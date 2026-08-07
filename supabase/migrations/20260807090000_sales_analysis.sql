-- Sales analysis.
--
-- The dashboard answers "how are we doing". This answers "why", which needs the
-- order lines expanded rather than summed — and expanding them in the browser
-- would mean shipping the whole sales history to render a bar chart.
--
-- Built entirely from CTEs. A first attempt used a temp table and failed: a
-- STABLE function may not write, and the whole point of marking it STABLE is
-- that a reporting query has no business modifying anything.
create or replace function public.sales_analysis(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
  with raw as (
    select
      o.id                                        as order_id,
      o.created_at,
      coalesce(s.cashier_name, 'Online')          as cashier,
      nullif(item ->> 'product_id', '')::bigint   as product_id,
      item ->> 'name'                             as name,
      coalesce((item ->> 'quantity')::numeric, 0) as qty,
      coalesce((item ->> 'price')::numeric, 0)    as unit_price,
      nullif(item ->> 'cost_price', '')::numeric  as line_cost
    from public.orders o
    left join public.till_shifts s on s.id = o.till_shift_id
    cross join lateral jsonb_array_elements(coalesce(o.items, '[]'::jsonb)) as t(item)
    where o.created_at >= p_from
      and o.created_at < p_to
      and o.status in ('Paid', 'Completed', 'Delivered', 'Dispatched')
  ),
  lines as (
    select
      r.order_id,
      r.created_at,
      r.cashier,
      r.name,
      r.qty,
      coalesce(p.category, 'Uncategorised') as category,
      -- Revenue is net of VAT, matching sales_profit, so the two reports agree.
      round(r.unit_price / 1.15 * r.qty, 2) as net,
      round(coalesce(r.line_cost, p.cost_price, 0) * r.qty, 2) as cost
    from raw r
    left join public.products p on p.id = r.product_id
  )
  select case
    when not public.is_admin() then jsonb_build_object('ok', false, 'message', 'Not permitted.')
    else jsonb_build_object(
      'ok', true,
      'order_count',    (select count(distinct order_id) from lines),
      'unit_count',     (select coalesce(sum(qty), 0)::int from lines),
      'average_basket', (select case when count(distinct order_id) > 0
                                then round(sum(net) / count(distinct order_id), 2) else 0 end from lines),
      'top_products',   coalesce((select jsonb_agg(t) from (
                          select name, sum(qty)::int as units,
                                 round(sum(net), 2) as revenue,
                                 round(sum(net - cost), 2) as profit
                          from lines group by name order by 4 desc limit 20) t), '[]'::jsonb),
      'by_category',    coalesce((select jsonb_agg(t) from (
                          select category, sum(qty)::int as units,
                                 round(sum(net), 2) as revenue,
                                 round(sum(net - cost), 2) as profit
                          from lines group by category order by 3 desc) t), '[]'::jsonb),
      'by_cashier',     coalesce((select jsonb_agg(t) from (
                          select cashier, count(distinct order_id)::int as sales,
                                 round(sum(net), 2) as revenue,
                                 round(sum(net - cost), 2) as profit
                          from lines group by cashier order by 3 desc) t), '[]'::jsonb),
      -- Local time, not UTC. "Busiest at 09:00" is worthless if it is really 11.
      'by_hour',        coalesce((select jsonb_agg(t order by t.hour) from (
                          select extract(hour from created_at at time zone 'Africa/Windhoek')::int as hour,
                                 count(distinct order_id)::int as sales,
                                 round(sum(net), 2) as revenue
                          from lines group by 1) t), '[]'::jsonb),
      'by_weekday',     coalesce((select jsonb_agg(t order by t.dow) from (
                          select extract(isodow from created_at at time zone 'Africa/Windhoek')::int as dow,
                                 count(distinct order_id)::int as sales,
                                 round(sum(net), 2) as revenue
                          from lines group by 1) t), '[]'::jsonb)
    )
  end;
$$;

revoke all on function public.sales_analysis(timestamptz, timestamptz) from public, anon;
grant execute on function public.sales_analysis(timestamptz, timestamptz) to authenticated;
