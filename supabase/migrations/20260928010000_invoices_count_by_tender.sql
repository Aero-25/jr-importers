/*
  An invoice reaches the cash-up by its tenders, and a credit note lands in
  the shift that pays it.

  Two faults, both on the invoice side of the cash-up.

  The invoice block bucketed by `payment_method` matched against the exact
  words 'cash', 'card' and 'eft'. A sale paid more than one way carries a
  readable summary there — "Cash 500.00 + Card 2,000.00" — which matches
  none of them, so the whole amount fell into "other" and the drawer never
  expected its cash half. Counter sales were safe only because they are
  counted from their order; anything raised or credited in the console was
  not. Invoices now split by tender exactly as orders do.

  And `credit_invoice` gave the credit note the shift of the invoice it
  reverses. Crediting a sale from a shift that closed last week would reach
  back and change that shift's signed-off figures, while today's drawer —
  the one the money actually left — showed nothing. A refund belongs to the
  shift that pays it out, so the credit note is stamped with the open shift
  like any other document raised today, and it carries the original's tender
  breakdown negated, so a refund of a split sale comes off cash and card in
  the same proportions it went on.
*/

-- What an invoice was settled with: the breakdown where there is one, else
-- the single method for the whole amount. Mirrors `order_tenders`, and is
-- null-safe in the same way — a missing breakdown must still yield a row.
create or replace function public.invoice_tenders(i public.invoices)
returns table (method text, amount numeric)
language sql
stable
as $$
  with split as (
    select coalesce(jsonb_typeof(i.payments) = 'array' and jsonb_array_length(i.payments) > 0, false) as yes
  )
  select lower(coalesce(p->>'method', '')), coalesce((p->>'amount')::numeric, 0)
  from split, jsonb_array_elements(case when split.yes then i.payments else '[]'::jsonb end) as p
  union all
  select lower(coalesce(i.payment_method, '')), coalesce(i.total_amount, 0)
  from split where not split.yes;
$$;

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


-- A credit note belongs to the shift that pays the refund out, and comes off
-- the same tenders the sale went on to.
create or replace function public.credit_invoice(p_invoice_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_inv public.invoices%rowtype;
  v_existing public.invoices%rowtype;
  v_credit public.invoices%rowtype;
  v_items jsonb;
  v_payments jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can credit an invoice.');
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Invoice not found.');
  end if;

  if coalesce(v_inv.doc_type, 'invoice') = 'credit_note' then
    return jsonb_build_object('ok', false, 'message', 'That is already a credit note.');
  end if;

  -- Already credited: hand back the credit note rather than raising a second.
  select * into v_existing from public.invoices where credits_invoice_id = p_invoice_id;
  if found then
    return jsonb_build_object(
      'ok', true, 'existed', true, 'id', v_existing.id,
      'invoice_number', v_existing.invoice_number,
      'message', 'Already credited by ' || coalesce(v_existing.invoice_number, '#' || v_existing.id) || '.'
    );
  end if;

  if public.is_period_locked(v_inv.created_at) then
    return jsonb_build_object('ok', false, 'message', 'That accounting period is closed. Reopen it first.');
  end if;

  -- The same lines, reversed, so the credit note reads like the invoice it
  -- undoes rather than as a bare amount.
  select coalesce(jsonb_agg(
           line || jsonb_build_object(
             'price', -1 * coalesce((line->>'price')::numeric, 0),
             'line_total', -1 * coalesce((line->>'line_total')::numeric, 0))
         ), '[]'::jsonb)
    into v_items
    from jsonb_array_elements(coalesce(v_inv.items, '[]'::jsonb)) as line;

  -- And the same tenders, reversed. A sale taken N$500 cash and N$2 000 card
  -- is refunded N$500 out of the drawer and N$2 000 back to the card, so the
  -- cash-up takes it off each in the proportion it went on.
  select case
           when jsonb_typeof(v_inv.payments) = 'array' and jsonb_array_length(v_inv.payments) > 0
           then (select jsonb_agg(p || jsonb_build_object(
                          'amount', -1 * coalesce((p->>'amount')::numeric, 0)))
                   from jsonb_array_elements(v_inv.payments) as p)
         end
    into v_payments;

  insert into public.invoices (
    doc_type, credits_invoice_id, customer_id, customer_name, customer_email,
    items, subtotal_amount, vat_amount, total_amount,
    -- The shop refunds every credit, so it is settled the moment it is
    -- raised; the statement shows the credit and the refund netting to zero.
    -- till_shift_id is left out on purpose: invoice_stamp_shift() puts the
    -- credit in the shift that is open now, which is the drawer the money
    -- comes out of. Taking the original's shift would reach back and change
    -- a cash-up that was counted and signed off days ago.
    status, payment_method, payments, notes, created_at
  )
  values (
    'credit_note', v_inv.id, v_inv.customer_id, v_inv.customer_name, v_inv.customer_email,
    v_items, -1 * coalesce(v_inv.subtotal_amount, 0), -1 * coalesce(v_inv.vat_amount, 0),
    -1 * coalesce(v_inv.total_amount, 0),
    'paid', v_inv.payment_method, v_payments,
    concat_ws(' ', 'Credit of ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.', nullif(btrim(coalesce(p_reason, '')), '')),
    now()
  )
  returning * into v_credit;

  -- A counter sale: the goods come back and the sale is cancelled. Nothing
  -- is assumed about an account invoice typed by hand, or IQ history.
  if v_inv.order_id is not null then
    perform public.release_order_stock(v_inv.order_id);
    update public.orders
       set status = 'Cancelled',
           notes  = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
     where id = v_inv.order_id and status <> 'Cancelled';
  end if;

  update public.invoices
     set notes = concat_ws(' · ', notes, 'Credited by ' || v_credit.invoice_number)
   where id = v_inv.id;

  return jsonb_build_object(
    'ok', true, 'existed', false, 'id', v_credit.id,
    'invoice_number', v_credit.invoice_number,
    'total_amount', v_credit.total_amount,
    'message', v_credit.invoice_number || ' raised against ' || coalesce(v_inv.invoice_number, '#' || v_inv.id) || '.'
  );
end;
$function$;
