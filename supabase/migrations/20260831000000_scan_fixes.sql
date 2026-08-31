-- Faults found by a full scan of the console, storefront and data layer.
--
-- Six independent defects, each one a place where the database promised
-- something the code around it could not deliver.

-- ---------------------------------------------------------------------------
-- 1. Coupon use caps were never enforced.
-- ---------------------------------------------------------------------------
-- `validate_coupon` gates on `times_used < max_uses`, but nothing ever
-- incremented `times_used`: the client logs a row in `coupon_usage` and stops
-- there. A "one use only" promo code therefore passed validation forever.
--
-- The counter is maintained by a trigger rather than by the client, because the
-- usage row is the record of the discount actually being granted — anything
-- that writes one has, by definition, used the coupon.

create or replace function public.sync_coupon_times_used()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.coupon_id is not null then
      update public.coupons
         set times_used = times_used + 1,
             updated_at = now()
       where id = new.coupon_id;
    end if;
    return new;
  end if;

  -- A usage row removed (a cancelled order being tidied up) hands the use back
  -- rather than burning it. Floored at zero so a double delete cannot go
  -- negative and quietly grant unlimited uses.
  if tg_op = 'DELETE' then
    if old.coupon_id is not null then
      update public.coupons
         set times_used = greatest(times_used - 1, 0),
             updated_at = now()
       where id = old.coupon_id;
    end if;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists sync_coupon_times_used on public.coupon_usage;
create trigger sync_coupon_times_used
after insert or delete on public.coupon_usage
for each row execute function public.sync_coupon_times_used();

-- Bring the counter in line with the usage already recorded, so caps start
-- counting from the truth rather than from zero.
update public.coupons c
   set times_used = coalesce(u.uses, 0)
  from (
    select coupon_id, count(*) as uses
      from public.coupon_usage
     where coupon_id is not null
     group by coupon_id
  ) u
 where u.coupon_id = c.id
   and c.times_used is distinct from coalesce(u.uses, 0);

-- ---------------------------------------------------------------------------
-- 2. Logged-out shoppers could not read the colour variants.
-- ---------------------------------------------------------------------------
-- The RLS policy on `product_imeis` deliberately exposes available units
-- ("authenticated reads available imeis", status = 'available'), and the
-- storefront's colour picker and compare page query the table directly. But
-- the table privilege was never granted to `anon`, so every logged-out
-- visitor — the shoppers the storefront exists for — got "permission denied"
-- instead of a colour picker, and their cart lines carried no colour at all.
grant select on public.product_imeis to anon;

-- The existing policy ("authenticated reads available imeis") carries no TO
-- clause, so it already applies to anon — but its `is_admin()` call does not:
-- anon was never granted EXECUTE on it, so evaluating the policy raises
-- "permission denied for function is_admin" and the grant above achieves
-- nothing on its own. The function is security definer and returns false for a
-- caller with no session, so letting anon run it discloses nothing.
grant execute on function public.is_admin() to anon;

-- ---------------------------------------------------------------------------
-- 3. Invoice PDFs were refused by the storage policy.
-- ---------------------------------------------------------------------------
-- Staff publishing rights were granted for the 'jobcards' and 'cashups'
-- folders, but `invoicePdf.ts` uploads to 'invoices/'. Sending a customer
-- their invoice therefore fails for exactly the non-admin cashier the original
-- migration was written to unblock.
drop policy if exists "staff publish customer documents" on storage.objects;
create policy "staff publish customer documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices')
  );

drop policy if exists "staff replace customer documents" on storage.objects;
create policy "staff replace customer documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices')
  )
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] in ('jobcards', 'cashups', 'invoices')
  );

-- ---------------------------------------------------------------------------
-- 4. "Stock is held for 30 minutes" was not true.
-- ---------------------------------------------------------------------------
-- Checkout tells the shopper their stock is held for 30 minutes, but
-- `expire_stale_reservations` only ever ran when an admin remembered to press
-- the housekeeping button in Settings. Abandoned Pending orders held real
-- stock and real IMEIs indefinitely.
--
-- Every ten minutes: the promise is a 30-minute hold, so the sweep has to be
-- meaningfully finer-grained than the window it enforces.
-- Guarded on `cron.schedule` itself rather than on the pg_cron extension
-- record: the scheduler being callable is the actual requirement, and it is
-- what makes this migration replayable on a database without pg_cron.
do $do$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    if exists (select 1 from cron.job where jobname = 'jr-expire-reservations') then
      perform cron.unschedule('jr-expire-reservations');
    end if;
    perform cron.schedule('jr-expire-reservations', '*/10 * * * *',
                          'select public.expire_stale_reservations();');
  end if;
end;
$do$;

-- ---------------------------------------------------------------------------
-- 5. Two devices could open the same till at once.
-- ---------------------------------------------------------------------------
-- `useOpenTill` checks for an open shift and then inserts — a check-then-act
-- with nothing enforcing it in between. Two cashiers opening the same till
-- simultaneously produced two open shifts, and the cash-up then reconciled
-- against whichever one happened to be newer.
--
-- Close any duplicates that already exist before the index goes on, keeping
-- the most recently opened shift per till.
update public.till_shifts t
   set status = 'Closed',
       closing_time = coalesce(t.closing_time, now()),
       notes = concat_ws(' · ', nullif(t.notes, ''),
                         'Closed automatically: a duplicate open shift on this till'),
       updated_at = now()
 where t.status = 'Open'
   and exists (
     select 1 from public.till_shifts other
      where other.till_id = t.till_id
        and other.status = 'Open'
        and (other.opening_time, other.id) > (t.opening_time, t.id)
   );

create unique index if not exists till_shifts_one_open_per_till
  on public.till_shifts (till_id)
  where status = 'Open';

-- ---------------------------------------------------------------------------
-- 6. Idle job-card alerts fired forever on finished cards.
-- The exclusion list named 'Cancelled' and 'Completed', neither of which is a
-- job-card status. The real terminal states — 'Returned unrepaired' and
-- 'Quote declined' — were missing, so a card that was closed but not collected
-- raised a fresh "has not moved" alert on every scheduled run, and re-raised it
-- after each acknowledgement.
--
-- Recreated verbatim from 20260807100000_alerts.sql with only that one `where`
-- clause corrected; every other alert in the function is unchanged.
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
  where j.status not in ('Collected', 'Returned unrepaired', 'Quote declined')
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
