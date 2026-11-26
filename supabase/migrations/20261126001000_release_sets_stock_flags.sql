-- Same fault as 20261126000000, on the way back: when the expiry cron (no JWT,
-- so not staff) releases an order, limit_customer_order_updates() copied the
-- old stock_reserved/stock_returned back. The order was cancelled but still
-- read as not returned, so a later release would add the stock again.

CREATE OR REPLACE FUNCTION public.release_order_stock(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_qty integer;
  v_released integer;
begin
  -- Returning stock to the shelf writes the stock figure the shop trades on.
  -- A direct database session with no request claims (pg_cron releasing an
  -- expired checkout) may run it; any call through the API must be staff.
  if nullif(current_setting('request.jwt.claims', true), '') is not null and not public.is_staff() then
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

  -- limit_customer_order_updates() pins the stock flags outside a stock
  -- operation; pg_cron is not staff, so mark this write as the release.
  perform set_config('jr.stock_op', 'on', true);
  update public.orders
  set stock_returned = true, stock_reserved = false, reservation_expires_at = null
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock released.');
end;
$function$;
