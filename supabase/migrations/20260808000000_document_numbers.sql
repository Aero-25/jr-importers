-- Quote and invoice numbers assigned by the database, in creation order.
--
-- Hand-typed document numbers drift: two staff pick the same number, or skip
-- a hundred. A printed quote whose number cannot be found again later is a
-- dispute waiting to happen, so the counter lives here — same pattern as
-- job_card_number_seq — and the forms no longer offer the field at all.
--
-- Numbers only ever move forward. A failed insert can leave a gap, which is
-- harmless; what the sequence guarantees is order and uniqueness.

-- ── Quotes ────────────────────────────────────────────────────────────────

create sequence if not exists public.quote_number_seq;

create or replace function public.assign_quote_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare n bigint;
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    n := nextval('public.quote_number_seq');
    -- greatest() because lpad truncates: number 10000 must not become "1000".
    new.quote_number := 'Q-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end;
$$;

drop trigger if exists quotes_assign_number on public.quotes;
create trigger quotes_assign_number
  before insert on public.quotes
  for each row execute function public.assign_quote_number();

-- Existing quotes without a number get one now, oldest first, so the ledger
-- reads in the order the quotes were actually made.
do $$
declare r record; n bigint;
begin
  for r in (
    select id from public.quotes
    where quote_number is null or btrim(quote_number) = ''
    order by created_at, id
  ) loop
    n := nextval('public.quote_number_seq');
    update public.quotes
      set quote_number = 'Q-' || lpad(n::text, greatest(4, length(n::text)), '0')
      where id = r.id;
  end loop;
end;
$$;

-- Continue after the highest number already in use, including any that were
-- typed by hand before this migration.
select setval(
  'public.quote_number_seq',
  greatest(
    (select coalesce(max(substring(quote_number from '(\d+)\s*$')::bigint), 0)
       from public.quotes
       where quote_number ~ '\d+\s*$'),
    1
  ),
  true
);

create index if not exists quotes_number_idx on public.quotes (quote_number);
grant usage, select on sequence public.quote_number_seq to authenticated;

-- ── Invoices ──────────────────────────────────────────────────────────────
-- The invoices table never had a number column at all.

alter table public.invoices add column if not exists invoice_number text;

create sequence if not exists public.invoice_number_seq;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare n bigint;
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    n := nextval('public.invoice_number_seq');
    new.invoice_number := 'INV-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_assign_number on public.invoices;
create trigger invoices_assign_number
  before insert on public.invoices
  for each row execute function public.assign_invoice_number();

do $$
declare r record; n bigint;
begin
  for r in (
    select id from public.invoices
    where invoice_number is null or btrim(invoice_number) = ''
    order by created_at, id
  ) loop
    n := nextval('public.invoice_number_seq');
    update public.invoices
      set invoice_number = 'INV-' || lpad(n::text, greatest(4, length(n::text)), '0')
      where id = r.id;
  end loop;
end;
$$;

select setval(
  'public.invoice_number_seq',
  greatest(
    (select coalesce(max(substring(invoice_number from '(\d+)\s*$')::bigint), 0)
       from public.invoices
       where invoice_number ~ '\d+\s*$'),
    1
  ),
  true
);

create index if not exists invoices_number_idx on public.invoices (invoice_number);
grant usage, select on sequence public.invoice_number_seq to authenticated;
