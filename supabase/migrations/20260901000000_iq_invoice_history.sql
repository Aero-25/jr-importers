-- The sales history IQ held, kept as documents.
--
-- These are imported for reference only and deliberately do NOT post to
-- public.account_transactions. The debtor and creditor opening balances
-- already carry every cent owed; posting these invoices as well would count
-- the same debt twice and leave the ledger reconciling to nothing.
--
-- The export is document headers only — one row per document, no line items —
-- so `items` stays empty. That is a limit of what IQ exported, not an omission
-- here, and it means these rows can tell you what was sold for how much and to
-- whom, but not which handset was on the invoice.

alter table public.invoices
  add column if not exists doc_type    text,
  add column if not exists source      text,
  add column if not exists iq_data     jsonb;

-- One row per IQ document number, so a re-run updates rather than duplicates.
create unique index if not exists invoices_invoice_number_key
  on public.invoices (invoice_number) where invoice_number is not null;

create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_source_idx   on public.invoices (source);

comment on column public.invoices.iq_data is
  'The complete IQ document header this invoice was imported from, IQ''s own field names.';
comment on column public.invoices.source is
  'Where the row came from. ''iq-import'' marks historical documents carried over from IQ Retail; rows the shop raises itself leave this null.';
