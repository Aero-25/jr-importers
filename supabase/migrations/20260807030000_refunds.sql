-- Refunds and returns.
--
-- Until now there was no way to reverse a sale. A returned handset or a
-- mis-rung item had to be fixed by editing records directly, which leaves the
-- drawer, the stock and the books disagreeing with each other and no trace of
-- who decided what.
--
-- The rules encoded here:
--   * money out of the drawer and stock back on the shelf happen together, in
--     one transaction, or neither happens;
--   * a refund is attributed to the shift it is *approved* in, because that is
--     when the cash actually leaves the till;
--   * nobody writes to the table directly — the RPCs are the only way in, so a
--     refund cannot exist without its stock movement.

create sequence if not exists public.refund_number_seq start 1;

create table if not exists public.refunds (
  id              bigint generated always as identity primary key,
  refund_number   bigint not null unique default nextval('public.refund_number_seq'),

  -- Either a sale in the system, or a free-text reference for a counter sale
  -- that predates it. One of the two is required by request_refund.
  order_id        uuid references public.orders(id) on delete set null,
  original_reference text,

  customer_name   text,
  customer_phone  text,
  reason          text not null,
  method          text not null default 'Cash',

  -- [{ product_id, name, quantity, unit_price, line_total, restock, imei }]
  items           jsonb  not null default '[]'::jsonb,
  total_amount    numeric(12,2) not null default 0,

  status          text not null default 'Pending',
  restocked       boolean not null default false,
  requested_by    text,
  approved_by     text,
  approved_at     timestamptz,
  declined_reason text,

  till_shift_id   bigint references public.till_shifts(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint refunds_status_check check (status in ('Pending', 'Approved', 'Declined')),
  constraint refunds_total_positive check (total_amount >= 0)
);

create index if not exists refunds_shift_idx   on public.refunds (till_shift_id);
create index if not exists refunds_status_idx  on public.refunds (status);
create index if not exists refunds_created_idx on public.refunds (created_at desc);
create index if not exists refunds_order_idx   on public.refunds (order_id);

alter table public.refunds enable row level security;

drop policy if exists "staff read refunds" on public.refunds;
create policy "staff read refunds"
  on public.refunds for select to authenticated using (true);

-- Deliberately no insert/update/delete policy. Every write goes through the
-- SECURITY DEFINER functions below, which is what guarantees a refund can never
-- be recorded without the matching stock movement, or vice versa.

/* ── Who is acting ───────────────────────────────────────────────────────── */

-- Mirrors STAFF_ROLES in src/lib/constants.ts. is_admin() already covers the
-- managing roles; this is everyone allowed to operate the console at all.
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.users u
    where u.active = true
      and (
        u.id = auth.uid()
        or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
      and lower(u.role) in ('admin', 'owner', 'manager', 'cashier', 'staff')
  );
$$;

create or replace function public.current_actor()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (select u.full_name from public.users u
      where u.id = auth.uid()
         or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      limit 1),
    auth.jwt() ->> 'email',
    'unknown'
  );
$$;

/* ── Requesting ──────────────────────────────────────────────────────────── */

create or replace function public.request_refund(
  p_reason      text,
  p_method      text,
  p_items       jsonb,
  p_total       numeric,
  p_order_id    uuid    default null,
  p_original_reference text default null,
  p_customer_name  text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_id bigint;
  v_actor text := public.current_actor();
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'A reason is required.');
  end if;

  if p_order_id is null and coalesce(trim(p_original_reference), '') = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Link the original sale, or record a reference for it.'
    );
  end if;

  if coalesce(p_total, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'The refund amount must be more than zero.');
  end if;

  insert into public.refunds (
    order_id, original_reference, customer_name, customer_phone,
    reason, method, items, total_amount, requested_by
  )
  values (
    p_order_id, nullif(trim(p_original_reference), ''), p_customer_name, p_customer_phone,
    trim(p_reason), coalesce(nullif(trim(p_method), ''), 'Cash'),
    coalesce(p_items, '[]'::jsonb), round(p_total, 2), v_actor
  )
  returning id into v_id;

  -- A manager raising the refund is the approval. Making them approve their own
  -- request in a second step would teach everyone that the step is noise.
  if public.is_admin() then
    return public.approve_refund(v_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'pending', true,
    'refund', (select to_jsonb(r) from public.refunds r where r.id = v_id)
  );
end;
$$;

/* ── Approving ───────────────────────────────────────────────────────────── */

create or replace function public.approve_refund(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.refunds%rowtype;
  v_actor text := public.current_actor();
  v_shift bigint;
  line jsonb;
  v_qty integer;
  v_product bigint;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can approve a refund.');
  end if;

  select * into r from public.refunds where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Refund not found.');
  end if;
  if r.status <> 'Pending' then
    return jsonb_build_object('ok', false, 'message', 'This refund has already been ' || lower(r.status) || '.');
  end if;

  -- Attributed to the shift that is open now, not the one the request was
  -- raised in: the drawer is short from the moment the money is handed over.
  select id into v_shift
  from public.till_shifts
  where status = 'Open'
  order by opening_time desc
  limit 1;

  for line in select value from jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) loop
    continue when not coalesce((line ->> 'restock')::boolean, true);

    v_product := nullif(line ->> 'product_id', '')::bigint;
    v_qty     := greatest(coalesce((line ->> 'quantity')::integer, 0), 0);
    continue when v_product is null or v_qty = 0;

    update public.products
       set stock = stock + v_qty, updated_at = now()
     where id = v_product;

    insert into public.stock_movements (
      product_id, product_name, movement_type, quantity,
      reference_type, reference_id, notes, user_name
    )
    values (
      v_product, line ->> 'name', 'return', v_qty,
      'refund', r.refund_number::text, r.reason, v_actor
    );

    -- A returned handset goes back on the shelf under its own IMEI, not as an
    -- anonymous unit, or the count and the serial record drift apart.
    if coalesce(line ->> 'imei', '') <> '' then
      update public.product_imeis
         set status = 'available', sold_at = null, sold_order_id = null, updated_at = now()
       where imei = line ->> 'imei';
    end if;
  end loop;

  update public.refunds
     set status = 'Approved',
         approved_by = v_actor,
         approved_at = now(),
         till_shift_id = v_shift,
         restocked = true,
         updated_at = now()
   where id = p_id
  returning * into r;

  if v_shift is not null then
    update public.till_shifts
       set refunds_total = coalesce(refunds_total, 0) + r.total_amount,
           updated_at = now()
     where id = v_shift;
  end if;

  return jsonb_build_object('ok', true, 'pending', false, 'refund', to_jsonb(r));
end;
$$;

create or replace function public.decline_refund(p_id bigint, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r public.refunds%rowtype;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can decline a refund.');
  end if;

  update public.refunds
     set status = 'Declined',
         declined_reason = nullif(trim(p_reason), ''),
         approved_by = public.current_actor(),
         approved_at = now(),
         updated_at = now()
   where id = p_id and status = 'Pending'
  returning * into r;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That refund is no longer pending.');
  end if;

  return jsonb_build_object('ok', true, 'refund', to_jsonb(r));
end;
$$;

revoke all on function public.request_refund(text, text, jsonb, numeric, uuid, text, text, text) from public, anon;
revoke all on function public.approve_refund(bigint) from public, anon;
revoke all on function public.decline_refund(bigint, text) from public, anon;

grant execute on function public.request_refund(text, text, jsonb, numeric, uuid, text, text, text) to authenticated;
grant execute on function public.approve_refund(bigint) to authenticated;
grant execute on function public.decline_refund(bigint, text) to authenticated;
grant execute on function public.current_actor() to authenticated;

grant execute on function public.is_staff() to authenticated;

/* ── The drawer has to know ──────────────────────────────────────────────── */

-- Cash paid out as a refund leaves the till exactly like petty cash does. Left
-- out of the expected figure, every shift with a refund in it would read as
-- short by the refunded amount and the count would stop meaning anything.
--
-- Card and EFT refunds are reported but not deducted: that money goes back the
-- way it came and never touches the drawer.
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
