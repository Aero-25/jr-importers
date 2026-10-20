-- Not on the shelf means on order, not out of stock.
--
-- Every handset on this list comes off a supplier price list the shop can order
-- from, so "out of stock" is the wrong word: it tells a dealer the phone cannot
-- be had, when in fact it arrives with the next order. The only distinction
-- that matters to someone reading the list is whether JR Importers can hand it
-- over today or has to bring it in.
--
-- That also makes the purchase-order lookup redundant. It existed to separate
-- "we have actually ordered this" from "we have not", a difference the list
-- never showed and the reader never needed, and it cost a scan of every open
-- purchase order's items for every line.
--
-- 'out_of_stock' stays permitted by the check constraint so old rows remain
-- valid, but nothing produces it any more and every label reads "On order".

create or replace function public.bulk_generate_list(p_upload_id bigint)
returns bigint
language plpgsql
security definer
set search_path to 'public', 'private'
as $$
declare
  v_import  numeric := public.bulk_setting('bulk_import_vat_rate', '0.17')::numeric;
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
      round(m.cost * v_import, 2)                                   as import_vat,
      round(m.cost + m.cost * v_import, 2)                          as landed,
      round((m.cost + m.cost * v_import) * (1 + m.markup / 100), 2) as excl,
      round(round((m.cost + m.cost * v_import)
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
        -- On the shelf, or coming in. There is no third answer worth printing.
        case when coalesce(st.qty, 0) > 0 then 'in_stock' else 'on_order' end as stock_status,
        st.product_id
      from (
        -- One row per variant. Where the supplier lists the same model and
        -- storage twice (two RAM builds of one handset), the cheaper cost wins.
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
      ) k
      left join public.bulk_variant_markups mk on mk.variant_key = k.variant_key
      -- The shop's own stock, matched through the same key. A serialised
      -- handset counts its available units; anything else trusts the count on
      -- the product row.
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

-- Lists already generated said the wrong word. Correcting the label on a draft
-- is a correction; none of these have been sent.
update public.bulk_price_list_items
   set stock_status = 'on_order'
 where stock_status = 'out_of_stock';

update public.bulk_price_lists l
   set on_order_count = (select count(*) from public.bulk_price_list_items i
                          where i.list_id = l.id and i.stock_status <> 'in_stock');
