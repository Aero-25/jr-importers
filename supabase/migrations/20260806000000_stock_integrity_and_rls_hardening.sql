-- Stock integrity + RLS hardening.
--
-- Two policies in the initial schema let any signed-in customer write to any
-- product or IMEI row:
--
--   "authenticated adjusts product stock"  (products, FOR UPDATE)
--   "authenticated updates imeis"          (product_imeis, FOR UPDATE)
--
-- They existed so the storefront could decrement stock at checkout from the
-- browser. The `limit_customer_product_updates` trigger reverts every other
-- column, but deliberately not `stock` — so any customer account could set the
-- stock of any product to any value, and mark any IMEI sold or available.
--
-- This migration removes both policies and moves the reservation into two
-- SECURITY DEFINER functions that run as the table owner, take row locks, and
-- verify the caller actually owns the order. Checkout calls these instead of
-- writing to `products` directly.

begin;

-- ---------------------------------------------------------------------------
-- 1. Close the write holes.
-- ---------------------------------------------------------------------------
drop policy if exists "authenticated adjusts product stock" on public.products;
drop policy if exists "authenticated updates imeis" on public.product_imeis;

-- Customers may still read available IMEIs (colour/variant pickers rely on it).
-- Only admins may write them; the reservation function bypasses RLS by design.
drop policy if exists "authenticated reads available imeis" on public.product_imeis;
create policy "authenticated reads available imeis" on public.product_imeis
for select using (public.is_admin() or status = 'available');

-- ---------------------------------------------------------------------------
-- 2. Helper: does the current caller own this order?
-- ---------------------------------------------------------------------------
create or replace function public.owns_order(p_order_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (
        public.is_admin()
        or o.user_id = auth.uid()
        or lower(o.customer_email) = lower(coalesce(auth.jwt()->>'email', ''))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Reserve stock for an order, atomically.
--
-- Returns jsonb: { ok: bool, message: text, shortages: [{name, requested, available}] }
--
-- For products that track IMEIs, reserving means flipping N available IMEI rows
-- to 'reserved'; the existing sync_product_stock_from_imeis trigger recomputes
-- products.stock from the remaining available rows. For everything else, the
-- stock column is decremented directly.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      public.orders%rowtype;
  v_product_id bigint;
  v_qty        integer;
  v_product    public.products%rowtype;
  v_imei_count integer;
  v_serialised boolean;
  v_shortages  jsonb := '[]'::jsonb;
begin
  if not public.owns_order(p_order_id) then
    return jsonb_build_object('ok', false, 'message', 'Not permitted to reserve this order.');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order not found.');
  end if;
  if v_order.stock_reserved then
    return jsonb_build_object('ok', true, 'message', 'Stock already reserved.');
  end if;

  -- Quantities are summed per product first. One product can appear on several
  -- lines (two colours of the same handset); checking each line against the
  -- full available count would let the order over-promise stock.
  --
  -- Pass 1: lock each product and check availability. Ascending product_id
  -- order gives every caller the same lock order, so two orders sharing lines
  -- cannot deadlock.
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
    if not found then
      v_shortages := v_shortages || jsonb_build_object(
        'name', 'Product #' || v_product_id, 'requested', v_qty, 'available', 0
      );
      continue;
    end if;

    v_serialised := exists (select 1 from public.product_imeis where product_id = v_product_id);

    -- Serialised products are limited by their IMEI pool, not the stock column.
    if v_serialised then
      select count(*)::integer into v_imei_count
      from public.product_imeis
      where product_id = v_product_id and status = 'available';

      if v_imei_count < v_qty then
        v_shortages := v_shortages || jsonb_build_object(
          'name', v_product.name, 'requested', v_qty, 'available', v_imei_count
        );
      end if;
    elsif v_product.stock < v_qty then
      v_shortages := v_shortages || jsonb_build_object(
        'name', v_product.name, 'requested', v_qty, 'available', v_product.stock
      );
    end if;
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Some items are no longer available in the quantity requested.',
      'shortages', v_shortages
    );
  end if;

  -- Pass 2: everything checked out, so commit the decrements.
  for v_product_id, v_qty in
    select (t.value->>'product_id')::bigint,
           sum(greatest(coalesce((t.value->>'quantity')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1
    having sum(greatest(coalesce((t.value->>'quantity')::integer, 0), 0)) > 0
    order by 1
  loop
    select * into v_product from public.products where id = v_product_id;

    if exists (select 1 from public.product_imeis where product_id = v_product_id) then
      update public.product_imeis
      set status = 'reserved', order_id = p_order_id
      where id in (
        select id from public.product_imeis
        where product_id = v_product_id and status = 'available'
        order by created_at
        limit v_qty
      );
    else
      update public.products
      set stock = greatest(stock - v_qty, 0)
      where id = v_product_id;
    end if;

    insert into public.stock_movements
      (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
    values
      (v_product_id, v_product.name, 'sale', -v_qty, 'order', p_order_id::text,
       'Reserved at checkout');
  end loop;

  update public.orders
  set stock_reserved = true,
      reservation_expires_at = now() + interval '30 minutes'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock reserved.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Release a reservation (cancellation, expiry, refund).
-- ---------------------------------------------------------------------------
create or replace function public.release_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      public.orders%rowtype;
  v_product_id bigint;
  v_qty        integer;
  v_product    public.products%rowtype;
  v_released   integer;
begin
  if not public.owns_order(p_order_id) then
    return jsonb_build_object('ok', false, 'message', 'Not permitted to release this order.');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order not found.');
  end if;
  -- Releasing twice would silently inflate stock.
  if not v_order.stock_reserved or v_order.stock_returned then
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
      -- Scoped to this product so each iteration releases only its own units.
      with freed as (
        update public.product_imeis
        set status = 'available', order_id = null
        where order_id = p_order_id
          and product_id = v_product_id
          and status = 'reserved'
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
         v_released, 'order', p_order_id::text, 'Reservation released');
    end if;
  end loop;

  update public.orders
  set stock_returned = true, stock_reserved = false, reservation_expires_at = null
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock released.');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Expiry sweep. Run from pg_cron (or the console's housekeeping action) to
--    free stock held by abandoned checkouts.
-- ---------------------------------------------------------------------------
create or replace function public.expire_stale_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order_id uuid;
  v_count integer := 0;
begin
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
-- 6. Grants. `owns_order` is intentionally not exposed to the API — it is a
--    helper for the two functions above.
-- ---------------------------------------------------------------------------
revoke all on function public.owns_order(uuid) from public, anon, authenticated;
grant execute on function public.reserve_order_stock(uuid) to authenticated;
grant execute on function public.release_order_stock(uuid) to authenticated;
grant execute on function public.expire_stale_reservations() to authenticated;

notify pgrst, 'reload schema';

commit;
