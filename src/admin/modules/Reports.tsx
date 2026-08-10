import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { money, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Notice, Skeleton, StatTile } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

interface SalesAnalysis {
  order_count: number;
  unit_count: number;
  average_basket: number;
  top_products: Array<{ name: string; units: number; revenue: number; profit: number }>;
  by_category: Array<{ category: string; units: number; revenue: number; profit: number }>;
  by_cashier: Array<{ cashier: string; sales: number; revenue: number; profit: number }>;
  by_hour: Array<{ hour: number; sales: number; revenue: number }>;
  by_weekday: Array<{ dow: number; sales: number; revenue: number }>;
}

const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last year', days: 365 },
] as const;

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function useSalesAnalysis(days: number) {
  return useQuery<SalesAnalysis, Error>({
    queryKey: keys.dashboard(`analysis-${days}`),
    staleTime: 120_000,
    queryFn: async () => {
      const to = new Date();
      const from = new Date(to.getTime() - days * 86_400_000);
      const { data, error } = await supabase.rpc('sales_analysis', {
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as SalesAnalysis & { ok: boolean; message?: string };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not build the report.');
      return result;
    },
  });
}

/**
 * Sales analysis.
 *
 * The dashboard says how the shop is doing. This says why — which line earns,
 * which sits, who sells it and when people actually walk in. Trading hours are
 * marked on the hour chart because the useful question is not "when are we
 * busiest" but "are we open at the right times".
 */
export default function Reports() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const report = useSalesAnalysis(range.days);
  const d = report.data;

  const totals = useMemo(() => {
    const revenue = (d?.by_category ?? []).reduce((n, c) => n + Number(c.revenue ?? 0), 0);
    const profit = (d?.by_category ?? []).reduce((n, c) => n + Number(c.profit ?? 0), 0);
    return { revenue, profit, margin: revenue > 0 ? (profit / revenue) * 100 : 0 };
  }, [d]);

  const peakHour = Math.max(1, ...(d?.by_hour ?? []).map((h) => h.sales));
  const peakDay = Math.max(1, ...(d?.by_weekday ?? []).map((w) => w.sales));

  return (
    <>
      <ModuleHeader title="Reports" description="Which lines earn, who sells them, and when." />

      <div className="space-y-5 p-6">
        <nav className="flex flex-wrap gap-1.5" aria-label="Reporting period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r)}
              aria-current={range.id === r.id ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                range.id === r.id
                  ? 'bg-brand-600 text-white'
                  : 'border border-hairline text-ink-muted hover:bg-raised',
              )}
            >
              {r.label}
            </button>
          ))}
        </nav>

        {report.isLoading ? (
          <Skeleton className="h-64 rounded-2xl" />
        ) : report.error ? (
          <Notice tone="danger" title="Could not build the report">{report.error.message}</Notice>
        ) : d ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Sales" value={d.order_count} />
              <StatTile label="Revenue (ex VAT)" value={moneyCompact(totals.revenue)} tone="brand" />
              <StatTile
                label="Gross profit"
                value={moneyCompact(totals.profit)}
                sub={`${totals.margin.toFixed(0)}% margin`}
                tone="success"
              />
              <StatTile label="Average basket" value={money(d.average_basket)} />
            </div>

            {/* ── When people come in ─────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="By hour of day" hint="Shaded hours are when you are open.">
                <div className="flex h-40 items-end gap-1">
                  {Array.from({ length: 24 }, (_, hour) => {
                    const row = d.by_hour.find((h) => h.hour === hour);
                    const sales = row?.sales ?? 0;
                    const open = hour >= 9 && hour < 17;
                    return (
                      <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={cn(
                            'w-full rounded-t transition-colors',
                            sales > 0 ? 'bg-lime-500' : 'bg-hairline',
                            !open && sales > 0 && 'bg-warn',
                          )}
                          style={{ height: `${Math.max((sales / peakHour) * 100, sales > 0 ? 6 : 2)}%` }}
                          title={`${hour}:00 — ${sales} sale${sales === 1 ? '' : 's'}, ${money(row?.revenue ?? 0)}`}
                        />
                        {hour % 6 === 0 && (
                          <span className="tabular text-[0.6rem] text-ink-subtle">{hour}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {d.by_hour.some((h) => h.sales > 0 && (h.hour < 9 || h.hour >= 17)) && (
                  <p className="mt-3 text-xs text-warn">
                    Some sales fall outside 09:00–17:00. Those are online orders, or the trading
                    hours in Settings do not match reality.
                  </p>
                )}
              </Panel>

              <Panel title="By day of week">
                <div className="flex h-40 items-end gap-2">
                  {WEEKDAYS.map((label, index) => {
                    const row = d.by_weekday.find((w) => w.dow === index + 1);
                    const sales = row?.sales ?? 0;
                    return (
                      <div key={label} className="flex flex-1 flex-col items-center gap-1">
                        <div
                          className={cn(
                            'w-full rounded-t',
                            index === 6 ? 'bg-hairline' : sales > 0 ? 'bg-brand-500' : 'bg-hairline',
                          )}
                          style={{ height: `${Math.max((sales / peakDay) * 100, sales > 0 ? 6 : 2)}%` }}
                          title={`${label} — ${sales} sale${sales === 1 ? '' : 's'}, ${money(row?.revenue ?? 0)}`}
                        />
                        <span className="text-[0.65rem] text-ink-subtle">{label}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-subtle">Sunday is greyed — you are closed.</p>
              </Panel>
            </div>

            {/* ── What earns ──────────────────────────────────────── */}
            <Panel title="Best lines by gross profit">
              <Table
                head={['Product', 'Units', 'Revenue', 'Profit']}
                rows={d.top_products.slice(0, 15).map((p) => [
                  p.name,
                  String(p.units),
                  money(p.revenue),
                  money(p.profit),
                ])}
              />
            </Panel>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="By category">
                <Table
                  head={['Category', 'Units', 'Revenue', 'Profit']}
                  rows={d.by_category.map((c) => [
                    c.category,
                    String(c.units),
                    money(c.revenue),
                    money(c.profit),
                  ])}
                />
              </Panel>
              <Panel title="By cashier">
                <Table
                  head={['Cashier', 'Sales', 'Revenue', 'Profit']}
                  rows={d.by_cashier.map((c) => [
                    c.cashier,
                    String(c.sales),
                    money(c.revenue),
                    money(c.profit),
                  ])}
                />
              </Panel>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5">
      <h3 className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{title}</h3>
      {hint && <p className="mb-3 mt-0.5 text-xs text-ink-subtle">{hint}</p>}
      <div className={hint ? '' : 'mt-3'}>{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">Nothing sold in this period.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-0 text-sm md:min-w-[26rem]">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wider text-ink-muted">
            {head.map((h, i) => (
              <th
                key={h}
                className={cn(
                  'py-2 font-bold',
                  i === 0 ? 'text-left' : 'text-right',
                  i === 1 && 'hidden md:table-cell',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/70">
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    'py-2',
                    i === 0 ? 'max-w-[16rem] truncate text-ink' : 'tabular text-right',
                    i === row.length - 1 && 'font-semibold text-ink',
                    i === 1 && 'hidden md:table-cell',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
