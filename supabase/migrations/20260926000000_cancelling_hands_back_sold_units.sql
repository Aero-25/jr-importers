/*
  Cancelling a till sale has to hand the handset back.

  `release_order_stock` only ever freed units it found marked `reserved`.
  That is the online path: a shopper reserves, and the reservation is
  released if they abandon it. A counter sale is different — it is paid the
  moment it is rung up, so `order_mark_units_sold` marks its units `sold`
  immediately. Cancelling such a sale therefore found nothing to release: it
  logged no movement, left the IMEI sold against a cancelled order, and left
  the phone missing from stock. The unit was still on the shelf.

  A cancelled order holds nothing. Units it holds come back whatever state
  they are in — reserved or sold — and the count is rebuilt from them.

  Deleting a POS invoice is also handled here. That invoice is a view of its
  order: deleting it alone left the sale standing (the shop then had to go
  and cancel the order by hand), and the next update to the order would have
  written the invoice straight back. Deleting it now cancels the sale it
  belongs to and returns the stock, which is what deleting it was meant to
  mean.
*/

create or replace function public.release_order_stock(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_product_id bigint;
  v_qty integer;
  v_released integer;
begin
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

-- ---------------------------------------------------------------------------
-- Deleting a POS invoice cancels the sale behind it.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_delete_cancels_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only an invoice raised from a counter sale. An account invoice typed by
  -- hand has no order behind it, and imported IQ history must never move
  -- today's stock.
  if old.order_id is null or coalesce(old.source, '') <> 'pos' then
    return old;
  end if;

  perform public.release_order_stock(old.order_id);

  update public.orders
     set status = 'Cancelled',
         notes  = concat_ws(' · ', notes, 'Cancelled: invoice ' || coalesce(old.invoice_number, '') || ' deleted')
   where id = old.order_id
     and status <> 'Cancelled';

  return old;
end;
$$;

drop trigger if exists invoices_delete_cancels_order on public.invoices;
create trigger invoices_delete_cancels_order
  before delete on public.invoices
  for each row
  execute function public.invoice_delete_cancels_order();
