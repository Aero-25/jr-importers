-- Fold layby payments into the shift totals alongside orders and invoices.
--
-- Recreated with the settled/unsettled split: every invoice in the shift is a
-- sale, only a settled cash one is money in the drawer.
--
-- Payment methods are compared lowercased because orders write 'cash' while the
-- invoice screen offers 'Cash'; matching case-sensitively would quietly drop
-- every invoice into "other" and leave expected cash short.
create or replace function public.till_cash_up(p_shift_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s public.till_shifts%rowtype;
  v_opening numeric(12,2);
  v_counted numeric(12,2);
  v_cash numeric(12,2);
  v_card numeric(12,2);
  v_eft numeric(12,2);
  v_other numeric(12,2);
  v_sales numeric(12,2);
  v_count integer;
  v_inv_cash numeric(12,2);
  v_inv_card numeric(12,2);
  v_inv_eft numeric(12,2);
  v_inv_other numeric(12,2);
  v_inv_total numeric(12,2);
  v_inv_count integer;
  v_inv_unpaid numeric(12,2);
  v_inv_unpaid_count integer;
  v_lay_cash numeric(12,2);
  v_lay_card numeric(12,2);
  v_lay_eft numeric(12,2);
  v_lay_other numeric(12,2);
  v_lay_total numeric(12,2);
  v_lay_count integer;
  v_petty numeric(12,2);
  v_refunds numeric(12,2);
  v_cash_refunds numeric(12,2);
  v_refund_count integer;
  v_expected numeric(12,2);
  v_stock_lines integer;
  v_stock_var integer;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select * into s from public.till_shifts where id = p_shift_id;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Shift not found.');
  end if;

  v_opening := public.denomination_total(s.opening_denominations);
  if v_opening = 0 then v_opening := coalesce(s.opening_float, 0); end if;

  v_counted := public.denomination_total(s.closing_denominations);

  select
    coalesce(sum(o.total_amount) filter (where lower(coalesce(o.payment_method,'')) = 'cash'), 0),
    coalesce(sum(o.total_amount) filter (where lower(coalesce(o.payment_method,'')) = 'card'), 0),
    coalesce(sum(o.total_amount) filter (where lower(coalesce(o.payment_method,'')) = 'eft'), 0),
    coalesce(sum(o.total_amount) filter (
      where lower(coalesce(o.payment_method,'')) not in ('cash','card','eft')), 0),
    coalesce(sum(o.total_amount), 0),
    count(*)
  into v_cash, v_card, v_eft, v_other, v_sales, v_count
  from public.orders o
  where o.till_shift_id = p_shift_id
    and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched');

  -- Invoices settled in this shift. An invoice with no payment method recorded
  -- falls to "other": it was taken somehow, but nothing here says it was cash,
  -- so it must not raise the figure the drawer is counted against.
  -- Settled buckets require BOTH a paid status and a method. An invoice
  -- marked cash but not yet paid is a stated intention, not money in the
  -- drawer, and must not raise the figure the cashier counts against.
  select
    coalesce(sum(i.total_amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and lower(coalesce(i.payment_method,'')) = 'cash'), 0),
    coalesce(sum(i.total_amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and lower(coalesce(i.payment_method,'')) = 'card'), 0),
    coalesce(sum(i.total_amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and lower(coalesce(i.payment_method,'')) = 'eft'), 0),
    coalesce(sum(i.total_amount) filter (
      where lower(coalesce(i.status,'')) <> 'paid'
         or lower(coalesce(i.payment_method,'')) not in ('cash','card','eft')), 0),
    coalesce(sum(i.total_amount), 0),
    count(*),
    coalesce(sum(i.total_amount) filter (where lower(coalesce(i.status,'')) <> 'paid'), 0),
    count(*) filter (where lower(coalesce(i.status,'')) <> 'paid')
  into v_inv_cash, v_inv_card, v_inv_eft, v_inv_other, v_inv_total, v_inv_count,
       v_inv_unpaid, v_inv_unpaid_count
  from public.invoices i
  where i.till_shift_id = p_shift_id;

  v_cash  := v_cash  + v_inv_cash;
  v_card  := v_card  + v_inv_card;
  v_eft   := v_eft   + v_inv_eft;
  v_other := v_other + v_inv_other;
  v_sales := v_sales + v_inv_total;
  v_count := v_count + v_inv_count;

  -- Layby instalments taken in this shift. The payment is the money, not the
  -- layby: a deposit today belongs to today, and the balance belongs to the
  -- shifts it arrives in. Each payment carries the shift it was taken in, so
  -- nothing depends on matching timestamps to shift windows.
  select
    coalesce(sum(amt) filter (where m = 'cash'), 0),
    coalesce(sum(amt) filter (where m = 'card'), 0),
    coalesce(sum(amt) filter (where m = 'eft'), 0),
    coalesce(sum(amt) filter (where m not in ('cash','card','eft')), 0),
    coalesce(sum(amt), 0),
    count(*)
  into v_lay_cash, v_lay_card, v_lay_eft, v_lay_other, v_lay_total, v_lay_count
  from public.laybys l
  cross join lateral jsonb_array_elements(coalesce(l.payments, '[]'::jsonb)) as p(entry)
  cross join lateral (
    select coalesce((entry->>'amount')::numeric, 0) as amt,
           lower(coalesce(entry->>'method', '')) as m
  ) v
  where (entry->>'till_shift_id') is not null
    and (entry->>'till_shift_id')::bigint = p_shift_id;

  v_cash  := v_cash  + v_lay_cash;
  v_card  := v_card  + v_lay_card;
  v_eft   := v_eft   + v_lay_eft;
  v_other := v_other + v_lay_other;
  v_sales := v_sales + v_lay_total;
  v_count := v_count + v_lay_count;

  select coalesce(sum(e.amount), 0) into v_petty
  from public.expenses e
  where e.till_shift_id = p_shift_id;

  select
    coalesce(sum(rf.total_amount), 0),
    coalesce(sum(rf.total_amount) filter (where lower(coalesce(rf.method,'')) = 'cash'), 0),
    count(*)
  into v_refunds, v_cash_refunds, v_refund_count
  from public.refunds rf
  where rf.till_shift_id = p_shift_id
    and rf.status = 'Approved';

  v_expected := v_opening + v_cash - v_petty - v_cash_refunds;

  select count(*), coalesce(sum(abs((line->>'variance')::int)), 0)
  into v_stock_lines, v_stock_var
  from jsonb_array_elements(coalesce(s.closing_stock_count, '[]'::jsonb)) as t(line)
  where coalesce((line->>'variance')::int, 0) <> 0;

  return jsonb_build_object(
    'ok', true,
    'shift_id', s.id,
    'till_id', s.till_id,
    'cashier', s.cashier_name,
    'closed_by', s.closed_by,
    'status', s.status,
    'opened_at', s.opening_time,
    'closed_at', s.closing_time,
    'opening_float', v_opening,
    'cash_sales', v_cash,
    'card_sales', v_card,
    'eft_sales', v_eft,
    'other_sales', v_other,
    'total_sales', v_sales,
    'transaction_count', v_count,
    'invoice_sales', v_inv_total,
    'invoice_count', v_inv_count,
    'invoice_unpaid', v_inv_unpaid,
    'invoice_unpaid_count', v_inv_unpaid_count,
    'layby_payments', v_lay_total,
    'layby_payment_count', v_lay_count,
    'petty_cash', v_petty,
    'refunds', v_refunds,
    'cash_refunds', v_cash_refunds,
    'refund_count', v_refund_count,
    'expected_cash', v_expected,
    'counted_cash', v_counted,
    'variance', round(v_counted - v_expected, 2),
    'opening_denominations', s.opening_denominations,
    'closing_denominations', s.closing_denominations,
    'stock_count', s.closing_stock_count,
    'stock_lines_off', v_stock_lines,
    'stock_variance_total', v_stock_var,
    'notes', s.notes
  );
end;
$function$;
