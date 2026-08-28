-- Remove ALL stock from the system, leaving the catalogue intact.
--
-- Run once, deliberately, before re-importing stock under the per-unit
-- IMEI + colour regime (one product_imeis row per phone). It:
--
--   1. writes one 'adjustment' stock movement per product that currently
--      carries stock, so the wipe is visible in the movement history;
--   2. deletes every serialised unit (product_imeis) — available, reserved
--      and sold alike;
--   3. zeroes the stock column on every product.
--
-- Products, prices, images, orders, customers and documents are untouched.
--
-- How to run:
--   Supabase Studio → SQL editor → paste and run, or:
--   psql "$SUPABASE_DB_URL" -f scripts/wipe-stock.sql

begin;

insert into public.stock_movements
  (product_id, product_name, movement_type, quantity, reference_type, notes, user_name)
select p.id, p.name, 'adjustment', -greatest(p.stock, 0), 'stock_wipe',
       'Stock cleared for per-unit IMEI/colour re-import', 'admin'
from public.products p
where p.stock <> 0
   or exists (select 1 from public.product_imeis i where i.product_id = p.id);

delete from public.product_imeis;

update public.products
   set stock = 0, updated_at = now()
 where stock <> 0;

commit;
