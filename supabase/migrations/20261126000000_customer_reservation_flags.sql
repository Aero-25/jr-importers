-- Customer checkouts never got a hold that expires. reserve_order_stock() ends
-- by setting stock_reserved and reservation_expires_at, but the update fires
-- limit_customer_order_updates(), and for a customer (not staff) that trigger
-- copies the old values back. The units stayed reserved with no expiry, so
-- expire_stale_reservations() never released them (seen on order 3D71D639).
--
-- The reservation and release functions now flag their own write with a
-- transaction-local setting, and the trigger lets only those three stock
-- columns through when it is set. PostgREST does not expose set_config, so a
-- customer cannot set the flag on a direct update.

create or replace function public.limit_customer_order_updates()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_stock_op boolean := coalesce(current_setting('jr.stock_op', true), '') = 'on';
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
  -- The stock flags move only when reserve_order_stock() writes them.
  if not v_stock_op then
    new.stock_reserved         := old.stock_reserved;
    new.stock_returned         := old.stock_returned;
    new.reservation_expires_at := old.reservation_expires_at;
  end if;
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
$function$;

CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order      public.orders%rowtype;
  v_product_id bigint;
  v_color      text;
  v_name       text;
  v_qty        integer;
  v_product    public.products%rowtype;
  v_imei_count integer;
  v_serialised boolean;
  v_known      boolean;
  v_shortages  jsonb := '[]'::jsonb;
  v_named      text[];
  v_took       integer;
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

  -- Pass 1a: lock each product and check the overall count, colour-blind.
  -- Ascending product_id order gives every caller the same lock order, so
  -- two orders sharing lines cannot deadlock.
  for v_product_id, v_qty in
    select (t.value->>'product_id')::bigint,
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
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

    -- On-order lines: the shop sources the unit after the sale, so a short
    -- shelf is not a shortage. Whatever is on hand is still reserved below.
    if v_product.allow_backorder then
      continue;
    end if;

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

  -- Pass 1b: for lines that name a colour the product's unit pool actually
  -- knows, that colour must be available in the quantity asked. Colours the
  -- pool has never heard of are metadata, not a choice — skipped here and
  -- reserved colour-blind in pass 2.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           lower(nullif(trim(both from coalesce(t.value->>'color', '')), '')),
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
      and nullif(trim(both from coalesce(t.value->>'color', '')), '') is not null
    group by 1, 2
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
    order by 1, 2
  loop
    if not exists (select 1 from public.product_imeis where product_id = v_product_id) then
      continue; -- untracked product: nothing to hold to a colour
    end if;
    continue when (select allow_backorder from public.products where id = v_product_id);

    select exists (
      select 1 from public.product_imeis
      where product_id = v_product_id
        and lower(trim(both from coalesce(color, ''))) = v_color
    ) into v_known;
    continue when not v_known; -- phantom colour: reserve colour-blind instead

    select count(*)::integer into v_imei_count
    from public.product_imeis
    where product_id = v_product_id and status = 'available'
      and lower(trim(both from coalesce(color, ''))) = v_color;

    if v_imei_count < v_qty then
      select name into v_name from public.products where id = v_product_id;
      v_shortages := v_shortages || jsonb_build_object(
        'name', coalesce(v_name, 'Product #' || v_product_id) || ' (' || initcap(v_color) || ')',
        'requested', v_qty, 'available', v_imei_count
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

  -- Pass 2: everything checked out, so commit the reservations. Coloured
  -- lines first, so a colour-blind line of the same product cannot grab a
  -- unit a coloured line needs. A named colour only narrows the pick when
  -- the pool knows it; otherwise any unit of the product will do.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           lower(nullif(trim(both from coalesce(t.value->>'color', '')), '')),
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1, 2
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
    order by 1, 2 nulls last
  loop
    select * into v_product from public.products where id = v_product_id;

    if exists (select 1 from public.product_imeis where product_id = v_product_id) then
      if v_color is not null and not exists (
        select 1 from public.product_imeis
        where product_id = v_product_id
          and lower(trim(both from coalesce(color, ''))) = v_color
      ) then
        v_color := null; -- phantom colour: any unit of the product will do
      end if;

      -- Units the seller actually named. The till now asks which handset is
      -- going out, and that answer has to be honoured: reserving the oldest
      -- unit instead means the IMEI recorded against the sale is not the one
      -- in the customer's hand, which surfaces months later as a warranty
      -- claim on a phone the shop still believes is on the shelf.
      select coalesce(array_agg(x), '{}')
        into v_named
        from (
          select jsonb_array_elements_text(t.value->'imeis') as x
          from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
          where (t.value->>'product_id')::bigint = v_product_id
            and jsonb_typeof(t.value->'imeis') = 'array'
          union
          select t.value->>'imei'
          from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
          where (t.value->>'product_id')::bigint = v_product_id
            and nullif(t.value->>'imei', '') is not null
        ) named
       where x is not null;

      v_took := 0;
      if array_length(v_named, 1) > 0 then
        with taken as (
          update public.product_imeis
             set status = 'reserved', order_id = p_order_id
           where product_id = v_product_id
             and status = 'available'
             and coalesce(imei, serial_number) = any (v_named)
          returning 1
        )
        select count(*)::integer into v_took from taken;
      end if;

      -- Whatever the line did not name still falls back to the colour pick,
      -- so a partly-named line reserves its full quantity and an older order
      -- carrying no serials behaves exactly as before.
      if v_took < v_qty then
        update public.product_imeis
        set status = 'reserved', order_id = p_order_id
        where id in (
          select id from public.product_imeis
          where product_id = v_product_id and status = 'available'
            and (v_color is null or lower(trim(both from coalesce(color, ''))) = v_color)
          order by created_at
          limit v_qty - v_took
        );
      end if;
    else
      update public.products
      set stock = greatest(stock - v_qty, 0)
      where id = v_product_id;
    end if;

    insert into public.stock_movements
      (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
    values
      (v_product_id, v_product.name, 'sale', -v_qty, 'order', p_order_id::text,
       'Reserved at checkout' || case when v_color is null then '' else ' — ' || initcap(v_color) end
         || case when v_product.allow_backorder and v_product.stock < v_qty then ' (on order)' else '' end);
  end loop;

  -- limit_customer_order_updates() pins the stock flags for a customer's own
  -- update; this marks the write as the reservation itself.
  perform set_config('jr.stock_op', 'on', true);
  update public.orders
  set stock_reserved = true,
      reservation_expires_at = now() + interval '3 hours'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock reserved.');
end;
$function$;
