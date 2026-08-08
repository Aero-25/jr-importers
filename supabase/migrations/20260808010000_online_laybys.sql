-- Laybuys from the online shop.
--
-- The shop already runs laybys for walk-in customers; this teaches the same
-- table about the website so staff manage every laybuy in one screen and the
-- finance reports stay whole. A customer pays a 10% deposit by card to open
-- one, pays the rest off any way they like within 3 months, and collects the
-- phone once it is fully paid. No refunds on laybuys: a lapsed one becomes
-- store credit or an extension, at the shop's discretion — never money back.

-- ── Columns the online flow needs ─────────────────────────────────────────

alter table public.laybys add column if not exists user_id uuid;
alter table public.laybys add column if not exists product_id bigint references public.products(id) on delete set null;
alter table public.laybys add column if not exists color text;
alter table public.laybys add column if not exists source text not null default 'store';

create index if not exists laybys_user_idx on public.laybys (user_id);

-- ── Layby numbers, same discipline as quotes and invoices ─────────────────

create sequence if not exists public.layby_number_seq;

create or replace function public.assign_layby_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare n bigint;
begin
  if new.layby_number is null or btrim(new.layby_number) = '' then
    n := nextval('public.layby_number_seq');
    new.layby_number := 'LB-' || lpad(n::text, greatest(4, length(n::text)), '0');
  end if;
  return new;
end;
$$;

drop trigger if exists laybys_assign_number on public.laybys;
create trigger laybys_assign_number
  before insert on public.laybys
  for each row execute function public.assign_layby_number();

do $$
declare r record; n bigint;
begin
  for r in (
    select id from public.laybys
    where layby_number is null or btrim(layby_number) = ''
    order by created_at, id
  ) loop
    n := nextval('public.layby_number_seq');
    update public.laybys
      set layby_number = 'LB-' || lpad(n::text, greatest(4, length(n::text)), '0')
      where id = r.id;
  end loop;
end;
$$;

select setval(
  'public.layby_number_seq',
  greatest(
    (select coalesce(max(substring(layby_number from '(\d+)\s*$')::bigint), 0)
       from public.laybys
       where layby_number ~ '\d+\s*$'),
    1
  ),
  true
);

grant usage, select on sequence public.layby_number_seq to authenticated;

-- ── Customers read their own laybys; staff policies stay as they are ──────

drop policy if exists "customers read own laybys" on public.laybys;
create policy "customers read own laybys" on public.laybys
  for select using (user_id = auth.uid());

-- ── Opening a laybuy from the shop ────────────────────────────────────────
--
-- The deposit is computed here, not taken from the client: 10% of the price
-- the shop has on record. The phone is reserved by decrementing stock inside
-- the same transaction — one writer, no double-sell. p_reference is the DPO
-- transaction reference of the verified deposit payment; a repeated reference
-- (the customer refreshing the confirmation page) returns the existing laybuy
-- instead of opening a second one.

create or replace function public.open_online_layby(
  p_product_id bigint,
  p_color text,
  p_customer_name text,
  p_customer_phone text,
  p_customer_email text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_product record;
  v_deposit numeric(12,2);
  v_existing record;
  v_layby record;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in first.');
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    return jsonb_build_object('ok', false, 'message', 'Missing payment reference.');
  end if;

  select id, layby_number into v_existing
  from public.laybys
  where payments @> jsonb_build_array(jsonb_build_object('reference', p_reference))
  limit 1;
  if found then
    return jsonb_build_object('ok', true, 'layby_id', v_existing.id,
                              'layby_number', v_existing.layby_number, 'existing', true);
  end if;

  select id, name, sku, price, stock, category, color
    into v_product
  from public.products
  where id = p_product_id and active = true
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That product is no longer available.');
  end if;
  if coalesce(v_product.category, '') <> 'Smartphones' then
    return jsonb_build_object('ok', false, 'message', 'Laybuys are for smartphones only.');
  end if;
  if coalesce(v_product.stock, 0) < 1 then
    return jsonb_build_object('ok', false, 'message', 'That phone has just sold out.');
  end if;
  if coalesce(v_product.price, 0) <= 0 then
    return jsonb_build_object('ok', false, 'message', 'That product has no price.');
  end if;

  v_deposit := round(v_product.price * 0.10, 2);

  update public.products set stock = stock - 1 where id = v_product.id;
  insert into public.stock_movements
    (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes, user_name)
  values
    (v_product.id, v_product.name, 'layby_reserve', -1, 'layby', null,
     'Reserved for online laybuy', coalesce(p_customer_name, 'online'));

  insert into public.laybys
    (customer_name, customer_phone, user_id, product_id, color, source,
     items, total_amount, deposit_amount, paid_amount, balance_amount,
     payments, status, due_date, notes)
  values
    (nullif(btrim(p_customer_name), ''), nullif(btrim(p_customer_phone), ''),
     v_user, v_product.id, coalesce(nullif(btrim(p_color), ''), v_product.color), 'online',
     jsonb_build_array(jsonb_build_object(
       'product_id', v_product.id, 'name', v_product.name, 'sku', v_product.sku,
       'price', v_product.price, 'quantity', 1,
       'color', coalesce(nullif(btrim(p_color), ''), v_product.color),
       'line_total', v_product.price)),
     v_product.price, v_deposit, v_deposit, round(v_product.price - v_deposit, 2),
     jsonb_build_array(jsonb_build_object(
       'amount', v_deposit, 'method', 'Card (DPO)', 'reference', p_reference,
       'date', now(), 'by', coalesce(nullif(btrim(p_customer_email), ''), 'online'))),
     'active', (current_date + interval '3 months')::date,
     'Opened on the online shop. No refunds on laybuys.')
  returning id, layby_number into v_layby;

  update public.stock_movements
    set reference_id = v_layby.id::text
  where reference_type = 'layby' and reference_id is null and product_id = v_product.id
    and created_at > now() - interval '1 minute';

  return jsonb_build_object('ok', true, 'layby_id', v_layby.id,
                            'layby_number', v_layby.layby_number,
                            'deposit', v_deposit, 'existing', false);
end;
$$;

grant execute on function public.open_online_layby(bigint, text, text, text, text, text) to authenticated;

-- ── Paying an instalment from the shop ────────────────────────────────────
--
-- Any amount, any time, as long as it lands before the due date. The amount
-- is capped at the balance, a repeated DPO reference is a no-op (double
-- redirects must not double-pay), and the layby completes itself when the
-- balance reaches zero — from that moment the customer sees "ready for
-- collection" and staff hand the phone over.

create or replace function public.pay_online_layby(
  p_layby_id bigint,
  p_amount numeric,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_layby record;
  v_amount numeric(12,2);
  v_balance numeric(12,2);
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'message', 'Sign in first.');
  end if;
  if p_reference is null or btrim(p_reference) = '' then
    return jsonb_build_object('ok', false, 'message', 'Missing payment reference.');
  end if;

  select * into v_layby from public.laybys
  where id = p_layby_id and user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'message', 'That laybuy was not found.');
  end if;
  if v_layby.status <> 'active' then
    return jsonb_build_object('ok', false, 'message', 'That laybuy is not active.');
  end if;
  if v_layby.payments @> jsonb_build_array(jsonb_build_object('reference', p_reference)) then
    return jsonb_build_object('ok', true, 'balance', v_layby.balance_amount,
                              'status', v_layby.status, 'duplicate', true);
  end if;

  v_amount := least(round(coalesce(p_amount, 0), 2), v_layby.balance_amount);
  if v_amount <= 0 then
    return jsonb_build_object('ok', false, 'message', 'Nothing to pay.');
  end if;

  v_balance := round(v_layby.balance_amount - v_amount, 2);

  update public.laybys
    set payments = payments || jsonb_build_array(jsonb_build_object(
          'amount', v_amount, 'method', 'Card (DPO)', 'reference', p_reference,
          'date', now(), 'by', 'online')),
        paid_amount = round(paid_amount + v_amount, 2),
        balance_amount = v_balance,
        status = case when v_balance <= 0.005 then 'completed' else status end
  where id = v_layby.id;

  return jsonb_build_object('ok', true, 'balance', v_balance,
                            'status', case when v_balance <= 0.005 then 'completed' else 'active' end);
end;
$$;

grant execute on function public.pay_online_layby(bigint, numeric, text) to authenticated;
