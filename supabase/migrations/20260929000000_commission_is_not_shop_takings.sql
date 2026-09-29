/*
  Commission is earned, not taken over the counter.

  The Cash ups screen totalled every closed shift into one "Takings" figure,
  and property commission went into it alongside phones and cables. Shift 19
  alone carried N$454,867.50 of commission against N$5,420.00 of shop sales,
  so the headline read N$678,691.29 when the shop itself had taken
  N$223,823.79. A number that size drowns out the trade it sits next to.

  Commission is identified by the line it is billed on: the SVC-COMMISSION
  product, which is how the shop already rings it up. That is recomputed from
  the documents rather than stored on the shift, because `total_sales` is
  written once at close and an invoice corrected afterwards would leave a
  stored commission figure quietly disagreeing with the report.

  Nothing here touches the drawer. Expected cash, variance and the tender
  buckets are untouched — a commission taken in cash is still cash in the
  till, and must still be counted. This changes only what the takings total
  is said to represent.
*/

-- How much of a shift's takings was commission rather than trade. The
-- population matches what feeds `total_sales`: sales that were rung up, and
-- invoices raised away from the till (a counter sale's invoice is skipped,
-- its order having already counted it).
create or replace view public.till_shift_commission
with (security_invoker = true) as
  select shift_id, sum(amount) as commission_sales, count(distinct doc) as commission_count
  from (
    select o.till_shift_id as shift_id,
           'o' || o.id::text as doc,
           coalesce((line->>'line_total')::numeric,
                    coalesce((line->>'price')::numeric, 0) * coalesce((line->>'quantity')::numeric, 1)) as amount
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as line
    where o.till_shift_id is not null
      and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched')
      and upper(coalesce(line->>'sku', '')) = 'SVC-COMMISSION'
    union all
    select i.till_shift_id,
           'i' || i.id::text,
           coalesce((line->>'line_total')::numeric,
                    coalesce((line->>'price')::numeric, 0) * coalesce((line->>'quantity')::numeric, 1))
    from public.invoices i
    cross join lateral jsonb_array_elements(coalesce(i.items, '[]'::jsonb)) as line
    where i.till_shift_id is not null
      and coalesce(i.source, '') <> 'pos'
      and upper(coalesce(line->>'sku', '')) = 'SVC-COMMISSION'
  ) lines
  group by shift_id;

grant select on public.till_shift_commission to authenticated;

comment on view public.till_shift_commission is
  'Commission billed on each till shift, by the SVC-COMMISSION line. Recomputed from the documents, never stored, so a corrected invoice cannot leave it stale.';


-- The report says how much of the shift was commission, so the screen and
-- the PDF can net it out without each recomputing it.

-- The cash-up's invoice block, by tender. Everything else about it stands:
-- a counter sale's invoice is skipped because its order is already counted,
-- and an invoice that is not yet paid stays out of cash, card and EFT — it
-- is a stated intention, not money in the drawer.
create or replace function public.till_cash_up(p_shift_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  -- The card machine's own total for the shift, typed off the swipe slip,
  -- and how it compares with what the till rang up on card.
  v_counted_card numeric(12,2);
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
  v_commission numeric(12,2);
  v_commission_count integer;
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

  -- Invoices settled in this shift, counted the same way — by tender, not by
  -- the words in payment_method. An invoice settled part cash, part card
  -- reaches both the drawer and the machine; one with no method recorded
  -- falls to "other", because it was taken somehow but nothing here says it
  -- was cash, and it must not raise the figure the drawer is counted against.
  -- Settled buckets require BOTH a paid status and a method: an invoice
  -- marked cash but not yet paid is a stated intention, not money in hand.
  select
    coalesce(sum(t.amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and t.method = 'cash'), 0),
    coalesce(sum(t.amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and t.method = 'card'), 0),
    coalesce(sum(t.amount) filter (
      where lower(coalesce(i.status,'')) = 'paid' and t.method = 'eft'), 0),
    coalesce(sum(t.amount) filter (
      where lower(coalesce(i.status,'')) <> 'paid'
         or t.method not in ('cash','card','eft')), 0),
    coalesce(sum(t.amount), 0),
    count(distinct i.id),
    coalesce(sum(t.amount) filter (where lower(coalesce(i.status,'')) <> 'paid'), 0),
    count(distinct i.id) filter (where lower(coalesce(i.status,'')) <> 'paid')
  into v_inv_cash, v_inv_card, v_inv_eft, v_inv_other, v_inv_total, v_inv_count,
       v_inv_unpaid, v_inv_unpaid_count
  from public.invoices i
  cross join lateral public.invoice_tenders(i) t
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

  -- How much of the above was commission rather than trade. Reported, never
  -- subtracted here: a commission taken in cash is still cash in the drawer,
  -- and the figure the cashier counts against must not move.
  select coalesce(c.commission_sales, 0), coalesce(c.commission_count, 0)
  into v_commission, v_commission_count
  from (select 1) one
  left join public.till_shift_commission c on c.shift_id = p_shift_id;
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
    'commission_sales', v_commission,
    'commission_count', v_commission_count,
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
    -- Why the slip and the till differ, and who said so. A card slip that
    -- does not match is ordinary; an unexplained one is not.
    'card_variance_reason', s.card_variance_reason,
    'card_variance_by', s.card_variance_by,
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
$function$;
