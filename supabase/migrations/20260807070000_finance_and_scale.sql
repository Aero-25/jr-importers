-- Financial control, and the indexes to survive growth.
--
-- Three things in one migration because they share a spine: once a period can
-- be locked, the reports that read it become facts rather than snapshots, and
-- the tables they read have to be indexed for the reads to stay cheap.

/* ── Indexes on the tables that actually grow ────────────────────────────── */

-- stock_movements had exactly one index (its primary key) and is written to by
-- every sale, refund and delivery. Product history was going to crawl first.
create index if not exists stock_movements_product_idx
  on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_created_idx
  on public.stock_movements (created_at desc);
create index if not exists stock_movements_reference_idx
  on public.stock_movements (reference_type, reference_id);

create index if not exists orders_created_idx  on public.orders (created_at desc);
create index if not exists orders_status_idx   on public.orders (status);
create index if not exists orders_shift_idx    on public.orders (till_shift_id);
create index if not exists orders_customer_idx on public.orders (customer_phone);

create index if not exists products_active_name_idx on public.products (active, name);
create index if not exists products_category_idx    on public.products (category) where active;
create index if not exists customers_phone_idx      on public.customers (phone);
create index if not exists expenses_date_idx        on public.expenses (expense_date desc);

/* ── Locking a period ────────────────────────────────────────────────────── */

create table if not exists public.accounting_periods (
  id          bigint generated always as identity primary key,
  period_from date not null,
  period_to   date not null,
  status      text not null default 'Open',
  locked_at   timestamptz,
  locked_by   text,
  notes       text,
  created_at  timestamptz not null default now(),

  constraint accounting_periods_status_check check (status in ('Open', 'Locked')),
  constraint accounting_periods_range_check check (period_to >= period_from),
  constraint accounting_periods_unique unique (period_from, period_to)
);

alter table public.accounting_periods enable row level security;

drop policy if exists "staff read periods" on public.accounting_periods;
create policy "staff read periods"
  on public.accounting_periods for select to authenticated using (true);

-- Locking is a decision, not an edit; it goes through the RPC below.

create or replace function public.is_period_locked(p_when timestamptz)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.accounting_periods
    where status = 'Locked'
      and p_when::date between period_from and period_to
  );
$$;

-- The guard itself. Attached to anything whose figures a locked period reports
-- on, so a closed month cannot quietly change shape three weeks later.
create or replace function public.block_locked_period()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_when timestamptz;
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  v_when := coalesce(
    (v_row ->> 'expense_date')::timestamptz,
    (v_row ->> 'opening_time')::timestamptz,
    (v_row ->> 'created_at')::timestamptz
  );

  if v_when is not null and public.is_period_locked(v_when) then
    raise exception
      'That date falls in a closed accounting period. Reverse it with a credit note or refund instead.'
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['orders', 'expenses', 'refunds', 'till_shifts'] loop
    execute format('drop trigger if exists block_locked_period_trg on public.%I', t);
    execute format(
      'create trigger block_locked_period_trg before update or delete on public.%I
         for each row execute function public.block_locked_period()', t);
  end loop;
end;
$$;

create or replace function public.close_period(
  p_from date,
  p_to date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_id bigint;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can close a period.');
  end if;

  if exists (select 1 from public.till_shifts
              where status = 'Open' and opening_time::date between p_from and p_to) then
    return jsonb_build_object(
      'ok', false,
      'message', 'A till shift in that period is still open. Close it before closing the period.'
    );
  end if;

  insert into public.accounting_periods (period_from, period_to, status, locked_at, locked_by, notes)
  values (p_from, p_to, 'Locked', now(), public.current_actor(), p_notes)
  on conflict (period_from, period_to) do update
    set status = 'Locked', locked_at = now(), locked_by = public.current_actor(),
        notes = coalesce(excluded.notes, public.accounting_periods.notes)
  returning id into v_id;

  return jsonb_build_object(
    'ok', true,
    'period', (select to_jsonb(x) from public.accounting_periods x where x.id = v_id)
  );
end;
$$;

create or replace function public.reopen_period(p_id bigint, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare p public.accounting_periods%rowtype;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can reopen a period.');
  end if;
  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Reopening a closed period needs a reason.');
  end if;

  update public.accounting_periods
     set status = 'Open',
         notes = concat_ws(E'\n', notes,
                 format('Reopened %s by %s: %s', to_char(now(), 'DD Mon YYYY'),
                        public.current_actor(), trim(p_reason)))
   where id = p_id
  returning * into p;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'Period not found.');
  end if;

  return jsonb_build_object('ok', true, 'period', to_jsonb(p));
end;
$$;

/* ── VAT return ──────────────────────────────────────────────────────────── */

-- Output VAT from sales less refunds, input VAT from purchases and deductible
-- expenses. Namibian returns are bi-monthly, so the period is a parameter
-- rather than an assumption.
create or replace function public.vat_return(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_rate numeric := 0.15;
  v_sales_inc numeric(14,2);
  v_refunds_inc numeric(14,2);
  v_purchases_inc numeric(14,2);
  v_expenses_inc numeric(14,2);
  v_output numeric(14,2);
  v_input numeric(14,2);
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

  select coalesce(sum(total_amount), 0) into v_sales_inc
  from public.orders
  where created_at::date between p_from and p_to
    and status in ('Paid', 'Completed', 'Delivered', 'Dispatched');

  select coalesce(sum(total_amount), 0) into v_refunds_inc
  from public.refunds
  where approved_at::date between p_from and p_to and status = 'Approved';

  select coalesce(sum(total_amount), 0) into v_purchases_inc
  from public.grvs
  where posted_at::date between p_from and p_to;

  select coalesce(sum(amount), 0) into v_expenses_inc
  from public.expenses
  where expense_date between p_from and p_to
    and coalesce(tax_deductible, false);

  v_output := round((v_sales_inc - v_refunds_inc) * v_rate / (1 + v_rate), 2);
  v_input  := round((v_purchases_inc + v_expenses_inc) * v_rate / (1 + v_rate), 2);

  select public.is_period_locked(p_to::timestamptz) into v_locked;

  return jsonb_build_object(
    'ok', true,
    'period_from', p_from,
    'period_to', p_to,
    'rate', v_rate,
    'period_locked', v_locked,
    'sales_inc', v_sales_inc,
    'refunds_inc', v_refunds_inc,
    'net_sales_inc', v_sales_inc - v_refunds_inc,
    'output_vat', v_output,
    'purchases_inc', v_purchases_inc,
    'expenses_inc', v_expenses_inc,
    'input_vat', v_input,
    'payable', round(v_output - v_input, 2)
  );
end;
$$;

/* ── Stock valuation and dead stock ──────────────────────────────────────── */

-- Services are not stock. Repairs are carried as products with a sentinel
-- quantity of 999 so the till can ring them up, and counting those as inventory
-- put roughly a million dollars of imaginary value on the balance sheet.
create or replace function public.stock_valuation(p_dead_days integer default 90)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_by_category jsonb;
  v_dead jsonb;
  v_total numeric(14,2);
  v_units integer;
  v_dead_value numeric(14,2);
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select
    coalesce(sum(p.stock * coalesce(p.cost_price, 0)), 0),
    coalesce(sum(p.stock), 0)
  into v_total, v_units
  from public.products p where p.active and p.category is distinct from 'Repairs';

  select coalesce(jsonb_agg(t order by t.value desc), '[]'::jsonb) into v_by_category
  from (
    select
      coalesce(p.category, 'Uncategorised') as category,
      sum(p.stock)::int as units,
      round(sum(p.stock * coalesce(p.cost_price, 0)), 2) as value,
      round(sum(p.stock * coalesce(p.price, 0)), 2) as retail
    from public.products p
    where p.active and p.category is distinct from 'Repairs'
    group by 1
  ) t;

  -- Nothing sold in the window. Products that have never sold count too: a line
  -- that has never moved is the most expensive kind of dead stock.
  select coalesce(jsonb_agg(t order by t.value desc), '[]'::jsonb) into v_dead
  from (
    select
      p.id, p.name, p.stock,
      round(p.stock * coalesce(p.cost_price, 0), 2) as value,
      (select max(m.created_at) from public.stock_movements m
        where m.product_id = p.id and m.movement_type = 'sale') as last_sold
    from public.products p
    where p.active
      and p.category is distinct from 'Repairs'
      and p.stock > 0
      and not exists (
        select 1 from public.stock_movements m
        where m.product_id = p.id
          and m.movement_type = 'sale'
          and m.created_at > now() - make_interval(days => p_dead_days)
      )
    limit 100
  ) t;

  select coalesce(sum((x ->> 'value')::numeric), 0) into v_dead_value
  from jsonb_array_elements(v_dead) as t(x);

  return jsonb_build_object(
    'ok', true,
    'total_at_cost', v_total,
    'total_units', v_units,
    'by_category', v_by_category,
    'dead_days', p_dead_days,
    'dead_stock', v_dead,
    'dead_value', v_dead_value
  );
end;
$$;

/* ── Debtors ageing ──────────────────────────────────────────────────────── */

create or replace function public.debtors_ageing()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_rows jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select coalesce(jsonb_agg(t order by t.total desc), '[]'::jsonb) into v_rows
  from (
    select
      coalesce(l.customer_name, 'Unnamed') as customer,
      l.customer_phone as phone,
      round(sum(coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0))), 2) as total,
      round(sum(case when now()::date - coalesce(l.due_date, l.created_at::date) <= 30
                then coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0)) else 0 end), 2) as d30,
      round(sum(case when now()::date - coalesce(l.due_date, l.created_at::date) between 31 and 60
                then coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0)) else 0 end), 2) as d60,
      round(sum(case when now()::date - coalesce(l.due_date, l.created_at::date) between 61 and 90
                then coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0)) else 0 end), 2) as d90,
      round(sum(case when now()::date - coalesce(l.due_date, l.created_at::date) > 90
                then coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0)) else 0 end), 2) as d90_plus
    from public.laybys l
    where coalesce(l.balance_amount, coalesce(l.total_amount,0) - coalesce(l.paid_amount,0)) > 0.005
    group by 1, 2
  ) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

/* ── Supplier reconciliation ─────────────────────────────────────────────── */

create or replace function public.supplier_recon(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare v_rows jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select coalesce(jsonb_agg(t order by t.received desc), '[]'::jsonb) into v_rows
  from (
    select
      coalesce(g.supplier_name, 'Unnamed') as supplier,
      count(*)::int as deliveries,
      round(sum(g.total_amount), 2) as received,
      count(*) filter (where g.posted_at is null)::int as unposted,
      count(*) filter (where coalesce(g.supplier_invoice_no, '') = '')::int as no_invoice_no,
      round(coalesce((
        select sum(e.amount) from public.expenses e
        where lower(coalesce(e.supplier_vendor, '')) = lower(coalesce(g.supplier_name, ''))
          and e.expense_date between p_from and p_to
      ), 0), 2) as paid
    from public.grvs g
    where coalesce(g.invoice_date, g.created_at::date) between p_from and p_to
    group by g.supplier_name
  ) t;

  return jsonb_build_object('ok', true, 'rows', v_rows);
end;
$$;

/* ── Trade accounts ──────────────────────────────────────────────────────── */

alter table public.customers
  add column if not exists credit_limit numeric(12,2) not null default 0,
  add column if not exists account_terms text,
  add column if not exists on_hold boolean not null default false;

revoke all on function public.close_period(date, date, text) from public, anon;
revoke all on function public.reopen_period(bigint, text) from public, anon;
revoke all on function public.vat_return(date, date) from public, anon;
revoke all on function public.stock_valuation(integer) from public, anon;
revoke all on function public.debtors_ageing() from public, anon;
revoke all on function public.supplier_recon(date, date) from public, anon;

grant execute on function public.close_period(date, date, text) to authenticated;
grant execute on function public.reopen_period(bigint, text) to authenticated;
grant execute on function public.vat_return(date, date) to authenticated;
grant execute on function public.stock_valuation(integer) to authenticated;
grant execute on function public.debtors_ageing() to authenticated;
grant execute on function public.supplier_recon(date, date) to authenticated;
grant execute on function public.is_period_locked(timestamptz) to authenticated;
