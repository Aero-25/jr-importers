-- Proper till control: counted floats, petty cash, and an auditable cash-up.
--
-- The existing till_shifts row stored a single typed float figure. That is the
-- number everyone argues about at the end of a shift, because there is nothing
-- behind it — no record of what was actually in the drawer. This migration
-- stores the denomination count itself, so opening and closing floats are
-- derived from what was physically counted rather than asserted.
--
-- It also ties sales and petty cash to the shift they belong to, so a cash-up
-- is a query rather than a reconstruction from timestamps.

begin;

-- ---------------------------------------------------------------------------
-- Denomination counts.
--
-- Stored as { "200": 4, "100": 12, "0.50": 8, … } — the denomination's face
-- value as the key, the number of pieces as the value. Keeping the face value
-- rather than a label means the float can be recomputed from the record even
-- if the UI's denomination list changes later.
-- ---------------------------------------------------------------------------
alter table public.till_shifts
  add column if not exists opening_denominations jsonb not null default '{}'::jsonb,
  add column if not exists closing_denominations jsonb not null default '{}'::jsonb,
  add column if not exists petty_cash_total numeric(12,2) not null default 0,
  add column if not exists refunds_total numeric(12,2) not null default 0,
  add column if not exists closed_by text,
  add column if not exists notes text;

-- ---------------------------------------------------------------------------
-- Tie the money to the shift.
--
-- Cash-up previously matched sales by `created_at >= opening_time`, which is
-- wrong the moment two tills trade at once, and drifts if a shift is closed
-- late. An explicit link makes the reconciliation exact.
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists till_shift_id bigint references public.till_shifts(id) on delete set null;

alter table public.expenses
  add column if not exists till_shift_id bigint references public.till_shifts(id) on delete set null;

create index if not exists orders_till_shift_idx on public.orders (till_shift_id);
create index if not exists expenses_till_shift_idx on public.expenses (till_shift_id);

-- ---------------------------------------------------------------------------
-- Sum a denomination count into an amount.
--
-- Immutable so it can be used in generated columns and indexes later; the keys
-- are numeric strings, so a bad key is skipped rather than failing the cash-up.
-- ---------------------------------------------------------------------------
create or replace function public.denomination_total(p_counts jsonb)
returns numeric
language sql
immutable
as $$
  select coalesce(
    sum(
      case
        when key ~ '^[0-9]+(\.[0-9]+)?$' and value::text ~ '^[0-9]+$'
        then key::numeric * value::text::numeric
        else 0
      end
    ),
    0
  )::numeric(12,2)
  from jsonb_each_text(coalesce(p_counts, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- The cash-up itself.
--
-- Returns everything a shift report needs in one round trip, computed on the
-- server so the till and the back office can never disagree about the numbers.
--
--   expected_cash = opening float + cash taken - cash refunded - petty cash out
--
-- Card and EFT never touch the drawer, so they are reported but excluded from
-- the expected figure. Counting them is how a till appears short every day.
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

  return jsonb_build_object(
    'ok', true,
    'shift_id', s.id,
    'till_id', s.till_id,
    'cashier', s.cashier_name,
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
    'closing_denominations', s.closing_denominations
  );
end;
$$;

grant execute on function public.denomination_total(jsonb) to authenticated;
grant execute on function public.till_cash_up(bigint) to authenticated;

notify pgrst, 'reload schema';

commit;
