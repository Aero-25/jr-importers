-- Take the repair-service catalogue entries off the shop entirely.
--
-- Phone Screen Replacement, Phone Battery Replacement, Computer / Laptop
-- Diagnostics, Data Recovery Service and anything else in the Repairs
-- category are deactivated rather than deleted: past orders, job cards and
-- documents may reference the rows, and `active = false` removes them from
-- every storefront query (the console can still see and reactivate them).
--
-- The storefront also stopped listing service categories in code, so this
-- is the data half of the same removal. The workshop itself is unaffected —
-- the repairs band and job-card booking do not read these rows.
--
-- How to run:
--   Supabase Studio → SQL editor → paste and run, or:
--   psql "$SUPABASE_DB_URL" -f scripts/remove-repair-services.sql

update public.products
   set active = false, updated_at = now()
 where category = 'Repairs'
   and active = true;
