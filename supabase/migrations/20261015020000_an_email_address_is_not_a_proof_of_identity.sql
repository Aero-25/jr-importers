-- An email address is not a proof of identity.
--
-- Email confirmation is switched off on this project (mailer_autoconfirm), so
-- anybody can sign up with an address they do not own and be confirmed on the
-- spot. Several policies still trusted the email claim in the token, and that
-- combination is a data breach: signing up as wwalters@namibmills.com.na with
-- a brand-new account returned all 20 of Namib Mills' orders and their
-- customer record.
--
-- Confirmation should also be turned on, but that needs an SMTP server first —
-- the built-in sender is capped at two mails an hour for the whole project and
-- switching confirmation on without it would stop customers signing up. This
-- file removes the database's dependence on the claim either way, which is the
-- right shape regardless of how mail is configured.
--
-- Also here: the gaps in two column guards, a blocklist that blocked nobody,
-- no throttle on the public forms, and the audit trail missing the documents
-- that matter most.

-- ---------------------------------------------------------------------------
-- 1. Identity comes from the login, not from the claim.
-- ---------------------------------------------------------------------------
--
-- Measured before changing: of 89 orders, 33 carry a login id and 28 carry an
-- email with no login id — and none of those 28 belong to anybody who has an
-- account, so nobody loses sight of their own order today. Checkout always
-- sets user_id for a signed-in shopper (Checkout.tsx passes `user?.id`) and the
-- INSERT policy requires a signed-in session, so every new order has one.
--
-- Staff reading is unaffected: "staff read orders" and "staff read customers"
-- are separate policies and already test is_staff().

drop policy if exists "authenticated reads own orders" on public.orders;
create policy "authenticated reads own orders" on public.orders
  for select to public
  using (public.is_admin() or user_id = auth.uid());

drop policy if exists "authenticated updates own orders" on public.orders;
create policy "authenticated updates own orders" on public.orders
  for update to public
  using (public.is_admin() or user_id = auth.uid())
  with check (public.is_admin() or user_id = auth.uid());

drop policy if exists "authenticated reads own customer" on public.customers;
create policy "authenticated reads own customer" on public.customers
  for select to public
  using (public.is_admin() or id = auth.uid());

-- owns_order() had the same email branch, and dropping it exposes a bug the
-- branch was hiding: a counter sale has no customer account, so its user_id is
-- null, and a cashier who is not an administrator could not reserve stock for
-- the sale they were ringing up. It only ever worked because both current
-- logins happen to be administrators. Staff operate the till; that is the
-- actual rule.
create or replace function public.owns_order(p_order_id uuid)
returns boolean
language sql
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.orders o
    where o.id = p_order_id
      and (public.is_staff() or o.user_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. The column guards had gaps.
-- ---------------------------------------------------------------------------
--
-- guard_customer_terms reverted credit_limit, customer_type, account_code and
-- active, but not account_terms — so a customer could put themselves on 90-day
-- terms. protect_user_admin_fields reverted role, active and password_hash,
-- but not email, so a customer could rewrite the address their own identity
-- row is keyed on.

create or replace function public.guard_customer_terms()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- A salesperson may fix a phone number; the credit terms are not theirs
  -- to change. Reverted silently rather than refused, so a contact edit that
  -- happens to resend the whole row does not fail on fields nobody touched.
  if not public.is_admin() then
    new.credit_limit   := old.credit_limit;
    new.customer_type  := old.customer_type;
    new.account_code   := old.account_code;
    new.account_terms  := old.account_terms;
    new.active         := old.active;
  end if;
  return new;
end;
$$;

create or replace function public.protect_user_admin_fields()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  new.role          := old.role;
  new.active        := old.active;
  new.password_hash := old.password_hash;
  -- The address is what every staff lookup and every audit entry is keyed on.
  -- Changing your own is an administrator's job, not self-service.
  new.email         := old.email;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The blocklist blocked nobody.
-- ---------------------------------------------------------------------------
--
-- public.blocked_users was read by nothing at all — not a policy, not a
-- trigger, not a line of the application. It was a screen in the console and
-- no more, which is worse than not having the feature: the shop believed it
-- had barred somebody who could still walk in and order.

create or replace function private.is_blocked(p_email text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.blocked_users b
    where b.active
      and lower(b.email) = lower(coalesce(p_email, ''))
  );
$$;

revoke all on function private.is_blocked(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The public forms had no brake.
-- ---------------------------------------------------------------------------
--
-- messages, special_order_requests and stock_alert_requests all accept inserts
-- from anybody with `with check (true)`, there is no captcha on the project,
-- and every row raises work for somebody. One loop fills the database and
-- buries the real enquiries.
--
-- A throttle in the database is not a substitute for a captcha, but it is the
-- half that cannot be skipped by posting straight at the API.

create or replace function private.guard_public_submission()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_row        jsonb := to_jsonb(new);
  v_email_col  text  := case when v_row ? 'email' then 'email' else 'customer_email' end;
  v_email      text  := lower(coalesce(v_row ->> 'email', v_row ->> 'customer_email', ''));
  v_recent     integer;
begin
  -- Staff entering something on a customer's behalf are not the problem.
  if public.is_staff() then
    return new;
  end if;

  if v_email <> '' and private.is_blocked(v_email) then
    raise exception 'We cannot accept this. Please contact the shop on 081 562 9203.';
  end if;

  -- Per address: enough for somebody with a genuine second thought, not
  -- enough to be worth automating.
  if v_email <> '' then
    execute format(
      'select count(*) from public.%I where created_at > now() - interval ''1 hour''
         and lower(coalesce(%I, '''')) = $1', tg_table_name, v_email_col)
      into v_recent using v_email;

    if v_recent >= 5 then
      raise exception 'That is several already in the last hour — please give us a moment to reply.';
    end if;
  end if;

  -- And a ceiling for the whole table, so rotating the address does not help.
  execute format(
    'select count(*) from public.%I where created_at > now() - interval ''1 hour''', tg_table_name)
    into v_recent;

  if v_recent >= 60 then
    raise exception 'We are receiving an unusual number of these. Please try again shortly.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_public_submission on public.messages;
create trigger guard_public_submission
  before insert on public.messages
  for each row execute function private.guard_public_submission();

drop trigger if exists guard_public_submission on public.special_order_requests;
create trigger guard_public_submission
  before insert on public.special_order_requests
  for each row execute function private.guard_public_submission();

drop trigger if exists guard_public_submission on public.stock_alert_requests;
create trigger guard_public_submission
  before insert on public.stock_alert_requests
  for each row execute function private.guard_public_submission();

-- An order from a blocked customer is the case the blocklist exists for.
-- Orders are not throttled: a shopper placing several is a good day.
create or replace function private.refuse_blocked_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
begin
  if public.is_staff() then
    return new;
  end if;

  if private.is_blocked(new.customer_email) then
    raise exception 'We cannot accept this order. Please contact the shop on 081 562 9203.';
  end if;

  return new;
end;
$$;

drop trigger if exists refuse_blocked_order on public.orders;
create trigger refuse_blocked_order
  before insert on public.orders
  for each row execute function private.refuse_blocked_order();

-- ---------------------------------------------------------------------------
-- 5. The audit trail missed the documents that matter.
-- ---------------------------------------------------------------------------
--
-- log_activity already covers coupons, damage_reports, expenses, job_cards,
-- laybys, products, refunds, settings, suppliers, till_shifts and users. It did
-- not cover invoices — the tax documents, the ones that may only ever be
-- credited and never deleted — nor orders, nor the handset units whose status
-- is what says a phone was sold.

drop trigger if exists log_activity_trg on public.invoices;
create trigger log_activity_trg
  after insert or update or delete on public.invoices
  for each row execute function public.log_activity();

drop trigger if exists log_activity_trg on public.orders;
create trigger log_activity_trg
  after insert or update or delete on public.orders
  for each row execute function public.log_activity();

drop trigger if exists log_activity_trg on public.grvs;
create trigger log_activity_trg
  after insert or update or delete on public.grvs
  for each row execute function public.log_activity();

drop trigger if exists log_activity_trg on public.product_imeis;
create trigger log_activity_trg
  after insert or update or delete on public.product_imeis
  for each row execute function public.log_activity();

-- ---------------------------------------------------------------------------
-- 6. The staff product view bypasses row security, and must keep doing so.
-- ---------------------------------------------------------------------------
--
-- products_staff is owned by postgres with no security_invoker, so it runs with
-- the owner's rights and the row security on products never applies. That looks
-- like something to fix, and setting security_invoker = true was tried here.
--
-- It cannot be done. Hiding cost_price from the public is implemented as a
-- COLUMN grant — the public may select every products column except that one —
-- and under security_invoker the view reads the table as the caller, who has no
-- grant on cost_price. The view then fails with "permission denied for table
-- products" for everybody, administrators included, which is the opposite of
-- what it exists for.
--
-- The two mechanisms are mutually exclusive and the column grant is the better
-- of them: it is what keeps the margin off the public product feed. So the view
-- is left exactly as it is, and its guard remains the `where is_staff()` in its
-- own definition.
--
-- That guard is a single point of failure — it is what handed out every cost
-- price while is_staff() was stubbed to `select true`. What protects it is not
-- this view but the shape check in 20261015000100, which fails any migration
-- leaving is_admin()/is_staff() not reading a role off public.users.
--
-- Deliberately unchanged. The reasoning is here so nobody tries it again.
