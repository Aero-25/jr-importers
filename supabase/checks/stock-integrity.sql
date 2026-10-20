-- Stock check: can a handset leave the shop without leaving the books?
--
-- Paste into the Supabase SQL editor. Every row must say PASS. The first three
-- cases run inside a transaction that rolls back, so they write nothing; the
-- audits at the end read the live data and are worth running after a stocktake.
--
-- Written after a count on 20 October 2026 found the system holding five
-- Samsung handsets the shelf did not have. Two were explained by the records:
-- INV12192 billed a Samsung A26 256GB and named no IMEI, and CRN408 credited an
-- A16 whose replacement was never taken off. The other three had left with no
-- document at all.

begin;

create temp table t(n int, check_name text, result text);
grant all on t to authenticated;

select set_config('request.jwt.claims',
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}',
  true);

-- The INV12192 case: a handset tracked by IMEI, billed without naming one.
do $$
declare v_pid bigint;
begin
  select p.id into v_pid from public.products p
  where p.active and exists (select 1 from public.product_imeis i where i.product_id = p.id)
  limit 1;

  insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                               subtotal_amount, vat_amount, total_amount, items)
  values ('CHECK-NO-IMEI', 'Check', 'invoice', 'paid', true, 100, 15, 115,
          jsonb_build_array(jsonb_build_object('product_id', v_pid, 'name', 'Check handset',
                                               'quantity', 1, 'price', 115)));
  insert into t select 1, 'a handset tracked by IMEI can be billed without naming one',
    'FAIL — it would take nothing off the shelf';
exception when others then
  insert into t select 1, 'a handset tracked by IMEI can be billed without naming one',
    'PASS (refused)';
end $$;

-- The partial case: two billed, one named.
do $$
declare v_pid bigint; v_imei text;
begin
  select i.product_id, i.imei into v_pid, v_imei
  from public.product_imeis i
  join public.products p on p.id = i.product_id
  where i.status = 'available' and p.active
  limit 1;

  insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                               subtotal_amount, vat_amount, total_amount, items)
  values ('CHECK-PARTIAL', 'Check', 'invoice', 'paid', true, 100, 15, 115,
          jsonb_build_array(jsonb_build_object('product_id', v_pid, 'name', 'Check handset',
                                               'quantity', 2, 'price', 115, 'imei', v_imei)));
  insert into t select 2, 'two handsets billed with only one named',
    'FAIL — the second would stay on the books';
exception when others then
  insert into t select 2, 'two handsets billed with only one named', 'PASS (refused)';
end $$;

-- And an ordinary sale must still go through.
do $$
declare v_pid bigint; v_imei text;
begin
  select i.product_id, i.imei into v_pid, v_imei
  from public.product_imeis i
  join public.products p on p.id = i.product_id
  where i.status = 'available' and p.active
  limit 1;

  insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                               subtotal_amount, vat_amount, total_amount, items)
  values ('CHECK-OK', 'Check', 'invoice', 'paid', true, 100, 15, 115,
          jsonb_build_array(jsonb_build_object('product_id', v_pid, 'name', 'Check handset',
                                               'quantity', 1, 'price', 115, 'imei', v_imei)));
  insert into t select 3, 'a properly named handset still invoices (must still work)', 'PASS';
exception when others then
  insert into t select 3, 'a properly named handset still invoices (must still work)',
    'FAIL (' || sqlerrm || ')';
end $$;

select n, check_name, result from t order by n;

rollback;

-- ---------------------------------------------------------------------------
-- Live audits. These read the real data; run them after a stocktake.
-- ---------------------------------------------------------------------------

-- Any invoice still billing a tracked handset without naming one. These are the
-- sales that took nothing off the shelf.
select 'invoices billing a tracked handset with no IMEI' as audit,
       coalesce(string_agg(d, E'\n  ' order by d), 'none — PASS') as detail
from (
  select distinct i.invoice_number || ' · ' || i.created_at::date
         || ' · ' || coalesce(i.customer_name, '-')
         || ' · ' || coalesce(t.value->>'name', '?') as d
  from public.invoices i
  cross join lateral jsonb_array_elements(coalesce(i.items, '[]'::jsonb)) as t(value)
  join public.products p on p.id = (t.value->>'product_id')::bigint
  where coalesce(i.doc_type, 'invoice') = 'invoice'
    and coalesce(i.status, '') <> 'credited'
    and nullif(t.value->>'imei', '') is null
    and coalesce(t.value->>'imeis', '[]') in ('[]', '', 'null')
    and not public.is_service_category(p.category)
    and exists (select 1 from public.product_imeis x where x.product_id = p.id)
) z

union all

-- A credit note does not move stock, which is right: the shop replaces rather
-- than refunds, and the money must not move twice. But the replacement handset
-- still leaves the shelf, and nothing records which one — so every credit note
-- on a tracked handset is a place a unit can go missing.
select 'credit notes on tracked handsets (each needs a replacement recorded)',
       coalesce(string_agg(d, E'\n  ' order by d), 'none')
from (
  select distinct i.invoice_number || ' · ' || i.created_at::date
         || ' · ' || coalesce(i.customer_name, '-')
         || ' · ' || coalesce(t.value->>'name', '?')
         || ' · credited ' || coalesce(nullif(t.value->>'imei', ''), 'no IMEI') as d
  from public.invoices i
  cross join lateral jsonb_array_elements(coalesce(i.items, '[]'::jsonb)) as t(value)
  join public.products p on p.id = (t.value->>'product_id')::bigint
  where coalesce(i.doc_type, '') = 'credit_note'
    and exists (select 1 from public.product_imeis x where x.product_id = p.id)
) z

union all

-- Units booked in must equal units sold plus units on the shelf. A gap here is
-- a unit whose status is neither, which nothing in the shop should produce.
select 'handsets whose units do not add up',
       coalesce(string_agg(
         p.name || ': booked in ' || r.booked || ', sold ' || r.sold
         || ', available ' || r.avail || ', other ' || r.other, E'\n  '), 'none — PASS')
from public.products p
cross join lateral (
  select count(*) as booked,
         count(*) filter (where status = 'sold') as sold,
         count(*) filter (where status = 'available') as avail,
         count(*) filter (where status not in ('sold', 'available')) as other
  from public.product_imeis i where i.product_id = p.id
) r
where r.booked > 0 and r.booked <> r.sold + r.avail + r.other;
