-- Stock intake: purchase order → goods received → stock.
--
-- Stock was appearing with no provenance. 43 products carried 4,758 units
-- between them on two stock movements and zero purchase orders, so the system
-- could not answer where a unit came from, what it cost, or who booked it in.
--
-- Receiving is now a posting, not an edit: it adds the stock, records the
-- movement, captures the serials and stamps the cost, all in one transaction,
-- and it can only happen once per GRV.

alter table public.grvs
  add column if not exists purchase_order_id bigint references public.purchase_orders(id),
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by text,
  add column if not exists received_by text;

alter table public.purchase_orders
  add column if not exists received_at timestamptz,
  add column if not exists expected_date date;

-- The same handset must not be bookable twice. There are no IMEIs captured yet,
-- so this can go on cleanly; after the first stock take it would have needed a
-- de-duplication pass first.
create unique index if not exists product_imeis_imei_key
  on public.product_imeis (imei)
  where imei is not null and imei <> '';

/* ── Posting a GRV ───────────────────────────────────────────────────────── */

-- Line shape: { product_id, name, quantity, unit_cost, line_total, imeis: [] }
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
  v_product bigint;
  v_qty integer;
  v_cost numeric(12,2);
  v_imei text;
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
    v_qty     := greatest(coalesce((line ->> 'quantity')::integer, 0), 0);
    v_cost    := nullif(line ->> 'unit_cost', '')::numeric;

    continue when v_product is null or v_qty = 0;
    v_line_imeis := 0;

    select stock, exists (select 1 from public.product_imeis where product_id = v_product)
    into v_stock_before, v_was_tracked
    from public.products where id = v_product;

    -- Serials first. sync_product_stock_from_imeis makes products.stock the
    -- count of available serials as soon as a product has any, so inserting
    -- them after adjusting stock would silently overwrite the adjustment.
    for v_imei in
      select trim(both from x)
      from jsonb_array_elements_text(coalesce(line -> 'imeis', '[]'::jsonb)) as t(x)
      where trim(both from x) <> ''
    loop
      insert into public.product_imeis (product_id, sku, color, imei, status)
      values (v_product, line ->> 'sku', line ->> 'color', v_imei, 'available')
      on conflict (imei) where imei is not null and imei <> '' do nothing;

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
    -- The first serial captured against a product hands the stock figure over
    -- to the serial list for good, and whatever was on the books before is
    -- discarded. That is the intended direction of travel, but it is not
    -- something anyone should discover from a shelf count a week later.
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

/* ── Turning an order into a delivery ────────────────────────────────────── */

create or replace function public.grv_from_purchase_order(p_po_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  po public.purchase_orders%rowtype;
  v_id bigint;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select * into po from public.purchase_orders where id = p_po_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Purchase order not found.');
  end if;

  -- Quantities are copied as ordered, then edited down to what actually turned
  -- up. Short deliveries are the normal case, not the exception.
  insert into public.grvs (
    supplier_id, supplier_name, po_number, purchase_order_id,
    items, total_amount, status, invoice_date
  )
  values (
    po.supplier_id, po.supplier_name, po.id::text, po.id,
    coalesce(po.items, '[]'::jsonb), po.total_amount, 'Draft', current_date
  )
  returning id into v_id;

  update public.purchase_orders
     set status = 'Receiving', updated_at = now()
   where id = p_po_id;

  return jsonb_build_object(
    'ok', true,
    'grv', (select to_jsonb(x) from public.grvs x where x.id = v_id)
  );
end;
$$;

revoke all on function public.receive_grv(bigint) from public, anon;
revoke all on function public.grv_from_purchase_order(bigint) from public, anon;
grant execute on function public.receive_grv(bigint) to authenticated;
grant execute on function public.grv_from_purchase_order(bigint) to authenticated;
