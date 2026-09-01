-- Invoices settled at the counter belong on the cash-up.
--
-- The shift totals were built from `orders` alone, so an invoice paid at the
-- till put money in the drawer that the cash-up never expected. The cashier
-- then counted a surplus every time, and a real surplus — the kind that means
-- something is wrong — was indistinguishable from the noise.
--
-- Only SETTLED invoices count. An invoice on account is a promise to pay, not
-- money taken: including it would inflate the shift and, worse, would invent an
-- expected-cash figure the drawer could never match.

alter table public.invoices
  add column if not exists till_shift_id  bigint references public.till_shifts(id) on delete set null,
  add column if not exists payment_method text;

create index if not exists invoices_till_shift_idx on public.invoices (till_shift_id);

comment on column public.invoices.till_shift_id is
  'The shift this invoice was settled in. Stamped automatically when status becomes paid; null while it sits on account.';

-- Stamping is a trigger rather than something the screens remember to do:
-- invoices can be settled from the record dialog, and any future screen would
-- otherwise have to repeat this and would eventually forget.
create or replace function public.invoice_stamp_shift()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift bigint;
begin
  if lower(coalesce(new.status, '')) <> 'paid' then
    return new;
  end if;

  if new.paid_at is null then
    new.paid_at := now();
  end if;

  -- Already attributed, either automatically or by hand. Leave it: re-stamping
  -- would move historical money into whichever shift happens to be open now.
  if new.till_shift_id is not null then
    return new;
  end if;

  -- Imported history predates the till entirely and must not land in a shift.
  if new.source = 'iq-import' then
    return new;
  end if;

  select id into v_shift
    from public.till_shifts
   where status = 'Open'
   order by opening_time desc
   limit 1;

  new.till_shift_id := v_shift;
  return new;
end;
$$;

drop trigger if exists invoices_stamp_shift on public.invoices;
create trigger invoices_stamp_shift
before insert or update of status on public.invoices
for each row execute function public.invoice_stamp_shift();
