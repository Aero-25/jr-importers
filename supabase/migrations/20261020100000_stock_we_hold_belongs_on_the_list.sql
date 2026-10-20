-- Stock the shop holds belongs on the list, whether the supplier quoted it or not.
--
-- The supplier's sheet is this week's offer, not an inventory of the shop. A
-- Samsung A26 128GB sitting on the shelf was simply absent from the list that
-- went out, which is the one handset a dealer could have had today.
--
-- Seven were missing on the first real run: A26 128GB, A26 256GB, A05s 64GB,
-- A05s 128GB, A17 256GB (seven units of it), A36 256GB and A56 128GB.
--
-- Their cost is pulled through and run through exactly the same calculation, so
-- a line's price does not depend on which of the two places it came from.
--
-- The one thing that must not go wrong: products.cost_price for a Samsung
-- ALREADY carries the 16.5% import VAT — that is how the catalogue was loaded,
-- and it checks out to the cent against the supplier's own figures (A26 128GB
-- is 4,194.00, which is 3,600.00 plus 16.5%). Treating that as a raw cost and
-- adding import VAT on top would overprice every one of these by 16.5%. So the
-- import VAT is backed out first and the normal chain puts it back.

-- A handset's name, built the same way whichever side it came from, so the list
-- does not read as two lists stapled together.
create or replace function private.describe_handset(
  p_model text, p_storage integer, p_five_g boolean
)
returns text
language sql
immutable
as $$
  select 'Samsung Galaxy '
    || case
         -- "Z-FOLD 7" -> "Z Fold 7"
         when p_model ~ '^Z-(FOLD|FLIP) ' then
           'Z ' || initcap(split_part(substring(p_model from 3), ' ', 1))
                || ' ' || split_part(p_model, ' ', 2)
         -- "S26 ULTRA" -> "S26 Ultra"; FE is an initialism and stays shouted.
         when p_model ~ '^[ASMF]\d{2,3} (FE|PLUS|ULTRA|LITE)$' then
           split_part(p_model, ' ', 1) || ' '
           || case when split_part(p_model, ' ', 2) = 'FE' then 'FE'
                   else initcap(split_part(p_model, ' ', 2)) end
         -- "A04S" -> "A04s": a trailing letter is part of the model.
         when p_model ~ '^[ASMF]\d{2,3}[A-Z]$' then
           left(p_model, length(p_model) - 1) || lower(right(p_model, 1))
         else p_model
       end
    || ' ' || p_storage || 'GB'
    || case when p_five_g then ' 5G' else '' end;
$$;

revoke all on function private.describe_handset(text, integer, boolean)
  from public, anon, authenticated;

create or replace function public.bulk_generate_list(p_upload_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_import  numeric := public.bulk_setting('bulk_import_vat_rate', '0.165')::numeric;
  v_sales   numeric := public.bulk_setting('bulk_sales_vat_rate', '0.15')::numeric;
  v_default numeric := public.bulk_setting('bulk_default_markup', '22')::numeric;
  v_list_id bigint;
  v_week    date := private.windhoek_week_start();
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may generate a price list.';
  end if;
  if not exists (select 1 from public.bulk_supplier_uploads where id = p_upload_id) then
    raise exception 'That upload does not exist.';
  end if;

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
    v_list_id, p.variant_key, p.display_name, p.model, p.storage_gb, p.five_g,
    p.cost, p.import_vat, p.landed, p.markup,
    p.excl, p.vat, p.excl + p.vat,
    p.stock_status, p.stock_qty, p.product_id
  from (
    select
      m.*,
      -- Rounded once, here; every later step uses this figure and not the
      -- fraction behind it, so the landed cost the workbook prints is the one
      -- the price was worked out from.
      round(m.cost * v_import, 2)                                   as import_vat,
      round(m.cost + m.cost * v_import, 2)                          as landed,
      round(round(m.cost + m.cost * v_import, 2)
            * (1 + m.markup / 100), 2)                              as excl,
      round(round(round(m.cost + m.cost * v_import, 2)
            * (1 + m.markup / 100), 2) * v_sales, 2)                as vat
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
        case when coalesce(st.qty, 0) > 0 then 'in_stock' else 'on_order' end as stock_status,
        st.product_id
      from (
        (
        -- What the supplier quoted this week.
        select distinct on (private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer))
               private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer) as variant_key,
               r.value->>'display_name'                       as display_name,
               r.value->>'model'                              as model,
               (r.value->>'storage_gb')::integer              as storage_gb,
               coalesce((r.value->>'five_g')::boolean, false)  as five_g,
               round((r.value->>'supplier_cost')::numeric, 2)  as cost
        from public.bulk_supplier_uploads u
        cross join lateral jsonb_array_elements(u.rows) as r(value)
        where u.id = p_upload_id
          and nullif(r.value->>'model', '') is not null
          and coalesce((r.value->>'supplier_cost')::numeric, 0) > 0
        order by private.variant_key(r.value->>'model', (r.value->>'storage_gb')::integer),
                 (r.value->>'supplier_cost')::numeric

        )
        union all
        (

        -- And what the shop is holding that the supplier did not quote. The
        -- sheet is this week's offer, not a stocktake.
        select distinct on (private.variant_key(ph.model, ph.storage_gb))
               private.variant_key(ph.model, ph.storage_gb) as variant_key,
               private.describe_handset(ph.model, ph.storage_gb, ph.five_g) as display_name,
               ph.model,
               ph.storage_gb,
               ph.five_g,
               -- Back out the import VAT the catalogue cost already carries, so
               -- the chain below can put it back exactly once.
               round(pr.cost_price / (1 + v_import), 2) as cost
        from public.products pr
        cross join lateral private.parse_handset(pr.name) ph
        where pr.active
          and private.is_samsung_phone(pr.name)
          and ph.model is not null
          and ph.storage_gb is not null
          and coalesce(pr.cost_price, 0) > 0
          and (case
                 when exists (select 1 from public.product_imeis i where i.product_id = pr.id)
                 then (select count(*) from public.product_imeis i
                        where i.product_id = pr.id and i.status = 'available')
                 else greatest(coalesce(pr.stock, 0), 0)
               end) > 0
          -- Only where the supplier did not quote it; their price is this
          -- week's and the catalogue's is whenever it was last bought.
          and not exists (
            select 1
            from public.bulk_supplier_uploads u2
            cross join lateral jsonb_array_elements(u2.rows) as r2(value)
            where u2.id = p_upload_id
              and private.variant_key(r2.value->>'model', (r2.value->>'storage_gb')::integer)
                  = private.variant_key(ph.model, ph.storage_gb)
          )
        order by private.variant_key(ph.model, ph.storage_gb), pr.id
        )
      ) k
      left join public.bulk_variant_markups mk on mk.variant_key = k.variant_key
      left join lateral (
        select pr.id as product_id,
               case
                 when exists (select 1 from public.product_imeis i where i.product_id = pr.id)
                 then (select count(*)::integer from public.product_imeis i
                        where i.product_id = pr.id and i.status = 'available')
                 else greatest(coalesce(pr.stock, 0), 0)
               end as qty
        from public.products pr
        cross join lateral private.parse_handset(pr.name) ph
        where pr.active
          and private.is_samsung_phone(pr.name)
          and private.variant_key(ph.model, ph.storage_gb) = k.variant_key
        order by pr.id
        limit 1
      ) st on true
    ) m
  ) p;

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

revoke all on function public.bulk_generate_list(bigint) from public, anon;
grant execute on function public.bulk_generate_list(bigint) to authenticated;
