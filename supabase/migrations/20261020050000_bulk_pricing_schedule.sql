-- Monday automation, and the file the schedule needs.
--
-- A scheduled send happens with nobody logged in, so the PDF cannot be built
-- in a browser at the time. It is built and stored when the list is approved;
-- the worker fetches it from there. `pdf_path` is where it went.
--
-- The schedule itself is a setting (day and time, in Africa/Windhoek), so a
-- fixed cron expression would not follow it. pg_cron therefore runs every hour
-- and bulk_scheduled_send() decides whether this is the hour — which also
-- means changing the time in Settings takes effect without touching the job.

alter table public.bulk_price_lists
  add column if not exists pdf_path text;

-- The document folders the shop may write to, plus the new one. Same rule as
-- the others: staff only, and never listable by the public.
do $policies$
declare
  folders text := $arr$array['jobcards', 'cashups', 'invoices', 'damage', 'bulk']$arr$;
begin
  execute format($f$
    drop policy if exists "staff read customer documents" on storage.objects;
    create policy "staff read customer documents" on storage.objects
      for select to authenticated
      using (bucket_id = 'Images'
             and (storage.foldername(name))[1] = any (%s)
             and public.is_admin());
  $f$, folders);

  execute format($f$
    drop policy if exists "staff publish customer documents" on storage.objects;
    create policy "staff publish customer documents" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'Images'
                  and (storage.foldername(name))[1] = any (%s)
                  and public.is_staff());
  $f$, folders);

  execute format($f$
    drop policy if exists "staff replace customer documents" on storage.objects;
    create policy "staff replace customer documents" on storage.objects
      for update to authenticated
      using (bucket_id = 'Images'
             and (storage.foldername(name))[1] = any (%s)
             and public.is_staff())
      with check (bucket_id = 'Images'
                  and (storage.foldername(name))[1] = any (%s)
                  and public.is_staff());
  $f$, folders, folders);
end
$policies$;

-- Where the scheduler's shared secret lives. Not in settings: that table is
-- readable by any administrator, and this is a credential for calling an
-- endpoint, not a preference.
create table if not exists private.bulk_cron (
  id       integer primary key default 1 check (id = 1),
  secret   text not null,
  endpoint text not null
);

insert into private.bulk_cron (id, secret, endpoint) values (
  1,
  'U_J89NSImUnktbCGqfRlWuyg04IWuH6QnJoaax-ekxQ',
  'https://snkvszndxwpozrefnpnv.supabase.co/functions/v1/bulk-dispatch'
) on conflict (id) do update
  set secret = excluded.secret, endpoint = excluded.endpoint;

revoke all on private.bulk_cron from public, anon, authenticated;

-- Records where the approved list's PDF was stored.
create or replace function public.bulk_set_pdf_path(p_list_id bigint, p_path text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may publish a price list.';
  end if;
  update public.bulk_price_lists set pdf_path = p_path where id = p_list_id;
end;
$fn$;

revoke all on function public.bulk_set_pdf_path(bigint, text) from public, anon;
grant execute on function public.bulk_set_pdf_path(bigint, text) to authenticated;

-- The hourly decision.
create or replace function private.bulk_scheduled_send()
returns text
language plpgsql
security definer
set search_path to 'public', 'private'
as $fn$
declare
  v_now    timestamptz := now();
  v_local  timestamp   := v_now at time zone 'Africa/Windhoek';
  v_day    integer     := extract(isodow from v_local);
  v_hour   integer     := extract(hour from v_local);
  v_want_day  integer  := public.bulk_setting('bulk_schedule_day', '1')::integer;
  v_want_hour integer  := split_part(public.bulk_setting('bulk_schedule_time', '08:00'), ':', 1)::integer;
  v_list   record;
  v_cron   record;
  v_reply  jsonb;
begin
  if public.bulk_setting('bulk_auto_send', 'false')::boolean is not true then
    return 'auto-send is off';
  end if;
  if v_day <> v_want_day or v_hour <> v_want_hour then
    return format('not the hour (local %s, day %s)', v_hour, v_day);
  end if;

  -- The current week's approved list, and only that. A week-old list is not
  -- sent; the dashboard already warns when there is nothing current.
  select l.* into v_list
  from public.bulk_price_lists l
  where l.status = 'approved'
    and l.week_start = private.windhoek_week_start(v_now)
  order by l.id desc
  limit 1;

  if v_list.id is null then
    return 'no approved list for this week — nothing sent';
  end if;
  if v_list.pdf_path is null then
    return 'the approved list has no stored PDF — nothing sent';
  end if;

  -- Already sent this week? A corrected upload must not post twice.
  if exists (
    select 1 from public.bulk_distributions d
    where d.list_id = v_list.id and d.trigger = 'scheduled'
  ) then
    return 'already sent this week';
  end if;

  v_reply := public.bulk_start_distribution(
    v_list.id, null, null, null, v_list.pdf_path, 'scheduled');

  if (v_reply->>'ok') <> 'true' then
    return coalesce(v_reply->>'message', 'the distribution was refused');
  end if;

  select * into v_cron from private.bulk_cron where id = 1;

  perform net.http_post(
    url := v_cron.endpoint,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron.secret),
    body := jsonb_build_object(
      'distribution_id', (v_reply->>'distribution_id')::bigint,
      'storage_path', v_list.pdf_path)
  );

  return format('queued %s recipients', v_reply->>'recipients');
end;
$fn$;

revoke all on function private.bulk_scheduled_send() from public, anon, authenticated;

-- One hourly job. Unscheduling first keeps this file re-runnable.
select cron.unschedule('bulk-weekly-price-list')
where exists (select 1 from cron.job where jobname = 'bulk-weekly-price-list');

select cron.schedule(
  'bulk-weekly-price-list',
  '5 * * * *',
  $job$ select private.bulk_scheduled_send(); $job$
);
