-- Company portal check: can a buyer see a cost, or price their own quote?
--
-- Paste into the Supabase SQL editor. Every row must say PASS. It runs inside a
-- transaction that rolls back, so it creates a portal login, uses it, and
-- throws it away.
--
-- The portal shows dealer prices, which live in the same rows as supplier
-- costs, landed costs and margins. Row security filters rows and not columns,
-- so everything here turns on the catalogue being a function that cannot
-- return a cost rather than a table that is trusted not to.

begin;

create temp table t(n int, check_name text, result text);
grant all on t to anon, authenticated;

-- A real company, and a login that is not staff.
create temp table scene as
select c.id as customer_id, c.name,
       '00000000-0000-0000-0000-00000000c0de'::uuid as buyer,
       'buyer@check.example' as buyer_email
from public.customers c
where c.name ilike '%namib mills%'
limit 1;
grant all on scene to anon, authenticated;

insert into public.company_portal_users (auth_user_id, customer_id, email, invited_by)
select buyer, customer_id, buyer_email, 'check' from scene;

-- ---------------------------------------------------------------------------
-- As the company
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-00000000c0de","email":"buyer@check.example","role":"authenticated"}',
  true);

insert into t select 1, 'the company sees this week''s list',
  case when count(*) > 0 then 'PASS (' || count(*) || ' lines)' else 'FAIL (nothing to buy)' end
from public.portal_catalogue();

-- Captured as the buyer, compared as the owner. The buyer cannot read the
-- priced list at all — case 3 is the proof of that — so comparing in one
-- statement would be testing the wrong thing and passing for the wrong reason.
create temp table seen as select * from public.portal_catalogue();
grant all on seen to anon, authenticated;

-- The whole point. A buyer must not reach a cost by any route.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.bulk_price_list_items;
  insert into t select 3, 'the company reads the priced list directly',
    case when v_n = 0 then 'PASS (none visible)' else 'FAIL (' || v_n || ' rows of costs)' end;
exception when others then
  insert into t select 3, 'the company reads the priced list directly', 'PASS (' || sqlerrm || ')';
end $$;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.products_staff;
  insert into t select 4, 'the company reads cost prices',
    case when v_n = 0 then 'PASS (none visible)' else 'FAIL (' || v_n || ' rows)' end;
exception when others then
  insert into t select 4, 'the company reads cost prices', 'PASS (' || sqlerrm || ')';
end $$;

insert into t select 5, 'the catalogue has no column that could carry a cost',
  case when count(*) = 0 then 'PASS'
       else 'FAIL: ' || string_agg(a.attname, ', ') end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join unnest(p.proargnames) with ordinality as a(attname, ord) on true
where n.nspname = 'public' and p.proname = 'portal_catalogue'
  and a.attname ~* 'cost|markup|landed|margin|supplier';

-- Pricing is the shop's, not the buyer's.
do $$
declare v jsonb; v_first bigint; v_price numeric;
begin
  select item_id, price into v_first, v_price from public.portal_catalogue() limit 1;

  v := public.portal_request_quote(
         jsonb_build_array(jsonb_build_object('item_id', v_first, 'quantity', 2, 'price', 1)),
         'Check');

  insert into t select 6, 'a quote is priced by the shop, not by what was posted',
    case when (v->>'ok') = 'true' and (v->>'total')::numeric = round(v_price * 2, 2)
         then 'PASS (' || (v->>'total') || ', not 2)'
         else 'FAIL — ' || coalesce(v->>'message', v->>'total') end;
exception when others then
  insert into t select 6, 'a quote is priced by the shop, not by what was posted',
    'FAIL — ' || left(sqlerrm, 70);
end $$;

-- Something not on the list cannot be quoted.
do $$
declare v jsonb;
begin
  v := public.portal_request_quote(
         jsonb_build_array(jsonb_build_object('item_id', 999999, 'quantity', 1)), null);
  insert into t select 7, 'a product that is not on the list can be quoted',
    case when (v->>'ok') = 'false' then 'PASS (refused)' else 'FAIL (allowed)' end;
exception when others then
  insert into t select 7, 'a product that is not on the list can be quoted', 'PASS (' || left(sqlerrm, 40) || ')';
end $$;

insert into t select 8, 'the company sees its own quote',
  case when count(*) > 0 then 'PASS' else 'FAIL' end
from public.portal_my_quotes();

insert into t select 9, 'and only its own',
  case when bool_and(q.customer_id = (select customer_id from scene))
       then 'PASS' else 'FAIL — somebody else''s quote is visible' end
from public.quotes q;

-- ---------------------------------------------------------------------------
-- As somebody who is not a portal user at all
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"dd7907f6-e057-46d8-b17c-b591e4bc401b","email":"ksauerwein12@gmail.com","role":"authenticated"}',
  true);

insert into t select 10, 'an ordinary customer sees the dealer catalogue',
  case when count(*) = 0 then 'PASS (empty)' else 'FAIL (' || count(*) || ' lines)' end
from public.portal_catalogue();

do $$
declare v jsonb;
begin
  v := public.portal_request_quote(
         jsonb_build_array(jsonb_build_object('item_id', 1, 'quantity', 1)), null);
  insert into t select 11, 'an ordinary customer can request a dealer quote',
    case when (v->>'ok') = 'false' then 'PASS (refused)' else 'FAIL (allowed)' end;
exception when others then
  insert into t select 11, 'an ordinary customer can request a dealer quote', 'PASS (' || left(sqlerrm, 40) || ')';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);

-- anon is not granted the function at all, so the refusal arrives as a
-- permission error rather than an empty result. Both are the right answer.
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.portal_catalogue();
  insert into t select 12, 'an anonymous visitor sees the dealer catalogue',
    case when v_n = 0 then 'PASS (empty)' else 'FAIL (' || v_n || ' lines)' end;
exception when others then
  insert into t select 12, 'an anonymous visitor sees the dealer catalogue',
    'PASS (' || left(sqlerrm, 40) || ')';
end $$;

reset role;

insert into t select 2, 'and the prices are the dealer prices, not shop prices',
  case when count(*) = 0 then 'FAIL (nothing to compare)'
       when bool_and(s.price = i.final_price) then 'PASS (' || count(*) || ' lines)'
       else 'FAIL' end
from seen s
join public.bulk_price_list_items i on i.id = s.item_id;

insert into t select 13, 'and they are not the shop''s own prices',
  case when count(*) = 0 then 'PASS (no line matches a shop price)'
       else 'CHECK: ' || count(*) || ' happen to equal the shop price' end
from seen s
join public.products p on p.id = s.product_id
where s.price = p.price;

select n, check_name, result from t order by n;

rollback;
