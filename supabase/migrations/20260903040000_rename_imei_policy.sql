/*
  Name the IMEI policy after what it does.

  It was called "authenticated reads available imeis", but it carried no role
  restriction, so it applied to anon as well — and that gap is what published
  every unsold IMEI until the column grants closed it. Every other loose-looking
  policy in the schema (alerts, refunds, accounting_periods) is genuinely safe
  because it is declared TO authenticated; this one only looked like they did.

  The storefront reads unit colours with the anon key, so the policy must stay
  open to the public. What it must not do is claim otherwise to the next person
  reading the schema.
*/

alter policy "authenticated reads available imeis"
  on public.product_imeis
  rename to "public reads available unit colours";

comment on table public.product_imeis is
  'Serialised stock, one row per handset. The public may read only (product_id, color, status) for available units — enforced by column grants to anon, not by this table''s policies. Do not widen that grant: it would republish every IMEI.';
