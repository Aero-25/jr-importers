/*
  Let a coupon apply to the whole shop or to named products only.

  `product_ids` null or empty means every product, so every coupon already
  issued keeps behaving exactly as it did.

  The scope is enforced in `validate_coupon`, not in the browser. The client
  sends the cart; the function decides which lines qualify and discounts only
  those. A percentage applies to the eligible subtotal, and a fixed amount is
  capped at it — otherwise "N$500 off the Armor 27" would take N$500 off a
  basket containing a N$120 cable.

  `p_items` is optional and defaults to null. An older client that has not
  been reloaded yet still calls the two-argument form; rather than silently
  granting an unscoped discount, a scoped coupon with no cart to check is
  refused and asks the cashier to reload.
*/

alter table public.coupons
  add column if not exists product_ids bigint[];

comment on column public.coupons.product_ids is
  'Products this coupon applies to. Null or empty means the whole catalogue.';

create or replace function public.validate_coupon(
  p_code text,
  p_cart_total numeric,
  p_items jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c public.coupons%rowtype;
  discount_amount numeric(12,2);
  v_eligible numeric(12,2);
  v_scoped boolean;
begin
  select * into c
  from public.coupons
  where upper(code) = upper(trim(p_code))
    and active = true
    and (valid_from is null or valid_from <= now())
    and (valid_until is null or valid_until >= now())
    and (max_uses is null or times_used < max_uses)
  limit 1;

  if not found then
    return jsonb_build_object('valid', false, 'message', 'Coupon is invalid or expired');
  end if;

  -- Minimum spend is still measured against the whole basket: it is a
  -- condition of using the coupon, not part of what it discounts.
  if p_cart_total < c.min_purchase then
    return jsonb_build_object('valid', false, 'message', 'Minimum purchase not met');
  end if;

  v_scoped := c.product_ids is not null and array_length(c.product_ids, 1) > 0;

  if not v_scoped then
    v_eligible := p_cart_total;
  elsif p_items is null then
    -- A scoped coupon cannot be judged without the basket. Refusing is the
    -- safe failure: the alternative discounts everything.
    return jsonb_build_object(
      'valid', false,
      'message', 'This coupon applies to selected products only. Reload the page and try again.'
    );
  else
    select coalesce(sum(
             round(coalesce((item->>'price')::numeric, 0)
                   * greatest(coalesce((item->>'quantity')::numeric, 1), 0), 2)
           ), 0)
      into v_eligible
    from jsonb_array_elements(p_items) as t(item)
    where nullif(item->>'product_id', '') is not null
      and (item->>'product_id')::bigint = any (c.product_ids);

    if v_eligible <= 0 then
      return jsonb_build_object(
        'valid', false,
        'message', 'This coupon does not apply to anything in the basket'
      );
    end if;
  end if;

  if c.discount_type = 'fixed' then
    discount_amount := least(c.discount_value, v_eligible);
  else
    discount_amount := round(v_eligible * (c.discount_value / 100), 2);
  end if;

  return jsonb_build_object(
    'valid', true,
    'coupon_id', c.id,
    'code', c.code,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'discount_amount', discount_amount,
    'scoped', v_scoped,
    'eligible_total', v_eligible
  );
end;
$function$;

/*
  Drop the old two-argument version.

  Leaving both meant `validate_coupon(text, numeric)` matched two candidates
  and Postgres refused to choose — which would have failed every coupon check
  on the live site, including from clients that had not reloaded. The new
  function defaults `p_items`, so it answers both call shapes on its own.
*/
drop function if exists public.validate_coupon(p_code text, p_cart_total numeric);
