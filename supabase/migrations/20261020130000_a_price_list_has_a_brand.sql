-- A price list has a brand, and not every brand is priced the same way.
--
-- The Samsung list is built from a supplier's weekly sheet and priced forward:
-- cost, import VAT, a markup the shop sets per handset, then sales VAT.
--
-- Ulefone is not like that. The shop buys them directly, there is no import VAT
-- on them, and the dealer price is simply the shop's own selling price — the
-- same number a customer sees on jrimporters.com. There is no markup to set,
-- because the price is not being worked out; it is being quoted.
--
-- So a list now says which brand it is for and how its prices were arrived at:
--
--   calculated  — from a supplier cost, through import VAT and a markup
--   shop_price  — taken from products.price exactly as it stands
--
-- The costing workbook still shows a margin for a shop_price list, worked back
-- from the price rather than used to set it. It is a fact about the line, not a
-- lever on it, and the console shows it read-only for that reason.

alter table public.bulk_price_lists
  add column if not exists brand text not null default 'Samsung';

alter table public.bulk_price_lists
  add column if not exists pricing_mode text not null default 'calculated';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.bulk_price_lists'::regclass
      and conname = 'bulk_price_lists_pricing_mode_check'
  ) then
    alter table public.bulk_price_lists
      add constraint bulk_price_lists_pricing_mode_check
      check (pricing_mode in ('calculated', 'shop_price'));
  end if;
end
$$;

create index if not exists bulk_price_lists_brand
  on public.bulk_price_lists (brand, week_start desc, id desc);

-- An upload belongs to a brand too, so next Monday's Samsung sheet cannot be
-- confused with anything else.
alter table public.bulk_supplier_uploads
  add column if not exists brand text not null default 'Samsung';

-- ---------------------------------------------------------------------------
-- Approving must only supersede lists of the same brand
-- ---------------------------------------------------------------------------
-- Without this, approving the Ulefone list would mark the week's approved
-- Samsung list superseded — and a scheduled send would then find nothing to
-- post. One live list per brand per week, not one in total.
create or replace function public.bulk_approve_list(p_list_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_week  date;
  v_brand text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may approve a price list.';
  end if;

  update public.bulk_price_lists
     set status = 'approved', approved_by = public.current_actor(), approved_at = now()
   where id = p_list_id and status = 'draft'
  returning week_start, brand into v_week, v_brand;

  if not found then
    raise exception 'That list is not a draft awaiting approval.';
  end if;

  update public.bulk_price_lists
     set status = 'superseded'
   where week_start = v_week
     and brand = v_brand
     and id <> p_list_id
     and status in ('approved', 'draft');
end;
$$;

-- ---------------------------------------------------------------------------
-- Building a list from the shop's own catalogue
-- ---------------------------------------------------------------------------
-- No supplier sheet, no markup. The price is what the shop sells at, and the
-- rest of the line is worked back from it so the costing workbook still adds up.
create or replace function public.bulk_generate_catalogue_list(
  p_brand text default 'Ulefone',
  p_categories text[] default array['Smartphones', 'Tablets']
)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_sales   numeric := public.bulk_setting('bulk_sales_vat_rate', '0.15')::numeric;
  v_list_id bigint;
  v_week    date := private.windhoek_week_start();
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may generate a price list.';
  end if;

  -- A re-run for the same brand this week replaces the draft rather than
  -- stacking up near-identical lists.
  delete from public.bulk_price_lists
   where brand = p_brand and week_start = v_week and status = 'draft';

  insert into public.bulk_price_lists
    (upload_id, week_start, brand, pricing_mode,
     import_vat_rate, sales_vat_rate, default_markup, generated_by)
  values
    (null, v_week, p_brand, 'shop_price',
     -- No import VAT on these, and no markup: recorded as zero so the
     -- workbook's rates sheet says so plainly rather than leaving it blank.
     0, v_sales, 0, public.current_actor())
  returning id into v_list_id;

  insert into public.bulk_price_list_items (
    list_id, variant_key, display_name, model, storage_gb, five_g,
    supplier_cost, import_vat, landed_cost, markup_pct,
    price_excl_vat, sales_vat, final_price, stock_status, stock_qty, product_id
  )
  select
    v_list_id,
    'product|' || p.id,
    p.name,
    nullif(btrim(coalesce(h.model, '')), ''),
    h.storage_gb,
    coalesce(h.five_g, false),
    coalesce(p.cost_price, 0),
    0,                                              -- no import VAT on these
    coalesce(p.cost_price, 0),
    -- The margin the shop price implies. Shown, not used: the price came first.
    case when coalesce(p.cost_price, 0) > 0
         then round((round(p.price / (1 + v_sales), 2) / p.cost_price - 1) * 100, 6)
         else 0 end,
    round(p.price / (1 + v_sales), 2),
    p.price - round(p.price / (1 + v_sales), 2),
    p.price,
    case when q.on_hand > 0 then 'in_stock' else 'on_order' end,
    q.on_hand,
    p.id
  from public.products p
  cross join lateral (
    select case
             when exists (select 1 from public.product_imeis i where i.product_id = p.id)
             then (select count(*)::integer from public.product_imeis i
                    where i.product_id = p.id and i.status = 'available')
             else greatest(coalesce(p.stock, 0), 0)
           end as on_hand
  ) q
  -- The storage size reads off the name for these too, so the list can be
  -- sorted and read the same way as the Samsung one. A null model is fine:
  -- the display name is the product's own and carries everything.
  left join lateral (
    select (regexp_match(upper(p.name), '(\d+)\s*(?:GIG|GB)'))[1]::integer as storage_gb,
           null::text as model,
           upper(p.name) ~ '\y5G\y' as five_g
  ) h on true
  where p.active
    and p.show_online
    and p.category = any (p_categories)
    and (p.brand ilike '%' || p_brand || '%' or p.name ilike '%' || p_brand || '%')
    and coalesce(p.price, 0) > 0;

  update public.bulk_price_lists l
     set product_count  = (select count(*) from public.bulk_price_list_items i where i.list_id = l.id),
         in_stock_count = (select count(*) from public.bulk_price_list_items i
                            where i.list_id = l.id and i.stock_status = 'in_stock'),
         on_order_count = (select count(*) from public.bulk_price_list_items i
                            where i.list_id = l.id and i.stock_status <> 'in_stock')
   where l.id = v_list_id;

  return v_list_id;
end;
$$;

revoke all on function public.bulk_generate_catalogue_list(text, text[]) from public, anon;
grant execute on function public.bulk_generate_catalogue_list(text, text[]) to authenticated;

-- A shop-price list has no supplier file behind it, so there is nothing to
-- recalculate from — it is regenerated from the catalogue instead.
create or replace function public.bulk_recalculate(p_list_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_upload bigint;
  v_status text;
  v_brand  text;
  v_mode   text;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may recalculate a price list.';
  end if;

  select upload_id, status, brand, pricing_mode
    into v_upload, v_status, v_brand, v_mode
  from public.bulk_price_lists where id = p_list_id;

  if v_status is null then
    raise exception 'That price list does not exist.';
  end if;
  if v_status <> 'draft' then
    raise exception 'Only a draft can be recalculated — % lists are a record of what went out.', v_status;
  end if;

  if v_mode = 'shop_price' then
    return public.bulk_generate_catalogue_list(v_brand);
  end if;

  if v_upload is null then
    raise exception 'That price list has no supplier file to recalculate from.';
  end if;

  return public.bulk_generate_list(v_upload);
end;
$$;

-- ---------------------------------------------------------------------------
-- The scheduled send posts every brand that has one ready
-- ---------------------------------------------------------------------------
create or replace function private.bulk_scheduled_send()
returns text
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_now    timestamptz := now();
  v_local  timestamp   := v_now at time zone 'Africa/Windhoek';
  v_day    integer     := extract(isodow from v_local);
  v_hour   integer     := extract(hour from v_local);
  v_want_day  integer  := public.bulk_setting('bulk_schedule_day', '1')::integer;
  v_want_hour integer  := split_part(public.bulk_setting('bulk_schedule_time', '08:00'), ':', 1)::integer;
  v_list   record;
  v_cron   record;
  v_reply  jsonb;
  v_done   text[] := '{}';
begin
  if public.bulk_setting('bulk_auto_send', 'false')::boolean is not true then
    return 'auto-send is off';
  end if;
  if v_day <> v_want_day or v_hour <> v_want_hour then
    return format('not the hour (local %s, day %s)', v_hour, v_day);
  end if;

  select * into v_cron from private.bulk_cron where id = 1;

  -- One approved list per brand for this week. A brand with nothing ready is
  -- skipped and said so, rather than holding up the others.
  for v_list in
    select distinct on (l.brand) l.*
    from public.bulk_price_lists l
    where l.status = 'approved'
      and l.week_start = private.windhoek_week_start(v_now)
    order by l.brand, l.id desc
  loop
    if v_list.pdf_path is null then
      v_done := v_done || format('%s: no stored PDF', v_list.brand);
      continue;
    end if;

    if exists (
      select 1 from public.bulk_distributions d
      where d.list_id = v_list.id and d.trigger = 'scheduled'
    ) then
      v_done := v_done || format('%s: already sent', v_list.brand);
      continue;
    end if;

    v_reply := public.bulk_start_distribution(
      v_list.id, null, null, null, v_list.pdf_path, 'scheduled');

    if (v_reply->>'ok') <> 'true' then
      v_done := v_done || format('%s: %s', v_list.brand, coalesce(v_reply->>'message', 'refused'));
      continue;
    end if;

    perform net.http_post(
      url := v_cron.endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', v_cron.secret),
      body := jsonb_build_object(
        'distribution_id', (v_reply->>'distribution_id')::bigint,
        'storage_path', v_list.pdf_path)
    );

    v_done := v_done || format('%s: queued %s recipients', v_list.brand, v_reply->>'recipients');
  end loop;

  if array_length(v_done, 1) is null then
    return 'no approved list for this week — nothing sent';
  end if;
  return array_to_string(v_done, '; ');
end;
$$;

revoke all on function private.bulk_scheduled_send() from public, anon, authenticated;
