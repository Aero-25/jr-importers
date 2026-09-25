-- Website visitor analytics.
--
-- The shop could see what it sold but not who came looking: how many people
-- open the website, and whether they arrived from Google, a Facebook post or a
-- WhatsApp message. Without that, there is no way to tell whether a post or a
-- flyer did anything.
--
-- Kept in-house, like fault tracking, rather than handed to a third party: no
-- account, no fee, no cookie banner, and nothing about a shopper leaves the
-- shop's own database. No IP address is stored. A visitor is a random number
-- the browser keeps, and location is the town and country the host (Cloudflare)
-- already knows from the connection.
--
-- A session is one sitting — it ends after 30 idle minutes, the same rule every
-- analytics tool uses — and is where "where did they come from" lives, because
-- a shopper arrives once and then clicks around. Page views hang off it.

create table if not exists public.site_sessions (
  id            uuid primary key,
  visitor_id    uuid not null,
  started_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  page_views    integer not null default 1,
  landing_path  text,
  -- The referring site's host, or `app:<package>` when an Android app (most
  -- often WhatsApp) opened the link.
  referrer_host text,
  -- What the shop would call it: "Google", "WhatsApp", "flyer".
  source        text not null default 'Direct',
  channel       text not null default 'Direct',
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  device        text,
  country       text,
  city          text,
  -- Had this browser been here before this session started.
  is_returning  boolean not null default false
);

create index if not exists site_sessions_started_idx on public.site_sessions (started_at);
create index if not exists site_sessions_last_seen_idx on public.site_sessions (last_seen_at);
create index if not exists site_sessions_visitor_idx on public.site_sessions (visitor_id);

create table if not exists public.site_page_views (
  id         bigint generated always as identity primary key,
  session_id uuid not null references public.site_sessions (id) on delete cascade,
  path       text not null,
  viewed_at  timestamptz not null default now()
);

create index if not exists site_page_views_viewed_idx on public.site_page_views (viewed_at);
create index if not exists site_page_views_session_idx on public.site_page_views (session_id);

alter table public.site_sessions enable row level security;
alter table public.site_page_views enable row level security;

drop policy if exists "admins read site sessions" on public.site_sessions;
create policy "admins read site sessions"
  on public.site_sessions for select to authenticated
  using (public.is_admin());

drop policy if exists "admins read site page views" on public.site_page_views;
create policy "admins read site page views"
  on public.site_page_views for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Recording a visit.
-- ---------------------------------------------------------------------------
-- Open to anonymous shoppers, since they are the whole point — which makes it
-- the one write in this schema anybody on the internet can call. So nothing it
-- accepts is trusted: every field is clipped and checked against what the
-- storefront can actually send, and two ceilings bound what abuse can cost.
-- A single sitting stops counting at 500 pages, and the whole site at 600 a
-- minute — far past anything a one-shop website sees, and it turns a flood
-- into a gap in the chart rather than a full database.
create or replace function public.record_site_visit(
  p_session uuid,
  p_visitor uuid,
  p_path text,
  p_landing jsonb default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_path     text := left(coalesce(nullif(trim(p_path), ''), '/'), 300);
  v_landing  jsonb := coalesce(p_landing, '{}'::jsonb);
  v_channel  text := v_landing ->> 'channel';
  v_device   text := v_landing ->> 'device';
  v_country  text := upper(v_landing ->> 'country');
  v_counted  uuid;
begin
  if p_session is null or p_visitor is null then
    return;
  end if;

  -- Staff looking up a price for a customer are not visitors.
  if public.is_staff() then
    return;
  end if;

  if (select count(*) from (
        select 1 from public.site_page_views
         where viewed_at > now() - interval '1 minute'
         limit 600) recent) >= 600 then
    return;
  end if;

  if v_channel is null or v_channel not in
     ('Direct', 'Search', 'Social', 'Messaging', 'Email', 'Ads', 'Campaign', 'Referral') then
    v_channel := 'Direct';
  end if;
  if v_device is null or v_device not in ('mobile', 'tablet', 'desktop') then
    v_device := null;
  end if;
  -- `XX` is Cloudflare's "unknown" and `T1` is Tor; neither is a place.
  if v_country is null or v_country !~ '^[A-Z]{2}$' or v_country in ('XX', 'T1') then
    v_country := null;
  end if;

  insert into public.site_sessions as s (
    id, visitor_id, landing_path, referrer_host, source, channel,
    utm_source, utm_medium, utm_campaign, device, country, city, is_returning
  )
  values (
    p_session,
    p_visitor,
    v_path,
    left(nullif(trim(v_landing ->> 'referrer_host'), ''), 200),
    left(coalesce(nullif(trim(v_landing ->> 'source'), ''), 'Direct'), 80),
    v_channel,
    left(nullif(trim(v_landing ->> 'utm_source'), ''), 100),
    left(nullif(trim(v_landing ->> 'utm_medium'), ''), 100),
    left(nullif(trim(v_landing ->> 'utm_campaign'), ''), 100),
    v_device,
    v_country,
    left(nullif(trim(v_landing ->> 'city'), ''), 80),
    exists (select 1 from public.site_sessions o where o.visitor_id = p_visitor)
  )
  on conflict (id) do update
    set page_views   = s.page_views + 1,
        last_seen_at = now()
    where s.page_views < 500
  returning s.id into v_counted;

  if v_counted is null then
    return;
  end if;

  insert into public.site_page_views (session_id, path)
  values (p_session, v_path);
end;
$$;

revoke all on function public.record_site_visit(uuid, uuid, text, jsonb) from public;
grant execute on function public.record_site_visit(uuid, uuid, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The report.
-- ---------------------------------------------------------------------------
-- Summarised here rather than in the browser: a quarter of visits is tens of
-- thousands of rows, and the screen needs a few dozen numbers.
--
-- Periods run in shop time. "Last 7 days" is today and the six days before it,
-- counted from midnight in Walvis Bay, and it is compared with the seven days
-- before that. A year is charted by the week; a day-by-day bar for 365 days is
-- too thin to point at.
create or replace function public.site_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_tz      constant text := 'Africa/Windhoek';
  v_days    integer := least(greatest(coalesce(p_days, 30), 1), 366);
  v_today   timestamptz := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
  v_from    timestamptz := v_today - make_interval(days => v_days - 1);
  v_to      timestamptz := now();
  v_prev    timestamptz := v_from - (v_to - v_from);
  v_bucket  text := case when v_days > 120 then 'week' else 'day' end;
  v_result  jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  with s as (
    select * from public.site_sessions
     where started_at >= v_from and started_at < v_to
  ),
  prev as (
    select * from public.site_sessions
     where started_at >= v_prev and started_at < v_from
  ),
  pv as (
    select v.path, v.viewed_at, ss.visitor_id
      from public.site_page_views v
      join public.site_sessions ss on ss.id = v.session_id
     where v.viewed_at >= v_from and v.viewed_at < v_to
  ),
  buckets as (
    select generate_series(
             date_trunc(v_bucket, v_from at time zone v_tz),
             date_trunc(v_bucket, v_to at time zone v_tz),
             ('1 ' || v_bucket)::interval
           ) as b
  ),
  s_by as (
    select date_trunc(v_bucket, started_at at time zone v_tz) as b,
           count(distinct visitor_id)::int as visitors,
           count(*)::int as sessions
      from s group by 1
  ),
  pv_by as (
    select date_trunc(v_bucket, viewed_at at time zone v_tz) as b,
           count(*)::int as page_views
      from pv group by 1
  )
  select jsonb_build_object(
    'ok', true,
    'days', v_days,
    'bucket', v_bucket,
    'from', v_from,
    'to', v_to,

    'visitors',       (select count(distinct visitor_id) from s),
    'new_visitors',   (select count(distinct visitor_id) from s where not is_returning),
    'sessions',       (select count(*) from s),
    'page_views',     (select count(*) from pv),
    'bounced',        (select count(*) from s where page_views <= 1),
    'prev_visitors',  (select count(distinct visitor_id) from prev),
    'prev_sessions',  (select count(*) from prev),
    'prev_page_views',(select count(*) from public.site_page_views
                        where viewed_at >= v_prev and viewed_at < v_from),

    'today_visitors', (select count(distinct visitor_id) from public.site_sessions
                        where last_seen_at >= v_today),
    'live_visitors',  (select count(distinct visitor_id) from public.site_sessions
                        where last_seen_at >= now() - interval '5 minutes'),
    'first_visit_at', (select min(started_at) from public.site_sessions),

    'series', coalesce((select jsonb_agg(jsonb_build_object(
                          'date',       to_char(k.b, 'YYYY-MM-DD'),
                          'visitors',   coalesce(s_by.visitors, 0),
                          'sessions',   coalesce(s_by.sessions, 0),
                          'page_views', coalesce(pv_by.page_views, 0)
                        ) order by k.b)
                        from buckets k
                        left join s_by on s_by.b = k.b
                        left join pv_by on pv_by.b = k.b), '[]'::jsonb),

    'channels', coalesce((select jsonb_agg(t order by t.sessions desc) from (
                  select channel,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s group by channel) t), '[]'::jsonb),

    'sources', coalesce((select jsonb_agg(t order by t.sessions desc, t.source) from (
                  select source, channel,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s group by source, channel
                   order by sessions desc, source
                   limit 25) t), '[]'::jsonb),

    'campaigns', coalesce((select jsonb_agg(t order by t.sessions desc) from (
                  select utm_campaign as campaign,
                         coalesce(utm_source, source) as source,
                         utm_medium as medium,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s
                   where utm_campaign is not null
                   group by 1, 2, 3
                   order by sessions desc
                   limit 20) t), '[]'::jsonb),

    'pages', coalesce((select jsonb_agg(t order by t.views desc, t.path) from (
                  select path,
                         count(*)::int as views,
                         count(distinct visitor_id)::int as visitors
                    from pv group by path
                   order by views desc, path
                   limit 25) t), '[]'::jsonb),

    'countries', coalesce((select jsonb_agg(t order by t.visitors desc) from (
                  select country,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s where country is not null
                   group by country
                   order by visitors desc
                   limit 20) t), '[]'::jsonb),

    'cities', coalesce((select jsonb_agg(t order by t.visitors desc) from (
                  select city, country,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s where city is not null
                   group by city, country
                   order by visitors desc
                   limit 20) t), '[]'::jsonb),

    'devices', coalesce((select jsonb_agg(t order by t.visitors desc) from (
                  select coalesce(device, 'unknown') as device,
                         count(distinct visitor_id)::int as visitors,
                         count(*)::int as sessions
                    from s group by 1) t), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.site_analytics(integer) from public, anon;
grant execute on function public.site_analytics(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention.
-- ---------------------------------------------------------------------------
-- Thirteen months: long enough to compare this December with last, short
-- enough that the tables do not grow for ever on a small database plan.
create or replace function public.prune_site_analytics()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_removed integer;
begin
  delete from public.site_sessions
   where last_seen_at < now() - interval '13 months';
  get diagnostics v_removed = row_count;
  return v_removed;
end;
$$;

revoke all on function public.prune_site_analytics() from public, anon, authenticated;

do $do$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if exists (select 1 from cron.job where jobname = 'jr-prune-site-analytics') then
      perform cron.unschedule('jr-prune-site-analytics');
    end if;
    perform cron.schedule('jr-prune-site-analytics', '17 3 * * *',
                          'select public.prune_site_analytics();');
  end if;
end;
$do$;
