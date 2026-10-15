/*
  Stop publishing what the shop pays for its stock.

  The storefront reads `products` through the public REST endpoint, and the
  table-wide `grant select ... to anon, authenticated` from the initial schema
  handed over every column with each row — `cost_price` included. Anyone with
  the anon key (it ships in config.js) could ask for
  `/rest/v1/products?select=name,price,cost_price` and read the margin on every
  product. Signing up for a customer account gave the same, because shoppers
  and staff share the `authenticated` role.

  RLS cannot hide a column, so this uses column grants, the same way
  20260903030000 closed the IMEI leak:

    * `anon` and `authenticated` may select every products column except
      `cost_price`. A request naming it, or `select=*`, is refused outright.
    * Staff read the full row through `products_staff`, a view that returns
      nothing unless `is_staff()`. The view runs as its owner, which is what
      lets it read `cost_price` while the callers cannot.

  Writes are untouched: INSERT/UPDATE privileges are separate from SELECT, and
  RLS still limits them to admins. The reporting functions that use cost
  (sales_profit, stock_valuation, sales_analysis, receive_grv) are all
  SECURITY DEFINER, so they keep working.

  A column added to products later is NOT readable by the public until it is
  added to the grant below — which is the safe way round.

  Suppliers, purchase orders and GRVs were already admin-only by RLS.
*/

revoke select on public.products from anon, authenticated;

grant select (
  id, name, brand, category, description, price, stock, reorder_level,
  sku, barcode, color,
  image, image1, image2, image3, image4, image5,
  spec_display, spec_processor, spec_ram, spec_storage, spec_battery,
  spec_back_camera, spec_front_camera, spec_os, spec_weight, spec_extras,
  active, show_online, featured, created_at, updated_at
) on public.products to anon, authenticated;

create or replace view public.products_staff as
  select p.*
  from public.products p
  where public.is_staff();

comment on view public.products_staff is
  'Full product rows, cost_price included, for staff only. The public reads products without cost_price.';

revoke all on public.products_staff from public, anon, authenticated;
grant select on public.products_staff to authenticated;

notify pgrst, 'reload schema';
