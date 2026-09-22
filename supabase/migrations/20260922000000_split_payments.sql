/*
  Split payments at the till.

  A customer pays part of a phone in cash and the rest on card, and the till
  had one box to put it in. Whichever the cashier chose, the cash-up was
  wrong by the other half: a N$9,000 sale rung as card with N$3,000 of cash
  in the drawer made the drawer N$3,000 over.

  A sale now carries a payment breakdown — one entry per tender, method and
  amount — and `payment_method` becomes the readable summary of it ("Cash
  3,000.00 + Card 6,000.00"). The cash-up counts each sale by its tenders,
  so the cash lands in the drawer's expected figure and the card on the
  card total. A sale paid one way is unchanged: no breakdown, one method.

  This file also carries the float & banking figures (float_target,
  float_retained, float_short, cash_to_bank) that the report prints. They
  had been applied to the database by hand and never committed, so the
  first recreation of till_cash_up from the repository lost them. From here
  on the function in the repository is the whole function.
*/

alter table public.orders
  add column if not exists payments jsonb;

comment on column public.orders.payments is
  'How the sale was tendered, one entry per method: [{"method":"Cash","amount":3000},{"method":"Card","amount":6000}]. Null on a sale paid a single way — payment_method alone describes it then.';

alter table public.invoices
  add column if not exists payments jsonb;

comment on column public.invoices.payments is
  'Tender breakdown copied from the sale the invoice was raised for, so the document can print how it was paid.';

-- What a sale was paid with: the breakdown where there is one, otherwise
-- the single method for the whole amount. Methods come back lower-cased so
-- the cash-up can compare them without caring how the till spelt them.
create or replace function public.order_tenders(o public.orders)
returns table (method text, amount numeric)
language sql
stable
as $$
  select lower(coalesce(p->>'method', '')), coalesce((p->>'amount')::numeric, 0)
  from jsonb_array_elements(o.payments) as p
  where jsonb_typeof(o.payments) = 'array' and jsonb_array_length(o.payments) > 0
  union all
  select lower(coalesce(o.payment_method, '')), coalesce(o.total_amount, 0)
  where not (jsonb_typeof(o.payments) = 'array' and jsonb_array_length(o.payments) > 0);
$$;

-- The POS invoice follows its order; the breakdown travels with it, and a
-- corrected tender on the sale reaches the invoice too.
create or replace function public.invoice_for_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status not in ('Paid', 'Completed', 'Delivered', 'Dispatched') then
    return new;
  end if;

  -- Already raised: bring it up to date rather than leaving it stale.
  if exists (select 1 from public.invoices where order_id = new.id) then
    update public.invoices
       set items           = coalesce(new.items, '[]'::jsonb),
           subtotal_amount = coalesce(new.subtotal_amount, 0),
           vat_amount      = coalesce(new.vat_amount, 0),
           total_amount    = coalesce(new.total_amount, 0),
           customer_name   = coalesce(new.customer_name, customer_name),
           customer_email  = coalesce(new.customer_email, customer_email),
           payment_method  = coalesce(new.payment_method, payment_method),
           payments        = new.payments,
           till_shift_id   = coalesce(new.till_shift_id, till_shift_id),
           updated_at      = now()
     where order_id = new.id
       -- Only when something actually differs, so an unrelated order update
       -- does not churn the invoice or stamp a new updated_at for nothing.
       and (total_amount    is distinct from coalesce(new.total_amount, 0)
         or subtotal_amount is distinct from coalesce(new.subtotal_amount, 0)
         or vat_amount      is distinct from coalesce(new.vat_amount, 0)
         or items           is distinct from coalesce(new.items, '[]'::jsonb)
         or payments        is distinct from new.payments
         or payment_method  is distinct from new.payment_method);
    return new;
  end if;

  insert into public.invoices (
    order_id, customer_id, customer_name, customer_email,
    items, subtotal_amount, vat_amount, total_amount,
    status, payment_method, payments, till_shift_id, doc_type, source, created_at
  )
  values (
    new.id, new.user_id, new.customer_name, new.customer_email,
    coalesce(new.items, '[]'::jsonb),
    coalesce(new.subtotal_amount, 0), coalesce(new.vat_amount, 0), coalesce(new.total_amount, 0),
    'paid', new.payment_method, new.payments, new.till_shift_id, 'invoice', 'pos', new.created_at
  )
  on conflict (order_id) where order_id is not null do nothing;

  return new;
end;
$function$;

drop trigger if exists orders_write_invoice on public.orders;

create trigger orders_write_invoice
  after insert or update of status, subtotal_amount, vat_amount, total_amount, items, payment_method, payments
  on public.orders
  for each row execute function public.invoice_for_order();

create or replace function public.till_cash_up(p_shift_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
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
