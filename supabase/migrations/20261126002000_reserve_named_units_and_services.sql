-- Till sales that took no stock off (17 since September).
--
-- reserve_order_stock() refused the whole sale in two cases, and the till
-- records the sale anyway (the customer has paid), so nothing came off stock:
--
-- 1. A scanned handset whose colour differed from the line's colour. The till
--    stamps the product's default colour on every line, so a scanned
--    "Wasteland Shadow" X16 was checked against "Sand Dune" stock, found
--    none, and failed. A line that names its handsets is now held to those
--    handsets only.
-- 2. A Repairs line (PARTS), which carries no stock. Service lines are now
--    skipped, so they cannot block the phone or accessory on the same sale.

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

    -- A repair or parts charge is billed, not stocked: nothing to run short of.
    continue when v_product.category = 'Repairs';

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
      -- A line that names its handsets is held to those handsets. The till
      -- stamps the product's default colour on the line, and holding a scanned
      -- Orange unit to "Black" refused the whole sale and took no stock off.
      and not (jsonb_typeof(t.value->'imeis') = 'array' and jsonb_array_length(t.value->'imeis') > 0)
      and nullif(t.value->>'imei', '') is null
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
    continue when v_product.category = 'Repairs';

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
