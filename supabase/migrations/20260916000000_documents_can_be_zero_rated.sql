/*
  A document can be raised with no VAT on it.

  Commission is not the shop's own supply — the money passes through — but
  every invoice had 15% worked backwards out of its total regardless. An
  N$ 88,000 commission invoice therefore printed N$ 11,478.26 of VAT that was
  never charged, and the counter's only way out was to raise the document
  outside the system.

  `charge_vat` says whether the document carries VAT. It defaults to true, so
  every invoice and quote already on file keeps the VAT it was issued with and
  the till, which always charges VAT, is unaffected.

  Unticking it makes `vat_amount` zero and `subtotal_amount` the whole total.
  Prices here are VAT-inclusive, so what the customer owes does not move —
  only the tax split disappears.
*/

alter table public.invoices
  add column if not exists charge_vat boolean not null default true;

alter table public.quotes
  add column if not exists charge_vat boolean not null default true;

comment on column public.invoices.charge_vat is
  'False on a zero-rated document (commission and the like): vat_amount is 0 and subtotal_amount equals total_amount.';

comment on column public.quotes.charge_vat is
  'False on a zero-rated document (commission and the like): vat_amount is 0 and subtotal_amount equals total_amount.';
