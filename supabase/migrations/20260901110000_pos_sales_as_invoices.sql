-- A till sale is an invoice too.
--
-- POS sales lived only in `orders`, so the Invoices tab showed account sales
-- and nothing the shop actually sold over the counter. The customer walked out
-- with a printed slip whose number appeared in no invoice book.
--
-- Each paid till sale now writes an invoice alongside its order, numbered from
-- the same book so the series stays whole whichever screen raised it.

alter table public.invoices
  add column if not exists order_id uuid references public.orders(id) on delete set null;

create unique index if not exists invoices_order_id_key
  on public.invoices (order_id) where order_id is not null;

create or replace function public.invoice_for_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only settled sales, and only once: the unique index on order_id is the
  -- real guard, this just avoids the churn of attempting it on every update.
  if new.status not in ('Paid', 'Completed', 'Delivered', 'Dispatched') then
    return new;
  end if;
  if exists (select 1 from public.invoices where order_id = new.id) then
    return new;
  end if;

  insert into public.invoices (
    order_id, customer_id, customer_name, customer_email,
    items, subtotal_amount, vat_amount, total_amount,
    status, payment_method, till_shift_id, doc_type, source, created_at
  )
  values (
    new.id, new.user_id, new.customer_name, new.customer_email,
    coalesce(new.items, '[]'::jsonb),
    coalesce(new.subtotal_amount, 0), coalesce(new.vat_amount, 0), coalesce(new.total_amount, 0),
    'paid', new.payment_method, new.till_shift_id, 'invoice', 'pos', new.created_at
  )
  on conflict (order_id) where order_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists orders_write_invoice on public.orders;
create trigger orders_write_invoice
after insert or update of status on public.orders
for each row execute function public.invoice_for_order();

-- Till sales already rung up before this existed.
insert into public.invoices (
  order_id, customer_id, customer_name, customer_email,
  items, subtotal_amount, vat_amount, total_amount,
  status, payment_method, till_shift_id, doc_type, source, created_at
)
select o.id, o.user_id, o.customer_name, o.customer_email,
       coalesce(o.items, '[]'::jsonb),
       coalesce(o.subtotal_amount, 0), coalesce(o.vat_amount, 0), coalesce(o.total_amount, 0),
       'paid', o.payment_method, o.till_shift_id, 'invoice', 'pos', o.created_at
  from public.orders o
 where o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched')
   and not exists (select 1 from public.invoices i where i.order_id = o.id)
 order by o.created_at;
