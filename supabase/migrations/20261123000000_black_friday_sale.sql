/*
  Black Friday 2026 (24-27 Nov), and what it needed that the shop lacked.

  1. A sale price per product, shown and charged only while a promotion is on.
     The window lives in `promotions`, readable by anyone, so the storefront
     can dress itself and the database can price an order from the same row.
  2. Prices are checked on the server. Checkout wrote whatever the browser's
     cart said; a cart filled before the sale, or kept after it, would have
     been charged the wrong figure. A non-staff order now fails if any line
     is below the product's effective price at that moment.
  3. "On order" products: Ulefone Armors the shop no longer holds stay on the
     website and can be bought; the unit is sourced after the sale.
  4. Orders carry their channel (web / pos / invoice) so the console can show
     online trade on its own.
  5. The shop is emailed when a web order is placed and when it is paid.
*/

-- ---------------------------------------------------------------------------
-- 1. Sale price and on-order flag
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists sale_price numeric(12,2),
  add column if not exists allow_backorder boolean not null default false;

comment on column public.products.sale_price is
  'Promotional price, VAT inclusive. Charged only while an active promotion is running and only when below price.';
comment on column public.products.allow_backorder is
  'Stays on the website and can be ordered when stock is 0; the unit is sourced after the sale.';

grant select (sale_price, allow_backorder) on public.products to anon, authenticated;

create or replace function public.limit_customer_product_updates()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if public.is_admin() then
    return new;
  end if;

  new.name := old.name;
  new.brand := old.brand;
  new.category := old.category;
  new.description := old.description;
  new.price := old.price;
  new.sale_price := old.sale_price;
  new.allow_backorder := old.allow_backorder;
  new.cost_price := old.cost_price;
  new.reorder_level := old.reorder_level;
  new.sku := old.sku;
  new.barcode := old.barcode;
  new.color := old.color;
  new.image := old.image;
  new.image1 := old.image1;
  new.image2 := old.image2;
  new.image3 := old.image3;
  new.image4 := old.image4;
  new.image5 := old.image5;
  new.spec_display := old.spec_display;
  new.spec_processor := old.spec_processor;
  new.spec_ram := old.spec_ram;
  new.spec_storage := old.spec_storage;
  new.spec_battery := old.spec_battery;
  new.spec_back_camera := old.spec_back_camera;
  new.spec_front_camera := old.spec_front_camera;
  new.spec_os := old.spec_os;
  new.spec_weight := old.spec_weight;
  new.spec_extras := old.spec_extras;
  new.active := old.active;
  new.show_online := old.show_online;
  new.featured := old.featured;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Promotions: the window a sale runs in
-- ---------------------------------------------------------------------------
create table if not exists public.promotions (
  id bigserial primary key,
  name text not null,
  theme text not null default 'black-friday',
  starts_on date not null,
  ends_on date not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_window check (ends_on >= starts_on)
);
comment on table public.promotions is
  'Sale windows. While one is active and today (Africa/Windhoek) is inside it, products with a sale_price are charged at it and the storefront wears its theme.';

alter table public.promotions enable row level security;
drop policy if exists "anyone reads active promotions" on public.promotions;
create policy "anyone reads active promotions" on public.promotions
  for select using (active = true or public.is_staff());
drop policy if exists "admins manage promotions" on public.promotions;
create policy "admins manage promotions" on public.promotions
  for all using (public.is_admin()) with check (public.is_admin());
grant select on public.promotions to anon, authenticated;
grant insert, update, delete on public.promotions to authenticated;
grant usage, select on sequence public.promotions_id_seq to authenticated;

drop trigger if exists set_promotions_updated_at on public.promotions;
create trigger set_promotions_updated_at before update on public.promotions
  for each row execute function public.set_updated_at();

/* Today in the shop's own day, not UTC: a sale that "starts on the 24th"
   starts at midnight in Walvis Bay. */
create or replace function public.sale_active()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select exists (
    select 1 from public.promotions
    where active
      and (now() at time zone 'Africa/Windhoek')::date between starts_on and ends_on
  );
$$;
grant execute on function public.sale_active() to anon, authenticated;

/* What a product costs right now. The sale price only ever lowers it. */
create or replace function public.effective_price(p_product_id bigint)
returns numeric
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
           when public.sale_active() and p.sale_price is not null and p.sale_price > 0 and p.sale_price < p.price
             then p.sale_price
           else p.price
         end
  from public.products p
  where p.id = p_product_id;
$$;
grant execute on function public.effective_price(bigint) to anon, authenticated;

insert into public.promotions (name, theme, starts_on, ends_on, active)
select 'Black Friday', 'black-friday', date '2026-11-24', date '2026-11-27', true
where not exists (select 1 from public.promotions where name = 'Black Friday' and starts_on = date '2026-11-24');

-- ---------------------------------------------------------------------------
-- 3. Orders: channel, and the server checks the prices
-- ---------------------------------------------------------------------------
alter table public.orders
  add column if not exists channel text not null default 'pos';
alter table public.orders drop constraint if exists orders_channel_check;
alter table public.orders add constraint orders_channel_check check (channel in ('web', 'pos', 'invoice'));
comment on column public.orders.channel is
  'Where the sale came from: web (customer checkout), pos (the till) or invoice (mirrored from a staff invoice).';

update public.orders set channel = 'invoice' where invoice_id is not null and channel = 'pos';
create index if not exists orders_channel_created_idx on public.orders (channel, created_at desc);

/* A customer cannot relabel their order as a till sale. */
create or replace function public.pin_order_channel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_staff() then
    new.channel := old.channel;
  end if;
  return new;
end;
$$;
drop trigger if exists pin_order_channel on public.orders;
create trigger pin_order_channel before update on public.orders
  for each row execute function public.pin_order_channel();

/* The price check. Staff rings up whatever the till says (discounts, trade
   prices); a customer's order must not undercut the catalogue. */
create or replace function public.guard_order_prices()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  li jsonb;
  v_pid bigint;
  v_price numeric;
  v_qty numeric;
  v_eff numeric;
  v_name text;
  v_sum numeric := 0;
begin
  if public.is_staff() then
    return new;
  end if;

  for li in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    v_pid := nullif(li->>'product_id', '')::bigint;
    continue when v_pid is null;
    v_price := coalesce(nullif(li->>'price', '')::numeric, 0);
    v_qty := greatest(coalesce(nullif(li->>'quantity', '')::numeric, nullif(li->>'qty', '')::numeric, 0), 0);
    v_eff := public.effective_price(v_pid);
    if v_eff is null then
      raise exception 'PRICE_CHANGED: % is no longer available.', coalesce(li->>'name', 'An item')
        using errcode = 'P0001';
    end if;
    if v_price < v_eff - 0.005 then
      select name into v_name from public.products where id = v_pid;
      raise exception 'PRICE_CHANGED: % is now N$ %. Please refresh your cart.',
        coalesce(v_name, li->>'name', 'An item'), to_char(v_eff, 'FM999G999G990D00')
        using errcode = 'P0001';
    end if;
    v_sum := v_sum + v_price * v_qty;
  end loop;

  if coalesce(new.total_amount, 0) < v_sum - coalesce(new.coupon_discount, 0) - 0.01 then
    raise exception 'PRICE_CHANGED: the order total does not match its lines. Please refresh your cart.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;
drop trigger if exists guard_order_prices on public.orders;
create trigger guard_order_prices before insert on public.orders
  for each row execute function public.guard_order_prices();

-- ---------------------------------------------------------------------------
-- 4. On-order lines reserve what is there and never report a shortage
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reserve_order_stock(p_order_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_order      public.orders%rowtype;
  v_product_id bigint;
  v_color      text;
  v_name       text;
  v_qty        integer;
  v_product    public.products%rowtype;
  v_imei_count integer;
  v_serialised boolean;
  v_known      boolean;
  v_shortages  jsonb := '[]'::jsonb;
  v_named      text[];
  v_took       integer;
begin
  if not public.owns_order(p_order_id) then
    return jsonb_build_object('ok', false, 'message', 'Not permitted to reserve this order.');
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'message', 'Order not found.');
  end if;
  if v_order.stock_reserved then
    return jsonb_build_object('ok', true, 'message', 'Stock already reserved.');
  end if;

  -- Pass 1a: lock each product and check the overall count, colour-blind.
  -- Ascending product_id order gives every caller the same lock order, so
  -- two orders sharing lines cannot deadlock.
  for v_product_id, v_qty in
    select (t.value->>'product_id')::bigint,
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
    order by 1
  loop
    select * into v_product from public.products where id = v_product_id for update;
    if not found then
      v_shortages := v_shortages || jsonb_build_object(
        'name', 'Product #' || v_product_id, 'requested', v_qty, 'available', 0
      );
      continue;
    end if;

    v_serialised := exists (select 1 from public.product_imeis where product_id = v_product_id);

    -- On-order lines: the shop sources the unit after the sale, so a short
    -- shelf is not a shortage. Whatever is on hand is still reserved below.
    if v_product.allow_backorder then
      continue;
    end if;

    if v_serialised then
      select count(*)::integer into v_imei_count
      from public.product_imeis
      where product_id = v_product_id and status = 'available';

      if v_imei_count < v_qty then
        v_shortages := v_shortages || jsonb_build_object(
          'name', v_product.name, 'requested', v_qty, 'available', v_imei_count
        );
      end if;
    elsif v_product.stock < v_qty then
      v_shortages := v_shortages || jsonb_build_object(
        'name', v_product.name, 'requested', v_qty, 'available', v_product.stock
      );
    end if;
  end loop;

  -- Pass 1b: for lines that name a colour the product's unit pool actually
  -- knows, that colour must be available in the quantity asked. Colours the
  -- pool has never heard of are metadata, not a choice — skipped here and
  -- reserved colour-blind in pass 2.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           lower(nullif(trim(both from coalesce(t.value->>'color', '')), '')),
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
      and nullif(trim(both from coalesce(t.value->>'color', '')), '') is not null
    group by 1, 2
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
    order by 1, 2
  loop
    if not exists (select 1 from public.product_imeis where product_id = v_product_id) then
      continue; -- untracked product: nothing to hold to a colour
    end if;
    continue when (select allow_backorder from public.products where id = v_product_id);

    select exists (
      select 1 from public.product_imeis
      where product_id = v_product_id
        and lower(trim(both from coalesce(color, ''))) = v_color
    ) into v_known;
    continue when not v_known; -- phantom colour: reserve colour-blind instead

    select count(*)::integer into v_imei_count
    from public.product_imeis
    where product_id = v_product_id and status = 'available'
      and lower(trim(both from coalesce(color, ''))) = v_color;

    if v_imei_count < v_qty then
      select name into v_name from public.products where id = v_product_id;
      v_shortages := v_shortages || jsonb_build_object(
        'name', coalesce(v_name, 'Product #' || v_product_id) || ' (' || initcap(v_color) || ')',
        'requested', v_qty, 'available', v_imei_count
      );
    end if;
  end loop;

  if jsonb_array_length(v_shortages) > 0 then
    return jsonb_build_object(
      'ok', false,
      'message', 'Some items are no longer available in the quantity requested.',
      'shortages', v_shortages
    );
  end if;

  -- Pass 2: everything checked out, so commit the reservations. Coloured
  -- lines first, so a colour-blind line of the same product cannot grab a
  -- unit a coloured line needs. A named colour only narrows the pick when
  -- the pool knows it; otherwise any unit of the product will do.
  for v_product_id, v_color, v_qty in
    select (t.value->>'product_id')::bigint,
           lower(nullif(trim(both from coalesce(t.value->>'color', '')), '')),
           sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0))::integer
    from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
    where nullif(t.value->>'product_id', '') is not null
    group by 1, 2
    having sum(greatest(coalesce(
             nullif(t.value->>'quantity', '')::integer,
             nullif(t.value->>'qty', '')::integer, 0), 0)) > 0
    order by 1, 2 nulls last
  loop
    select * into v_product from public.products where id = v_product_id;

    if exists (select 1 from public.product_imeis where product_id = v_product_id) then
      if v_color is not null and not exists (
        select 1 from public.product_imeis
        where product_id = v_product_id
          and lower(trim(both from coalesce(color, ''))) = v_color
      ) then
        v_color := null; -- phantom colour: any unit of the product will do
      end if;

      -- Units the seller actually named. The till now asks which handset is
      -- going out, and that answer has to be honoured: reserving the oldest
      -- unit instead means the IMEI recorded against the sale is not the one
      -- in the customer's hand, which surfaces months later as a warranty
      -- claim on a phone the shop still believes is on the shelf.
      select coalesce(array_agg(x), '{}')
        into v_named
        from (
          select jsonb_array_elements_text(t.value->'imeis') as x
          from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
          where (t.value->>'product_id')::bigint = v_product_id
            and jsonb_typeof(t.value->'imeis') = 'array'
          union
          select t.value->>'imei'
          from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) as t(value)
          where (t.value->>'product_id')::bigint = v_product_id
            and nullif(t.value->>'imei', '') is not null
        ) named
       where x is not null;

      v_took := 0;
      if array_length(v_named, 1) > 0 then
        with taken as (
          update public.product_imeis
             set status = 'reserved', order_id = p_order_id
           where product_id = v_product_id
             and status = 'available'
             and coalesce(imei, serial_number) = any (v_named)
          returning 1
        )
        select count(*)::integer into v_took from taken;
      end if;

      -- Whatever the line did not name still falls back to the colour pick,
      -- so a partly-named line reserves its full quantity and an older order
      -- carrying no serials behaves exactly as before.
      if v_took < v_qty then
        update public.product_imeis
        set status = 'reserved', order_id = p_order_id
        where id in (
          select id from public.product_imeis
          where product_id = v_product_id and status = 'available'
            and (v_color is null or lower(trim(both from coalesce(color, ''))) = v_color)
          order by created_at
          limit v_qty - v_took
        );
      end if;
    else
      update public.products
      set stock = greatest(stock - v_qty, 0)
      where id = v_product_id;
    end if;

    insert into public.stock_movements
      (product_id, product_name, movement_type, quantity, reference_type, reference_id, notes)
    values
      (v_product_id, v_product.name, 'sale', -v_qty, 'order', p_order_id::text,
       'Reserved at checkout' || case when v_color is null then '' else ' — ' || initcap(v_color) end
         || case when v_product.allow_backorder and v_product.stock < v_qty then ' (on order)' else '' end);
  end loop;

  update public.orders
  set stock_reserved = true,
      reservation_expires_at = now() + interval '30 minutes'
  where id = p_order_id;

  return jsonb_build_object('ok', true, 'message', 'Stock reserved.');
end;
$function$
;

update public.products
   set allow_backorder = true
 where active and brand ilike 'ulefone' and name ilike '%armor%' and category = 'Smartphones';

-- ---------------------------------------------------------------------------
-- 5. Email the shop about web orders
-- ---------------------------------------------------------------------------
create table if not exists private.email_config (
  id integer primary key default 1 check (id = 1),
  resend_key text,
  function_url text,
  webhook_secret text,
  from_addr text not null default 'JR Importers <info@jrimporters.com>',
  to_addr text not null default 'info@jrimporters.com',
  cc_addr text,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into private.email_config (id, cc_addr) values (1, 'jr.importers@iway.na')
on conflict (id) do update set cc_addr = excluded.cc_addr;

create or replace function public.email_shop_about_web_order()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'private', 'net', 'extensions'
as $$
declare
  cfg private.email_config;
  v_subject text;
  v_rows text := '';
  li jsonb;
  v_event text;
  v_ref text;
begin
  if new.channel <> 'web' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_event := 'New online order';
  elsif tg_op = 'UPDATE' and new.status = 'Paid' and coalesce(old.status, '') <> 'Paid' then
    v_event := 'Online order paid';
  else
    return new;
  end if;

  select * into cfg from private.email_config where id = 1;
  if cfg.function_url is null or cfg.webhook_secret is null or not cfg.enabled then
    return new;
  end if;

  v_ref := coalesce(new.invoice_number, upper(left(new.id::text, 8)));
  v_subject := v_event || ' - ' || v_ref || ' - ' || coalesce(new.customer_name, 'Customer')
               || ' - N$ ' || to_char(coalesce(new.total_amount, 0), 'FM999G999G990D00');

  for li in select value from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) loop
    v_rows := v_rows || '<tr><td style="padding:4px 8px">' || coalesce(li->>'quantity', li->>'qty', '1') || ' x</td>'
      || '<td style="padding:4px 8px">' || coalesce(li->>'name', '') ||
         case when nullif(li->>'color', '') is not null then ' - ' || (li->>'color') else '' end || '</td>'
      || '<td style="padding:4px 8px;text-align:right">N$ ' || to_char(coalesce((li->>'price')::numeric, 0), 'FM999G999G990D00') || '</td></tr>';
  end loop;

  perform net.http_post(
    url := cfg.function_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-order-mail-secret', cfg.webhook_secret),
    body := jsonb_build_object(
      'from', cfg.from_addr,
      'to', jsonb_build_array(cfg.to_addr),
      'cc', case when cfg.cc_addr is null then '[]'::jsonb else jsonb_build_array(cfg.cc_addr) end,
      'subject', v_subject,
      'html',
        '<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c312a">'
        || '<h2 style="margin:0 0 12px">' || v_event || '</h2>'
        || '<p><strong>' || v_ref || '</strong> - ' || to_char(new.created_at at time zone 'Africa/Windhoek', 'DD Mon YYYY HH24:MI') || '</p>'
        || '<p>' || coalesce(new.customer_name, '') || '<br>' || coalesce(new.customer_email, '') || '<br>' || coalesce(new.customer_phone, '') || '</p>'
        || '<p>Delivery: ' || coalesce(new.delivery_method, '-')
        || case when nullif(new.delivery_address, '') is not null then '<br>' || new.delivery_address else '' end
        || case when nullif(new.customer_city, '') is not null then '<br>' || new.customer_city || coalesce(', ' || new.customer_region, '') else '' end
        || '</p>'
        || '<table style="border-collapse:collapse">' || v_rows || '</table>'
        || case when coalesce(new.coupon_discount, 0) > 0 then '<p>Discount ' || coalesce(new.coupon_code, '') || ': -N$ ' || to_char(new.coupon_discount, 'FM999G999G990D00') || '</p>' else '' end
        || '<p style="font-size:16px"><strong>Total N$ ' || to_char(coalesce(new.total_amount, 0), 'FM999G999G990D00') || '</strong> (incl. VAT N$ ' || to_char(coalesce(new.vat_amount, 0), 'FM999G999G990D00') || ')</p>'
        || '<p>Payment: ' || coalesce(new.payment_method, '-') || ' - Status: ' || coalesce(new.status, '-') || '</p>'
        || case when nullif(new.delivery_notes, '') is not null then '<p>Notes: ' || new.delivery_notes || '</p>' else '' end
        || '<p><a href="https://jrimporters.com/admin/#/online">Open in the console</a></p>'
        || '</div>'
    ),
    timeout_milliseconds := 8000
  );
  return new;
exception when others then
  -- An email that fails must never stop a customer's order.
  return new;
end;
$$;

drop trigger if exists email_shop_about_web_order on public.orders;
create trigger email_shop_about_web_order after insert or update of status on public.orders
  for each row execute function public.email_shop_about_web_order();

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 6. Every new order gets its channel from who placed it
-- ---------------------------------------------------------------------------
/* A customer's insert is a web order whatever it claims; an order mirrored
   from a staff invoice is an invoice; staff keep what they send (the till
   sends nothing, so 'pos'). Runs before the price guard and the email. */
create or replace function public.set_order_channel()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.invoice_id is not null then
    new.channel := 'invoice';
  elsif not public.is_staff() then
    new.channel := 'web';
  end if;
  return new;
end;
$$;
drop trigger if exists aa_set_order_channel on public.orders;
create trigger aa_set_order_channel before insert on public.orders
  for each row execute function public.set_order_channel();
