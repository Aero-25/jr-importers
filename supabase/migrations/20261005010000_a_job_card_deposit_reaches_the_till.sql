/*
  A deposit taken on a job card is money in the drawer.

  A repair is booked in, the customer pays a deposit at the counter and the
  handset goes on the bench. No order, no invoice — the deposit lived only as
  a number on the job card, with nothing recording how it was paid or which
  till took it, and the cash up had no job-card block at all. Job card 1360
  took N$450.00 in cash and no cash up in the shop could see it.

  Three columns now carry what was missing: how the deposit was paid, which
  shift took it, and when. The shift is stamped the moment a deposit is first
  entered, the same way an invoice is stamped, so the money lands on the day
  it was handed over rather than the day the repair is finished.

  There is no double counting. When the repair is invoiced, repairCharge()
  bills the quote plus the handling fee LESS the deposit, so the deposit is
  counted here, once, on the day it was taken, and the invoice collects only
  what is still owed.
*/

alter table public.job_cards
  add column if not exists deposit_method text,
  add column if not exists deposit_till_shift_id bigint references public.till_shifts(id),
  add column if not exists deposit_taken_at timestamptz;

create index if not exists job_cards_deposit_shift_idx
  on public.job_cards (deposit_till_shift_id)
  where deposit_till_shift_id is not null;

comment on column public.job_cards.deposit_method is
  'How the deposit was paid: Cash, Card or EFT. Null until a deposit is taken.';
comment on column public.job_cards.deposit_till_shift_id is
  'The shift the deposit was taken in. Stamped once, when the deposit is first entered.';


-- Stamp the deposit when it is first taken, and clear the stamp if it is
-- taken back off. Left alone on every other edit, so a job card touched
-- weeks later does not walk its deposit into whichever till is open then.
create or replace function public.job_card_stamp_deposit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_shift bigint;
  v_had boolean := tg_op = 'UPDATE' and coalesce(old.deposit, 0) <> 0;
  v_has boolean := coalesce(new.deposit, 0) <> 0;
begin
  if v_has and not v_had then
    select id into v_shift
      from public.till_shifts
     where status = 'Open'
     order by opening_time desc
     limit 1;

    if new.deposit_till_shift_id is null then
      new.deposit_till_shift_id := v_shift;
    end if;
    if new.deposit_taken_at is null then
      new.deposit_taken_at := now();
    end if;
    -- Cash unless the counter says otherwise: it is what a deposit over the
    -- counter nearly always is, and "unrecorded" would hide it in "other".
    if nullif(btrim(coalesce(new.deposit_method, '')), '') is null then
      new.deposit_method := 'Cash';
    end if;
  elsif v_had and not v_has then
    new.deposit_till_shift_id := null;
    new.deposit_taken_at := null;
    new.deposit_method := null;
  end if;

  return new;
end;
$fn$;

drop trigger if exists job_cards_stamp_deposit on public.job_cards;
create trigger job_cards_stamp_deposit
  before insert or update on public.job_cards
  for each row execute function public.job_card_stamp_deposit();


CREATE OR REPLACE FUNCTION public.till_cash_up(p_shift_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_inv_paid numeric(12,2);
  v_inv_paid_count integer;
  v_inv_paid_earlier numeric(12,2);
  v_inv_paid_earlier_count integer;
  v_invoices jsonb;
  v_lay_cash numeric(12,2);
  v_lay_card numeric(12,2);
  v_lay_eft numeric(12,2);
  v_lay_other numeric(12,2);
  v_lay_total numeric(12,2);
  v_lay_count integer;
  v_jc_cash numeric(12,2);
  v_jc_card numeric(12,2);
  v_jc_eft numeric(12,2);
  v_jc_other numeric(12,2);
  v_jc_total numeric(12,2);
  v_jc_count integer;
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
  -- its single payment method otherwise. See order_tenders(). An order that
  -- mirrors an invoice carries no shift and is skipped by name as well: its
  -- invoice is counted below.
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
    and o.invoice_id is null
    and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched');

  -- Invoices raised in this shift: the sale, however and whenever it is
  -- paid for. What was not settled in this shift — still owed, or paid in
  -- a later one — is reported as such and never reaches the drawer. A till
  -- sale's invoice is skipped: its order is the record and was counted
  -- above.
  select
    coalesce(sum(i.total_amount), 0),
    count(*),
    coalesce(sum(i.total_amount) filter (
      where lower(coalesce(i.status, '')) <> 'paid'
         or i.paid_till_shift_id is distinct from p_shift_id), 0),
    count(*) filter (
      where lower(coalesce(i.status, '')) <> 'paid'
         or i.paid_till_shift_id is distinct from p_shift_id)
  into v_inv_total, v_inv_count, v_inv_unpaid, v_inv_unpaid_count
  from public.invoices i
  where i.till_shift_id = p_shift_id
    and coalesce(i.source, '') <> 'pos'
    -- The shop replaces, it does not refund. A credit note reverses the
    -- sale on the customer's account and sends the goods back to the shelf,
    -- but no money crosses the counter, so it must not move a day's takings
    -- — neither the day it is raised nor the day of the sale it undoes. It
    -- still reverses the VAT, which is why vat_return and vat_transactions
    -- go on counting it.
    and coalesce(i.doc_type, 'invoice') <> 'credit_note';

  -- Invoices settled in this shift: the money, by tender, whichever shift
  -- raised the document. An invoice settled part cash, part card reaches
  -- both the drawer and the machine; one with no method recorded falls to
  -- "other", because it was taken somehow but nothing here says it was
  -- cash, and it must not raise the figure the drawer is counted against.
  select
    coalesce(sum(t.amount) filter (where t.method = 'cash'), 0),
    coalesce(sum(t.amount) filter (where t.method = 'card'), 0),
    coalesce(sum(t.amount) filter (where t.method = 'eft'), 0),
    coalesce(sum(t.amount) filter (where t.method not in ('cash','card','eft')), 0),
    coalesce(sum(t.amount), 0),
    count(distinct i.id),
    coalesce(sum(t.amount) filter (where i.till_shift_id is distinct from p_shift_id), 0),
    count(distinct i.id) filter (where i.till_shift_id is distinct from p_shift_id)
  into v_inv_cash, v_inv_card, v_inv_eft, v_inv_other, v_inv_paid, v_inv_paid_count,
       v_inv_paid_earlier, v_inv_paid_earlier_count
  from public.invoices i
  cross join lateral public.invoice_tenders(i) t
  where i.paid_till_shift_id = p_shift_id
    and lower(coalesce(i.status, '')) = 'paid'
    and coalesce(i.source, '') <> 'pos'
    and coalesce(i.doc_type, 'invoice') <> 'credit_note';

  v_cash  := v_cash  + v_inv_cash;
  v_card  := v_card  + v_inv_card;
  v_eft   := v_eft   + v_inv_eft;
  -- Sold here and not settled here is owed: in the sales figure, in
  -- "other", never in the drawer.
  v_other := v_other + v_inv_other + v_inv_unpaid;
  v_sales := v_sales + v_inv_total;
  v_count := v_count + v_inv_count;

  -- Every console invoice this shift touched, by number, so a document can
  -- be found on the report rather than inferred from a total.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id,
           'invoice_number', i.invoice_number,
           'doc_type', coalesce(i.doc_type, 'invoice'),
           'customer_name', i.customer_name,
           'total_amount', i.total_amount,
           'status', lower(coalesce(i.status, '')),
           'payment_method', i.payment_method,
           'raised_here', i.till_shift_id = p_shift_id,
           'settled_here', coalesce(i.paid_till_shift_id = p_shift_id, false),
           'raised_shift_id', i.till_shift_id,
           'settled_shift_id', i.paid_till_shift_id,
           'created_at', i.created_at,
           'paid_at', i.paid_at
         ) order by i.created_at, i.id), '[]'::jsonb)
    into v_invoices
    from public.invoices i
   where coalesce(i.source, '') <> 'pos'
     -- Left out for the same reason, and so the report adds up: a figure
     -- that is not in the totals must not be in the list under them.
     and coalesce(i.doc_type, 'invoice') <> 'credit_note'
     and (i.till_shift_id = p_shift_id or i.paid_till_shift_id = p_shift_id);

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

  -- Deposits taken on a job card. A repair is booked in, money changes
  -- hands at the counter, and the handset goes on the bench — so the deposit
  -- belongs to the drawer on the day it was taken, long before any invoice
  -- exists. When the repair is finally invoiced, repairCharge() bills the
  -- quote plus handling LESS this deposit, so the two never count the same
  -- money twice.
  select
    coalesce(sum(j.deposit) filter (where lower(coalesce(j.deposit_method,'')) = 'cash'), 0),
    coalesce(sum(j.deposit) filter (where lower(coalesce(j.deposit_method,'')) = 'card'), 0),
    coalesce(sum(j.deposit) filter (where lower(coalesce(j.deposit_method,'')) = 'eft'), 0),
    coalesce(sum(j.deposit) filter (
      where lower(coalesce(j.deposit_method,'')) not in ('cash','card','eft')), 0),
    coalesce(sum(j.deposit), 0),
    count(*)
  into v_jc_cash, v_jc_card, v_jc_eft, v_jc_other, v_jc_total, v_jc_count
  from public.job_cards j
  where j.deposit_till_shift_id = p_shift_id
    and coalesce(j.deposit, 0) <> 0;

  v_cash  := v_cash  + v_jc_cash;
  v_card  := v_card  + v_jc_card;
  v_eft   := v_eft   + v_jc_eft;
  v_other := v_other + v_jc_other;
  v_sales := v_sales + v_jc_total;
  v_count := v_count + v_jc_count;

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
    -- Money taken against invoices in this shift, and the part of it that
    -- settles a sale from an earlier shift. The second explains why the
    -- tender lines can add up to more than total sales.
    'invoice_paid', v_inv_paid,
    'invoice_paid_count', v_inv_paid_count,
    'invoice_paid_earlier', v_inv_paid_earlier,
    'invoice_paid_earlier_count', v_inv_paid_earlier_count,
    'invoices', v_invoices
  ) || jsonb_build_object(
    'job_card_deposits', v_jc_total,
    'job_card_deposit_count', v_jc_count,
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
$function$
;
