drop policy if exists "anyone creates messages" on public.messages;
create policy "anyone creates messages" on public.messages
for insert to anon, authenticated
with check (true);

drop policy if exists "anyone creates special orders" on public.special_order_requests;
create policy "anyone creates special orders" on public.special_order_requests
for insert to anon, authenticated
with check (true);

drop policy if exists "anyone creates stock alerts" on public.stock_alert_requests;
create policy "anyone creates stock alerts" on public.stock_alert_requests
for insert to anon, authenticated
with check (true);

grant insert on public.messages to anon, authenticated;
grant insert on public.special_order_requests to anon, authenticated;
grant insert on public.stock_alert_requests to anon, authenticated;
grant usage, select on sequence public.messages_id_seq to anon, authenticated;
grant usage, select on sequence public.special_order_requests_id_seq to anon, authenticated;
grant usage, select on sequence public.stock_alert_requests_id_seq to anon, authenticated;

notify pgrst, 'reload schema';
