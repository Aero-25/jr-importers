-- Keys the IQ import needs to update rather than duplicate.
--
-- An upsert has to name a unique constraint. products.sku and suppliers.name
-- had none, so re-importing a corrected export would have appended a second
-- copy of every row instead of correcting the first — the exact failure a
-- migration cannot survive, because it is invisible until a stock take.
--
-- Partial, so the rows that legitimately have no code are unaffected: a
-- plain unique index treats every empty string as equal and would refuse them
-- all after the first.
create unique index if not exists products_sku_key
  on public.products (lower(sku))
  where sku is not null and sku <> '';

create unique index if not exists suppliers_name_key
  on public.suppliers (lower(name))
  where name is not null and name <> '';
