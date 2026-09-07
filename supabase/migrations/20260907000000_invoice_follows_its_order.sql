/*
  Keep an invoice in step with the order it was raised from.

  `invoice_for_order` copies the order's amounts, but only fires on insert or a
  status change. The till writes the order and then settles its amounts a
  fraction of a second later — 750 ms in the case that surfaced this — so the
  invoice captured zeros and nothing ever went back for the real figures.
  INV12129 went out at N$0.00 for a N$2,700 phone.

  The trigger now also watches the amount columns and the line items, and
  updates the existing invoice instead of doing nothing when one is already
  there. An invoice is a mirror of its order; it should not be able to drift.
*/

create or replace function public.invoice_for_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status not in ('Paid', 'Completed', 'Delivered', 'Dispatched') then
    return new;
  end if;

  -- Already raised: bring it up to date rather than leaving it stale.
  if exists (select 1 from public.invoices where order_id = new.id) then
    update public.invoices
       set items           = coalesce(new.items, '[]'::jsonb),
           subtotal_amount = coalesce(new.subtotal_amount, 0),
           vat_amount      = coalesce(new.vat_amount, 0),
           total_amount    = coalesce(new.total_amount, 0),
           customer_name   = coalesce(new.customer_name, customer_name),
           customer_email  = coalesce(new.customer_email, customer_email),
           payment_method  = coalesce(new.payment_method, payment_method),
           till_shift_id   = coalesce(new.till_shift_id, till_shift_id),
           updated_at      = now()
     where order_id = new.id
       -- Only when something actually differs, so an unrelated order update
       -- does not churn the invoice or stamp a new updated_at for nothing.
       and (total_amount    is distinct from coalesce(new.total_amount, 0)
         or subtotal_amount is distinct from coalesce(new.subtotal_amount, 0)
         or vat_amount      is distinct from coalesce(new.vat_amount, 0)
         or items           is distinct from coalesce(new.items, '[]'::jsonb));
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
$function$;

drop trigger if exists orders_write_invoice on public.orders;

create trigger orders_write_invoice
  after insert or update of status, subtotal_amount, vat_amount, total_amount, items
  on public.orders
  for each row execute function public.invoice_for_order();

-- Repair anything already stale, INV12129 included.
update public.invoices i
   set subtotal_amount = coalesce(o.subtotal_amount, 0),
       vat_amount      = coalesce(o.vat_amount, 0),
       total_amount    = coalesce(o.total_amount, 0),
       updated_at      = now()
  from public.orders o
 where i.order_id = o.id
   and i.total_amount is distinct from coalesce(o.total_amount, 0);
