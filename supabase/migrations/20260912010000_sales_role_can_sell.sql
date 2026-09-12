/*
  Let the sales role sell.

  Roles were defined in August — admin, owner, manager on one side; sales,
  cashier, staff on the other — but the row policies were never opened up
  to the second group. Every table a salesperson works in was still
  `is_admin()` only: quotes, invoices, job cards, laybys, customers, the
  till itself. The console showed her the screens; the database refused
  every save. Tested as sales@jrimporters.com: quote, invoice, job card and
  opening the till were all "violates row-level security policy".

  This grants the sales side the work it does, and stops there:

    sales    — sell at the till, open and close their own shift, record
               petty cash, raise quotes, invoices, job cards and laybys,
               look up and add customers, see orders to invoice and dispatch.
    admin    — everything, and alone on stock, products, purchase orders,
               stock takes, the ledger, amending a cash-up, and deleting.

  Stock and products are untouched here on purpose: their policies are
  already admin-only, and that is the line the shop asked for.
*/

-- ---------------------------------------------------------------------------
-- Documents a salesperson raises. Read, create and amend; never delete.
-- ---------------------------------------------------------------------------
create policy "staff read quotes"    on public.quotes    for select to authenticated using (public.is_staff());
create policy "staff create quotes"  on public.quotes    for insert to authenticated with check (public.is_staff());
create policy "staff update quotes"  on public.quotes    for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read invoices"   on public.invoices for select to authenticated using (public.is_staff());
create policy "staff create invoices" on public.invoices for insert to authenticated with check (public.is_staff());
create policy "staff update invoices" on public.invoices for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read job cards"   on public.job_cards for select to authenticated using (public.is_staff());
create policy "staff create job cards" on public.job_cards for insert to authenticated with check (public.is_staff());
create policy "staff update job cards" on public.job_cards for update to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "staff read laybys"   on public.laybys for select to authenticated using (public.is_staff());
create policy "staff create laybys" on public.laybys for insert to authenticated with check (public.is_staff());
create policy "staff update laybys" on public.laybys for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- Customers: the picker on every document needs to read them, and a walk-in
-- becomes a customer at the counter. The money side of the record stays
-- with admin — see the trigger below.
-- ---------------------------------------------------------------------------
create policy "staff read customers"   on public.customers for select to authenticated using (public.is_staff());
create policy "staff create customers" on public.customers for insert to authenticated with check (public.is_staff());
create policy "staff update customers" on public.customers for update to authenticated using (public.is_staff()) with check (public.is_staff());

create or replace function public.guard_customer_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A salesperson may fix a phone number; the credit terms are not theirs
  -- to change. Reverted silently rather than refused, so a contact edit that
  -- happens to resend the whole row does not fail on fields nobody touched.
  if not public.is_admin() then
    new.credit_limit  := old.credit_limit;
    new.customer_type := old.customer_type;
    new.account_code  := old.account_code;
    new.active        := old.active;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_customer_terms on public.customers;
create trigger guard_customer_terms
  before update on public.customers
  for each row
  execute function public.guard_customer_terms();

-- ---------------------------------------------------------------------------
-- Orders: a cashier already creates her own. She also has to find any order
-- to invoice it, take a payment on it, or dispatch it.
-- ---------------------------------------------------------------------------
create policy "staff read orders"   on public.orders for select to authenticated using (public.is_staff());
create policy "staff update orders" on public.orders for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- The till. A shift can be opened and worked by staff, and closed — the
-- must-balance rule applies to everyone. Once closed it is out of reach:
-- a closed shift's numbers change only through amend_cash_up, which asks
-- for a manager.
-- ---------------------------------------------------------------------------
create policy "staff read till shifts"   on public.till_shifts for select to authenticated using (public.is_staff());
create policy "staff open till shifts"   on public.till_shifts for insert to authenticated with check (public.is_staff());
create policy "staff work open shifts"   on public.till_shifts for update to authenticated
  using (public.is_staff() and status = 'Open')
  with check (public.is_staff());

-- Petty cash is money out of the drawer during a shift, recorded as an
-- expense against that shift. Staff may write those and only those.
create policy "staff read expenses" on public.expenses for select to authenticated using (public.is_staff());
create policy "staff record petty cash" on public.expenses for insert to authenticated
  with check (public.is_staff() and till_shift_id is not null);
