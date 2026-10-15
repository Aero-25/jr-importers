-- Security check: is a signed-in customer still just a customer?
--
-- Paste this whole file into the Supabase SQL editor and read the result. It is
-- three independent blocks, each rolled back, so the editor shows three result
-- grids. Every row of every grid must say PASS. It runs inside a transaction that rolls back, so it writes
-- nothing: it creates one order, attacks it, and throws the order away.
--
-- Each case is something that was actually possible against the live database
-- in October 2026, found during the audit behind migrations 20261015000100 and
-- 20261015010000. Cases 18, 19 and 27 to 30 are the other half of the job —
-- they fail if a fix has gone too far and broken the shop.
--
-- The `must still work` cases name the live administrator and customer rows by
-- id, so if those accounts change this file needs the new ids.

-- Adversarial check. Everything runs as a real signed-in customer, or as an
-- anonymous visitor, and every case is something the audit said was possible.
begin;

create temp table t(n int, attack text, result text);
grant all on t to anon, authenticated;

-- A real customer account: Kurt, role 'customer'.
create temp view me as select 'dd7907f6-e057-46d8-b17c-b591e4bc401b'::text as uid;

-- An order that genuinely belongs to that customer, to attack.
insert into public.orders (id, user_id, customer_name, customer_email, customer_phone,
                           items, subtotal, subtotal_amount, vat_amount, total_amount,
                           payment_method, status, delivery_method, stock_reserved, stock_returned)
values ('11111111-1111-1111-1111-111111111111',
        'dd7907f6-e057-46d8-b17c-b591e4bc401b',
        'Kurt Sauerwein', 'ksauerwein12@gmail.com', '0810000000',
        '[]'::jsonb, 100, 86.96, 13.04, 100, 'Card', 'Pending', 'Collect', false, false);

----------------------------------------------------------------- anonymous
set local role anon;
set local request.jwt.claims = '{}';

insert into t select 1, 'anon lists customer documents in storage',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from storage.objects
where bucket_id = 'Images'
  and (storage.foldername(name))[1] = any (array['invoices','jobcards','damage','cashups']);

insert into t select 2, 'anon still sees product photographs',
  case when count(*) > 0 then 'PASS (' || count(*) || ' visible)' else 'FAIL (storefront images broken)' end
from storage.objects
where bucket_id = 'Images' and (storage.foldername(name))[1] = 'products';

insert into t select 3, 'anon reads IMEIs of stock on the shelf',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.product_imeis;

insert into t select 4, 'anon reads live coupon codes',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.coupons;

insert into t select 5, 'anon can still ask which colours are in stock',
  case when count(*) >= 0 then 'PASS (rpc answers, ' || count(*) || ' colours)' else 'FAIL' end
from public.product_variant_colours((select min(product_id) from public.product_imeis));

----------------------------------------------------------- signed-in customer
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"dd7907f6-e057-46d8-b17c-b591e4bc401b","email":"ksauerwein12@gmail.com","role":"authenticated"}';

insert into t select 6, 'customer is treated as staff',
  case when public.is_staff() or public.is_admin() then 'FAIL' else 'PASS (neither)' end;

insert into t select 7, 'customer reads every refund',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.refunds;

insert into t select 8, 'customer reads the shop alerts',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.alerts;

insert into t select 9, 'customer reads accounting periods',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.accounting_periods;

insert into t select 10, 'customer reads the blocked-user list',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.blocked_users;

insert into t select 11, 'customer reads invoices',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.invoices;

insert into t select 12, 'customer reads job cards (handset PINs)',
  case when count(*) = 0 then 'PASS (none visible)' else 'FAIL (' || count(*) || ' visible)' end
from public.job_cards;

do $$
declare v_n integer;
begin
  select count(*) into v_n from public.products_staff where cost_price is not null;
  insert into t select 13, 'customer reads cost prices',
    case when v_n = 0 then 'PASS (none visible)' else 'FAIL (' || v_n || ' visible)' end;
exception when others then
  insert into t select 13, 'customer reads cost prices', 'PASS (' || sqlerrm || ')';
end $$;

-- The order is theirs, so the row is writable; the question is which columns.
update public.orders
   set status = 'Paid', total_amount = 1, payments = '[{"method":"Cash","amount":1}]'::jsonb,
       stock_returned = true, invoice_number = 'INV00001',
       customer_phone = '0819999999'
 where id = '11111111-1111-1111-1111-111111111111';

insert into t select 14, 'customer marks own order Paid',
  case when status = 'Pending' then 'PASS (reverted)' else 'FAIL (now ' || status || ')' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

insert into t select 15, 'customer rewrites own order total',
  case when total_amount = 100 then 'PASS (reverted)' else 'FAIL (now ' || total_amount || ')' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

insert into t select 16, 'customer claims a payment on own order',
  case when payments is null or payments = '[]'::jsonb then 'PASS (reverted)'
       else 'FAIL (' || payments::text || ')' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

insert into t select 17, 'customer lifts own stock hold',
  case when stock_returned = false then 'PASS (reverted)' else 'FAIL' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

insert into t select 18, 'customer edits own phone number (must still work)',
  case when customer_phone = '0819999999' then 'PASS (allowed)' else 'FAIL (blocked)' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

-- Cancelling your own pending order must still work: checkout relies on it.
update public.orders set status = 'Cancelled'
 where id = '11111111-1111-1111-1111-111111111111';
insert into t select 19, 'customer cancels own pending order (must still work)',
  case when status = 'Cancelled' then 'PASS (allowed)' else 'FAIL (blocked)' end
from public.orders where id = '11111111-1111-1111-1111-111111111111';

-- Returning stock to the shelf.
do $$ begin
  perform public.release_order_stock('11111111-1111-1111-1111-111111111111');
  insert into t select 20, 'customer returns stock to the shelf', 'FAIL (allowed)';
exception when others then
  insert into t select 20, 'customer returns stock to the shelf', 'PASS (' || sqlerrm || ')';
end $$;

do $$ begin
  perform public.expire_stale_reservations();
  insert into t select 21, 'customer expires reservations', 'FAIL (allowed)';
exception when others then
  insert into t select 21, 'customer expires reservations', 'PASS (' || sqlerrm || ')';
end $$;

do $$ begin
  perform public.pay_online_layby(1, 99999, 'made-up-reference');
  insert into t select 22, 'customer settles a layby with a made-up reference', 'FAIL (allowed)';
exception when others then
  insert into t select 22, 'customer settles a layby with a made-up reference',
    'PASS (' || sqlerrm || ')';
end $$;

do $$ begin
  perform public.next_document_number('invoice');
  insert into t select 23, 'customer burns an invoice number', 'FAIL (allowed)';
exception when others then
  insert into t select 23, 'customer burns an invoice number', 'PASS (' || sqlerrm || ')';
end $$;

do $$ begin
  perform public.generate_alerts();
  insert into t select 24, 'customer writes shop alerts', 'FAIL (allowed)';
exception when others then
  insert into t select 24, 'customer writes shop alerts', 'PASS (' || sqlerrm || ')';
end $$;

-- Role escalation on their own user row.
update public.users set role = 'admin' where id = 'dd7907f6-e057-46d8-b17c-b591e4bc401b';
insert into t select 25, 'customer promotes self to admin',
  case when lower(role) = 'customer' then 'PASS (reverted)' else 'FAIL (now ' || role || ')' end
from public.users where id = 'dd7907f6-e057-46d8-b17c-b591e4bc401b';

------------------------------------------- stranger who signed up as sales@
set local request.jwt.claims =
  '{"sub":"99999999-9999-9999-9999-999999999999","email":"sales@jrimporters.com","role":"authenticated"}';
insert into t select 26, 'stranger signs up as sales@jrimporters.com and is staff',
  case when public.is_staff() then 'FAIL (is staff)' else 'PASS (not staff)' end;

------------------------------------------------------------------ the admin
set local request.jwt.claims =
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}';
insert into t select 27, 'the real admin still has admin (must still work)',
  case when public.is_admin() and public.is_staff() then 'PASS' else 'FAIL — LOCKED OUT' end;
insert into t select 28, 'the real admin still reads invoices (must still work)',
  case when count(*) > 0 then 'PASS (' || count(*) || ' visible)' else 'FAIL' end
from public.invoices;
insert into t select 29, 'the real admin still reads units (must still work)',
  case when count(*) > 0 then 'PASS (' || count(*) || ' visible)' else 'FAIL' end
from public.product_imeis;
insert into t select 30, 'the real admin still lists documents (must still work)',
  case when count(*) > 0 then 'PASS (' || count(*) || ' visible)' else 'FAIL' end
from storage.objects where bucket_id = 'Images'
  and (storage.foldername(name))[1] = 'invoices';

reset role;
select n, attack, result from t order by n;

rollback;

-- ===========================================================================
-- Part two: an email address is not a proof of identity.
--
-- Email confirmation is off on this project, so anybody may sign up with an
-- address they do not own. These two blocks check that the database does not
-- care — and that the controls added in 20261015020000 actually do something.
-- Every row must say PASS.
-- ===========================================================================

-- Email confirmation is OFF (mailer_autoconfirm = true), so anyone may sign up
-- with an address they do not own and be instantly confirmed. Several policies
-- still trust the email claim. What does that get a stranger?
begin;
create temp table t(n int, attack text, result text);
grant all on t to authenticated;

-- Pick a real customer who has orders, and a real invoiced account.
create temp table victim as
select lower(o.customer_email) as email, count(*) as orders
from public.orders o
where coalesce(o.customer_email,'') <> ''
group by 1 order by 2 desc limit 1;
grant all on victim to authenticated;

-- A brand-new account: a uid nobody has, claiming the victim's address.
select set_config('request.jwt.claims',
  (select json_build_object('sub','00000000-0000-0000-0000-0000000000ff',
                            'email', email, 'role','authenticated')::text
   from victim), true);
set local role authenticated;

insert into t select 1, 'stranger who signed up as ' || (select email from victim)
                        || ' reads their orders',
  case when count(*) = 0 then 'PASS (none visible)'
       else 'FAIL (' || count(*) || ' orders visible)' end
from public.orders;

insert into t select 2, 'and their customer record',
  case when count(*) = 0 then 'PASS (none visible)'
       else 'FAIL (' || count(*) || ' visible)' end
from public.customers;

do $$
declare v_ok boolean;
begin
  select bool_or(public.owns_order(o.id)) into v_ok from public.orders o;
  insert into t select 3, 'and owns_order() accepts them',
    case when v_ok is not true then 'PASS (refused)' else 'FAIL (accepted)' end;
exception when others then
  insert into t select 3, 'and owns_order() accepts them', 'PASS (' || sqlerrm || ')';
end $$;

reset role;
select n, attack, result from t order by n;
rollback;

-- Do the new controls actually do anything, and does the shop still work?
begin;
create temp table t(n int, check_name text, result text);
grant all on t to anon, authenticated;

-- Block somebody.
insert into public.blocked_users (email, reason, active)
values ('nuisance@example.com', 'test', true);

-- An order that belongs to a real customer, for the ownership checks.
insert into public.orders (id, user_id, customer_name, customer_email, customer_phone,
                           items, subtotal, subtotal_amount, vat_amount, total_amount,
                           payment_method, status, delivery_method, stock_reserved, stock_returned)
values ('22222222-2222-2222-2222-222222222222',
        'dd7907f6-e057-46d8-b17c-b591e4bc401b', 'Kurt Sauerwein',
        'ksauerwein12@gmail.com', '0810000000',
        '[]'::jsonb, 100, 86.96, 13.04, 100, 'Card', 'Pending', 'Collect', false, false);

set local role authenticated;

------------------------------------------------------------------ the blocklist
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-00000000beef","email":"nuisance@example.com","role":"authenticated"}';

do $$ begin
  insert into public.orders (user_id, customer_name, customer_email, customer_phone,
                             items, subtotal, subtotal_amount, vat_amount, total_amount,
                             payment_method, status, delivery_method)
  values ('00000000-0000-0000-0000-00000000beef', 'Nuisance', 'nuisance@example.com',
          '0810000001', '[]'::jsonb, 10, 8.7, 1.3, 10, 'Card', 'Pending', 'Collect');
  insert into t select 1, 'a blocked customer can still order', 'FAIL (allowed)';
exception when others then
  insert into t select 1, 'a blocked customer can still order', 'PASS (' || sqlerrm || ')';
end $$;

do $$ begin
  insert into public.messages (name, email, message)
  values ('Nuisance', 'nuisance@example.com', 'hello');
  insert into t select 2, 'a blocked customer can still use the contact form', 'FAIL (allowed)';
exception when others then
  insert into t select 2, 'a blocked customer can still use the contact form',
    'PASS (' || sqlerrm || ')';
end $$;

----------------------------------------------------------------- the throttle
set local role anon;
set local request.jwt.claims = '{}';

do $$
declare i integer; v_sent integer := 0;
begin
  for i in 1..9 loop
    begin
      insert into public.messages (name, email, message)
      values ('Flooder', 'flood@example.com', 'msg ' || i);
      v_sent := v_sent + 1;
    exception when others then
      exit;
    end;
  end loop;
  insert into t select 3, 'the contact form throttles a flood',
    case when v_sent between 1 and 5 then 'PASS (stopped after ' || v_sent || ')'
         else 'FAIL (' || v_sent || ' got through)' end;
end $$;

-- Read back as the owner: messages are admin-only to read, by design, so anon
-- cannot see what it just wrote.
reset role;
insert into t select 4, 'an ordinary enquiry still gets through (must still work)',
  case when count(*) between 1 and 5 then 'PASS (' || count(*) || ' stored)'
       else 'FAIL (' || count(*) || ')' end
from public.messages where email = 'flood@example.com';
set local role anon;

------------------------------------------------------- ownership and the till
set local role authenticated;

-- The customer whose order it is.
set local request.jwt.claims =
  '{"sub":"dd7907f6-e057-46d8-b17c-b591e4bc401b","email":"ksauerwein12@gmail.com","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.reserve_order_stock('22222222-2222-2222-2222-222222222222');
  insert into t select 5, 'a shopper can reserve their own order (must still work)',
    case when coalesce(v->>'ok','') = 'true' then 'PASS' else 'FAIL (' || coalesce(v->>'message','?') || ')' end;
exception when others then
  insert into t select 5, 'a shopper can reserve their own order (must still work)',
    'FAIL (' || sqlerrm || ')';
end $$;

-- A stranger must not be able to.
set local request.jwt.claims =
  '{"sub":"00000000-0000-0000-0000-0000000000aa","email":"stranger@example.com","role":"authenticated"}';
do $$
declare v jsonb;
begin
  v := public.reserve_order_stock('22222222-2222-2222-2222-222222222222');
  insert into t select 6, 'a stranger can reserve somebody else''s order',
    case when coalesce(v->>'ok','') = 'false' then 'PASS (refused)' else 'FAIL (allowed)' end;
exception when others then
  insert into t select 6, 'a stranger can reserve somebody else''s order', 'PASS (' || sqlerrm || ')';
end $$;

------------------------------------------------------------ the staff product view
set local request.jwt.claims =
  '{"sub":"d235f065-753e-4ad2-a677-2380752624a9","email":"info@jrimporters.com","role":"authenticated"}';
insert into t select 7, 'an admin still reads cost prices (must still work)',
  case when count(*) > 0 then 'PASS (' || count(*) || ' rows)' else 'FAIL' end
from public.products_staff where cost_price is not null;

set local request.jwt.claims =
  '{"sub":"dd7907f6-e057-46d8-b17c-b591e4bc401b","email":"ksauerwein12@gmail.com","role":"authenticated"}';
do $$
declare v_n integer;
begin
  select count(*) into v_n from public.products_staff;
  insert into t select 8, 'a customer reads the staff product view',
    case when v_n = 0 then 'PASS (empty)' else 'FAIL (' || v_n || ' rows)' end;
exception when others then
  insert into t select 8, 'a customer reads the staff product view', 'PASS (' || sqlerrm || ')';
end $$;

---------------------------------------------------------------- the audit trail
reset role;
update public.invoices set customer_name = customer_name || ' (audit probe)'
 where id = (select id from public.invoices order by id desc limit 1);

insert into t select 9, 'a change to an invoice is written to the audit log',
  case when count(*) > 0 then 'PASS' else 'FAIL (nothing logged)' end
from public.activity_log
where entity = 'invoices' and created_at > now() - interval '1 minute';

select n, check_name, result from t order by n;
rollback;
