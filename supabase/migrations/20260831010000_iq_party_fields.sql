-- Everything IQ knew about a debtor or a creditor, kept and visible.
--
-- The first import took five fields per party and dropped the rest. The export
-- carries 162 columns; 79 of them hold data for debtors and 63 for creditors,
-- so most of what the business had accumulated was being thrown away.
--
-- Two kinds of field, handled differently:
--
--   1. Fields whose meaning is unambiguous outside IQ get real columns, so
--      they can be searched, sorted and reported on.
--
--   2. Everything else — IQ's own workflow flags, ageing buckets, custom C_*
--      slots, layout and printing preferences — goes into `iq_data` verbatim.
--      Promoting them would mean guessing at semantics we do not have the code
--      tables for, and guessing wrong is worse than keeping the raw record.
--
-- Deliberately NOT promoted, having looked at the actual values:
--
--   * ISACTIVE reads 'False' on all 2,492 debtors. Mapped to `active` it would
--     switch off the entire customer base on day one. It means something inside
--     IQ that it does not mean here.
--   * TERMS holds 0, 1 or 2 — IQ term codes, not day counts. Written into
--     payment_terms it would read as "1 day" on an invoice.
--
-- Both are preserved in iq_data, where they are plainly IQ's values rather than
-- the shop's.

alter table public.customers
  add column if not exists account_code        text,
  add column if not exists opened_date         date,
  add column if not exists last_invoice_date   date,
  add column if not exists last_invoice_amount numeric(12,2),
  add column if not exists last_payment_date   date,
  add column if not exists last_payment_amount numeric(12,2),
  add column if not exists iq_data             jsonb;

alter table public.suppliers
  add column if not exists account_code        text,
  add column if not exists last_invoice_date   date,
  add column if not exists last_invoice_amount numeric(12,2),
  add column if not exists iq_data             jsonb;

-- The IQ account code is the key the shop reconciles against when a customer
-- rings up quoting their old statement, so it has to resolve to one party.
create unique index if not exists customers_account_code_key
  on public.customers (account_code) where account_code is not null;
create unique index if not exists suppliers_account_code_key
  on public.suppliers (account_code) where account_code is not null;

comment on column public.customers.iq_data is
  'The complete IQ Retail record this customer was imported from, field names as IQ exported them. Read-only history: the shop''s own columns are the live values.';
comment on column public.suppliers.iq_data is
  'The complete IQ Retail record this supplier was imported from, field names as IQ exported them.';
