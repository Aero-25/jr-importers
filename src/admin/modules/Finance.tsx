import { useState } from 'react';
import { Lock, LockOpen, Receipt, TrendingDown, Users, Warehouse } from 'lucide-react';
import {
  useClosePeriod,
  useDebtorsAgeing,
  usePeriods,
  useReopenPeriod,
  useStockValuation,
  useSupplierRecon,
  useVatReturn,
} from '@/data/finance';
import { formatDate, money, moneyCompact } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, Input, Modal, Notice, Skeleton, StatTile, Textarea, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

type Tab = 'vat' | 'stock' | 'debtors' | 'suppliers' | 'periods';

const TABS: Array<{ id: Tab; label: string; icon: typeof Receipt }> = [
  { id: 'vat', label: 'VAT return', icon: Receipt },
  { id: 'stock', label: 'Stock valuation', icon: Warehouse },
  { id: 'debtors', label: 'Debtors', icon: Users },
  { id: 'suppliers', label: 'Suppliers', icon: TrendingDown },
  { id: 'periods', label: 'Period close', icon: Lock },
];

/** First and last day of the month n months back, as ISO dates. */
function monthRange(monthsBack = 0): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
  const to = new Date(now.getFullYear(), now.getMonth() - monthsBack + 1, 0);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export default function Finance() {
  const [tab, setTab] = useState<Tab>('vat');

  return (
    <>
      <ModuleHeader
        title="Finance"
        description="What you owe, what you hold, who owes you — and closing the books on it."
      />

      <div className="space-y-5 p-6">
        <nav className="flex flex-wrap gap-1.5" aria-label="Finance reports">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-brand-600 text-white'
                  : 'border border-hairline text-ink-muted hover:bg-raised',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        {tab === 'vat' && <VatPanel />}
        {tab === 'stock' && <StockPanel />}
        {tab === 'debtors' && <DebtorsPanel />}
        {tab === 'suppliers' && <SuppliersPanel />}
        {tab === 'periods' && <PeriodsPanel />}
      </div>
    </>
  );
}

/* ── VAT ─────────────────────────────────────────────────────────────────── */

function VatPanel() {
  const last = monthRange(1);
  const [from, setFrom] = useState(last.from);
  const [to, setTo] = useState(monthRange(0).to);
  const vat = useVatReturn(from, to);

  return (
    <section className="space-y-4">
      <Notice tone="info">
        Namibian VAT returns run in two-month periods. Output VAT is taken out of sales less
        refunds; input VAT out of goods received and expenses marked tax deductible.
      </Notice>

      <div className="flex flex-wrap gap-3">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {vat.isLoading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : vat.error ? (
        <Notice tone="danger" title="Could not build the return">{vat.error.message}</Notice>
      ) : vat.data ? (
        <>
          <div
            className={cn(
              'rounded-2xl px-6 py-5 text-white',
              vat.data.payable >= 0 ? 'bg-brand-600' : 'bg-success',
            )}
          >
            <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/70">
              {vat.data.payable >= 0 ? 'VAT payable' : 'VAT refundable'}
            </p>
            <p className="tabular font-display text-4xl font-bold">
              {money(Math.abs(vat.data.payable))}
            </p>
            <p className="mt-1 text-sm text-white/80">
              {formatDate(vat.data.period_from)} to {formatDate(vat.data.period_to)} · at{' '}
              {(vat.data.rate * 100).toFixed(0)}%
            </p>
          </div>

          {!vat.data.period_locked && (
            <Notice tone="warn" title="This period is still open">
              Figures can still change. Close the period before filing so the number you submit is
              the number the system keeps.
            </Notice>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Block
              title="Output VAT — what you collected"
              rows={[
                ['Sales including VAT', money(vat.data.sales_inc)],
                ['Less refunds', `− ${money(vat.data.refunds_inc)}`],
                ['Net sales', money(vat.data.net_sales_inc)],
              ]}
              total={['Output VAT', money(vat.data.output_vat)]}
            />
            <Block
              title="Input VAT — what you paid"
              rows={[
                ['Goods received', money(vat.data.purchases_inc)],
                ['Deductible expenses', money(vat.data.expenses_inc)],
              ]}
              total={['Input VAT', money(vat.data.input_vat)]}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function Block({
  title,
  rows,
  total,
}: {
  title: string;
  rows: Array<[string, string]>;
  total: [string, string];
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <h3 className="mb-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
        {title}
      </h3>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-ink-muted">{label}</dt>
            <dd className="tabular">{value}</dd>
          </div>
        ))}
        <div className="flex justify-between border-t border-hairline pt-2 font-bold text-ink">
          <dt>{total[0]}</dt>
          <dd className="tabular">{total[1]}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ── Stock ───────────────────────────────────────────────────────────────── */

function StockPanel() {
  const [days, setDays] = useState(90);
  const val = useStockValuation(days);

  return (
    <section className="space-y-4">
      <Notice tone="info">
        Repairs are excluded. They are carried as products with a sentinel quantity so the till can
        ring them up, and counting them would put about a million dollars of imaginary value here.
      </Notice>

      {val.isLoading ? (
        <Skeleton className="h-56 rounded-2xl" />
      ) : val.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Value at cost" value={moneyCompact(val.data.total_at_cost)} tone="brand" />
            <StatTile label="Units on hand" value={val.data.total_units} />
            <StatTile
              label={`Not sold in ${days} days`}
              value={moneyCompact(val.data.dead_value)}
              tone={val.data.dead_value > 0 ? 'danger' : 'success'}
            />
          </div>

          <div className="overflow-x-auto rounded-2xl border border-hairline">
            <table className="w-full min-w-[32rem] text-sm">
              <thead>
                <tr className="border-b border-hairline bg-raised/60 text-2xs uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-2.5 text-left font-bold">Category</th>
                  <th className="px-4 py-2.5 text-right font-bold">Units</th>
                  <th className="px-4 py-2.5 text-right font-bold">At cost</th>
                  <th className="px-4 py-2.5 text-right font-bold">At retail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70">
                {val.data.by_category.map((c) => (
                  <tr key={c.category}>
                    <td className="px-4 py-2.5 text-ink">{c.category}</td>
                    <td className="tabular px-4 py-2.5 text-right">{c.units}</td>
                    <td className="tabular px-4 py-2.5 text-right font-medium">{money(c.value)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-ink-muted">{money(c.retail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <h3 className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
                Dead stock
              </h3>
              {[30, 60, 90, 180].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    days === d ? 'bg-lime-500 text-brand-800' : 'border border-hairline text-ink-muted',
                  )}
                >
                  {d} days
                </button>
              ))}
            </div>
            {val.data.dead_stock.length === 0 ? (
              <p className="text-sm text-success">Everything has moved inside the window.</p>
            ) : (
              <ul className="divide-y divide-hairline/70 rounded-2xl border border-hairline">
                {val.data.dead_stock.slice(0, 25).map((d) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
                    <span className="tabular text-xs text-ink-subtle">
                      {d.stock} on hand · {d.last_sold ? `last sold ${formatDate(d.last_sold)}` : 'never sold'}
                    </span>
                    <span className="tabular shrink-0 font-semibold text-danger">{money(d.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </section>
  );
}

/* ── Debtors ─────────────────────────────────────────────────────────────── */

function DebtorsPanel() {
  const ageing = useDebtorsAgeing();
  const rows = ageing.data?.rows ?? [];
  const total = rows.reduce((n, r) => n + Number(r.total ?? 0), 0);
  const overdue = rows.reduce((n, r) => n + Number(r.d90_plus ?? 0), 0);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Owed to you" value={money(total)} tone="brand" />
        <StatTile label="Accounts" value={rows.length} />
        <StatTile label="Over 90 days" value={money(overdue)} tone={overdue > 0 ? 'danger' : 'success'} />
      </div>

      {ageing.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-success">Nobody owes you anything.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full min-w-[40rem] text-sm">
            <thead>
              <tr className="border-b border-hairline bg-raised/60 text-2xs uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2.5 text-left font-bold">Customer</th>
                <th className="px-4 py-2.5 text-right font-bold">Current</th>
                <th className="px-4 py-2.5 text-right font-bold">31–60</th>
                <th className="px-4 py-2.5 text-right font-bold">61–90</th>
                <th className="px-4 py-2.5 text-right font-bold">90+</th>
                <th className="px-4 py-2.5 text-right font-bold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/70">
              {rows.map((r) => (
                <tr key={`${r.customer}-${r.phone}`}>
                  <td className="px-4 py-2.5">
                    <p className="text-ink">{r.customer}</p>
                    <p className="text-xs text-ink-subtle">{r.phone ?? '—'}</p>
                  </td>
                  <td className="tabular px-4 py-2.5 text-right">{money(r.d30)}</td>
                  <td className="tabular px-4 py-2.5 text-right">{money(r.d60)}</td>
                  <td className="tabular px-4 py-2.5 text-right text-warn">{money(r.d90)}</td>
                  <td className="tabular px-4 py-2.5 text-right font-semibold text-danger">
                    {money(r.d90_plus)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-bold">{money(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Suppliers ───────────────────────────────────────────────────────────── */

function SuppliersPanel() {
  const year = new Date().getFullYear();
  const [from, setFrom] = useState(`${year}-01-01`);
  const [to, setTo] = useState(`${year}-12-31`);
  const recon = useSupplierRecon(from, to);
  const rows = recon.data?.rows ?? [];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>

      {recon.isLoading ? (
        <Skeleton className="h-40 rounded-2xl" />
      ) : rows.length === 0 ? (
        <Notice tone="info" title="No deliveries in this period">
          Book one in under Goods received and it will reconcile here.
        </Notice>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline">
          <table className="w-full min-w-[38rem] text-sm">
            <thead>
              <tr className="border-b border-hairline bg-raised/60 text-2xs uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2.5 text-left font-bold">Supplier</th>
                <th className="px-4 py-2.5 text-right font-bold">Deliveries</th>
                <th className="px-4 py-2.5 text-right font-bold">Received</th>
                <th className="px-4 py-2.5 text-right font-bold">Paid</th>
                <th className="px-4 py-2.5 text-right font-bold">Difference</th>
                <th className="px-4 py-2.5 text-left font-bold">Needs attention</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/70">
              {rows.map((r) => {
                const diff = Number(r.received ?? 0) - Number(r.paid ?? 0);
                return (
                  <tr key={r.supplier}>
                    <td className="px-4 py-2.5 text-ink">{r.supplier}</td>
                    <td className="tabular px-4 py-2.5 text-right">{r.deliveries}</td>
                    <td className="tabular px-4 py-2.5 text-right">{money(r.received)}</td>
                    <td className="tabular px-4 py-2.5 text-right text-ink-muted">{money(r.paid)}</td>
                    <td
                      className={cn(
                        'tabular px-4 py-2.5 text-right font-semibold',
                        Math.abs(diff) > 0.005 ? 'text-warn' : 'text-success',
                      )}
                    >
                      {money(diff)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {r.unposted > 0 && (
                          <Badge tone="warn" size="sm">{r.unposted} not in stock</Badge>
                        )}
                        {r.no_invoice_no > 0 && (
                          <Badge tone="neutral" size="sm">{r.no_invoice_no} no invoice no.</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/* ── Period close ────────────────────────────────────────────────────────── */

function PeriodsPanel() {
  const toast = useToast();
  const periods = usePeriods();
  const close = useClosePeriod();
  const reopen = useReopenPeriod();

  const last = monthRange(1);
  const [from, setFrom] = useState(last.from);
  const [to, setTo] = useState(last.to);
  const [reopening, setReopening] = useState<number | null>(null);
  const [reason, setReason] = useState('');

  async function doClose() {
    try {
      await close.mutateAsync({ from, to });
      toast.success('Period closed', 'Orders, refunds, expenses and shifts in it are now read-only.');
    } catch (error) {
      toast.error('Could not close it', error instanceof Error ? error.message : undefined);
    }
  }

  async function doReopen() {
    if (reopening === null) return;
    try {
      await reopen.mutateAsync({ id: reopening, reason });
      toast.success('Period reopened', 'The reason is on the record.');
      setReopening(null);
      setReason('');
    } catch (error) {
      toast.error('Could not reopen it', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <section className="space-y-4">
      <Notice tone="warn" title="Closing a period makes it read-only">
        Orders, refunds, expenses and till shifts dated inside a closed period can no longer be
        edited or deleted by anyone. Mistakes get reversed with a credit note, not rewritten — which
        is the whole point.
      </Notice>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-hairline bg-surface p-4">
        <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button
          variant="danger"
          icon={<Lock className="h-4 w-4" />}
          loading={close.isPending}
          onClick={doClose}
        >
          Close this period
        </Button>
      </div>

      {(periods.data ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted">No periods have been closed yet.</p>
      ) : (
        <ul className="divide-y divide-hairline/70 rounded-2xl border border-hairline">
          {(periods.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Badge tone={p.status === 'Locked' ? 'danger' : 'neutral'} size="sm">
                {p.status}
              </Badge>
              <span className="tabular text-ink">
                {formatDate(p.period_from)} — {formatDate(p.period_to)}
              </span>
              <span className="text-xs text-ink-subtle">
                {p.locked_by ? `by ${p.locked_by}` : ''}
              </span>
              {p.status === 'Locked' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  icon={<LockOpen className="h-4 w-4" />}
                  onClick={() => setReopening(p.id)}
                >
                  Reopen
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {reopening !== null && (
        <Modal
          open
          onClose={() => setReopening(null)}
          title="Reopen a closed period"
          description="The reason is appended to the period and cannot be removed."
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setReopening(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={reopen.isPending} onClick={doReopen}>
                Reopen
              </Button>
            </>
          }
        >
          <Textarea
            label="Why is it being reopened?"
            rows={3}
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Modal>
      )}
    </section>
  );
}
