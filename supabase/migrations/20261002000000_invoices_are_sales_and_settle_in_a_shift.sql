/*
  An invoice is a sale, and settles in the shift that takes the money.

  INV12178 — Meritus Brokers cc, N$7,400.00, marked paid — was under
  Invoices and nowhere else: not on Orders, which says "every sale", and
  not on any cash up. Three gaps, all in how an invoice raised at the
  console reaches the rest of the shop.

  1. Orders knew nothing about invoices. A till sale writes an order and
     an invoice beside it; an invoice raised at the console wrote only the
     invoice. So the sale was missing from Orders, from the dashboard and
     from every sales report built on `orders` — the mirror image of the
     fault vat_return had until last week. An invoice now writes an order
     beside it, exactly as the till does the other way round: the invoice
     stays the record, the order follows it, and both carry the invoice
     number so the sale can be found by it from either side.

  2. An invoice reached a cash up only if a till happened to be open at the
     moment it was raised. Raised after hours, or before the cashier had
     opened the drawer, it was stamped with no shift, and no cash up would
     ever include it. An invoice that finds no open till now joins the next
     shift to open — the first cash up that can account for it.

  3. One shift carried both the sale and the money. An account invoice is
     raised in one shift and paid in another; it held only the shift it was
     raised in, so the day the money came in never saw it, and the earlier
     shift's figures moved underneath a cash up that had been signed off.
     The two are now separate: `till_shift_id` is the shift it was raised
     in and answers "what was sold"; `paid_till_shift_id` is the shift it
     was settled in and answers "what is in the drawer".

  The cash up also lists its invoices by number, so a document can be seen
  on it rather than inferred from a total.
*/

-- ---------------------------------------------------------------------------
-- 1. Columns.
-- ---------------------------------------------------------------------------
alter table public.invoices
  add column if not exists paid_till_shift_id bigint references public.till_shifts(id) on delete set null;

create index if not exists invoices_paid_till_shift_idx on public.invoices (paid_till_shift_id);

comment on column public.invoices.till_shift_id is
  'The shift this invoice was raised in: the cash up that counts it as a sale. Stamped from the open till, or by the next shift to open when none was.';
comment on column public.invoices.paid_till_shift_id is
  'The shift this invoice was settled in: the cash up whose drawer and card totals carry the money. Null while it is unpaid.';

alter table public.orders
  add column if not exists invoice_id     bigint references public.invoices(id) on delete set null,
  add column if not exists invoice_number text;

create unique index if not exists orders_invoice_id_key
  on public.orders (invoice_id) where invoice_id is not null;
create index if not exists orders_invoice_number_idx on public.orders (invoice_number);

comment on column public.orders.invoice_id is
  'Set on an order that mirrors an invoice raised at the console. The invoice is the record; this order follows it and is not edited directly.';
comment on column public.orders.invoice_number is
  'The number of the tax invoice for this sale, whichever side raised it. Kept here so Orders can show it and search by it.';

-- ---------------------------------------------------------------------------
-- 2. Where an invoice lands: raised in the open shift, settled in the shift
--    that is open when it is marked paid.
-- ---------------------------------------------------------------------------
create or replace function public.invoice_stamp_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift    bigint;
  v_paid     boolean := lower(coalesce(new.status, '')) = 'paid';
  v_was_paid boolean := tg_op = 'UPDATE' and lower(coalesce(old.status, '')) = 'paid';
begin
  -- Imported history predates the till entirely.
  if new.source = 'iq-import' then
    return new;
  end if;

  -- A till sale's invoice is rung up and paid in one breath, in the shift
  -- its order carries. The cash up counts the order, not this row, but the
  -- row says the same thing.
  if new.source = 'pos' then
    if v_paid then
      if new.paid_at is null then new.paid_at := now(); end if;
      if new.paid_till_shift_id is null then new.paid_till_shift_id := new.till_shift_id; end if;
    else
      new.paid_till_shift_id := null;
    end if;
    return new;
  end if;

  select id into v_shift
    from public.till_shifts
   where status = 'Open'
   order by opening_time desc
   limit 1;

  if tg_op = 'INSERT' then
    -- Raised now, so it belongs to the shift open now. With no till open it
    -- stays unattributed and the next shift to open adopts it: see
    -- adopt_unshifted_invoices().
    if new.till_shift_id is null then
      new.till_shift_id := v_shift;
    end if;
    if v_paid then
      if new.paid_at is null then new.paid_at := now(); end if;
      if new.paid_till_shift_id is null then new.paid_till_shift_id := v_shift; end if;
    else
      new.paid_till_shift_id := null;
    end if;
    return new;
  end if;

  -- An update moves the money only when the payment state changes. Any
  -- other edit — a note, a PO number, a corrected line — leaves both
  -- shifts where they are, so an invoice touched weeks later does not walk
  -- into whichever shift happens to be open at the time.
  if v_paid and not v_was_paid then
    new.paid_at := case
      when new.paid_at is distinct from old.paid_at then new.paid_at
      else now()
    end;
    new.paid_till_shift_id := case
      when new.paid_till_shift_id is distinct from old.paid_till_shift_id then new.paid_till_shift_id
      else v_shift
    end;
    -- Never attributed to any shift: the sale joins the shift that settles
    -- it rather than staying off every cash up.
    if new.till_shift_id is null then
      new.till_shift_id := v_shift;
    end if;
  elsif v_was_paid and not v_paid then
    -- Marked paid by mistake: the money comes back off the cash up that
    -- had it.
    new.paid_at := null;
    new.paid_till_shift_id := null;
  elsif not v_paid then
    new.paid_till_shift_id := null;
  end if;

  return new;
end;
$$;

drop trigger if exists invoices_stamp_shift on public.invoices;
create trigger invoices_stamp_shift
  before insert or update on public.invoices
  for each row execute function public.invoice_stamp_shift();

-- ---------------------------------------------------------------------------
-- 3. An invoice that found no open till joins the next shift to open.
-- ---------------------------------------------------------------------------
-- Attribution to a shift began on 1 September 2026 (20260901020000). An
-- invoice from before that was never expected on a cash up and is left
-- alone; anything since that has no shift fell between two of them.
create or replace function public.adopt_unshifted_invoices(p_shift_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since   constant timestamptz := timestamptz '2026-09-01 00:00:00+02';
  v_raised  integer;
  v_settled integer;
begin
  -- The sale, and the money with it when it was paid before any till opened.
  with adopted as (
    update public.invoices
       set till_shift_id = p_shift_id,
           paid_till_shift_id = case
             when lower(coalesce(status, '')) = 'paid' then coalesce(paid_till_shift_id, p_shift_id)
           end
     where till_shift_id is null
       and source is distinct from 'iq-import'
       and source is distinct from 'pos'
       and created_at >= v_since
     returning 1
  )
  select count(*) into v_raised from adopted;

  -- The money alone: raised in some shift, paid after it had closed.
  with adopted as (
    update public.invoices
       set paid_till_shift_id = p_shift_id
     where paid_till_shift_id is null
       and lower(coalesce(status, '')) = 'paid'
       and source is distinct from 'iq-import'
       and source is distinct from 'pos'
       and coalesce(paid_at, created_at) >= v_since
     returning 1
  )
  select count(*) into v_settled from adopted;

  return v_raised + v_settled;
end;
$$;

revoke all on function public.adopt_unshifted_invoices(bigint) from public, anon, authenticated;

create or replace function public.till_shift_adopts_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Open' then
    perform public.adopt_unshifted_invoices(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists till_shifts_adopt_invoices on public.till_shifts;
create trigger till_shifts_adopt_invoices
  after insert on public.till_shifts
  for each row execute function public.till_shift_adopts_invoices();

-- ---------------------------------------------------------------------------
-- 4. An invoice raised at the console writes an order beside it.
-- ---------------------------------------------------------------------------
-- The reverse of invoice_for_order(): the invoice is the record, and the
-- order is a view of it for Orders, the dashboard and the sales reports.
-- It carries no shift of its own — the invoice carries both shifts, and the
-- cash up reads the invoice — so it cannot be counted twice there.
--
-- Status is translated rather than copied. Orders describe fulfilment and
-- invoices describe payment, and an invoiced sale has already handed over
-- its goods (raising it took the stock), so a paid invoice is a completed
-- order rather than one waiting in the dispatch queue.
create or replace function public.sync_invoice_order(i public.invoices)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order  public.orders%rowtype;
  v_status text;
  v_credit text;
  v_phone  text;
  v_email  text;
  v_notes  text;
  v_ref    text;
begin
  -- Only an invoice raised at the console. A till sale already has its
  -- order; IQ history describes sales made on another system; a credit
  -- note is a reversal, not a sale.
  if coalesce(i.source, '') in ('pos', 'iq-import') then
    return;
  end if;
  if coalesce(i.doc_type, 'invoice') = 'credit_note' then
    return;
  end if;

  select c.invoice_number into v_credit
    from public.invoices c
   where c.credits_invoice_id = i.id
   limit 1;

  v_status := case
    when v_credit is not null                                 then 'Cancelled'
    when lower(coalesce(i.status, '')) = 'paid'               then 'Completed'
    when lower(coalesce(i.status, '')) = 'void'               then 'Cancelled'
    when lower(coalesce(i.status, '')) in ('sent', 'overdue') then 'Pending'
  end;

  select * into v_order from public.orders where invoice_id = i.id;

  if not found then
    -- Nothing to show for a draft, and nothing worth adding for a document
    -- that is already void.
    if v_status is null or v_status = 'Cancelled' then
      return;
    end if;
  else
    -- A document that had an order and went back to draft stays visible as
    -- a sale awaiting payment rather than vanishing.
    if v_status is null then
      v_status := 'Pending';
    end if;
    -- A closed month cannot change shape. The invoice edit goes through;
    -- the order that reports it stays as the period was closed on.
    if public.is_period_locked(v_order.created_at) then
      return;
    end if;
  end if;

  select c.phone, c.email into v_phone, v_email
    from public.customers c
   where c.id = i.customer_id;

  v_ref := nullif(btrim(coalesce(i.po_number, '')), '');
  v_notes := concat_ws(' · ',
    'Invoice ' || coalesce(i.invoice_number, '#' || i.id::text),
    case when v_ref is not null then 'PO ' || v_ref end,
    case when v_credit is not null then 'Credited by ' || v_credit end);

  if v_order.id is null then
    insert into public.orders (
      invoice_id, invoice_number, user_id,
      customer_name, customer_email, customer_phone,
      items, subtotal, subtotal_amount, vat_amount, total_amount,
      payment_method, payments, payment_reference,
      status, paid_at, notes,
      stock_reserved, stock_returned, till_shift_id, created_at
    )
    values (
      i.id, i.invoice_number, null,
      i.customer_name, coalesce(i.customer_email, v_email), v_phone,
      coalesce(i.items, '[]'::jsonb), coalesce(i.total_amount, 0),
      coalesce(i.subtotal_amount, 0), coalesce(i.vat_amount, 0), coalesce(i.total_amount, 0),
      i.payment_method, i.payments, v_ref,
      v_status, case when v_status = 'Completed' then coalesce(i.paid_at, now()) end, v_notes,
      false, false, null, i.created_at
    );
    return;
  end if;

  update public.orders o
     set invoice_number    = i.invoice_number,
         customer_name     = i.customer_name,
         customer_email    = coalesce(i.customer_email, v_email),
         customer_phone    = coalesce(v_phone, o.customer_phone),
         items             = coalesce(i.items, '[]'::jsonb),
         subtotal          = coalesce(i.total_amount, 0),
         subtotal_amount   = coalesce(i.subtotal_amount, 0),
         vat_amount        = coalesce(i.vat_amount, 0),
         total_amount      = coalesce(i.total_amount, 0),
         payment_method    = i.payment_method,
         payments          = i.payments,
         payment_reference = v_ref,
         status            = v_status,
         paid_at           = case when v_status = 'Completed' then coalesce(i.paid_at, o.paid_at, now()) end,
         notes             = v_notes,
         updated_at        = now()
   where o.id = v_order.id
     -- Only when something differs, so saving an invoice untouched does not
     -- churn the order or stamp a new updated_at for nothing.
     and (o.status            is distinct from v_status
       or o.invoice_number    is distinct from i.invoice_number
       or o.customer_name     is distinct from i.customer_name
       or o.customer_email    is distinct from coalesce(i.customer_email, v_email)
       or o.customer_phone    is distinct from coalesce(v_phone, o.customer_phone)
       or o.items             is distinct from coalesce(i.items, '[]'::jsonb)
       or o.subtotal_amount   is distinct from coalesce(i.subtotal_amount, 0)
       or o.vat_amount        is distinct from coalesce(i.vat_amount, 0)
       or o.total_amount      is distinct from coalesce(i.total_amount, 0)
       or o.payment_method    is distinct from i.payment_method
       or o.payments          is distinct from i.payments
       or o.payment_reference is distinct from v_ref
       or o.notes             is distinct from v_notes);
end;
$$;

revoke all on function public.sync_invoice_order(public.invoices) from public, anon, authenticated;

create or replace function public.invoice_write_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_invoice_order(new);
  return new;
end;
$$;

-- After, not before: the order points at the invoice, so the invoice row
-- has to exist first. Every update is watched, because a credit note lands
-- on the original as a note and that is the moment its order is cancelled.
drop trigger if exists invoices_write_order on public.invoices;
create trigger invoices_write_order
  after insert or update on public.invoices
  for each row execute function public.invoice_write_order();

-- ---------------------------------------------------------------------------
-- 5. The till's side, told about the mirror.
-- ---------------------------------------------------------------------------
-- Recreated from 20260922000000 with two changes: an order that mirrors an
-- invoice is left alone (it already has one — the invoice wrote it), and a
-- till sale's order is given the number its invoice was issued, so Orders
-- can show and search every sale by the same number the customer holds.
create or replace function public.invoice_for_order()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_number text;
begin
  -- The mirror of an invoice. Writing an invoice for it would raise a
  -- second document for the same sale.
  if new.invoice_id is not null then
    return new;
  end if;

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

  -- The number the register issued, written back onto the sale. Not in a
  -- closed period: the order row is guarded there and this is not a change
  -- worth refusing a sale over.
  select invoice_number into v_number from public.invoices where order_id = new.id;
  if v_number is not null
     and new.invoice_number is distinct from v_number
     and not public.is_period_locked(new.created_at) then
    update public.orders set invoice_number = v_number where id = new.id;
  end if;

  return new;
end;
$function$;

-- Recreated from 20260613000000 with one change: an order written beside an
-- invoice is not a customer placing an order, and must not ring the shop.
create or replace function public.notify_admins_new_order()
returns trigger
language plpgsql
security definer
set search_path = public, private, net, extensions
as $$
declare
  cfg private.push_config;
  item_count int;
  body jsonb;
begin
  -- The mirror of an invoice raised by staff: nobody new has ordered anything.
  if new.invoice_id is not null then
    return new;
  end if;

  select * into cfg from private.push_config where id = 1;

  -- Only fire when configured and for customer/online orders (skip POS 'Paid' sales).
  if cfg.onesignal_app_id is null or cfg.onesignal_rest_key is null or cfg.enabled = false then
    return new;
  end if;
  if not (coalesce(new.status, '') = 'Pending' or coalesce(new.payment_method, '') ilike '%dpo%') then
    return new;
  end if;

  item_count := coalesce(jsonb_array_length(new.items), 0);

  body := jsonb_build_object(
    'app_id', cfg.onesignal_app_id,
    'filters', jsonb_build_array(
      jsonb_build_object('field','tag','key','role','relation','=','value','admin')
    ),
    'headings', jsonb_build_object('en', '🛒 New order received'),
    'contents', jsonb_build_object('en',
      coalesce(new.customer_name, 'Customer') || ' · N$ ' ||
      to_char(coalesce(new.total_amount, 0), 'FM999G999G990D00') ||
      ' · ' || item_count || ' item(s)'),
    'data', jsonb_build_object('order_id', new.id::text, 'type', 'new_order'),
    'url', cfg.admin_url || '#online-orders',
    'android_channel_id', null,
    'priority', 10
  );

  perform net.http_post(
    url := 'https://onesignal.com/api/v1/notifications',
    body := body,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Basic ' || cfg.onesignal_rest_key
    ),
    timeout_milliseconds := 6000
  );

  return new;
exception when others then
  -- Never let a notification failure block the order from being created.
  return new;
end;
$$;

-- Commission on a shift: the orders side leaves the mirrors out, since the
-- invoices side already has them. They carry no shift anyway; this says so.
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
      and o.invoice_id is null
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

-- ---------------------------------------------------------------------------
-- 6. The cash up: sales by the shift that raised them, money by the shift
--    that took it, and the invoices listed by number.
-- ---------------------------------------------------------------------------
-- Recreated from 20260929000000. The invoice block is now two questions:
--
--   * Raised in this shift   → total sales, and "not settled in this shift"
--                              for whatever was not paid here.
--   * Settled in this shift  → cash, card and EFT, whichever shift raised
--                              the document.
--
-- So the tender lines add up to total sales plus whatever was settled here
-- against an earlier shift's sale, and the report says that figure out
-- loud rather than leaving the reader to find the difference.
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
    and coalesce(i.source, '') <> 'pos';

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
    and coalesce(i.source, '') <> 'pos';

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
    'invoices', v_invoices,
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

-- ---------------------------------------------------------------------------
-- 7. What is already on the books.
-- ---------------------------------------------------------------------------

-- 7a. Where each paid invoice was settled. A till sale's invoice: the shift
--     of its order. A console invoice: the shift whose hours cover the
--     moment it was marked paid — the same shift it was raised in for most,
--     a later one for an account settled afterwards, which is exactly the
--     case the old single column got wrong. Paid with no till open, it stays
--     unsettled here and the open or next shift adopts it below.
update public.invoices
   set paid_till_shift_id = till_shift_id
 where source = 'pos'
   and lower(coalesce(status, '')) = 'paid'
   and paid_till_shift_id is null
   and till_shift_id is not null;

update public.invoices i
   set paid_till_shift_id = (
         select t.id
           from public.till_shifts t
          where t.opening_time <= i.paid_at
            and i.paid_at <= coalesce(t.closing_time, now())
          order by t.opening_time desc
          limit 1)
 where lower(coalesce(i.status, '')) = 'paid'
   and i.paid_till_shift_id is null
   and i.paid_at is not null
   and i.source is distinct from 'pos'
   and i.source is distinct from 'iq-import'
   and exists (
         select 1
           from public.till_shifts t
          where t.opening_time <= i.paid_at
            and i.paid_at <= coalesce(t.closing_time, now()));

-- 7b. An order beside every console invoice already raised, in the order
--     they were raised. Drafts and voided documents are passed over by the
--     function itself.
do $$
declare
  r public.invoices%rowtype;
begin
  for r in
    select *
      from public.invoices
     where source is distinct from 'pos'
       and source is distinct from 'iq-import'
       and coalesce(doc_type, 'invoice') <> 'credit_note'
     order by created_at, id
  loop
    perform public.sync_invoice_order(r);
  end loop;
end;
$$;

-- 7c. The invoice number onto every till sale that has one. Not in a closed
--     period, where the order row is guarded.
update public.orders o
   set invoice_number = i.invoice_number
  from public.invoices i
 where i.order_id = o.id
   and o.invoice_number is distinct from i.invoice_number
   and not public.is_period_locked(o.created_at);

-- 7d. Whatever fell between shifts joins the shift that is open now, if
--     there is one. Otherwise the next till to open collects it.
do $$
declare
  v_shift bigint;
begin
  select id into v_shift
    from public.till_shifts
   where status = 'Open'
   order by opening_time desc
   limit 1;
  if v_shift is not null then
    perform public.adopt_unshifted_invoices(v_shift);
  end if;
end;
$$;
