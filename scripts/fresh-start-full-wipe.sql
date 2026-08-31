-- Full clean system: clear every operational record from the old system,
-- keeping only what the shop needs in order to trade on day one.
--
-- KEPT, deliberately:
--   * public.users    — the three staff logins. Wiping these locks everyone
--                       out of their own console.
--   * public.settings — VAT number, bank details, store address, currency,
--                       delivery fees. Invoices and the storefront read these;
--                       clearing them un-configures the shop rather than
--                       cleaning it.
--   * public.hero_images — the storefront banners.
--
-- CLEARED: customers, suppliers, and every transaction, document and log
-- belonging to the previous system.
--
-- Two ordering rules this script depends on:
--
--   1. Children before parents. Most foreign keys are SET NULL rather than
--      CASCADE, so a parent could be deleted while orphaned children kept
--      pointing at nothing; deleting bottom-up avoids leaving those behind.
--   2. activity_log LAST. Ten tables carry `log_activity_trg`, which fires
--      AFTER DELETE — so clearing suppliers and coupons writes fresh rows into
--      activity_log. Truncating it first would leave the log repopulated with
--      a record of its own wipe.
--
-- How to run:
--   Supabase Studio → SQL editor → paste and run, or:
--   psql "$SUPABASE_DB_URL" -f scripts/fresh-start-full-wipe.sql

begin;

-- 1. Documents and lines that hang off orders, customers or till shifts.
delete from public.coupon_usage;
delete from public.refunds;
delete from public.invoices;
delete from public.quotes;
delete from public.laybys;
delete from public.job_cards;
delete from public.special_order_requests;
delete from public.stock_alert_requests;
delete from public.messages;
delete from public.blocked_users;

-- 2. Stock records (already emptied by the earlier wipe; kept for replay).
delete from public.product_imeis;
delete from public.stock_movements;
delete from public.stock_takes;
delete from public.products;

-- 3. Purchasing, against suppliers.
delete from public.grvs;
delete from public.purchase_orders;

-- 4. The ledger — both debtors and creditors.
delete from public.account_transactions;

-- 5. Trading records.
delete from public.expenses;
delete from public.orders;
delete from public.till_shifts;
delete from public.accounting_periods;
delete from public.service_charges;

-- 6. The parties themselves, plus the old promo codes.
delete from public.coupons;
delete from public.customers;
delete from public.suppliers;

-- 7. Operational noise.
delete from public.alerts;
delete from public.client_errors;

-- 8. Last, once nothing further can write to it.
delete from public.activity_log;

-- 9. Restart identity counters on everything emptied, so the fresh import
--    numbers from 1. Driven off the catalogue rather than a hand-written list,
--    so a table added later is covered without editing this script.
do $do$
declare
  r record;
begin
  for r in
    select c.table_name, c.column_name
      from information_schema.columns c
     where c.table_schema = 'public'
       and c.is_identity = 'YES'
       and c.table_name not in ('users', 'settings', 'hero_images')
  loop
    execute format('alter table public.%I alter column %I restart with 1',
                   r.table_name, r.column_name);
  end loop;
end;
$do$;

commit;
