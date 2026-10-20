-- Bulk pricing: the arithmetic, the matching, and the queue.
--
-- All of it runs here rather than in the browser. The money is numeric, not
-- float; the variant key is built in one place so the supplier's wording and
-- the shop's own product names cannot drift apart; and a distribution is a
-- table of one row per recipient, so "fifty people, fifty separate emails" is
-- something you can check afterwards instead of something you hope happened.

-- ---------------------------------------------------------------------------
-- The variant key
-- ---------------------------------------------------------------------------
-- A handset is identified by its model and its storage size. Not by RAM: the
-- shop prices by storage, so the 6/128 and the 8/128 of one model are one line
-- on the price list. Not by colour either — the list is one row per model.
--
-- Built in SQL and nowhere else. The browser extracts the model and the storage
-- from the supplier's wording; this turns those into the key, and turns the
-- shop's own product names into the same key, so the two always agree.
create or replace function private.variant_key(p_model text, p_storage integer)
returns text
language sql
immutable
as $$
  select case
    when nullif(trim(coalesce(p_model, '')), '') is null then null
    else 'samsung|'
         || lower(regexp_replace(trim(p_model), '\s+', ' ', 'g'))
         || '|' || coalesce(p_storage::text, '')
  end;
$$;

-- Reads a model and a storage size out of a handset name, in either dialect:
-- "SAMSUNG A07 4/128GIG DUAL (EXPORT)" or "Samsung Galaxy A07 128GB".
--
-- The order of the two storage patterns matters. "4/128GIG" must be read as
-- 128, so the RAM/storage pair is tried first; otherwise the lone-number rule
-- would match the 4. And "5G" must never be read as 5GB, which is why every
-- pattern insists on GB or GIG rather than a bare G.
create or replace function private.parse_handset(p_name text)
returns table (model text, storage_gb integer, five_g boolean)
language plpgsql
immutable
as $$
declare
  v text := upper(coalesce(p_name, ''));
  v_storage integer;
  v_model text;
  m text[];
begin
  -- Strip the supplier's trade wording before looking for anything. These say
  -- which market a handset was built for, not which handset it is.
  v := regexp_replace(v, '\((\s*(LOCAL|EXPORT|IMPORT)\s*[/]?\s*)+\)?', ' ', 'g');
  v := regexp_replace(v, '\b(DUAL|LTE|SIM|NEW)\b', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');

  -- Storage: the RAM/storage pair first, then a lone size.
  m := regexp_match(v, '(\d+)\s*/\s*(\d+)\s*(?:GIG|GB)');
  if m is not null then
    v_storage := m[2]::integer;
  else
    m := regexp_match(v, '(\d+)\s*(?:GIG|GB)');
    if m is not null then
      v_storage := m[1]::integer;
    end if;
  end if;

  five_g := v ~ '\b5G\b';

  -- Model. Foldables carry a word, so they are matched before the plain
  -- letter-and-number families.
  m := regexp_match(v, '\bZ\s*-?\s*(FOLD|FLIP)\s*(\d+)\b');
  if m is not null then
    v_model := 'Z-' || initcap(m[1]) || ' ' || m[2];
  else
    -- An A/S/M/F model number, with the suffix words that are part of the name
    -- rather than packaging: S25 FE, S26 ULTRA, S26 PLUS, A07 PRO.
    m := regexp_match(v, '\b([ASMF])\s*(\d{2,3})\s*(FE|PLUS|ULTRA|PRO|LITE)?\b');
    if m is not null then
      v_model := m[1] || m[2] || coalesce(' ' || m[3], '');
      -- "S25FE" arrives with no space; normalise to "S25 FE".
      m := regexp_match(v, '\b([ASMF])\s*(\d{2,3})(FE|PLUS|ULTRA|PRO|LITE)\b');
      if m is not null then
        v_model := m[1] || m[2] || ' ' || m[3];
      end if;
    end if;
  end if;

  model := nullif(trim(coalesce(v_model, '')), '');
  storage_gb := v_storage;
  return next;
end;
$$;

-- Is this name a Samsung phone the shop would sell? Tablets are the thing most
-- easily mistaken for one: they are Samsung, they have a storage size and a
-- price, and they sit in the same column of the same spreadsheet.
create or replace function private.is_samsung_phone(p_name text)
returns boolean
language sql
immutable
as $$
  select upper(coalesce(p_name, '')) ~ '\bSAMSUNG\b'
     -- Tablets: the word, and the X-series model codes they are listed under.
     and upper(coalesce(p_name, '')) !~ '\bTAB\b|TAB-|\bTABLET\b|\bMEDIAPAD\b'
     and upper(coalesce(p_name, '')) !~ '\bX\d{3}[A-Z]?\b'
     -- Watches, buds and the rest of the accessory wall.
     and upper(coalesce(p_name, '')) !~ '\bWATCH\b|\bBUDS\b|\bFIT\b|\bCHARGER\b|\bCOVER\b|\bCASE\b';
$$;

-- ---------------------------------------------------------------------------
-- The week
-- ---------------------------------------------------------------------------
-- Monday, in Namibia. Auto-send compares against this to refuse to post a list
-- that belongs to a week gone by.
create or replace function private.windhoek_week_start(p_when timestamptz default now())
returns date
language sql
stable
as $$
  select (date_trunc('week', p_when at time zone 'Africa/Windhoek'))::date;
$$;

-- ---------------------------------------------------------------------------
-- Saving an upload
-- ---------------------------------------------------------------------------
create or replace function public.bulk_save_upload(
  p_file_name text,
  p_rows jsonb,
  p_skipped jsonb default '[]'::jsonb,
  p_supplier_name text default null,
  p_list_date date default null,
  p_storage_path text default null
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_id bigint;
  v_phones integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may upload supplier prices.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'The parsed rows must be a JSON array.';
  end if;

  select count(*)::integer into v_phones
  from jsonb_array_elements(p_rows) as t(value)
  where nullif(t.value->>'model', '') is not null;

  insert into public.bulk_supplier_uploads
    (file_name, storage_path, supplier_name, list_date, row_count, phone_count,
     rows, skipped, uploaded_by)
  values
    (p_file_name, p_storage_path, p_supplier_name, p_list_date,
     jsonb_array_length(p_rows) + jsonb_array_length(coalesce(p_skipped, '[]'::jsonb)),
     v_phones, p_rows, coalesce(p_skipped, '[]'::jsonb), public.current_actor())
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The markup
-- ---------------------------------------------------------------------------
create or replace function public.bulk_set_markup(
  p_variant_key text,
  p_markup numeric,
  p_label text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may change a markup.';
  end if;
  if p_markup is null or p_markup < 0 or p_markup > 500 then
    raise exception 'A markup must be between 0 and 500 per cent.';
  end if;

  insert into public.bulk_variant_markups (variant_key, label, markup_pct, updated_by, updated_at)
  values (p_variant_key, p_label, round(p_markup, 3), public.current_actor(), now())
  on conflict (variant_key) do update
    set markup_pct = excluded.markup_pct,
        label      = coalesce(excluded.label, public.bulk_variant_markups.label),
        updated_by = excluded.updated_by,
        updated_at = now();
end;
$$;

-- Back to the default, which is not the same as setting it to today's default:
-- the row goes away, so this handset follows the default if it ever changes.
create or replace function public.bulk_clear_markup(p_variant_key text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may change a markup.';
  end if;
  delete from public.bulk_variant_markups where variant_key = p_variant_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generating a list
-- ---------------------------------------------------------------------------
-- One transaction: the rates, the markups, the arithmetic and the stock
-- position, frozen together. Re-running it for the same upload replaces the
-- draft rather than piling up near-identical lists.
create or replace function public.bulk_generate_list(p_upload_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_import numeric := public.bulk_setting('bulk_import_vat_rate', '0.17')::numeric;
  v_sales  numeric := public.bulk_setting('bulk_sales_vat_rate', '0.15')::numeric;
  v_default numeric := public.bulk_setting('bulk_default_markup', '22')::numeric;
  v_list_id bigint;
  v_week date := private.windhoek_week_start();
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may generate a price list.';
  end if;
  if not exists (select 1 from public.bulk_supplier_uploads where id = p_upload_id) then
    raise exception 'That upload does not exist.';
  end if;

  -- A draft already generated from this same upload is a re-run, not history.
  delete from public.bulk_price_lists
   where upload_id = p_upload_id and status = 'draft';

  insert into public.bulk_price_lists
    (upload_id, week_start, import_vat_rate, sales_vat_rate, default_markup, generated_by)
  values
    (p_upload_id, v_week, v_import, v_sales, v_default, public.current_actor())
  returning id into v_list_id;

  insert into public.bulk_price_list_items (
    list_id, variant_key, display_name, model, storage_gb, five_g,
    supplier_cost, import_vat, landed_cost, markup_pct,
    price_excl_vat, sales_vat, final_price, stock_status, stock_qty, product_id
  )
  select
    v_list_id,
    priced.variant_key,
    priced.display_name,
    priced.model,
    priced.storage_gb,
    priced.five_g,
    priced.cost,
    priced.import_vat,
    priced.landed,
    priced.markup,
    priced.excl,
    priced.vat,
    priced.excl + priced.vat,
    priced.stock_status,
    priced.stock_qty,
    priced.product_id
  from (
    select
      m.variant_key,
      m.display_name,
      m.model,
      m.storage_gb,
      m.five_g,
      m.cost,
      round(m.cost * v_import, 2)                              as import_vat,
      round(m.cost + m.cost * v_import, 2)                     as landed,
      m.markup,
      round((m.cost + m.cost * v_import)
            * (1 + m.markup / 100), 2)                         as excl,
      round(round((m.cost + m.cost * v_import)
            * (1 + m.markup / 100), 2) * v_sales, 2)           as vat,
      m.stock_status,
      m.stock_qty,
      m.product_id
    from (
      select
        k.variant_key,
        k.display_name,
        k.model,
        k.storage_gb,
        k.five_g,
        k.cost,
        coalesce(mk.markup_pct, v_default) as markup,
        coalesce(st.qty, 0)                as stock_qty,
        case
          when coalesce(st.qty, 0) > 0 then 'in_stock'
          when po.on_order then 'on_order'
          else 'out_of_stock'
        end                                as stock_status,
        st.product_id
      from (
        -- One row per variant. Where the supplier lists the same model and
        -- storage twice (two RAM builds), the cheaper cost wins and the other
        -- is reported as a duplicate in the import preview.
        select distinct on (private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer))
               private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer) as variant_key,
               r.value->>'display_name'                      as display_name,
               r.value->>'model'                             as model,
               (r.value->>'storage_gb')::integer             as storage_gb,
               coalesce((r.value->>'five_g')::boolean, false) as five_g,
               round((r.value->>'supplier_cost')::numeric, 2) as cost
        from public.bulk_supplier_uploads u
        cross join lateral jsonb_array_elements(u.rows) as r(value)
        where u.id = p_upload_id
          and nullif(r.value->>'model', '') is not null
          and coalesce((r.value->>'supplier_cost')::numeric, 0) > 0
        order by private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer),
                 (r.value->>'supplier_cost')::numeric
      ) k
      left join public.bulk_variant_markups mk on mk.variant_key = k.variant_key
      -- The shop's own stock, matched through the same key. A serialised
      -- handset counts its available units; everything else trusts the count
      -- on the product row.
      left join lateral (
        select p.id as product_id,
               case
                 when exists (select 1 from public.product_imeis i where i.product_id = p.id)
                 then (select count(*)::integer from public.product_imeis i
                        where i.product_id = p.id and i.status = 'available')
                 else greatest(coalesce(p.stock, 0), 0)
               end as qty
        from public.products p
        cross join lateral private.parse_handset(p.name) ph
        where p.active
          and private.is_samsung_phone(p.name)
          and private.variant_key(ph.model, ph.storage_gb) = k.variant_key
        order by p.id
        limit 1
      ) st on true
      -- On order: named on a purchase order that has not been received.
      left join lateral (
        select true as on_order
        from public.purchase_orders o
        cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as it(value)
        where coalesce(o.status, '') not in ('Received', 'received', 'Cancelled', 'cancelled')
          and o.received_at is null
          and (
            (nullif(it.value->>'product_id', '') is not null
              and (it.value->>'product_id')::bigint = st.product_id)
            or private.variant_key(
                 (private.parse_handset(it.value->>'name')).model,
                 (private.parse_handset(it.value->>'name')).storage_gb) = k.variant_key
          )
        limit 1
      ) po on true
    ) m
  ) priced;

  update public.bulk_price_lists l
     set product_count  = (select count(*) from public.bulk_price_list_items i where i.list_id = l.id),
         in_stock_count = (select count(*) from public.bulk_price_list_items i
                            where i.list_id = l.id and i.stock_status = 'in_stock'),
         on_order_count = (select count(*) from public.bulk_price_list_items i
                            where i.list_id = l.id and i.stock_status = 'on_order')
   where l.id = v_list_id;

  return v_list_id;
end;
$$;

-- Recomputes a draft in place after the markups were edited, without needing
-- the supplier file again. Refuses to touch anything already published: a list
-- that has gone out to customers is a record, not a working copy.
create or replace function public.bulk_recalculate(p_list_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_upload bigint;
  v_status text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may recalculate a price list.';
  end if;

  select upload_id, status into v_upload, v_status
  from public.bulk_price_lists where id = p_list_id;

  if v_upload is null then
    raise exception 'That price list has no supplier file to recalculate from.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be recalculated — % lists are a record of what went out.', v_status;
  end if;

  return public.bulk_generate_list(v_upload);
end;
$$;

create or replace function public.bulk_approve_list(p_list_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may approve a price list.';
  end if;

  update public.bulk_price_lists
     set status = 'approved', approved_by = public.current_actor(), approved_at = now()
   where id = p_list_id and status = 'draft';

  if not found then
    raise exception 'That list is not a draft awaiting approval.';
  end if;

  -- Only one live list per week.
  update public.bulk_price_lists
     set status = 'superseded'
   where week_start = (select week_start from public.bulk_price_lists where id = p_list_id)
     and id <> p_list_id
     and status in ('approved', 'draft');
end;
$$;

-- ---------------------------------------------------------------------------
-- Distribution
-- ---------------------------------------------------------------------------
-- Creates the distribution and one pending delivery per recipient, in a single
-- transaction. The unique (distribution_id, email) is what makes a retry safe:
-- a second attempt at the same distribution cannot create a second row for
-- somebody who already has one.
create or replace function public.bulk_start_distribution(
  p_list_id bigint,
  p_recipient_ids bigint[] default null,
  p_subject text default null,
  p_body text default null,
  p_file_name text default null,
  p_trigger text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_dist bigint;
  v_week date;
  v_status text;
  v_requires boolean := public.bulk_setting('bulk_require_approval', 'true')::boolean;
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may send a price list.';
  end if;

  select week_start, status into v_week, v_status
  from public.bulk_price_lists where id = p_list_id;
  if v_week is null then
    raise exception 'That price list does not exist.';
  end if;

  if v_requires and v_status not in ('approved', 'sent') then
    raise exception 'That price list has not been approved yet.';
  end if;

  -- Never post a list from a week gone by. A scheduled run that finds nothing
  -- current must say so rather than send stale prices.
  if p_trigger = 'scheduled' and v_week < private.windhoek_week_start() then
    return jsonb_build_object(
      'ok', false,
      'message', format('The newest approved list is for the week of %s, not this week. Nothing was sent.', v_week));
  end if;

  insert into public.bulk_distributions
    (list_id, subject, body, file_name, started_by, trigger)
  values (
    p_list_id,
    coalesce(nullif(p_subject, ''), public.bulk_setting('bulk_email_subject', 'JR Importers | Weekly Samsung Price List')),
    coalesce(nullif(p_body, ''), public.bulk_setting('bulk_email_body', '')),
    p_file_name,
    public.current_actor(),
    p_trigger
  )
  returning id into v_dist;

  -- One row per recipient. Opted-out and inactive addresses are not eligible,
  -- whatever the caller passed.
  insert into public.bulk_deliveries (distribution_id, recipient_id, email, name)
  select v_dist, r.id, lower(trim(r.email)), r.name
  from public.bulk_recipients r
  where r.active
    and r.opted_out_at is null
    and (p_recipient_ids is null or r.id = any (p_recipient_ids))
  on conflict (distribution_id, email) do nothing;

  select count(*)::integer into v_count
  from public.bulk_deliveries where distribution_id = v_dist;

  update public.bulk_distributions set recipient_count = v_count where id = v_dist;

  if v_count = 0 then
    delete from public.bulk_distributions where id = v_dist;
    return jsonb_build_object('ok', false, 'message', 'No eligible recipients were selected.');
  end if;

  update public.bulk_price_lists set status = 'sent' where id = p_list_id and status = 'approved';

  return jsonb_build_object('ok', true, 'distribution_id', v_dist, 'recipients', v_count);
end;
$$;

-- Hands the worker the next address to write to, and marks it as in flight so a
-- second worker cannot pick up the same one.
create or replace function public.bulk_claim_delivery(p_distribution_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v record;
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'Only an administrator may send a price list.';
  end if;

  select d.* into v
  from public.bulk_deliveries d
  where d.status = 'pending'
    and (p_distribution_id is null or d.distribution_id = p_distribution_id)
    and d.attempts < 3
  order by d.id
  for update skip locked
  limit 1;

  if v.id is null then
    return jsonb_build_object('ok', true, 'done', true);
  end if;

  update public.bulk_deliveries
     set status = 'sending', attempts = attempts + 1, updated_at = now()
   where id = v.id;

  return jsonb_build_object(
    'ok', true, 'done', false,
    'delivery_id', v.id, 'distribution_id', v.distribution_id,
    'email', v.email, 'name', coalesce(v.name, ''));
end;
$$;

create or replace function public.bulk_finish_delivery(
  p_delivery_id bigint,
  p_sent boolean,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not (public.is_admin() or auth.uid() is null) then
    raise exception 'Only an administrator may send a price list.';
  end if;

  update public.bulk_deliveries
     set status = case when p_sent then 'sent'
                       when attempts >= 3 then 'failed'
                       else 'pending' end,
         error = case when p_sent then null else left(coalesce(p_error, 'unknown error'), 500) end,
         sent_at = case when p_sent then now() else sent_at end,
         updated_at = now()
   where id = p_delivery_id;

  update public.bulk_distributions d
     set finished_at = now()
   where d.id = (select distribution_id from public.bulk_deliveries where id = p_delivery_id)
     and not exists (
       select 1 from public.bulk_deliveries x
       where x.distribution_id = d.id and x.status in ('pending', 'sending'));
end;
$$;

-- Puts the failures back in the queue, on the same distribution, so nobody who
-- already received it receives it twice.
create or replace function public.bulk_retry_failed(p_distribution_id bigint)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may retry a distribution.';
  end if;

  update public.bulk_deliveries
     set status = 'pending', attempts = 0, error = null, updated_at = now()
   where distribution_id = p_distribution_id and status = 'failed';

  get diagnostics v_n = row_count;

  if v_n > 0 then
    update public.bulk_distributions set finished_at = null where id = p_distribution_id;
  end if;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- The dashboard
-- ---------------------------------------------------------------------------
create or replace function public.bulk_dashboard()
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'private'
as $$
  select jsonb_build_object(
    'this_week', private.windhoek_week_start(),
    'rates', jsonb_build_object(
      'import_vat', public.bulk_setting('bulk_import_vat_rate', '0.17')::numeric,
      'sales_vat',  public.bulk_setting('bulk_sales_vat_rate', '0.15')::numeric,
      'default_markup', public.bulk_setting('bulk_default_markup', '22')::numeric,
      'auto_send', public.bulk_setting('bulk_auto_send', 'false')::boolean,
      'require_approval', public.bulk_setting('bulk_require_approval', 'true')::boolean
    ),
    'latest_upload', (
      select jsonb_build_object('id', u.id, 'file_name', u.file_name, 'at', u.created_at,
                                'rows', u.row_count, 'phones', u.phone_count,
                                'skipped', jsonb_array_length(u.skipped))
      from public.bulk_supplier_uploads u order by u.id desc limit 1
    ),
    'latest_list', (
      select jsonb_build_object('id', l.id, 'week', l.week_start, 'status', l.status,
                                'products', l.product_count, 'in_stock', l.in_stock_count,
                                'on_order', l.on_order_count, 'at', l.created_at,
                                'current_week', l.week_start = private.windhoek_week_start())
      from public.bulk_price_lists l
      where l.status <> 'superseded'
      order by l.week_start desc, l.id desc limit 1
    ),
    'latest_distribution', (
      select jsonb_build_object(
        'id', d.id, 'at', d.created_at, 'trigger', d.trigger,
        'recipients', d.recipient_count,
        'sent', (select count(*) from public.bulk_deliveries x where x.distribution_id = d.id and x.status = 'sent'),
        'failed', (select count(*) from public.bulk_deliveries x where x.distribution_id = d.id and x.status = 'failed'),
        'pending', (select count(*) from public.bulk_deliveries x where x.distribution_id = d.id and x.status in ('pending','sending')))
      from public.bulk_distributions d order by d.id desc limit 1
    ),
    'recipients', (
      select jsonb_build_object(
        'total', count(*),
        'active', count(*) filter (where active and opted_out_at is null))
      from public.bulk_recipients
    ),
    'markups_overridden', (select count(*) from public.bulk_variant_markups)
  );
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
-- Every one of these checks is_admin() for itself; the grant only decides who
-- may reach the check. anon is never given any of them.
do $grants$
declare
  fn text;
begin
  for fn in
    select format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'bulk\_%' and p.prokind = 'f'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end
$grants$;

-- bulk_setting is internal plumbing for the others, not an endpoint.
revoke all on function public.bulk_setting(text, text) from public, anon, authenticated;
revoke all on function private.variant_key(text, integer) from public, anon, authenticated;
revoke all on function private.parse_handset(text) from public, anon, authenticated;
revoke all on function private.is_samsung_phone(text) from public, anon, authenticated;
revoke all on function private.windhoek_week_start(timestamptz) from public, anon, authenticated;
