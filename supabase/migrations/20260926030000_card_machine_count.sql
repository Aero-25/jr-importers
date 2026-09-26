/*
  Closing the till is three counts, not one.

  The drawer was counted and the phones were counted, and the card machine
  — the other place the day's money sits — was never looked at. A card sale
  rung up on the wrong tender, or a slip that never made it into the batch,
  showed up nowhere: the drawer balanced, so the shift closed clean and the
  difference surfaced whenever the bank statement was next read.

  The cashier now enters the card machine's own total off the swipe slip,
  and it is checked against what the till rang up on card the same way the
  drawer is checked against expected cash. Both counts are compulsory; a
  difference on either needs a manager's reason, recorded on the shift.
*/

alter table public.till_shifts
  /* The card machine's total for the shift, off the swipe slip. */
  add column if not exists counted_card  numeric(12,2),
  /* Slip total less what the till rang up on card. */
  add column if not exists card_variance numeric(12,2);

comment on column public.till_shifts.counted_card is
  'The card machine''s own total for the shift, entered from the swipe slip at close. Null on shifts closed before the card count existed.';
comment on column public.till_shifts.card_variance is
  'counted_card less the card takings the till recorded. Zero when the machine and the till agree.';

create or replace function public.till_cash_up(p_shift_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  -- The card machine's own total for the shift, typed off the swipe slip,
  -- and how it compares with what the till rang up on card.
  v_counted_card numeric(12,2);
  v_card_variance numeric(12,2);
  -- Float & banking: what stays in the drawer for the next shift, and what
  -- goes to the bank. The target is the till_float_target setting; on a
  -- thin day the drawer may not cover it, and the report says so rather
  -- than inventing money.
  v_float_target numeric(12,2);
  v_float_retained numeric(12,2);
  v_float_short numeric(12,2);
  v_cash_to_bank numeric(12,2);
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
  v_counted_card := s.counted_card;

  -- Each sale is counted by what was actually tendered. A sale paid part cash,
  -- part card puts its cash in the drawer and its card on the machine; the
  -- tenders come from the sale's payment breakdown when it has one, and from
  -- its single payment method otherwise. See order_tenders().
  select
    coalesce(sum(t.amount) filter (where t.method = 'cash'), 0),
    coalesce(sum(t.amount) filter (where t.method = 'card'), 0),
    coalesce(sum(t.amount) filter (where t.method = 'eft'), 0),
    coalesce(sum(t.amount) filter (where t.method not in ('cash','card','eft')), 0),
    coalesce(sum(t.amount), 0),
    count(distinct o.id)
  into v_cash, v_card, v_eft, v_other, v_sales, v_count
  from public.orders o
  cross join lateral public.order_tenders(o) t
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
  where i.till_shift_id = p_shift_id
    -- A till sale now writes an invoice alongside its order. Both carry the
    -- same shift, so counting both would double every counter sale on the
    -- cash-up. The order is the original record and already counted above.
    and coalesce(i.source, '') <> 'pos';

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

  select coalesce((value #>> '{}')::numeric, 500) into v_float_target
    from public.settings where key = 'till_float_target';
  v_float_target   := coalesce(v_float_target, 500);
  v_float_retained := least(v_counted, v_float_target);
  v_float_short    := greatest(v_float_target - v_counted, 0);
  v_cash_to_bank   := greatest(v_counted - v_float_retained, 0);

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
    -- Null until the cashier has entered the slip, so the report can tell
    -- "not yet counted" from "counted, and it agrees".
    'counted_card', v_counted_card,
    'card_variance', case when v_counted_card is null then null else round(v_counted_card - v_card, 2) end,
    'float_target', v_float_target,
    'float_retained', v_float_retained,
    'float_short', v_float_short,
    'cash_to_bank', v_cash_to_bank,
    'opening_denominations', s.opening_denominations,
    'closing_denominations', s.closing_denominations,
    'stock_count', s.closing_stock_count,
    'stock_lines_off', v_stock_lines,
    'stock_variance_total', v_stock_var,
    'notes', s.notes
  );
end;
$function$
;

-- ---------------------------------------------------------------------------
-- Closing is refused while either count is out.
-- ---------------------------------------------------------------------------
create or replace function public.till_shift_must_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_off_cash boolean;
  v_off_card boolean;
begin
  -- Only the transition into Closed is guarded. Amending a closed shift's
  -- count later goes through amend_cash_up, which has its own rules.
  if new.status = 'Closed' and coalesce(old.status, '') <> 'Closed' then
    -- The card machine has to have been counted at all. Null means the
    -- cashier never reached that screen; zero is a real answer.
    if new.counted_card is null then
      raise exception 'Enter the card machine total from the swipe slip before closing.'
        using errcode = 'check_violation';
    end if;

    v_off_cash := abs(coalesce(new.cash_variance, 0)) >= 0.005;
    v_off_card := abs(coalesce(new.card_variance, 0)) >= 0.005;

    if v_off_cash or v_off_card then
      if new.variance_accepted_reason is null or btrim(new.variance_accepted_reason) = '' then
        if v_off_cash then
          raise exception 'The drawer does not balance: counted % against an expected %. Recount the drawer, or have a manager accept the difference with a reason.',
            to_char(coalesce(new.actual_cash, 0), 'FM999G999G990D00'),
            to_char(coalesce(new.expected_cash, 0), 'FM999G999G990D00')
            using errcode = 'check_violation';
        else
          raise exception 'The card machine does not agree with the till: slip % against % rung up on card. Check the slip, or have a manager accept the difference with a reason.',
            to_char(coalesce(new.counted_card, 0), 'FM999G999G990D00'),
            to_char(coalesce(new.counted_card, 0) - coalesce(new.card_variance, 0), 'FM999G999G990D00')
            using errcode = 'check_violation';
        end if;
      end if;
      if not public.is_admin() then
        raise exception 'Only a manager can accept a count that does not agree.'
          using errcode = 'insufficient_privilege';
      end if;
      new.variance_accepted_by := coalesce(new.variance_accepted_by, public.current_actor());
      new.variance_accepted_at := coalesce(new.variance_accepted_at, now());
    else
      -- Counts that agree need no excuse, and must not carry one.
      new.variance_accepted_by     := null;
      new.variance_accepted_reason := null;
      new.variance_accepted_at     := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists till_shift_must_balance on public.till_shifts;
create trigger till_shift_must_balance
  before update on public.till_shifts
  for each row
  execute function public.till_shift_must_balance();
