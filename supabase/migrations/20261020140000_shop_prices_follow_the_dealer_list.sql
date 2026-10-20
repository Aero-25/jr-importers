-- Shop prices follow the dealer list, by 3% and by hand.
--
-- The dealer list is the better price — that is the point of it. The shop's own
-- price should therefore sit above it, and the shop wants that gap kept at 3%
-- rather than drifting as costs move.
--
-- Two things this deliberately does NOT do.
--
-- It does not write anything on its own. Generating a list leaves products.price
-- alone; the console shows what each price would become and an administrator
-- presses a button. The module was built on the rule that these are special
-- prices which never touch the shop, and reversing that quietly — on a schedule,
-- with no one watching — is not the same decision as reversing it on purpose.
--
-- It does not touch a shop_price list. Ulefone's dealer price is READ FROM
-- products.price, so writing back price + 3% would be read as next week's dealer
-- price and raised 3% again, compounding every Monday until the shop priced
-- itself out of the market. The guard is in bulk_apply_shop_prices, not in the
-- caller, because that is the only place it cannot be forgotten.
--
-- Rounding: the shop's prices are round numbers — 2,500 and 4,200 and 6,000 —
-- and a dealer price plus 3% is not. The target is rounded UP to the nearest
-- bulk_shop_rounding, so the gap is never less than the 3% asked for.

insert into public.settings (key, value) values
  ('bulk_shop_uplift',   to_jsonb(3)),
  ('bulk_shop_rounding', to_jsonb(10))
on conflict (key) do nothing;

-- What each shop price would become. The preview and the write share this, so
-- the number on screen is the number applied.
create or replace function public.bulk_shop_price_preview(p_list_id bigint)
returns table (
  product_id    bigint,
  display_name  text,
  dealer_price  numeric,
  shop_price    numeric,
  target_price  numeric,
  change        numeric
)
language sql
stable
security definer
set search_path to 'public'
as $$
  with settings as (
    select public.bulk_setting('bulk_shop_uplift', '3')::numeric    as uplift,
           public.bulk_setting('bulk_shop_rounding', '10')::numeric as rounding
  ),
  priced as (
    select i.product_id,
           i.display_name,
           i.final_price as dealer_price,
           p.price       as shop_price,
           -- Up to the nearest step, so the gap is never under the uplift
           -- asked for. A rounding of 0 means to the cent.
           case
             when s.rounding > 0
               then ceil(i.final_price * (1 + s.uplift / 100) / s.rounding) * s.rounding
             else round(i.final_price * (1 + s.uplift / 100), 2)
           end as target_price
    from public.bulk_price_list_items i
    join public.products p on p.id = i.product_id
    join public.bulk_price_lists l on l.id = i.list_id
    cross join settings s
    where i.list_id = p_list_id
      -- Never a shop-price list: its dealer price is read from products.price,
      -- so writing back would compound every week.
      and l.pricing_mode = 'calculated'
      and i.product_id is not null
  )
  select product_id, display_name, dealer_price, shop_price, target_price,
         target_price - shop_price as change
  from priced
  order by display_name;
$$;

revoke all on function public.bulk_shop_price_preview(bigint) from public, anon;
grant execute on function public.bulk_shop_price_preview(bigint) to authenticated;

-- Applies it. Nothing happens until somebody calls this.
create or replace function public.bulk_apply_shop_prices(p_list_id bigint)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_mode  text;
  v_brand text;
  v_n     integer;
begin
  if not public.is_admin() then
    raise exception 'Only an administrator may change the shop''s prices.';
  end if;

  select pricing_mode, brand into v_mode, v_brand
  from public.bulk_price_lists where id = p_list_id;

  if v_mode is null then
    raise exception 'That price list does not exist.';
  end if;

  -- The compounding guard. A shop-price list takes its dealer price FROM
  -- products.price; writing price + 3% back would be read as next week's
  -- dealer price and raised again, every Monday, forever.
  if v_mode <> 'calculated' then
    return jsonb_build_object(
      'ok', false,
      'message', format(
        'The %s list is quoted at the shop''s own prices, so raising them would raise the dealer price too, week after week. Change the price on the product instead.',
        v_brand));
  end if;

  with target as (
    select * from public.bulk_shop_price_preview(p_list_id)
  ),
  moved as (
    update public.products p
       set price = t.target_price, updated_at = now()
      from target t
     where p.id = t.product_id
       and p.price is distinct from t.target_price
    returning 1
  )
  select count(*)::integer into v_n from moved;

  return jsonb_build_object(
    'ok', true,
    'updated', v_n,
    'message', case
      when v_n = 0 then 'Every shop price already matched.'
      else format('%s shop price%s updated.', v_n, case when v_n = 1 then '' else 's' end)
    end);
end;
$$;

revoke all on function public.bulk_apply_shop_prices(bigint) from public, anon;
grant execute on function public.bulk_apply_shop_prices(bigint) to authenticated;
