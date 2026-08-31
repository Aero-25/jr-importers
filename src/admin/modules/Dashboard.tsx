import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, Coins, Package, Receipt, ShoppingCart, TrendingUp, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { OPEN_ORDER_STATUSES } from '@/lib/constants';
import { formatDate, money, moneyCompact, round2 } from '@/lib/format';
import { useSalesProfit, startOfMonth as monthStart, startOfToday as todayStart } from '@/data/profit';
import { Card, ErrorState, Notice, StatTile, StatusBadge, Skeleton } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

interface DashboardData {
  todayRevenue: number;
  todayOrders: number;
  monthRevenue: number;
  openOrders: number;
  customers: number;
  lowStock: Array<{ id: number; name: string; stock: number; reorder_level: number }>;
  recentOrders: Array<{
    id: string;
    customer_name: string | null;
    total_amount: number;
    status: string;
    created_at: string;
  }>;
}

function useDashboard() {
  return useQuery<DashboardData, Error>({
    queryKey: keys.dashboard('today'),
    staleTime: 60_000,
    queryFn: async () => {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const [monthSales, openOrders, customerCount, lowStock, recent] = await Promise.all([
        supabase
          .from('orders')
          .select('total_amount, created_at')
          .gte('created_at', startOfMonth.toISOString())
          .in('status', ['Paid', 'Completed', 'Delivered', 'Dispatched'])
          // Without an explicit limit PostgREST caps at its default (1000)
          // and a busy month would silently under-report revenue.
          .limit(10000),
        supabase
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .in('status', [...OPEN_ORDER_STATUSES]),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        supabase
          .from('products')
          .select('id, name, stock, reorder_level')
          .eq('active', true)
          .order('stock', { ascending: true })
          .limit(60),
        supabase
          .from('orders')
          .select('id, customer_name, total_amount, status, created_at')
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      if (monthSales.error) throw new Error(monthSales.error.message);
      // A failed count would otherwise render as "0 open orders" — a
      // confident lie, where an error state at least says "unknown".
      if (openOrders.error) throw new Error(openOrders.error.message);
      if (customerCount.error) throw new Error(customerCount.error.message);
      if (lowStock.error) throw new Error(lowStock.error.message);
      if (recent.error) throw new Error(recent.error.message);

      const monthRows = monthSales.data ?? [];
      const todayRows = monthRows.filter((row) => row.created_at >= startOfToday.toISOString());

      return {
        todayRevenue: round2(todayRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)),
        todayOrders: todayRows.length,
        monthRevenue: round2(monthRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0)),
        openOrders: openOrders.count ?? 0,
        customers: customerCount.count ?? 0,
        // The reorder threshold is per-product, so the filter cannot be pushed
        // into the query — Postgres would need a column-to-column comparison.
        lowStock: (lowStock.data ?? []).filter((p) => p.stock <= p.reorder_level).slice(0, 8),
        recentOrders: recent.data ?? [],
      };
    },
  });
}

export default function Dashboard() {
  const { data, isLoading, isError, error, refetch } = useDashboard();

  const now = new Date();
  const today = useSalesProfit(todayStart(), now, 'today');
  const month = useSalesProfit(monthStart(), now, 'month');

  if (isError) {
    return (
      <>
        <ModuleHeader title="Dashboard" />
        <div className="p-6">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
      </>
    );
  }

  return (
    <>
      <ModuleHeader title="Dashboard" description="How the shop is trading right now." />

      <div className="space-y-6 p-6">
        {/* Says so plainly when the margin cannot be trusted, rather than
            printing a proud number derived from missing cost prices. */}
        {month.data && month.data.costed_lines < month.data.total_lines && (
          <Notice tone="warn" title="Some sales have no cost price behind them">
            {month.data.total_lines - month.data.costed_lines} of {month.data.total_lines} lines sold
            this month could not be matched to a product cost, so they are counted as pure profit.
            The real margin is lower than shown.
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-card" />)
          ) : (
            <>
              <StatTile
                label="Revenue today"
                value={money(data!.todayRevenue)}
                sub={`${data!.todayOrders} sale${data!.todayOrders === 1 ? '' : 's'}`}
                icon={<TrendingUp className="h-4 w-4" />}
                tone="success"
              />
              {/* Turnover and profit sit next to each other deliberately: a
                  record day on takings and a day that lost money look identical
                  until the second number is on the screen. */}
              <StatTile
                label="Gross profit today"
                value={today.isLoading ? '—' : money(today.data?.gross_profit ?? 0)}
                sub={
                  today.data && today.data.revenue_net > 0
                    ? `${today.data.margin_pct}% margin`
                    : 'No sales yet'
                }
                icon={<Coins className="h-4 w-4" />}
                tone="success"
              />
              <StatTile
                label="Revenue this month"
                value={moneyCompact(data!.monthRevenue)}
                icon={<Receipt className="h-4 w-4" />}
                tone="brand"
              />
              <StatTile
                label="Gross profit this month"
                value={month.isLoading ? '—' : moneyCompact(month.data?.gross_profit ?? 0)}
                sub={
                  month.data && month.data.revenue_net > 0
                    ? `${month.data.margin_pct}% margin · cost ${moneyCompact(month.data.cost_of_sales)}`
                    : 'No sales yet'
                }
                icon={<Coins className="h-4 w-4" />}
                tone="success"
              />
              <StatTile
                label="Open orders"
                value={data!.openOrders}
                sub="Awaiting fulfilment"
                icon={<ShoppingCart className="h-4 w-4" />}
                tone={data!.openOrders > 0 ? 'warn' : 'neutral'}
              />
              <StatTile
                label="Customers"
                value={data!.customers}
                icon={<Users className="h-4 w-4" />}
              />
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                <AlertTriangle aria-hidden className="h-4 w-4 text-warn" />
                Needs reordering
              </h2>
              <Link to="/products" className="text-xs text-brand-400 hover:underline">
                All products →
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : data!.lowStock.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">
                Every product is above its reorder level.
              </p>
            ) : (
              <ul className="divide-y divide-hairline">
                {data!.lowStock.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="truncate text-sm text-ink">{product.name}</span>
                    <span
                      className={cnStock(product.stock)}
                      title={`Reorder level ${product.reorder_level}`}
                    >
                      {product.stock === 0 ? 'Out of stock' : `${product.stock} left`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-hairline px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-display text-base font-semibold text-ink">
                <Package aria-hidden className="h-4 w-4 text-brand-400" />
                Latest orders
              </h2>
              <Link to="/orders" className="text-xs text-brand-400 hover:underline">
                All orders →
              </Link>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : data!.recentOrders.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-ink-muted">No orders yet.</p>
            ) : (
              <ul className="divide-y divide-hairline">
                {data!.recentOrders.map((order) => (
                  <li key={order.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {order.customer_name ?? 'Walk-in customer'}
                      </p>
                      <p className="text-xs text-ink-subtle">{formatDate(order.created_at)}</p>
                    </div>
                    <StatusBadge status={order.status} size="sm" />
                    <span className="tabular w-24 shrink-0 text-right text-sm font-medium text-ink">
                      {money(order.total_amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function cnStock(stock: number): string {
  return stock === 0
    ? 'tabular shrink-0 text-xs font-medium text-danger'
    : 'tabular shrink-0 text-xs font-medium text-warn';
}
