/*
  Stop publishing the shop's IMEIs.

  The storefront shows which colours are physically on the shelf by reading
  `product_imeis`, and the RLS policy opens `status = 'available'` rows to do
  it. RLS is row-level, though: granting the row grants every column with it,
  so `select=*` against the public REST endpoint returned all 65 unsold IMEIs,
  with SKU and colour, to anyone holding the anon key — which ships in the
  site's own config.js.

  The policy is even named "authenticated reads available imeis", but a policy
  with no role restriction applies to anon as well, so the intent was never
  what was enforced.

  Column grants close it without touching the feature: `useVariants` selects
  `color` and filters on `product_id` and `status`, and filtering needs the
  same privilege as selecting, so those three columns are exactly the grant.
  `imei` and `serial_number` are no longer readable by the public at all.

  Sold units were already withheld by the policy and stay that way.
*/

revoke select on public.product_imeis from anon;
grant select (product_id, color, status) on public.product_imeis to anon;
