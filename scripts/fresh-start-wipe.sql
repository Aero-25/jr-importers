-- Fresh start: clear debtors, creditors and stock.
--
-- Run once, deliberately, before re-importing the stock master and then the
-- debtor and creditor opening balances (the order ImportIQ expects). It:
--
--   1. deletes the whole account ledger — both sides. `account_transactions`
--      is the single table behind Debtors (owed to us) and Creditors (we owe),
--      so emptying it zeroes every party balance and the ageing report;
--   2. deletes the stock movement history, including the adjustment rows left
--      by the earlier scripts/wipe-stock.sql run;
--   3. deletes every product, and with it every serialised unit —
--      product_imeis cascades from products.
--
-- Deliberately NOT touched: orders keep their JSONB line items, so sales
-- history stays readable. Customers, suppliers, invoices, quotes, laybys,
-- job cards, GRVs, till shifts and the activity log all survive; the ones
-- that point at a product or a ledger row simply go null.
--
-- Identity counters are reset so the re-import starts at 1.
--
-- How to run:
--   Supabase Studio → SQL editor → paste and run, or:
--   psql "$SUPABASE_DB_URL" -f scripts/fresh-start-wipe.sql

begin;

-- 1. Debtors and creditors (both live in this one table).
delete from public.account_transactions;

-- 2. Stock movement history.
delete from public.stock_movements;

-- 3. Stock: serialised units first, then the catalogue itself.
delete from public.product_imeis;
delete from public.products;

-- 4. Start the re-import from 1.
alter table public.account_transactions alter column id restart with 1;
alter table public.stock_movements      alter column id restart with 1;
alter table public.product_imeis        alter column id restart with 1;
alter table public.products             alter column id restart with 1;

commit;
