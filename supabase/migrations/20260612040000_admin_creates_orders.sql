-- Allow admins/staff to create orders on behalf of customers (POS sales, quote
-- conversions, layby fulfilment). The original policy only permitted an order
-- whose user_id matched the auth user or was null, which blocked staff from
-- ringing up a sale for a selected customer.
drop policy if exists "authenticated creates own orders" on public.orders;
create policy "authenticated creates own orders" on public.orders
for insert with check (
  public.is_admin()
  or (auth.role() = 'authenticated' and (user_id = auth.uid() or user_id is null))
);
