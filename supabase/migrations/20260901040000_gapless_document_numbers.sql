-- Invoice numbers that follow each other.
--
-- Numbers came from a Postgres sequence, and nextval is deliberately outside
-- transaction control: it never rolls back, so every failed insert burned a
-- number permanently. Four invoices had reached INV-0016 — the twelve missing
-- numbers were failed saves and rolled-back tests.
--
-- The original migration called that harmless. For ordering and uniqueness it
-- is. For a tax invoice it is not: a gap in an issued sequence is something the
-- shop has to be able to explain, and "the software skipped it" is a poor
-- answer to a revenue audit.
--
-- A counter row replaces the sequence. UPDATE takes a row lock, so two cashiers
-- saving at the same moment queue rather than both reading the same number, and
-- the increment lives inside the caller's transaction — if their insert fails,
-- the number goes back. That serialises document creation, which is the right
-- trade here: one counter for a shop that issues a handful of invoices an hour.

create table if not exists public.document_counters (
  name       text primary key,
  next_value bigint not null,
  updated_at timestamptz not null default now()
);

alter table public.document_counters enable row level security;

-- Reached only through the security-definer function below, never directly.
drop policy if exists "no direct access to counters" on public.document_counters;

create or replace function public.next_document_number(p_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  update public.document_counters
     set next_value = next_value + 1, updated_at = now()
   where name = p_name
   returning next_value - 1 into n;

  if n is null then
    insert into public.document_counters (name, next_value)
    values (p_name, 2)
    on conflict (name) do update
      set next_value = public.document_counters.next_value + 1
    returning next_value - 1 into n;
  end if;

  return n;
end;
$$;

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
    -- greatest() because lpad truncates: number 10000 must not become "1000".
    new.invoice_number := 'INV-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end;
$$;

create or replace function public.assign_quote_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    n := public.next_document_number('quote');
    new.quote_number := 'Q-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end;
$$;

-- ── Close the gaps already issued ─────────────────────────────────────────
--
-- Renumbered in creation order, so the sequence still tells the truth about
-- what was raised when. Imported IQ documents keep their own numbers and are
-- untouched: they belong to the old system's series.
--
-- Two passes because the unique index is not deferrable — moving INV-0015 down
-- to INV-0003 would collide with the row still holding that number.
update public.invoices
   set invoice_number = 'TMP-' || id
 where source is distinct from 'iq-import'
   and invoice_number like 'INV-%';

with ranked as (
  select id, row_number() over (order by created_at, id) as rn
    from public.invoices
   where invoice_number like 'TMP-%'
)
update public.invoices i
   set invoice_number = 'INV-' || lpad(r.rn::text, 4, '0')
  from ranked r
 where r.id = i.id;

-- Seed the counters past what is already issued.
insert into public.document_counters (name, next_value)
values (
  'invoice',
  coalesce((select max(substring(invoice_number from 5)::bigint) + 1
              from public.invoices
             where invoice_number ~ '^INV-[0-9]+$'), 1)
)
on conflict (name) do update set next_value = excluded.next_value;

insert into public.document_counters (name, next_value)
values (
  'quote',
  coalesce((select max(substring(quote_number from 3)::bigint) + 1
              from public.quotes
             where quote_number ~ '^Q-[0-9]+$'), 1)
)
on conflict (name) do update set next_value = excluded.next_value;
