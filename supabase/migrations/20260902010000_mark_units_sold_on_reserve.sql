/*
  Units sold on an already-paid order were being stranded as `reserved`.

  `order_mark_units_sold` looks for the order's reserved units, but the
  trigger only listened to `insert or update of status`. A POS sale — and any
  checkout that is already paid when the row is written — inserts the order
  with status 'Paid' and reserves the stock a few hundred milliseconds later,
  so at trigger time there was nothing to mark, and no later status change
  ever fired it again.

  `reserve_order_stock` finishes by setting `stock_reserved`, which is exactly
  the moment the units exist. Listening to that column too closes the gap:
  the units are reserved before that update runs, so the AFTER trigger sees
  them. A pending order is unaffected — its status is not a selling one, so
  the function returns early and the units stay held until payment lands.

  The backfill settles the one live sale already stranded this way: the
  Armor 30 Pro on order 04ad23cb. Stock counts were never wrong (a reserved
  unit is not available), but the unit ledger never recorded the sale.
*/

drop trigger if exists orders_mark_units_sold on public.orders;

create trigger orders_mark_units_sold
  after insert or update of status, stock_reserved on public.orders
  for each row execute function public.order_mark_units_sold();

update public.product_imeis i
   set status = 'sold',
       sold_at = coalesce(i.sold_at, o.paid_at, o.created_at),
       sold_order_id = coalesce(i.sold_order_id, o.id),
       updated_at = now()
  from public.orders o
 where i.order_id = o.id
   and i.status = 'reserved'
   and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched');
