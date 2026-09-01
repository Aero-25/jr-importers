-- New invoices continue the shop's existing invoice book.
--
-- The numbering carried over from IQ runs INV0 to INV12113 — a plain "INV"
-- prefix, no dash and no zero padding. The previous migration started a fresh
-- INV-0001 series alongside it, which leaves the shop with two books running at
-- once and an invoice number that means nothing to a customer holding an older
-- statement.
--
-- One series, continuing where IQ left off.

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    n := public.next_document_number('invoice');
    -- No padding: the imported series is unpadded (INV0 through INV12113), and
    -- a padded INV012114 would sort and read as a different book.
    new.invoice_number := 'INV' || n::text;
  end if;
  return new;
end;
$$;

-- Seed past the highest number already issued, whichever series it came from.
insert into public.document_counters (name, next_value)
values (
  'invoice',
  coalesce((select max(substring(invoice_number from 4)::bigint) + 1
              from public.invoices
             where invoice_number ~ '^INV[0-9]+$'), 1)
)
on conflict (name) do update set next_value = excluded.next_value;

-- Move the four invoices raised on the short-lived INV-0001 series onto the
-- real book, in creation order so the sequence still reflects what was raised
-- when. No collision is possible: they land above the imported maximum.
with ranked as (
  select id,
         row_number() over (order by created_at, id) - 1 as offset_from_start
    from public.invoices
   where invoice_number ~ '^INV-[0-9]+$'
),
base as (
  select next_value as start_at from public.document_counters where name = 'invoice'
)
update public.invoices i
   set invoice_number = 'INV' || (base.start_at + r.offset_from_start)::text
  from ranked r, base
 where r.id = i.id;

-- Advance the counter past the four just placed.
update public.document_counters
   set next_value = coalesce((select max(substring(invoice_number from 4)::bigint) + 1
                                from public.invoices
                               where invoice_number ~ '^INV[0-9]+$'), next_value),
       updated_at = now()
 where name = 'invoice';
