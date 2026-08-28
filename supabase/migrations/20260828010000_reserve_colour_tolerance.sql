-- Colour matching that cannot block a sellable phone.
--
-- The colour-exact reservation compared the order line's colour to unit
-- colours byte-for-byte. Two ways that turns stale metadata into lost sales:
--
--   1. Case and spacing: units are booked in through free-text inputs, so
--      "black" and "Black " are the same shelf but failed the comparison.
--
--   2. Phantom colours: a cart line can carry a colour that no unit of the
--      product has ever had (a catalogue field, not a shopper's choice).
--      Failing the order over a colour that does not exist in the unit pool
--      protects nothing — there is no unit of another colour being taken
--      from anyone. Such a line now reserves colour-blind. A colour that
--      does exist in the pool but has run out still fails the order, which
--      is the case the check is for.
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
  v_known      boolean;
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

      update public.product_imeis
      set status = 'reserved', order_id = p_order_id
      where id in (
        select id from public.product_imeis
        where product_id = v_product_id and status = 'available'
          and (v_color is null or lower(trim(both from coalesce(color, ''))) = v_color)
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
       'Reserved at checkout' || case when v_color is null then '' else ' — ' || initcap(v_color) end);
  end loop;

  update public.orders
  set stock_reserved = true,
      reservation_expires_at = now() + interval '30 minutes'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock reserved.');
end;
$$;
