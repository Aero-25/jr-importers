-- A paid sale's units are sold, not reserved.
--
-- reserve_order_stock marks units 'reserved' and stops there. Stock is correct
-- either way — products.stock counts available units only — but the unit never
-- gained sold_at or sold_order_id, so asking "which sale did this IMEI go out
-- on?" had no answer. That question is where every warranty claim, insurance
-- letter and police enquiry starts.
--
-- Reserved is still the right state between checkout and payment: it holds the
-- handset without claiming it has gone.

create or replace function public.order_mark_units_sold()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status not in ('Paid', 'Completed', 'Delivered', 'Dispatched') then
    return new;
  end if;

  update public.product_imeis
     set status = 'sold',
         sold_at = coalesce(sold_at, now()),
         sold_order_id = coalesce(sold_order_id, new.id),
         updated_at = now()
   where order_id = new.id
     and status = 'reserved';

  return new;
end;
$$;

drop trigger if exists orders_mark_units_sold on public.orders;
create trigger orders_mark_units_sold
after insert or update of status on public.orders
for each row execute function public.order_mark_units_sold();

-- Units still held against orders that were paid before this existed.
update public.product_imeis i
   set status = 'sold',
       sold_at = coalesce(i.sold_at, o.created_at),
       sold_order_id = coalesce(i.sold_order_id, o.id),
       updated_at = now()
  from public.orders o
 where i.order_id = o.id
   and i.status = 'reserved'
   and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched');
