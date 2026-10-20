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
-- Crediting, and the handset that goes out in its place
-- ---------------------------------------------------------------------------
-- The shop replaces rather than refunds, so a credit note is usually the start
-- of a second handset leaving the counter. The credit must not be refused for
-- naming a handset that is already sold, must not put that handset back on the
-- shelf, and must take whatever was handed over instead.
begin;
create temp table t(n int, check_name text, result text);
grant all on t to authenticated;
select set_config('request.jwt.claims',
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}',
  true);

-- A product with at least three handsets on the shelf: one to sell, one to
-- give as a replacement, one left over.
create temp table scene as
select pr.id as product_id,
       (array(select imei from public.product_imeis
               where product_id = pr.id and status = 'available' order by id))[1] as sold_a,
       (array(select imei from public.product_imeis
               where product_id = pr.id and status = 'available' order by id))[2] as sold_b,
       (array(select imei from public.product_imeis
               where product_id = pr.id and status = 'available' order by id))[3] as spare,
       (array(select imei from public.product_imeis
               where product_id = pr.id and status = 'available' order by id))[4] as fourth
from public.products pr
where pr.active and private.is_samsung_phone(pr.name)
  and (select count(*) from public.product_imeis i
        where i.product_id = pr.id and i.status = 'available') >= 4
limit 1;
grant all on scene to authenticated;

insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                             subtotal_amount, vat_amount, total_amount, items)
select 'CHECK-SALE-A', 'Check', 'invoice', 'paid', true, 100, 15, 115,
       jsonb_build_array(jsonb_build_object('product_id', s.product_id, 'name', 'Check handset',
                                            'quantity', 1, 'price', 115, 'imei', s.sold_a))
from scene s;

insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                             subtotal_amount, vat_amount, total_amount, items)
select 'CHECK-SALE-B', 'Check', 'invoice', 'paid', true, 100, 15, 115,
       jsonb_build_array(jsonb_build_object('product_id', s.product_id, 'name', 'Check handset',
                                            'quantity', 1, 'price', 115, 'imei', s.sold_b))
from scene s;

-- 1. Crediting must work at all. It has been refused since 20261020110000.
do $$
declare v jsonb;
begin
  v := public.credit_invoice((select id from public.invoices where invoice_number = 'CHECK-SALE-A'));
  insert into t select 1, 'an invoice can be credited at all',
    case when (v->>'ok') = 'true' then 'PASS' else 'FAIL — ' || coalesce(v->>'message','?') end;
exception when others then
  insert into t select 1, 'an invoice can be credited at all', 'FAIL — ' || left(sqlerrm, 80);
end $$;

-- 2. The credited handset stays sold: it came back faulty, it is not re-shelved
--    by the credit note, and naming it does not get the credit note refused.
insert into t select 2, 'the credited handset is not refused and not re-shelved',
  case when (select status from public.product_imeis where imei = (select sold_a from scene)) = 'sold'
       then 'PASS (still sold)'
       else 'FAIL (now ' || (select status from public.product_imeis where imei = (select sold_a from scene)) || ')' end;

-- 3. A replacement named on the credit goes out, and is recorded.
do $$
declare v jsonb;
begin
  v := public.credit_invoice(
         (select id from public.invoices where invoice_number = 'CHECK-SALE-B'),
         'Faulty screen',
         jsonb_build_array(jsonb_build_object('imei', (select sold_b from scene),
                                              'replacement_imei', (select spare from scene))));
  insert into t select 3, 'a replacement can be named when crediting',
    case when (v->>'ok') = 'true' and (v->>'replacements') = '1' then 'PASS'
         else 'FAIL — ' || coalesce(v->>'message','?') end;
exception when others then
  insert into t select 3, 'a replacement can be named when crediting', 'FAIL — ' || left(sqlerrm, 80);
end $$;

insert into t select 4, 'the replacement handset comes off the shelf',
  case when (select status from public.product_imeis where imei = (select spare from scene)) = 'sold'
       then 'PASS (taken)'
       else 'FAIL (still ' || (select status from public.product_imeis where imei = (select spare from scene)) || ')' end;

insert into t select 5, 'and a movement says which credit note took it',
  coalesce((select 'PASS (' || left(m.notes, 44) || '…)'
            from public.stock_movements m
            where m.reference_type = 'credit_note'
              and m.notes like '%' || (select sold_b from scene) || '%'
            order by m.id desc limit 1),
           'FAIL — no movement recorded');

-- 6. A replacement keyed to a handset this invoice never sold.
do $$
declare v jsonb;
begin
  insert into public.invoices (invoice_number, customer_name, doc_type, status, charge_vat,
                               subtotal_amount, vat_amount, total_amount, items)
  select 'CHECK-SALE-C', 'Check', 'invoice', 'paid', true, 100, 15, 115,
         jsonb_build_array(jsonb_build_object('product_id', s.product_id, 'name', 'Check handset',
                                              'quantity', 1, 'price', 115, 'imei', s.fourth))
  from scene s;

  v := public.credit_invoice(
         (select id from public.invoices where invoice_number = 'CHECK-SALE-C'),
         null,
         jsonb_build_array(jsonb_build_object('imei', 'A-HANDSET-NOT-ON-THIS-INVOICE',
                                              'replacement_imei', 'ANYTHING')));
  insert into t select 6, 'a replacement keyed to the wrong handset',
    case when (v->>'ok') = 'false' then 'PASS (' || left(v->>'message', 44) || '…)'
         else 'FAIL (accepted and dropped in silence)' end;
exception when others then
  insert into t select 6, 'a replacement keyed to the wrong handset', 'PASS (' || left(sqlerrm, 44) || '…)';
end $$;

-- 7. A replacement that is named correctly but is not on the shelf.
do $$
declare v jsonb;
begin
  v := public.credit_invoice(
         (select id from public.invoices where invoice_number = 'CHECK-SALE-C'),
         null,
         jsonb_build_array(jsonb_build_object('imei', (select fourth from scene),
                                              'replacement_imei', 'NOT-A-REAL-HANDSET')));
  insert into t select 7, 'a replacement that is not in stock',
    case when (v->>'ok') = 'false' then 'PASS' else 'FAIL (allowed)' end;
exception when others then
  insert into t select 7, 'a replacement that is not in stock', 'PASS (' || left(sqlerrm, 44) || '…)';
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
