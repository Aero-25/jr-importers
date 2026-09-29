/*
  VAT, read off the documents that carry it.

  Two things, one of them serious.

  `vat_return` built output VAT from `orders` alone. Every invoice — the
  12,111 brought over from IQ, every credit note, and every invoice raised at
  the console — was invisible to it. July 2026 and August 2026 each returned
  N$0.00 of output VAT while the invoices for those months hold N$57,459.09
  and N$46,339.41. Filing from that screen would have declared nothing on
  N$795,787.97 of sales. Output VAT now comes from the invoices, which is
  where a VAT return's figures actually live: a till sale writes an invoice
  beside its order, and every sellable order has one, so nothing is counted
  twice and nothing is missed.

  It also derived the VAT by taking 15/115 of the total rather than reading
  the VAT each document recorded. That is the same answer only while every
  document is standard-rated; a zero-rated one would have had VAT invented
  for it. The recorded figure is used instead.

  Second, the shop could see a summary but never the transaction listing that
  IQ printed — date, reference, customer, amount, VAT, one row per document.
  That listing is what gets checked against a return, so `vat_transactions`
  produces it in exactly IQ's columns and order.
*/

-- The VAT transaction listing, in IQ's shape: one row per document, oldest
-- first, credit notes carrying their negatives. `Description` is rebuilt the
-- way IQ printed it — the account code then the customer's name, collapsed
-- to one where the account is the name, as it is for CASH.
create or replace function public.vat_transactions(p_from date, p_to date)
returns table (
  tx_date date,
  reference text,
  description text,
  excl numeric,
  vat numeric,
  incl numeric,
  doc_type text,
  status text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    (i.created_at at time zone 'Africa/Windhoek')::date,
    coalesce(i.invoice_number, '#' || i.id::text),
    case
      when coalesce(nullif(btrim(c.account_code), ''), '') = ''
        then coalesce(nullif(btrim(i.customer_name), ''), 'CASH')
      when lower(btrim(c.account_code)) = lower(btrim(coalesce(c.name, i.customer_name, '')))
        then btrim(c.account_code)
      else btrim(c.account_code) || ' ' || coalesce(nullif(btrim(c.name), ''), btrim(coalesce(i.customer_name, '')))
    end,
    coalesce(i.subtotal_amount, 0),
    coalesce(i.vat_amount, 0),
    coalesce(i.total_amount, 0),
    coalesce(i.doc_type, 'invoice'),
    lower(coalesce(i.status, ''))
  from public.invoices i
  left join public.customers c on c.id = i.customer_id
  where public.is_admin()
    and (i.created_at at time zone 'Africa/Windhoek')::date between p_from and p_to
  order by (i.created_at at time zone 'Africa/Windhoek')::date, i.id;
$$;

revoke all on function public.vat_transactions(date, date) from public;
grant execute on function public.vat_transactions(date, date) to authenticated;

comment on function public.vat_transactions(date, date) is
  'The VAT transaction listing in IQ''s columns: TxDate, Reference, Description, Amount (excl), VatAmount. One row per document, credit notes negative.';


-- The return itself, with its output side taken from the documents.
create or replace function public.vat_return(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_rate numeric := 0.15;
  v_sales_inc numeric(14,2);
  v_credits_inc numeric(14,2);
  v_output numeric(14,2);
  v_documents integer;
  v_purchases_inc numeric(14,2);
  v_expenses_inc numeric(14,2);
  v_input numeric(14,2);
  v_refunds_recorded numeric(14,2);
  v_locked boolean;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select nullif(btrim(value::text, '"'), '')::numeric into v_rate
  from public.settings where key = 'vat_rate';
  if v_rate is null or v_rate <= 0 then v_rate := 0.15; end if;
  -- Stored as either 15 or 0.15 depending on who typed it.
  if v_rate > 1 then v_rate := v_rate / 100; end if;

  -- Output VAT is what the tax invoices say it is. Not 15/115 of the total:
  -- a zero-rated document records no VAT, and must not have any invented
  -- for it. Credit notes are invoices with negative amounts, so issuing one
  -- takes its VAT back out here without any separate handling.
  select
    coalesce(sum(i.total_amount) filter (where coalesce(i.doc_type,'invoice') <> 'credit_note'), 0),
    coalesce(sum(-i.total_amount) filter (where coalesce(i.doc_type,'invoice') = 'credit_note'), 0),
    coalesce(sum(i.vat_amount), 0),
    count(*)
  into v_sales_inc, v_credits_inc, v_output, v_documents
  from public.invoices i
  where (i.created_at at time zone 'Africa/Windhoek')::date between p_from and p_to;

  -- Refunds are effected by crediting the invoice, so they are already in
  -- the figures above. Anything sitting in the refunds table on top of that
  -- is reported separately rather than quietly added, which would count the
  -- same money out twice.
  select coalesce(sum(total_amount), 0) into v_refunds_recorded
  from public.refunds
  where approved_at::date between p_from and p_to and status = 'Approved';

  -- Input VAT has no recorded figure to read: a GRV and an expense carry
  -- only what was paid, so it is still taken out of the inclusive total.
  select coalesce(sum(total_amount), 0) into v_purchases_inc
  from public.grvs
  where posted_at::date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_expenses_inc
  from public.expenses
  where expense_date between p_from and p_to
    and coalesce(tax_deductible, false);

  v_input := round((v_purchases_inc + v_expenses_inc) * v_rate / (1 + v_rate), 2);

  select public.is_period_locked(p_to::timestamptz) into v_locked;

  return jsonb_build_object(
    'ok', true,
    'period_from', p_from,
    'period_to', p_to,
    'rate', v_rate,
    'period_locked', v_locked,
    'sales_inc', v_sales_inc,
    'refunds_inc', v_credits_inc,
    'net_sales_inc', v_sales_inc - v_credits_inc,
    'output_vat', v_output,
    'document_count', v_documents,
    'refunds_recorded', v_refunds_recorded,
    'purchases_inc', v_purchases_inc,
    'expenses_inc', v_expenses_inc,
    'input_vat', v_input,
    'payable', round(v_output - v_input, 2)
  );
end;
$function$;
