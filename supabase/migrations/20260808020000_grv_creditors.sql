-- Posting a delivery now raises what the shop owes the supplier.
--
-- Receiving already moved the stock, stamped the cost and captured the
-- serials — but the creditors ledger never heard about it, so the money owed
-- for a delivery had to be remembered rather than read. A trigger keeps the
-- bookkeeping attached to the posting itself: the bill appears the moment
-- the GRV posts, once, and never for a draft.

create or replace function public.grv_post_creditor_bill()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_supplier_id bigint;
begin
  -- A zero-value delivery (warranty replacements, samples) owes nothing.
  if coalesce(new.total_amount, 0) <= 0 then
    return new;
  end if;

  select id into v_supplier_id
  from public.suppliers
  where lower(name) = lower(coalesce(new.supplier_name, ''))
  limit 1;

  insert into public.account_transactions
    (account_type, supplier_id, party_name, txn_type, amount, reference,
     doc_type, doc_id, notes, txn_date, created_by)
  values
    ('creditor', v_supplier_id, new.supplier_name, 'bill', new.total_amount,
     new.supplier_invoice_no, 'grv', new.id::text,
     'Goods received — delivery #' || new.id,
     coalesce(new.invoice_date, current_date), new.posted_by);

  return new;
end;
$$;

drop trigger if exists grvs_post_to_creditors on public.grvs;
create trigger grvs_post_to_creditors
  after update of posted_at on public.grvs
  for each row
  when (old.posted_at is null and new.posted_at is not null)
  execute function public.grv_post_creditor_bill();
