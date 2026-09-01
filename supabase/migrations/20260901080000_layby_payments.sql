-- Taking a layby payment, and putting it on the cash-up.
--
-- Laybys carried a `payments` array and paid/balance columns, but nothing ever
-- wrote to them: there was no way to record that a customer had come in and put
-- N$500 on their phone. So the money arrived in the drawer and the cash-up
-- knew nothing about it — the same hole invoices had, and it counts double
-- here because a layby is settled in instalments by design.
--
-- What matters for a till reconciliation is the PAYMENT, not the layby. A
-- N$10,000 layby with a N$2,000 deposit is N$2,000 in the drawer today; the
-- other N$8,000 arrives over weeks and belongs to the shifts it arrives in.
--
-- Each payment records the shift it was taken in, rather than the cash-up
-- matching timestamps to shift windows afterwards. Timestamp matching looks
-- fine until a payment lands in the minutes between one shift closing and the
-- next opening, and then the money belongs to nobody.

create or replace function public.take_layby_payment(
  p_layby_id bigint,
  p_amount   numeric,
  p_method   text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.laybys%rowtype;
  v_shift bigint;
  v_paid numeric(12,2);
  v_balance numeric(12,2);
  v_status text;
  v_by text;
begin
  if not public.is_staff() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  if coalesce(p_amount, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'A payment has to be more than nothing.');
  end if;

  select * into l from public.laybys where id = p_layby_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Layby not found.');
  end if;

  -- Overpaying is refused rather than silently producing a negative balance:
  -- if a customer is owed change, that is a decision for the person at the
  -- counter, not something the system should quietly absorb.
  v_paid := round(coalesce(l.paid_amount, 0) + p_amount, 2);
  if v_paid > coalesce(l.total_amount, 0) + 0.005 then
    return jsonb_build_object(
      'ok', false,
      'message', format('That is more than the %s outstanding.',
                        to_char(coalesce(l.total_amount,0) - coalesce(l.paid_amount,0), 'FM999G999D00'))
    );
  end if;

  select id into v_shift
    from public.till_shifts
   where status = 'Open'
   order by opening_time desc
   limit 1;

  select coalesce(u.full_name, u.email) into v_by
    from public.users u
   where u.id = auth.uid()
      or lower(u.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
   limit 1;

  v_balance := round(coalesce(l.total_amount, 0) - v_paid, 2);
  v_status := case when v_balance <= 0.005 then 'Completed' else coalesce(l.status, 'Active') end;

  update public.laybys
     set payments = coalesce(payments, '[]'::jsonb) || jsonb_build_object(
           'amount', round(p_amount, 2),
           'method', coalesce(nullif(btrim(p_method), ''), 'Cash'),
           'date', now(),
           'by', v_by,
           'till_shift_id', v_shift
         ),
         paid_amount = v_paid,
         balance_amount = v_balance,
         status = v_status,
         updated_at = now()
   where id = p_layby_id;

  return jsonb_build_object(
    'ok', true,
    'paid_amount', v_paid,
    'balance_amount', v_balance,
    'status', v_status,
    'till_shift_id', v_shift
  );
end;
$$;

grant execute on function public.take_layby_payment(bigint, numeric, text) to authenticated;
