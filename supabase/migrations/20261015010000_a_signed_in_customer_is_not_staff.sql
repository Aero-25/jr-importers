-- A signed-in customer is not staff.
--
-- An audit of the live database turned up a set of holes that all share one
-- shape: a check that reads like a check but is not one. A policy named "staff
-- read refunds" whose expression is `true`. A policy named "staff publish
-- customer documents" that never asks whether the writer is staff. A role test
-- that matches on an email address nobody has had to prove they own. Each was
-- written in good faith and each hands a signed-in shopper the keys to the
-- shop.
--
-- This closes them. Grouped by what is actually being defended.

-- ---------------------------------------------------------------------------
-- 1. Staff are known by their login, not by a name they typed.
-- ---------------------------------------------------------------------------
--
-- is_admin()/is_staff() matched a row in public.users either by auth.uid() OR
-- by `lower(u.email) = lower(auth.jwt()->>'email')`. The second half is the
-- hole: public.users holds a row for sales@jrimporters.com with role 'sales'
-- and NO corresponding auth user at all, so the first stranger to sign up on
-- the storefront with that address became staff — every invoice, every cost
-- price, every till shift, every customer record.
--
-- The email claim in a JWT only says what someone typed into a signup form.
-- auth.uid() says which account Supabase actually issued the session to. Match
-- on that alone. Both live administrators already have public.users rows whose
-- id equals their auth user id, so nothing that works today stops working; the
-- guard at the foot of this section refuses the migration if that is ever
-- untrue, because a role check nobody passes locks the shop out of its console.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.active = true
      and u.id = auth.uid()
      and lower(u.role) in ('admin', 'owner', 'manager')
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.active = true
      and u.id = auth.uid()
      and lower(u.role) in ('admin', 'owner', 'manager', 'sales', 'cashier', 'staff')
  );
$$;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.is_staff() to anon, authenticated;

-- Giving a staff member a login is now a deliberate act by an administrator
-- rather than something a signup form can do by itself. An admin creates the
-- auth user in Supabase, then calls this to bind the existing staff row to it.
create or replace function public.link_staff_login(p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_auth_id uuid;
  v_role    text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may link a staff login.';
  end if;

  select u.id into v_auth_id from auth.users u where lower(u.email) = lower(p_email);
  if v_auth_id is null then
    return jsonb_build_object('ok', false,
      'message', 'No login exists for that address yet — create the user in Supabase first.');
  end if;

  select lower(role) into v_role from public.users where lower(email) = lower(p_email);
  if v_role is null then
    return jsonb_build_object('ok', false, 'message', 'No staff record with that address.');
  end if;
  if v_role = 'customer' then
    return jsonb_build_object('ok', false, 'message', 'That address is a customer, not staff.');
  end if;

  update public.users set id = v_auth_id where lower(email) = lower(p_email);
  return jsonb_build_object('ok', true, 'message', 'Login linked.', 'role', v_role);
end;
$$;

revoke all on function public.link_staff_login(text) from public, anon;
grant execute on function public.link_staff_login(text) to authenticated;

do $guard$
declare
  v_admins integer;
begin
  select count(*) into v_admins
  from public.users u
  join auth.users a on a.id = u.id
  where u.active = true and lower(u.role) in ('admin', 'owner', 'manager');

  if v_admins = 0 then
    raise exception
      'no active administrator has a matching auth login — this change would lock the console';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 2. A policy named for staff must ask whether the reader is staff.
-- ---------------------------------------------------------------------------
--
-- These four read `using (true)` or test only that somebody is signed in, so
-- every customer with an account could read them. Refunds name customers and
-- amounts; alerts quote till variances and the cashier who closed the drawer;
-- blocked_users is the shop's own blacklist.

drop policy if exists "staff read refunds" on public.refunds;
create policy "staff read refunds" on public.refunds
  for select to authenticated using (public.is_staff());

drop policy if exists "staff read alerts" on public.alerts;
create policy "staff read alerts" on public.alerts
  for select to authenticated using (public.is_staff());

drop policy if exists "staff read periods" on public.accounting_periods;
create policy "staff read periods" on public.accounting_periods
  for select to authenticated using (public.is_staff());

drop policy if exists "authenticated checks blocked users" on public.blocked_users;
drop policy if exists "staff read blocked users" on public.blocked_users;
create policy "staff read blocked users" on public.blocked_users
  for select to authenticated using (public.is_staff());

-- Coupon codes were readable by anyone at all, signed in or not: `(active =
-- true) OR is_admin()` to role `public`. A live discount code is worth money.
-- Nothing in the application lists coupons; the storefront redeems one through
-- validate_coupon(), which is SECURITY DEFINER and needs no table read.
drop policy if exists "authenticated reads coupons" on public.coupons;
drop policy if exists "staff read coupons" on public.coupons;
create policy "staff read coupons" on public.coupons
  for select to authenticated using (public.is_staff());

-- Logging a redemption required only that you were signed in, so a shopper
-- could burn a promotion's usage limit in a loop, or file redemptions against
-- orders that were never theirs — `sync_coupon_times_used` believes each row.
-- Tie it to an order the writer actually owns.
drop policy if exists "authenticated logs coupon usage" on public.coupon_usage;
drop policy if exists "a redemption belongs to an order you own" on public.coupon_usage;
create policy "a redemption belongs to an order you own" on public.coupon_usage
  for insert to authenticated
  with check (public.is_staff() or public.owns_order(order_id));

-- ---------------------------------------------------------------------------
-- 3. IMEIs are not public catalogue data.
-- ---------------------------------------------------------------------------
--
-- `(is_admin() OR status = 'available')` to role `public` published the serial
-- number of every handset on the shelf to anybody who asked, because RLS
-- filters rows and not columns. The storefront never wanted the numbers: it
-- asks which colours a customer can pick. So answer that question directly and
-- keep the units themselves behind the counter.

create or replace function public.product_variant_colours(p_product_id bigint)
returns table (color text, available integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  -- NULL where a unit was booked in without a colour recorded, which is the
  -- shape the picker already expects: no name, no swatch.
  select nullif(trim(both from coalesce(i.color, '')), '') as color,
         count(*)::integer as available
  from public.product_imeis i
  join public.products p on p.id = i.product_id
  where i.product_id = p_product_id
    and i.status = 'available'
    -- Only for something the shop is actually offering: this function answers
    -- without a role check, so it must not become a way to inspect stock that
    -- is hidden from the storefront.
    and p.active = true
    and (p.show_online = true or public.is_staff())
  group by 1
  order by 1;
$$;

grant execute on function public.product_variant_colours(bigint) to anon, authenticated;

drop policy if exists "public reads available unit colours" on public.product_imeis;
drop policy if exists "staff read units" on public.product_imeis;
create policy "staff read units" on public.product_imeis
  for select to authenticated using (public.is_staff());

-- ---------------------------------------------------------------------------
-- 4. A customer may correct their address, not their bill.
-- ---------------------------------------------------------------------------
--
-- The orders UPDATE policy let the owner of an order write any column on it,
-- with no restriction at all: status to 'Paid', total_amount to 1, payments to
-- whatever, stock_returned to false so the handset could be released twice.
-- `products` and `customers` already have a trigger that quietly reverts the
-- fields a non-admin has no business changing; orders had none.
--
-- Reverting rather than refusing is deliberate and matches the other two: the
-- storefront sends whole rows back, so failing on a field nobody touched would
-- break an address edit for no reason.

create or replace function public.limit_customer_order_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  -- Abandoning your own checkout is legitimate, and the storefront does it
  -- when a reservation fails, so let the owner cancel a Pending order. Any
  -- other status move belongs to the shop.
  if not (old.status = 'Pending' and new.status in ('Pending', 'Cancelled')) then
    new.status := old.status;
  end if;

  -- What the customer is allowed to fix: how to reach them and where it goes.
  -- Everything about what was bought, what it cost and whether it was paid is
  -- the shop's record of the sale.
  new.user_id                := old.user_id;
  new.customer_email         := old.customer_email;
  new.items                  := old.items;
  new.subtotal               := old.subtotal;
  new.subtotal_amount        := old.subtotal_amount;
  new.vat_amount             := old.vat_amount;
  new.total_amount           := old.total_amount;
  new.payment_method         := old.payment_method;
  new.payment_reference      := old.payment_reference;
  new.payments               := old.payments;
  new.dpo_trans_ref          := old.dpo_trans_ref;
  new.paid_at                := old.paid_at;
  new.loyalty_discount       := old.loyalty_discount;
  new.coupon_code            := old.coupon_code;
  new.coupon_discount        := old.coupon_discount;
  new.stock_reserved         := old.stock_reserved;
  new.stock_returned         := old.stock_returned;
  new.reservation_expires_at := old.reservation_expires_at;
  new.till_shift_id          := old.till_shift_id;
  new.invoice_id             := old.invoice_id;
  new.invoice_number         := old.invoice_number;
  new.courier_company        := old.courier_company;
  new.waybill_number         := old.waybill_number;
  new.date_dispatched        := old.date_dispatched;
  new.picked_up_at           := old.picked_up_at;
  new.created_at             := old.created_at;

  return new;
end;
$$;

drop trigger if exists limit_customer_order_updates on public.orders;
create trigger limit_customer_order_updates
  before update on public.orders
  for each row execute function public.limit_customer_order_updates();

-- ---------------------------------------------------------------------------
-- 5. Putting stock back is a shop decision.
-- ---------------------------------------------------------------------------
--
-- release_order_stock() is SECURITY DEFINER, was executable by `anon`, and
-- asked nothing about the caller. Its un-serialised branch is
-- `update products set stock = stock + v_qty`, and the quantity comes from the
-- order's own items. So: place an order for one accessory with quantity
-- 100000, call this, and the shop's stock figure is fiction. For a handset it
-- flips sold units back to 'available' — a sale undone and a phone that is on
-- the books but not on the shelf.
--
-- Only the console calls it (Orders.tsx, when an order is cancelled), so a
-- staff check costs nothing. reserve_order_stock() is left as it is: the
-- storefront calls it at checkout and it already guards with owns_order().

create or replace function public.release_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_qty integer;
  v_released integer;
begin
  -- Returning stock to the shelf writes the stock figure the shop trades on.
  if not public.is_staff() then
    raise exception 'Only the shop can return stock to the shelf.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order not found.');
  end if;

  -- Releasing twice would silently inflate stock. `stock_returned` is the
  -- guard; `stock_reserved` is not, because a counter sale's units are sold
  -- rather than reserved and the order would refuse to give them back.
  if v_order.stock_returned then
    return jsonb_build_object('ok', true, 'message', 'Nothing to release.');
  end if;

  for v_product_id, v_qty in
    select (t.value->>'product_id')::bigint,
           sum(greatest(coalesce((t.value->>'quantity')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1
    having sum(greatest(coalesce((t.value->>'quantity')::integer, 0), 0)) > 0
    order by 1
  loop
    select * into v_product from public.products where id = v_product_id for update;

    if exists (select 1 from public.product_imeis where product_id = v_product_id) then
      -- Reserved or sold: either way the order is cancelled and the handset
      -- is back on the shelf. `sync_product_stock_from_imeis` rebuilds the
      -- count from the units, so nothing is added to `stock` by hand here.
      with freed as (
        update public.product_imeis
        set status = 'available', order_id = null
        where order_id = p_order_id
          and product_id = v_product_id
          and status in ('reserved', 'sold')
        returning 1
      )
      select count(*)::integer into v_released from freed;
    else
      update public.products set stock = stock + v_qty where id = v_product_id;
      v_released := v_qty;
    end if;

    if v_released > 0 then
      insert into public.stock_movements
        (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
      values
        (v_product_id, coalesce(v_product.name, 'Product #' || v_product_id), 'return',
         v_released, 'order', p_order_id::text, 'Order cancelled — stock returned');
    end if;
  end loop;

  update public.orders
  set stock_returned = true, stock_reserved = false, reservation_expires_at = null
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock released.');
end;
$$;

-- Sweeping expired reservations releases stock in a loop, so it inherits the
-- same answer. Called from Settings in the console.
create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
  if not public.is_staff() then
    raise exception 'Only the shop can expire reservations.';
  end if;

  for v_order_id in
    select id from public.orders
    where stock_reserved = true
      and stock_returned = false
      and status = 'Pending'
      and reservation_expires_at is not null
      and reservation_expires_at < now()
  loop
    perform public.release_order_stock(v_order_id);
    update public.orders set status = 'Cancelled' where id = v_order_id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Internal plumbing is not an API.
-- ---------------------------------------------------------------------------
--
-- next_document_number() hands out the next invoice number and increments the
-- counter. Nothing calls it from the browser — the invoice triggers use it —
-- but it was executable by `anon`, so anyone could sit in a loop burning
-- invoice numbers and leave the shop's tax sequence full of holes.
revoke all on function public.next_document_number(text) from public, anon, authenticated;

-- generate_alerts() writes rows into the alerts table. Nothing calls it from
-- the application at all.
revoke all on function public.generate_alerts() from public, anon, authenticated;

-- Trigger functions are invoked by the trigger machinery, which does not check
-- EXECUTE, so revoking this changes nothing about how the shop works — it just
-- stops them being reachable as RPCs, where they run with the owner's rights
-- and outside the row context they were written for.
do $revoke$
declare
  v_fn text;
begin
  for v_fn in
    select format('%I.%I(%s)', n.nspname, p.proname,
                  pg_get_function_identity_arguments(p.oid))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('anon', p.oid, 'execute')
           or has_function_privilege('authenticated', p.oid, 'execute'))
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
  end loop;
end
$revoke$;

-- ---------------------------------------------------------------------------
-- 7. A layby is not paid because the browser says so.
-- ---------------------------------------------------------------------------
--
-- pay_online_layby(p_layby_id, p_amount, p_reference) checked that the layby
-- belonged to the caller and then believed everything else: any amount, any
-- reference string, and it marked the layby 'completed'. open_online_layby()
-- did the same for the opening deposit and decremented stock on the strength of
-- it. A customer could settle a layby in full with a made-up reference and walk
-- out with the phone.
--
-- Verifying a DPO payment means an outbound HTTPS call, which Postgres cannot
-- make; the Worker that can (/api/dpo-verify-token) holds no credentials for
-- this database, so there is nowhere to put a trustworthy version of this
-- today. Until the Worker can verify a payment and record it with the service
-- key, online self-service layby payment is closed. No laybys exist, so this
-- takes nothing away that is in use, and the console's take_layby_payment()
-- — which does check is_staff() — is unaffected.
revoke all on function public.open_online_layby(bigint, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.pay_online_layby(bigint, numeric, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The document shelf is not a public directory.
-- ---------------------------------------------------------------------------
--
-- The Images bucket mixes product photographs with 44 customer invoices, job
-- cards, damage reports and a cash-up. Three things were wrong at once:
--
--   * "public reads Images bucket" granted SELECT on the whole bucket to role
--     `public`, so an unauthenticated visitor could LIST it and read back every
--     document's exact path. The documents rely on an unguessable path — that
--     is what the random file names in publishSharedPdf are for — and listing
--     the folder defeats it completely.
--   * "staff publish customer documents" and "staff replace customer
--     documents" are named for staff but check only the folder, so any
--     signed-in shopper could upload into invoices/ or overwrite a job card
--     with a file of their own.
--
-- Product and hero images stay publicly listable: the storefront reads them by
-- public URL and they are meant to be seen.

drop policy if exists "public reads Images bucket" on storage.objects;
drop policy if exists "public reads shop images" on storage.objects;
create policy "public reads shop images" on storage.objects
  for select to public
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] = any (array['products', 'Hero'])
  );

drop policy if exists "staff read customer documents" on storage.objects;
create policy "staff read customer documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] = any (array['jobcards', 'cashups', 'invoices', 'damage'])
    and public.is_staff()
  );

drop policy if exists "staff publish customer documents" on storage.objects;
create policy "staff publish customer documents" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] = any (array['jobcards', 'cashups', 'invoices', 'damage'])
    and public.is_staff()
  );

drop policy if exists "staff replace customer documents" on storage.objects;
create policy "staff replace customer documents" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] = any (array['jobcards', 'cashups', 'invoices', 'damage'])
    and public.is_staff()
  )
  with check (
    bucket_id = 'Images'
    and (storage.foldername(name))[1] = any (array['jobcards', 'cashups', 'invoices', 'damage'])
    and public.is_staff()
  );
