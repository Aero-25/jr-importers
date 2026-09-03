/*
  Close the till by restoring the float, then bank what is left.

  The report stopped at the variance, which left the cashier to work out in
  their head how much to leave in the drawer and how much goes to the bank —
  the two numbers most likely to be got wrong at the end of a long day, and
  the ones nobody can reconstruct afterwards if they are only ever thought and
  not written down.

  The float target is a setting rather than a constant: it is a business
  decision, and the shop should be able to change it without a deploy.

  It is a target, not a promise. On a quiet day the drawer can hold less than
  the float, and the report must then say the float is short rather than
  inventing money to make the arithmetic work — hence `least(counted, target)`
  and never a negative amount to bank.
*/

insert into public.settings (key, value)
values ('till_float_target', '500'::jsonb)
on conflict (key) do nothing;

alter table public.till_shifts
  /* What stays in the drawer for the next shift. */
  add column if not exists float_retained numeric(12,2),
  /* What physically goes to the bank. */
  add column if not exists cash_banked    numeric(12,2);

comment on column public.till_shifts.float_retained is
  'Cash left in the drawer as the next shift''s float. Capped at the counted cash when the drawer cannot cover the target.';
comment on column public.till_shifts.cash_banked is
  'Counted cash less the retained float — the amount to bank. Never negative.';
