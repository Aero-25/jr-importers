-- Invoicing a client properly.
--
-- Two fields the counter actually needs and had nowhere to put:
--
--   * po_number — business customers pay against their own purchase order, and
--     an invoice without it goes to the back of the queue in their accounts
--     department or comes straight back.
--   * notes — what the invoice is for, delivery arrangements, anything the
--     line items do not say on their own.
--
-- customer_id already existed but was never written: the customer picker stored
-- only a name string, so an invoice could not reach the customer's phone,
-- address or account code, and none of it reached the printed document.

alter table public.invoices
  add column if not exists po_number text,
  add column if not exists notes     text;

comment on column public.invoices.po_number is
  'The customer''s own purchase order number, printed on the invoice so their accounts department can match it.';
