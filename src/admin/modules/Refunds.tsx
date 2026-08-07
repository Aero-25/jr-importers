import { useMemo, useState } from 'react';
import { Check, Download, Plus, RotateCcw, X } from 'lucide-react';
import type { LineItem, RefundLine, RefundRow } from '@/lib/database.types';
import {
  useApproveRefund,
  useDeclineRefund,
  useRecentSales,
  useRefunds,
  useRequestRefund,
} from '@/data/refunds';
import { useAuth } from '@/auth/AuthProvider';
import { downloadCreditNotePdf } from '@/lib/creditNotePdf';
import { formatDateTime, money, round2, toNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  Input,
  Modal,
  Notice,
  Select,
  StatTile,
  Textarea,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

const METHODS = ['Cash', 'Card', 'EFT'];

const TONE: Record<string, 'success' | 'warn' | 'danger' | 'neutral'> = {
  Approved: 'success',
  Pending: 'warn',
  Declined: 'danger',
};

/**
 * Refunds and returns.
 *
 * The rule this screen exists to enforce: money does not leave the drawer
 * without a reason, a named authoriser and a decision about the stock. Anything
 * looser and the cash-up variance stops being evidence of anything.
 */
export default function Refunds() {
  const { isAdmin } = useAuth();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<RefundRow | null>(null);

  const refunds = useRefunds({ status: status || undefined, search: search || undefined });
  const rows = refunds.data ?? [];

  const pending = rows.filter((r) => r.status === 'Pending');
  const approved = rows.filter((r) => r.status === 'Approved');
  const refunded = approved.reduce((n, r) => n + Number(r.total_amount ?? 0), 0);

  const columns: Column<RefundRow>[] = [
    {
      key: 'number',
      header: 'No.',
      render: (r) => <span className="tabular font-semibold text-ink">#{r.refund_number}</span>,
      sortValue: (r) => r.refund_number,
      width: '5rem',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{r.customer_name || 'Walk-in customer'}</p>
          <p className="truncate text-xs text-ink-subtle">{r.reason}</p>
        </div>
      ),
      sortValue: (r) => r.customer_name ?? '',
    },
    {
      key: 'when',
      header: 'Raised',
      secondary: true,
      render: (r) => <span className="text-xs text-ink-muted">{formatDateTime(r.created_at)}</span>,
      sortValue: (r) => r.created_at,
    },
    {
      key: 'method',
      header: 'Paid back',
      secondary: true,
      render: (r) => <span className="text-ink-muted">{r.method}</span>,
      sortValue: (r) => r.method,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => (
        <span className="tabular font-semibold text-danger">− {money(r.total_amount)}</span>
      ),
      sortValue: (r) => Number(r.total_amount ?? 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={TONE[r.status] ?? 'neutral'} size="sm">
          {r.status}
        </Badge>
      ),
      sortValue: (r) => r.status,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Refunds & returns"
        description="Every reversal, who authorised it, and where the stock went."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New refund
          </Button>
        }
      />

      <div className="space-y-5 p-6">
        {pending.length > 0 && (
          <Notice tone="warn" title={`${pending.length} refund(s) waiting for approval`}>
            {isAdmin
              ? 'Open one to approve or decline it. Nothing moves until you do.'
              : 'A manager needs to approve these before any money or stock moves.'}
          </Notice>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Awaiting approval" value={pending.length} tone={pending.length > 0 ? 'warn' : 'success'} />
          <StatTile label="Refunds approved" value={approved.length} />
          <StatTile label="Value refunded" value={money(refunded)} tone="danger" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by number, customer or reason…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[12rem]">
            <option value="">All statuses</option>
            <option value="Pending">Pending</option>
            <option value="Approved">Approved</option>
            <option value="Declined">Declined</option>
          </Select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            loading={refunds.isLoading}
            onRowClick={setSelected}
            defaultSort={{ key: 'number', direction: 'desc' }}
            empty={{
              title: 'No refunds yet',
              message: 'Raise one from here when a customer returns something.',
            }}
          />
        </div>
      </div>

      {creating && <NewRefundDialog onClose={() => setCreating(false)} />}
      {selected && <RefundDialog refund={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/* ── Raising one ─────────────────────────────────────────────────────────── */

interface DraftLine extends RefundLine {
  key: string;
  max: number;
}

function NewRefundDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const request = useRequestRefund();

  const [saleSearch, setSaleSearch] = useState('');
  const [orderId, setOrderId] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState('Cash');

  const sales = useRecentSales(saleSearch);

  const total = useMemo(
    () => round2(lines.reduce((n, l) => n + l.line_total, 0)),
    [lines],
  );

  function pickSale(sale: {
    id: string;
    customer_name: string | null;
    customer_phone: string | null;
    items: LineItem[];
  }) {
    setOrderId(sale.id);
    setCustomerName(sale.customer_name ?? '');
    setCustomerPhone(sale.customer_phone ?? '');
    setReference('');
    setLines(
      (sale.items ?? []).map((item, index) => ({
        key: `${index}`,
        product_id: item.product_id ?? null,
        name: item.name,
        quantity: 0,
        unit_price: Number(item.price ?? 0),
        line_total: 0,
        // A service line has nothing to put back on a shelf.
        restock: !item.service_code,
        imei: item.imei ?? null,
        max: Number(item.quantity ?? 0),
      })),
    );
  }

  function setQty(key: string, value: string) {
    setLines((current) =>
      current.map((l) => {
        if (l.key !== key) return l;
        const qty = Math.max(0, Math.min(l.max || 9999, Math.floor(toNumber(value))));
        return { ...l, quantity: qty, line_total: round2(qty * l.unit_price) };
      }),
    );
  }

  function addBlankLine() {
    setLines((current) => [
      ...current,
      {
        key: `manual-${current.length}-${Date.now()}`,
        product_id: null,
        name: '',
        quantity: 1,
        unit_price: 0,
        line_total: 0,
        restock: false,
        imei: null,
        max: 0,
      },
    ]);
  }

  async function submit() {
    const chosen = lines.filter((l) => l.quantity > 0 && l.line_total > 0);
    if (chosen.length === 0) {
      toast.warn('Nothing to refund', 'Set a quantity on at least one line.');
      return;
    }
    if (!reason.trim()) {
      toast.warn('A reason is required', 'It appears on the credit note and the cash-up.');
      return;
    }

    try {
      const result = await request.mutateAsync({
        reason: reason.trim(),
        method,
        total,
        orderId,
        originalReference: reference.trim() || null,
        customerName: customerName.trim() || null,
        customerPhone: customerPhone.trim() || null,
        items: chosen.map(({ key: _key, max: _max, ...line }) => line),
      });

      if (result.pending) {
        toast.success('Sent for approval', 'A manager must approve it before money or stock moves.');
      } else {
        toast.success(`Refund #${result.refund.refund_number} approved`, 'Stock returned and the drawer adjusted.');
      }
      onClose();
    } catch (error) {
      toast.error('Could not record the refund', error instanceof Error ? error.message : undefined);
    }
  }

  const hasSale = orderId !== null || reference.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title="New refund"
      description={
        isAdmin
          ? 'Approved as you save it, since you can authorise refunds.'
          : 'Saved for a manager to approve. Nothing moves until they do.'
      }
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={submit}
            loading={request.isPending}
            disabled={!hasSale || total <= 0}
            icon={<RotateCcw className="h-4 w-4" />}
          >
            Refund {money(total)}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── The original sale ─────────────────────────────────────────── */}
        <section>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            The original sale
          </h3>

          {orderId ? (
            <div className="flex items-center gap-3 rounded-xl border border-lime-500/40 bg-lime-500/10 px-3 py-2.5">
              <Check className="h-4 w-4 shrink-0 text-lime-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {customerName || 'Walk-in customer'}
                </p>
                <p className="tabular truncate text-xs text-ink-muted">Sale {orderId.slice(0, 8)}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOrderId(null);
                  setLines([]);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search recent sales by customer or phone…"
                value={saleSearch}
                onChange={(e) => setSaleSearch(e.target.value)}
              />

              <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-hairline">
                {sales.isLoading ? (
                  <p className="p-4 text-center text-sm text-ink-muted">Loading sales…</p>
                ) : (sales.data ?? []).length === 0 ? (
                  <EmptyState
                    title="No matching sales"
                    message="Record the original reference below instead."
                  />
                ) : (
                  <ul className="divide-y divide-hairline/70">
                    {(sales.data ?? []).map((sale) => (
                      <li key={sale.id}>
                        <button
                          type="button"
                          onClick={() => pickSale(sale as never)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-raised"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">
                              {sale.customer_name || 'Walk-in customer'}
                            </p>
                            <p className="truncate text-xs text-ink-subtle">
                              {formatDateTime(sale.created_at)} · {sale.payment_method}
                            </p>
                          </div>
                          <span className="tabular shrink-0 text-sm font-medium text-ink">
                            {money(sale.total_amount)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Input
                  label="Or the original reference"
                  hint="Receipt or invoice number for a sale not in the system."
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
                <Input
                  label="Customer"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
                <Input
                  label="Contact number"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </div>
            </>
          )}
        </section>

        {/* ── What is coming back ───────────────────────────────────────── */}
        {hasSale && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
                What is being refunded
              </h3>
              <Button size="sm" variant="ghost" onClick={addBlankLine}>
                Add a line
              </Button>
            </div>

            {lines.length === 0 ? (
              <p className="rounded-xl border border-dashed border-hairline p-4 text-center text-sm text-ink-muted">
                Add the item being returned.
              </p>
            ) : (
              <ul className="space-y-2">
                {lines.map((line) => (
                  <li
                    key={line.key}
                    className={cn(
                      'rounded-xl border p-3',
                      line.quantity > 0 ? 'border-danger/40 bg-danger/5' : 'border-hairline',
                    )}
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[10rem] flex-1">
                        {line.max > 0 ? (
                          <>
                            <p className="text-sm font-medium text-ink">{line.name}</p>
                            <p className="tabular text-xs text-ink-subtle">
                              {money(line.unit_price)} each · {line.max} sold
                              {line.imei ? ` · IMEI ${line.imei}` : ''}
                            </p>
                          </>
                        ) : (
                          <Input
                            label="Item"
                            value={line.name}
                            onChange={(e) =>
                              setLines((c) =>
                                c.map((l) => (l.key === line.key ? { ...l, name: e.target.value } : l)),
                              )
                            }
                          />
                        )}
                      </div>

                      {line.max === 0 && (
                        <Input
                          label="Unit price"
                          type="number"
                          inputMode="decimal"
                          className="w-28"
                          value={line.unit_price || ''}
                          onChange={(e) =>
                            setLines((c) =>
                              c.map((l) =>
                                l.key === line.key
                                  ? {
                                      ...l,
                                      unit_price: toNumber(e.target.value),
                                      line_total: round2(l.quantity * toNumber(e.target.value)),
                                    }
                                  : l,
                              ),
                            )
                          }
                        />
                      )}

                      <Input
                        label="Qty"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={line.max || undefined}
                        className="w-20"
                        value={line.quantity || ''}
                        onChange={(e) => setQty(line.key, e.target.value)}
                      />

                      <span className="tabular ml-auto pb-2 text-sm font-semibold text-ink">
                        {money(line.line_total)}
                      </span>
                    </div>

                    <div className="mt-2">
                      <Checkbox
                        label="Put this back into stock"
                        checked={line.restock}
                        onChange={(e) =>
                          setLines((c) =>
                            c.map((l) =>
                              l.key === line.key ? { ...l, restock: e.target.checked } : l,
                            ),
                          )
                        }
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ── Why, and how ──────────────────────────────────────────────── */}
        {hasSale && (
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Textarea
                label="Reason"
                rows={2}
                required
                hint="Appears on the credit note and the cash-up report."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Faulty screen, returned within 7 days…"
              />
            </div>
            <Select label="Paid back by" value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </section>
        )}

        {method === 'Cash' && total > 0 && (
          <Notice tone="info">
            {money(total)} will come out of the till float and is deducted from the expected cash on
            this shift&rsquo;s cash-up.
          </Notice>
        )}
      </div>
    </Modal>
  );
}

/* ── Reviewing one ───────────────────────────────────────────────────────── */

function RefundDialog({ refund, onClose }: { refund: RefundRow; onClose: () => void }) {
  const toast = useToast();
  const { isAdmin } = useAuth();
  const approve = useApproveRefund();
  const decline = useDeclineRefund();
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  async function doApprove() {
    try {
      const updated = await approve.mutateAsync(refund.id);
      toast.success(`Refund #${updated.refund_number} approved`, 'Stock returned and the drawer adjusted.');
      onClose();
    } catch (error) {
      toast.error('Could not approve', error instanceof Error ? error.message : undefined);
    }
  }

  async function doDecline() {
    try {
      await decline.mutateAsync({ id: refund.id, reason: declineReason.trim() || undefined });
      toast.success('Refund declined');
      onClose();
    } catch (error) {
      toast.error('Could not decline', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Refund #${refund.refund_number}`}
      description={`${refund.status} · raised by ${refund.requested_by ?? '—'}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {refund.status === 'Approved' && (
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => void downloadCreditNotePdf(refund)}
            >
              Credit note
            </Button>
          )}
          {refund.status === 'Pending' && isAdmin && (
            <>
              <Button
                variant="danger"
                icon={<X className="h-4 w-4" />}
                onClick={() => setDeclining((d) => !d)}
              >
                Decline
              </Button>
              <Button
                variant="success"
                icon={<Check className="h-4 w-4" />}
                loading={approve.isPending}
                onClick={doApprove}
              >
                Approve &amp; pay out
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {refund.status === 'Pending' && !isAdmin && (
          <Notice tone="warn" title="Waiting on a manager">
            No money or stock has moved yet.
          </Notice>
        )}

        {declining && (
          <div className="rounded-xl border border-danger/40 bg-danger/5 p-3">
            <Textarea
              label="Why is it being declined?"
              rows={2}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
            />
            <Button
              variant="danger"
              size="sm"
              className="mt-2"
              loading={decline.isPending}
              onClick={doDecline}
            >
              Confirm decline
            </Button>
          </div>
        )}

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Customer" value={refund.customer_name || 'Walk-in customer'} />
          <Detail label="Contact" value={refund.customer_phone || '—'} />
          <Detail
            label="Original sale"
            value={refund.original_reference || refund.order_id?.slice(0, 8) || '—'}
          />
          <Detail label="Paid back by" value={refund.method} />
          <Detail label="Raised" value={formatDateTime(refund.created_at)} />
          <Detail
            label={refund.status === 'Declined' ? 'Declined by' : 'Approved by'}
            value={refund.approved_by ? `${refund.approved_by} · ${formatDateTime(refund.approved_at)}` : '—'}
          />
        </dl>

        <div>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Reason
          </h3>
          <p className="text-sm text-ink">{refund.reason}</p>
          {refund.declined_reason && (
            <p className="mt-1 text-sm text-danger">Declined: {refund.declined_reason}</p>
          )}
        </div>

        <div>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Items
          </h3>
          <ul className="divide-y divide-hairline/70 rounded-xl border border-hairline">
            {(refund.items ?? []).map((line, index) => (
              <li key={index} className="flex items-center gap-3 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ink">{line.name}</p>
                  <p className="text-xs text-ink-subtle">
                    {line.quantity} × {money(line.unit_price)}
                    {line.imei ? ` · IMEI ${line.imei}` : ''}
                    {line.restock ? '' : ' · not returned to stock'}
                  </p>
                </div>
                <span className="tabular shrink-0 font-medium text-ink">{money(line.line_total)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-danger px-5 py-4 text-white">
          <span className="text-2xs font-bold uppercase tracking-[0.14em] text-white/75">
            Refunded
          </span>
          <span className="tabular font-display text-2xl font-bold">
            {money(refund.total_amount)}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
