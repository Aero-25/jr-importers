-- Bulk pricing check: does the money come out right, and does the markup last?
--
-- Paste into the Supabase SQL editor. Every row must say PASS. It runs inside a
-- transaction that rolls back, so it writes nothing.
--
-- The cases are the ones that would cost real money if they were wrong: the
-- order the three rates are applied in, the rounding, whether a markup set by
-- hand survives next week's upload, and whether a tablet can reach a phone
-- price list.

begin;

create temp table t(n int, check_name text, result text);
grant all on t to authenticated;

-- Act as the administrator throughout; every function here checks is_admin().
select set_config('request.jwt.claims',
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}',
  true);

-- ---------------------------------------------------------------------------
-- The classifier and the parser
-- ---------------------------------------------------------------------------
insert into t
select 1, 'a Samsung phone is recognised',
  case when private.is_samsung_phone('SAMSUNG A07  4/128GIG DUAL (EXPORT)')
       then 'PASS' else 'FAIL' end;

insert into t
select 2, 'a Samsung tablet is not a phone',
  case when not private.is_samsung_phone('SAMSUNG X115 TAB-A9  8.7"  64GIG LTE (LOCAL)')
        and not private.is_samsung_phone('SAMSUNG X826 TAB-S10+  12.4"  256GIG  5G (EXPORT)')
       then 'PASS' else 'FAIL — a tablet would be priced as a phone' end;

insert into t
select 3, 'another brand is not a Samsung',
  case when not private.is_samsung_phone('I-PHONE 17 PRO MAX 256GIG (LOCAL)')
        and not private.is_samsung_phone('XIAOMI REDMI NOTE 17 8/256GB DUAL (EXPORT)')
        and not private.is_samsung_phone('HUAWEI MEDIAPAD M5 10.1" 32GIG (LOCAL)')
       then 'PASS' else 'FAIL' end;

-- Storage, not RAM, and never the 5 in "5G".
insert into t
select 4, 'storage is read from a RAM/storage pair',
  case when (select storage_gb from private.parse_handset('SAMSUNG A07 4/128GIG DUAL (EXPORT)')) = 128
       then 'PASS' else 'FAIL' end;

insert into t
select 5, '"5G" is not mistaken for a 5GB handset',
  case when (select storage_gb from private.parse_handset('Samsung Galaxy A26 5G 256GB')) = 256
       then 'PASS' else 'FAIL' end;

insert into t
select 6, 'a model with a trailing letter survives',
  case when (select model from private.parse_handset('SAMSUNG A04S 3/32GIG DUAL (EXPORT)')) = 'A04S'
       then 'PASS' else 'FAIL' end;

insert into t
select 7, 'S25FE and S25 FE are the same handset',
  case when (select model from private.parse_handset('SAMSUNG S25FE 8/256GIG DUAL (EXPORT)'))
          = (select model from private.parse_handset('SAMSUNG S25 FE 8/256GIG DUAL (EXPORT)'))
       then 'PASS' else 'FAIL' end;

-- The supplier's wording and the shop's own product name must land on one key.
insert into t
select 8, 'the supplier wording and the shop name agree on one key',
  case when private.variant_key(
              (select model from private.parse_handset('SAMSUNG A17 4/128GIG DUAL (EXPORT)')),
              (select storage_gb from private.parse_handset('SAMSUNG A17 4/128GIG DUAL (EXPORT)')))
          = private.variant_key(
              (select model from private.parse_handset('Samsung A17 128GB')),
              (select storage_gb from private.parse_handset('Samsung A17 128GB')))
       then 'PASS' else 'FAIL — stock would never match' end;

insert into t
select 9, 'the two RAM builds of one handset share a key',
  case when private.variant_key('A57', 128) = private.variant_key('A57', 128)
        and private.variant_key('A57', 128) <> private.variant_key('A57', 256)
       then 'PASS' else 'FAIL' end;

-- ---------------------------------------------------------------------------
-- The money
-- ---------------------------------------------------------------------------
-- The shop's worked example: N$1,000 at 22% markup must come to N$1,641.51.
-- Import VAT 170.00, landed 1,170.00, markup 257.40, excl 1,427.40, VAT 214.11.
create temp table up as
select public.bulk_save_upload(
  'check.xlsx',
  jsonb_build_array(
    jsonb_build_object('display_name','Check Handset 64GB','model','A99','storage_gb',64,
                       'five_g',false,'description','CHECK A99 64GIG','supplier_cost',1000),
    jsonb_build_object('display_name','Rounding Handset 128GB','model','A98','storage_gb',128,
                       'five_g',false,'description','CHECK A98 128GIG','supplier_cost',1625)
  )
) as id;
grant all on up to authenticated;

create temp table gen as select public.bulk_generate_list((select id from up)) as id;
grant all on gen to authenticated;

insert into t
select 10, 'the worked example comes to N$1,641.51',
  case when i.import_vat = 170.00 and i.landed_cost = 1170.00
        and i.price_excl_vat = 1427.40 and i.sales_vat = 214.11
        and i.final_price = 1641.51
       then 'PASS'
       else format('FAIL — got imp %s landed %s excl %s vat %s final %s',
                   i.import_vat, i.landed_cost, i.price_excl_vat, i.sales_vat, i.final_price) end
from public.bulk_price_list_items i
where i.list_id = (select id from gen) and i.model = 'A99';

insert into t
select 11, 'retail is exactly excl + VAT, to the cent',
  case when bool_and(i.final_price = i.price_excl_vat + i.sales_vat)
       then 'PASS' else 'FAIL — the rounding drifts' end
from public.bulk_price_list_items i
where i.list_id = (select id from gen);

insert into t
select 12, 'landed is exactly cost + import VAT',
  case when bool_and(i.landed_cost = i.supplier_cost + i.import_vat)
       then 'PASS' else 'FAIL' end
from public.bulk_price_list_items i
where i.list_id = (select id from gen);

insert into t
select 13, 'a tablet in the upload never reaches the list',
  case when count(*) = 2 then 'PASS (only the two phones)'
       else 'FAIL (' || count(*) || ' items)' end
from public.bulk_price_list_items where list_id = (select id from gen);

-- ---------------------------------------------------------------------------
-- The markup, which must outlive the upload
-- ---------------------------------------------------------------------------
select public.bulk_set_markup(private.variant_key('A99', 64), 18, 'Check Handset');

create temp table gen2 as select public.bulk_generate_list((select id from up)) as id;
grant all on gen2 to authenticated;

insert into t
select 14, 'a markup set by hand is used instead of the default',
  case when i.markup_pct = 18 then 'PASS'
       else 'FAIL — got ' || i.markup_pct end
from public.bulk_price_list_items i
where i.list_id = (select id from gen2) and i.model = 'A99';

insert into t
select 15, 'and the retail price follows it',
  -- 1000 -> 1170 landed -> x1.18 = 1380.60 -> +15% = 1587.69
  case when i.price_excl_vat = 1380.60 and i.final_price = 1587.69 then 'PASS'
       else format('FAIL — excl %s final %s', i.price_excl_vat, i.final_price) end
from public.bulk_price_list_items i
where i.list_id = (select id from gen2) and i.model = 'A99';

insert into t
select 16, 'a handset with no markup of its own keeps the default',
  case when i.markup_pct = public.bulk_setting('bulk_default_markup','22')::numeric
       then 'PASS' else 'FAIL — got ' || i.markup_pct end
from public.bulk_price_list_items i
where i.list_id = (select id from gen2) and i.model = 'A98';

-- Next Monday: a new upload, new costs, same markup.
create temp table up2 as
select public.bulk_save_upload(
  'next-monday.xlsx',
  jsonb_build_array(
    jsonb_build_object('display_name','Check Handset 64GB','model','A99','storage_gb',64,
                       'five_g',false,'description','CHECK A99 64GIG','supplier_cost',1100)
  )
) as id;
grant all on up2 to authenticated;

create temp table gen3 as select public.bulk_generate_list((select id from up2)) as id;
grant all on gen3 to authenticated;

insert into t
select 17, 'next week''s upload remembers the markup',
  case when i.markup_pct = 18 and i.supplier_cost = 1100 then 'PASS'
       else format('FAIL — markup %s cost %s', i.markup_pct, i.supplier_cost) end
from public.bulk_price_list_items i
where i.list_id = (select id from gen3) and i.model = 'A99';

select public.bulk_clear_markup(private.variant_key('A99', 64));
create temp table gen4 as select public.bulk_generate_list((select id from up2)) as id;
grant all on gen4 to authenticated;

insert into t
select 18, 'resetting a markup returns the handset to the default',
  case when i.markup_pct = public.bulk_setting('bulk_default_markup','22')::numeric
       then 'PASS' else 'FAIL — got ' || i.markup_pct end
from public.bulk_price_list_items i
where i.list_id = (select id from gen4) and i.model = 'A99';

-- ---------------------------------------------------------------------------
-- Stock
-- ---------------------------------------------------------------------------
-- A handset the supplier lists but the shop does not stock must never be shown
-- as available: the supplier having one is not the shop having one.
insert into t
select 19, 'an unmatched handset is not shown as in stock',
  case when bool_and(i.stock_status <> 'in_stock')
       then 'PASS' else 'FAIL' end
from public.bulk_price_list_items i
where i.list_id = (select id from gen4) and i.product_id is null;

-- And a real one that the shop does stock is picked up through the same key.
create temp table up3 as
select public.bulk_save_upload(
  'stock-check.xlsx',
  (select jsonb_agg(jsonb_build_object(
     'display_name', p.name, 'model', ph.model, 'storage_gb', ph.storage_gb,
     'five_g', false, 'description', p.name, 'supplier_cost', 2000))
   from public.products p
   cross join lateral private.parse_handset(p.name) ph
   where p.active and private.is_samsung_phone(p.name)
     and ph.model is not null and ph.storage_gb is not null
     and (select count(*) from public.product_imeis i
           where i.product_id = p.id and i.status = 'available') > 0
   limit 3)
) as id;
grant all on up3 to authenticated;

create temp table gen5 as select public.bulk_generate_list((select id from up3)) as id;
grant all on gen5 to authenticated;

insert into t
select 20, 'handsets the shop holds are matched and shaded green',
  case when count(*) > 0 and bool_and(i.stock_status = 'in_stock' and i.stock_qty > 0)
       then 'PASS (' || count(*) || ' matched)'
       else 'FAIL — stock did not match through the variant key' end
from public.bulk_price_list_items i
where i.list_id = (select id from gen5);

-- ---------------------------------------------------------------------------
-- Distribution: one row per recipient, and no second copy on a retry
-- ---------------------------------------------------------------------------
insert into public.bulk_recipients (name, email) values
  ('Check One', 'check-one@example.com'),
  ('Check Two', 'check-two@example.com');

select public.bulk_approve_list((select id from gen5));

create temp table dist as
select public.bulk_start_distribution((select id from gen5), null, 'Subject', 'Body', 'x.pdf', 'manual') as reply;
grant all on dist to authenticated;

insert into t
select 21, 'every recipient gets their own delivery row',
  case when (select count(*) from public.bulk_deliveries
              where distribution_id = ((select reply from dist)->>'distribution_id')::bigint) = 2
       then 'PASS (2 rows for 2 people)' else 'FAIL' end;

-- A data-modifying CTE has to be top level, so the duplicate attempt runs as
-- its own statement and the outcome is counted afterwards.
create temp table dup(inserted int);
grant all on dup to authenticated;

with again as (
  insert into public.bulk_deliveries (distribution_id, email)
  values (((select reply from dist)->>'distribution_id')::bigint, 'check-one@example.com')
  on conflict (distribution_id, email) do nothing
  returning 1
)
insert into dup select 1 from again;

insert into t
select 22, 'a second queue attempt cannot double-send',
  case when (select count(*) from dup) = 0
       then 'PASS (refused)' else 'FAIL (a duplicate was created)' end;

-- A scheduled run must refuse a list from a week gone by.
update public.bulk_price_lists
   set week_start = private.windhoek_week_start() - interval '7 days'
 where id = (select id from gen5);

insert into t
select 23, 'a scheduled send refuses last week''s prices',
  case when (public.bulk_start_distribution(
               (select id from gen5), null, 'S', 'B', 'x.pdf', 'scheduled') ->> 'ok') = 'false'
       then 'PASS (skipped)' else 'FAIL — stale prices would go out' end;

select n, check_name, result from t order by n;

rollback;
