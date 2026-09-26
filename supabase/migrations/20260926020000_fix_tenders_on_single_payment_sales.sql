/*
  Every sale paid a single way vanished from the cash-up.

  `order_tenders` splits a sale into its tenders: the payment breakdown when
  there is one, otherwise the single payment method for the whole amount.
  The fallback was guarded by `where not (jsonb_typeof(payments) = 'array'
  and jsonb_array_length(payments) > 0)`. On a sale with no breakdown
  `payments` is null, so `jsonb_typeof(null)` is null, the whole condition is
  null, and `not null` is null — which is not true, so the row was never
  emitted. Neither branch produced anything, and `cross join lateral` then
  dropped the sale from the cash-up entirely.

  Every sale is paid a single way except the handful that are split, so the
  cash-up read zero: five sales on shift 27, N$16,880 between them, and a
  report saying nothing had been sold.

  Null-safe now, and the join is a left join so a sale can never be dropped
  by this function again even if it somehow returns nothing.
*/

create or replace function public.order_tenders(o public.orders)
returns table (method text, amount numeric)
language sql
stable
as $$
  with split as (
    select coalesce(jsonb_typeof(o.payments) = 'array' and jsonb_array_length(o.payments) > 0, false) as yes
  )
  select lower(coalesce(p->>'method', '')), coalesce((p->>'amount')::numeric, 0)
  from split, jsonb_array_elements(case when split.yes then o.payments else '[]'::jsonb end) as p
  union all
  select lower(coalesce(o.payment_method, '')), coalesce(o.total_amount, 0)
  from split where not split.yes;
$$;
