-- A phone count as part of closing the till.
--
-- Deliberately advisory: the count is recorded against the shift and any
-- discrepancy appears on the cash-up report, but it does NOT move stock. A
-- miscount at 17:30 on a busy Friday should raise a question, not silently
-- rewrite the inventory. Correcting stock stays a separate, deliberate act
-- through Stock Takes.

begin;

alter table public.till_shifts
  -- [{ product_id, name, system_qty, counted_qty, variance }]
  add column if not exists closing_stock_count jsonb not null default '[]'::jsonb,
  add column if not exists stock_variance_total integer not null default 0;

-- ---------------------------------------------------------------------------
-- Extend the cash-up with the stock check.
-- ---------------------------------------------------------------------------
create or replace function public.till_cash_up(p_shift_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  v_petty numeric(12,2);
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

  select coalesce(sum(e.amount), 0) into v_petty
  from public.expenses e
  where e.till_shift_id = p_shift_id;

  v_expected := v_opening + v_cash - v_petty;

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
    'petty_cash', v_petty,
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
$$;

grant execute on function public.till_cash_up(bigint) to authenticated;
notify pgrst, 'reload schema';

commit;
