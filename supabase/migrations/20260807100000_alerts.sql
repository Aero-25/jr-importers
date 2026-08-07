-- Alerts.
--
-- Everything the console knows sits on a screen somebody has to remember to
-- visit. These are the handful of things that should come and find you.
--
-- Generated in the database on a schedule rather than in the browser, because
-- the whole point is that they fire when nobody has the console open.

create extension if not exists pg_cron;

create table if not exists public.alerts (
  id              bigint generated always as identity primary key,
  kind            text not null,
  severity        text not null default 'info',
  title           text not null,
  detail          text,
  -- One open alert per real-world fact. Without this the scheduled run would
  -- raise "the A55 is low" every morning until somebody ordered more.
  dedupe_key      text not null,
  entity          text,
  entity_id       text,
  acknowledged_at timestamptz,
  acknowledged_by text,
  created_at      timestamptz not null default now(),

  constraint alerts_severity_check check (severity in ('info', 'warn', 'critical'))
);

create unique index if not exists alerts_open_dedupe_key
  on public.alerts (dedupe_key) where acknowledged_at is null;
create index if not exists alerts_created_idx on public.alerts (created_at desc);

alter table public.alerts enable row level security;

drop policy if exists "staff read alerts" on public.alerts;
create policy "staff read alerts"
  on public.alerts for select to authenticated using (true);

create or replace function private.raise_alert(
  p_kind text,
  p_severity text,
  p_title text,
  p_detail text,
  p_dedupe text,
  p_entity text default null,
  p_entity_id text default null
)
returns void
language sql
security definer
set search_path to 'public'
as $fn$
  insert into public.alerts (kind, severity, title, detail, dedupe_key, entity, entity_id)
  values (p_kind, p_severity, p_title, p_detail, p_dedupe, p_entity, p_entity_id)
  on conflict (dedupe_key) where acknowledged_at is null do nothing;
$fn$;

create or replace function public.generate_alerts()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_before integer;
  v_after integer;
begin
  select count(*) into v_before from public.alerts;

  -- Stock at or below its reorder level. Repairs are excluded: their quantity
  -- is a sentinel so the till can ring them up, not a shelf.
  perform private.raise_alert(
    'low_stock', 'warn',
    format('%s is down to %s', p.name, p.stock),
    format('Reorder level is %s.', p.reorder_level),
    'low_stock:' || p.id, 'products', p.id::text
  )
  from public.products p
  where p.active
    and p.category is distinct from 'Repairs'
    and coalesce(p.reorder_level, 0) > 0
    and p.stock <= p.reorder_level;

  -- A drawer that did not balance by more than N$50. Small change happens;
  -- fifty dollars is somebody's mistake or somebody's hand.
  perform private.raise_alert(
    'till_variance', 'critical',
    format('Till %s was out by %s', s.till_id,
           to_char(abs(coalesce(s.cash_variance, 0)), 'FM999G999D00')),
    format('Shift #%s, closed by %s.', s.id, coalesce(s.closed_by, 'unknown')),
    'till_variance:' || s.id, 'till_shifts', s.id::text
  )
  from public.till_shifts s
  where s.status = 'Closed'
    and abs(coalesce(s.cash_variance, 0)) > 50
    and s.closing_time > now() - interval '7 days';

  -- A refund a cashier raised that no manager has looked at.
  perform private.raise_alert(
    'refund_pending', 'warn',
    format('Refund #%s is waiting for approval', r.refund_number),
    format('%s raised by %s. %s',
           to_char(r.total_amount, 'FM999G999D00'),
           coalesce(r.requested_by, 'unknown'), r.reason),
    'refund_pending:' || r.id, 'refunds', r.id::text
  )
  from public.refunds r
  where r.status = 'Pending';

  -- A handset booked in and then forgotten. Three days is long enough that the
  -- customer has started wondering.
  perform private.raise_alert(
    'job_card_idle', 'warn',
    format('Job card #%s has not moved in %s days', j.job_number,
           extract(day from now() - j.updated_at)::int),
    format('%s · %s · %s', j.customer_name,
           coalesce(j.handset_type, 'handset'), j.status),
    'job_card_idle:' || j.id, 'job_cards', j.id::text
  )
  from public.job_cards j
  where j.status not in ('Collected', 'Cancelled', 'Completed')
    and j.updated_at < now() - interval '3 days';

  -- Stock that arrived but was never posted: it is on the shelf and not in the
  -- system. Two days covers a delivery that landed late on a Friday.
  perform private.raise_alert(
    'grv_unposted', 'warn',
    format('Delivery #%s has not been received into stock', g.id),
    format('%s · %s', coalesce(g.supplier_name, 'unknown supplier'),
           to_char(coalesce(g.total_amount, 0), 'FM999G999D00')),
    'grv_unposted:' || g.id, 'grvs', g.id::text
  )
  from public.grvs g
  where g.posted_at is null
    and g.created_at < now() - interval '2 days';

  select count(*) into v_after from public.alerts;
  return v_after - v_before;
end;
$fn$;

create or replace function public.acknowledge_alert(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  update public.alerts
     set acknowledged_at = now(),
         acknowledged_by = public.current_actor()
   where id = p_id and acknowledged_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That alert is already cleared.');
  end if;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- Before opening and again mid-afternoon, Monday to Saturday. Not hourly: an
-- alert that arrives six times a day is an alert nobody reads. Times are UTC,
-- which is two hours behind Windhoek — so 06:00 and 13:00 here land at 08:00
-- and 15:00 in the shop.
do $do$
begin
  if exists (select 1 from cron.job where jobname = 'jr-generate-alerts') then
    perform cron.unschedule('jr-generate-alerts');
  end if;
  perform cron.schedule('jr-generate-alerts', '0 6,13 * * 1-6',
                        'select public.generate_alerts();');
end;
$do$;

revoke all on function public.generate_alerts() from public, anon;
revoke all on function public.acknowledge_alert(bigint) from public, anon;
grant execute on function public.generate_alerts() to authenticated;
grant execute on function public.acknowledge_alert(bigint) to authenticated;
