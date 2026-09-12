/*
  A till cannot be closed on a count that does not balance.

  Closing was a plain status update: count the drawer, and whatever the gap
  against the expected figure, the shift went to Closed with the variance
  written beside it. The variance column then became a record of money that
  was never found, on a shift nobody could reopen.

  Now the close itself is refused while the counted cash differs from what
  the till expects. The cashier recounts; the shift stays open until the
  drawer agrees. This is enforced here, on the row, so that no screen, no
  script and no future rewrite of the till can close a short drawer.

  A drawer can be genuinely short — a note handed over as change, a refund
  paid out and not recorded. For that, and only that, a manager can accept
  the variance with a written reason. The acceptance is stored on the shift
  in the manager's name; the variance is not cleared, it is explained, and
  the report says who signed it off.
*/

alter table public.till_shifts
  add column if not exists variance_accepted_by     text,
  add column if not exists variance_accepted_reason text,
  add column if not exists variance_accepted_at     timestamptz;

comment on column public.till_shifts.variance_accepted_reason is
  'Why a shift was allowed to close on a drawer that did not balance. Set by a manager; null on every shift that balanced.';

create or replace function public.till_shift_must_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the transition into Closed is guarded. Amending a closed shift's
  -- count later goes through amend_cash_up, which has its own rules.
  if new.status = 'Closed' and coalesce(old.status, '') <> 'Closed' then
    if abs(coalesce(new.cash_variance, 0)) >= 0.005 then
      if new.variance_accepted_reason is null or btrim(new.variance_accepted_reason) = '' then
        raise exception 'The drawer does not balance: counted % against an expected %. Recount the drawer, or have a manager accept the difference with a reason.',
          to_char(coalesce(new.actual_cash, 0), 'FM999G999G990D00'),
          to_char(coalesce(new.expected_cash, 0), 'FM999G999G990D00')
          using errcode = 'check_violation';
      end if;
      if not public.is_admin() then
        raise exception 'Only a manager can accept a drawer that does not balance.'
          using errcode = 'insufficient_privilege';
      end if;
      new.variance_accepted_by := coalesce(new.variance_accepted_by, public.current_actor());
      new.variance_accepted_at := coalesce(new.variance_accepted_at, now());
    else
      -- A balanced drawer needs no excuse, and must not carry one.
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
