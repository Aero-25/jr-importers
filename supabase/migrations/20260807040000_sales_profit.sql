-- Gross profit reporting.
--
-- The dashboard could only show turnover, so a record day on takings and a day
-- that lost money looked identical. Cost prices are captured on every product,
-- so the margin was always computable — it just was not being computed.
--
-- Done in SQL rather than the browser because it has to expand every line of
-- every order in the period and join each one to its product. Pulling that down
-- to the client would mean shipping the whole sales history to render four
-- numbers.
--
-- Two honesty notes about the figures this returns:
--
--   * Revenue is taken net of VAT. VAT collected is not income, and a margin
--     computed against the inclusive price flatters itself by 15%.
--   * Cost uses the line's own cost_price where the sale recorded one, and
--     falls back to the product's current cost otherwise. Older sales made
--     before the POS started stamping cost onto the line are therefore valued
--     at today's cost. `costed_lines` and `total_lines` are returned so the
--     screen can say how much of the figure is exact.

create or replace function public.sales_profit(
  p_from timestamptz,
  p_to   timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_revenue_inc numeric(14,2);
  v_revenue_net numeric(14,2);
  v_cost numeric(14,2);
  v_orders integer;
  v_lines integer;
  v_costed integer;
  v_refunds_inc numeric(14,2);
  v_refund_cost numeric(14,2);
  v_top jsonb;
begin
  if not public.is_admin() then
    return jsonb_build_object('ok', false, 'message', 'Not permitted.');
  end if;

  select
    coalesce(sum(o.total_amount), 0),
    coalesce(sum(coalesce(o.subtotal_amount, o.total_amount / 1.15)), 0),
    count(*)
  into v_revenue_inc, v_revenue_net, v_orders
  from public.orders o
  where o.created_at >= p_from
    and o.created_at < p_to
    and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched');

  with lines as (
    select
      nullif(item ->> 'product_id', '')::bigint as product_id,
      coalesce((item ->> 'quantity')::numeric, 0) as qty,
      nullif(item ->> 'cost_price', '')::numeric as line_cost
    from public.orders o
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t(item)
    where o.created_at >= p_from
      and o.created_at < p_to
      and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched')
  )
  select
    coalesce(sum(l.qty * coalesce(l.line_cost, p.cost_price, 0)), 0),
    count(*),
    count(*) filter (where l.line_cost is not null or p.cost_price is not null)
  into v_cost, v_lines, v_costed
  from lines l
  left join public.products p on p.id = l.product_id;

  -- Refunds reverse both sides: the money goes back, and anything restocked is
  -- no longer a cost of sale.
  select coalesce(sum(r.total_amount), 0)
  into v_refunds_inc
  from public.refunds r
  where r.status = 'Approved'
    and r.approved_at >= p_from
    and r.approved_at < p_to;

  with refund_lines as (
    select
      nullif(item ->> 'product_id', '')::bigint as product_id,
      coalesce((item ->> 'quantity')::numeric, 0) as qty
    from public.refunds r
    cross join lateral jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) as t(item)
    where r.status = 'Approved'
      and r.approved_at >= p_from
      and r.approved_at < p_to
      and coalesce((item ->> 'restock')::boolean, true)
  )
  select coalesce(sum(rl.qty * coalesce(p.cost_price, 0)), 0)
  into v_refund_cost
  from refund_lines rl
  left join public.products p on p.id = rl.product_id;

  v_revenue_inc := v_revenue_inc - v_refunds_inc;
  v_revenue_net := v_revenue_net - round(v_refunds_inc / 1.15, 2);
  v_cost := v_cost - v_refund_cost;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_top
  from (
    select
      p.name,
      sum(l.qty)::int as units,
      round(sum(l.qty * (l.price - coalesce(l.line_cost, p.cost_price, 0))), 2) as profit
    from (
      select
        nullif(item ->> 'product_id', '')::bigint as product_id,
        coalesce((item ->> 'quantity')::numeric, 0) as qty,
        coalesce((item ->> 'price')::numeric, 0) / 1.15 as price,
        nullif(item ->> 'cost_price', '')::numeric as line_cost
      from public.orders o
      cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t2(item)
      where o.created_at >= p_from
        and o.created_at < p_to
        and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched')
    ) l
    join public.products p on p.id = l.product_id
    group by p.name
    order by profit desc
    limit 5
  ) t;

  return jsonb_build_object(
    'ok', true,
    'revenue_inc', round(v_revenue_inc, 2),
    'revenue_net', round(v_revenue_net, 2),
    'cost_of_sales', round(v_cost, 2),
    'gross_profit', round(v_revenue_net - v_cost, 2),
    'margin_pct', case
      when v_revenue_net > 0 then round(((v_revenue_net - v_cost) / v_revenue_net) * 100, 1)
      else 0
    end,
    'refunds', round(v_refunds_inc, 2),
    'order_count', v_orders,
    'total_lines', v_lines,
    'costed_lines', v_costed,
    'top_products', v_top
  );
end;
$$;

revoke all on function public.sales_profit(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_profit(timestamptz, timestamptz) to authenticated;
