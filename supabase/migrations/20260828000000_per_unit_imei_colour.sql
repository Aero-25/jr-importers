-- Every phone is one unit: its own IMEI, its own colour.
--
-- The pieces already existed — product_imeis carries imei, serial_number and
-- color, the sync trigger counts a serialised product's stock from its
-- available units, and the GRV form captures {imei, color} per unit — but the
-- chain was broken in two places:
--
--   1. receive_grv() read the GRV line's serial list with
--      jsonb_array_elements_text, which stringifies the {imei, color} objects
--      the admin form actually saves, so a received phone landed with a JSON
--      blob for an IMEI and no colour at all. It also read 'quantity' and
--      'unit_cost' while the form saves 'qty_received' and 'cost_price'.
--
--   2. reserve_order_stock() reserved the N oldest available units of a
--      product regardless of colour, so a customer who ordered the black
--      handset could have the shop's last gold one reserved out from under
--      the next customer.
--
-- This migration mends both, and adds the missing uniqueness guarantee for
-- serial numbers (IMEIs already had one).

-- The same serial must not be bookable twice, exactly like an IMEI. Partial,
-- so unit rows recorded by IMEI alone are unaffected.
create unique index if not exists product_imeis_serial_key
  on public.product_imeis (serial_number)
  where serial_number is not null and serial_number <> '';

/* ── Receiving stock: one unit, one IMEI, one colour ─────────────────────── */

-- Line shape, either generation:
--   IQ import: { product_id, name, sku, quantity, unit_cost, color, imeis: ["356…", …] }
--   GRV form:  { product_id, name, sku, qty_received, cost_price,
--                imeis: [{ imei: "356…", color: "Black" }, …] }
-- A unit entry that is 15 digits is an IMEI; anything else is a serial
-- number. A unit's own colour wins; the line colour is the fallback.
create or replace function public.receive_grv(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  g public.grvs%rowtype;
  v_actor text := public.current_actor();
  line jsonb;
  unit jsonb;
  v_product bigint;
  v_qty integer;
  v_cost numeric(12,2);
  v_imei text;
  v_serial text;
  v_color text;
  v_imeis_taken integer := 0;
  v_line_imeis integer := 0;
  v_units integer := 0;
  v_lines integer := 0;
  v_tracked boolean;
  v_was_tracked boolean;
  v_stock_before integer;
  v_stock_after integer;
  v_short jsonb := '[]'::jsonb;
  v_switched jsonb := '[]'::jsonb;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select * into g from public.grvs where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Goods received note not found.');
  end if;

  -- Posting twice would double the stock, and the second posting would look
  -- exactly like the first in the movement history.
  if g.posted_at is not null then
    return jsonb_build_object(
      'ok', false,
      'message', format('Already received into stock on %s by %s.',
                        to_char(g.posted_at, 'DD Mon YYYY'), coalesce(g.posted_by, 'someone'))
    );
  end if;

  if jsonb_array_length(coalesce(g.items, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'message', 'There is nothing on this note to receive.');
  end if;

  for line in select value from jsonb_array_elements(g.items) loop
    v_product := nullif(line ->> 'product_id', '')::bigint;
    v_qty     := greatest(coalesce(
                   nullif(line ->> 'quantity', '')::integer,
                   nullif(line ->> 'qty_received', '')::integer, 0), 0);
    v_cost    := coalesce(
                   nullif(line ->> 'unit_cost', '')::numeric,
                   nullif(line ->> 'cost_price', '')::numeric);

    continue when v_product is null or v_qty = 0;
    v_line_imeis := 0;

    select stock, exists (select 1 from public.product_imeis where product_id = v_product)
    into v_stock_before, v_was_tracked
    from public.products where id = v_product;

    -- Serials first. sync_product_stock_from_imeis makes products.stock the
    -- count of available serials as soon as a product has any, so inserting
    -- them after adjusting stock would silently overwrite the adjustment.
    for unit in
      select value from jsonb_array_elements(coalesce(line -> 'imeis', '[]'::jsonb))
    loop
      if jsonb_typeof(unit) = 'object' then
        v_imei  := trim(both from coalesce(unit ->> 'imei', unit ->> 'serial', ''));
        v_color := nullif(trim(both from coalesce(unit ->> 'color', '')), '');
      else
        v_imei  := trim(both from coalesce(unit #>> '{}', ''));
        v_color := null;
      end if;
      v_color := coalesce(v_color, nullif(trim(both from coalesce(line ->> 'color', '')), ''));

      continue when v_imei = '';

      -- 15 digits is an IMEI; anything else is a serial number. Each column
      -- carries its own uniqueness, so each needs its own conflict target.
      if v_imei ~ '^\d{15}$' then
        insert into public.product_imeis (product_id, sku, color, imei, status)
        values (v_product, line ->> 'sku', v_color, v_imei, 'available')
        on conflict (imei) where imei is not null and imei <> '' do nothing;
      else
        v_serial := v_imei;
        insert into public.product_imeis (product_id, sku, color, serial_number, status)
        values (v_product, line ->> 'sku', v_color, v_serial, 'available')
        on conflict (serial_number) where serial_number is not null and serial_number <> '' do nothing;
      end if;

      if found then v_line_imeis := v_line_imeis + 1; end if;
    end loop;

    select exists (select 1 from public.product_imeis where product_id = v_product)
    into v_tracked;

    update public.products
       set -- A serial-tracked product is counted by its serials, and the sync
           -- trigger has already set the figure. Adding the quantity on top
           -- would double-count it.
           stock = case when v_tracked then stock else stock + v_qty end,
           -- Last cost wins, rather than a weighted average against the
           -- quantity already on the books. Those quantities are not yet
           -- trustworthy, and averaging against a wrong number would spread the
           -- error into cost prices that are currently correct.
           cost_price = coalesce(v_cost, cost_price),
           updated_at = now()
     where id = v_product;

    insert into public.stock_movements (
      product_id, product_name, movement_type, quantity,
      reference_type, reference_id, notes, user_name
    )
    values (
      v_product, line ->> 'name', 'receipt', v_qty,
      'grv', g.id::text,
      coalesce(g.supplier_invoice_no, g.supplier_name), v_actor
    );

    -- Received without a serial on a tracked product means the shelf and the
    -- system will disagree until someone captures it. Reported, not blocked:
    -- refusing the delivery at the counter helps nobody.
    if v_tracked and not v_was_tracked then
      select stock into v_stock_after from public.products where id = v_product;
      v_switched := v_switched || jsonb_build_object(
        'name', line ->> 'name',
        'stock_before', v_stock_before,
        'stock_after', v_stock_after
      );
    end if;

    if v_tracked and v_line_imeis < v_qty then
      v_short := v_short || jsonb_build_object(
        'name', line ->> 'name',
        'received', v_qty,
        'serials', v_line_imeis
      );
    end if;

    v_imeis_taken := v_imeis_taken + v_line_imeis;
    v_units := v_units + v_qty;
    v_lines := v_lines + 1;
  end loop;

  update public.grvs
     set status = 'Received',
         posted_at = now(),
         posted_by = v_actor,
         updated_at = now()
   where id = p_id
  returning * into g;

  if g.purchase_order_id is not null then
    update public.purchase_orders
       set status = 'Received', received_at = now(), updated_at = now()
     where id = g.purchase_order_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'grv', to_jsonb(g),
    'lines', v_lines,
    'units', v_units,
    'imeis', v_imeis_taken,
    'short_on_serials', v_short,
    'switched_to_serials', v_switched
  );
end;
$$;

/* ── Reserving stock: the colour the customer chose ──────────────────────── */

-- Order lines carry the colour the shopper picked ('color', set by the
-- storefront's colour selector). Reservation now honours it: availability is
-- checked per colour, and only units of the chosen colour are flipped to
-- 'reserved'. Lines without a colour behave exactly as before — any unit of
-- the product will do. Legacy carts write 'qty' where the new modules write
-- 'quantity'; both are read.
create or replace function public.reserve_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      public.orders%rowtype;
  v_product_id bigint;
  v_color      text;
  v_name       text;
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

  -- Pass 1a: lock each product and check the overall count, colour-blind.
  -- One product can appear on several lines (two colours of the same
  -- handset); checking each line against the full available count would let
  -- the order over-promise stock. Ascending product_id order gives every
  -- caller the same lock order, so two orders sharing lines cannot deadlock.
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

    -- Serialised products are limited by their unit pool, not the stock column.
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

  -- Pass 1b: for lines that name a colour, that exact colour must be there.
  -- The products are already locked, so these counts cannot move under us.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           nullif(trim(both from coalesce(t.value->>'color', '')), ''),
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
      continue; -- colour noted on an untracked product: nothing to hold to it
    end if;

    select count(*)::integer into v_imei_count
    from public.product_imeis
    where product_id = v_product_id and status = 'available'
      and trim(both from coalesce(color, '')) = v_color;

    if v_imei_count < v_qty then
      select name into v_name from public.products where id = v_product_id;
      v_shortages := v_shortages || jsonb_build_object(
        'name', coalesce(v_name, 'Product #' || v_product_id) || ' (' || v_color || ')',
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
  -- unit a coloured line needs.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           nullif(trim(both from coalesce(t.value->>'color', '')), ''),
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
      update public.product_imeis
      set status = 'reserved', order_id = p_order_id
      where id in (
        select id from public.product_imeis
        where product_id = v_product_id and status = 'available'
          and (v_color is null or trim(both from coalesce(color, '')) = v_color)
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
       'Reserved at checkout' || case when v_color is null then '' else ' — ' || v_color end);
  end loop;

  update public.orders
  set stock_reserved = true,
      reservation_expires_at = now() + interval '30 minutes'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock reserved.');
end;
$$;
