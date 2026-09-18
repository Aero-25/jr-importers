/*
  An invoice can be for a repair.

  Parts and labour on a job card were invoiced by typing a PARTS line and
  hoping the two documents could be matched up later by name. Nothing tied
  them together: a job card had no way of saying it had been invoiced, and
  an invoice could not say which repair it was for.

  The invoice now carries the job card it settles. From the job card the
  shop can raise the invoice in one step; from an invoice the shop can pick
  the job card and have the repair line and the customer filled in. Either
  way the link is the same column, and a job card can only be invoiced once.
*/

alter table public.invoices
  add column if not exists job_card_id bigint references public.job_cards(id) on delete set null;

comment on column public.invoices.job_card_id is
  'The repair this invoice settles. Set when the invoice is raised from a job card, or when a job card is picked on the invoice.';

-- One invoice per repair. A second invoice for the same job is a mistake, not
-- a use case: amend the first.
create unique index if not exists invoices_job_card_key
  on public.invoices (job_card_id) where job_card_id is not null;
