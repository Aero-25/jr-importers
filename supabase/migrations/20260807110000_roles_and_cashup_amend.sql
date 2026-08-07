-- Two profiles, and a way to correct a cash-up.
--
-- Roles existed in the code but nobody had been given one other than admin.
-- Naming them properly is what makes the difference between a permission system
-- and a permission system somebody actually uses.
--
--   sales — sells. Till, orders, job cards, customers, deliveries.
--   admin — everything, including the money screens and correcting a cash-up.
--
-- The older names stay valid so nothing that already works stops working:
-- owner and manager behave as admin, cashier and staff as sales.

create or replace function public.is_admin()
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
      and lower(u.role) in ('admin', 'owner', 'manager')
  );
$$;

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
      and lower(u.role) in ('admin', 'owner', 'manager', 'sales', 'cashier', 'staff')
  );
$$;

/* ── Correcting a cash-up ────────────────────────────────────────────────── */

alter table public.till_shifts
  add column if not exists amended_at timestamptz,
  add column if not exists amended_by text,
  add column if not exists amend_reason text,
  -- What was counted before anybody corrected it. Keeping the original is the
  -- whole point: an amendment that erases what it replaced is not a correction,
  -- it is a rewrite.
  add column if not exists original_denominations jsonb,
  add column if not exists original_counted numeric(12,2);

/**
 * Amends a closed shift's cash count.
 *
 * A drawer gets miscounted at the end of a long Saturday and the shift is
 * closed on a wrong figure. Without this the only fixes were to leave a false
 * variance on the record forever or to edit the row by hand, and the second one
 * leaves no trace of who decided what.
 *
 * Three things make it safe rather than a back door: only a manager may do it,
 * it demands a reason, and the original count is preserved alongside the new
 * one. A closed accounting period still refuses the write — that guard is not
 * negotiable from here.
 */
create or replace function public.amend_cash_up(
  p_shift_id bigint,
  p_counts jsonb,
  p_reason text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  s public.till_shifts%rowtype;
  v_counted numeric(12,2);
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Only a manager can amend a cash-up.');
  end if;

  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object(
      'ok', false,
      'message', 'Amending a cash-up needs a reason. It stays on the record.'
    );
  end if;

  select * into s from public.till_shifts where id = p_shift_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Shift not found.');
  end if;
  if s.status <> 'Closed' then
    return jsonb_build_object(
      'ok', false,
      'message', 'That shift is still open. Close it before amending the count.'
    );
  end if;

  v_counted := public.denomination_total(coalesce(p_counts, '{}'::jsonb));

  update public.till_shifts
     set original_denominations = coalesce(original_denominations, closing_denominations),
         original_counted       = coalesce(original_counted, actual_cash),
         closing_denominations  = coalesce(p_counts, '{}'::jsonb),
         actual_cash            = v_counted,
         cash_variance          = round(v_counted - coalesce(expected_cash, 0), 2),
         notes                  = coalesce(p_notes, notes),
         amended_at             = now(),
         amended_by             = public.current_actor(),
         amend_reason           = concat_ws(E'\n', amend_reason,
                                    format('%s — %s: %s',
                                           to_char(now(), 'DD Mon YYYY HH24:MI'),
                                           public.current_actor(), trim(p_reason))),
         updated_at             = now()
   where id = p_shift_id
  returning * into s;

  return jsonb_build_object('ok', true, 'shift', to_jsonb(s));
end;
$$;

-- till_cash_up recomputes expected cash from the underlying records, so the
-- amended count flows into the report and the PDF without touching either.

revoke all on function public.amend_cash_up(bigint, jsonb, text, text) from public, anon;
grant execute on function public.amend_cash_up(bigint, jsonb, text, text) to authenticated;
