import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banknote,
  Lock,
  Minus,
  Plus,
  Receipt,
  ScanLine,
  Search,
  Trash2,
  Unlock,
  Wallet,
} from 'lucide-react';
import type { DenominationCounts, LineItem, ProductRow } from '@/lib/database.types';
import {
  useAddPettyCash,
  useCompleteSale,
  useOpenShift,
  useOpenTill,
  usePettyCash,
  usePosSearch,
  useShiftSales,
} from '@/data/till';
import { cartTotals } from '@/data/cart';
import { useAuth } from '@/auth/AuthProvider';
import { PAYMENT_METHODS } from '@/lib/constants';
import { formatTime, money, round2, toNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  Input,
  Modal,
  Notice,
  Select,
  StockBadge,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { DenominationCounter, denominationTotal } from '../components/DenominationCounter';
import { CloseTillDialog } from './CloseTill';

export default function Pos() {
  const { profile } = useAuth();
  const toast = useToast();
  const cashier = profile?.full_name ?? profile?.email ?? 'Staff';

  const shift = useOpenShift();
  const [openTillOpen, setOpenTillOpen] = useState(false);
  const [closeTillOpen, setCloseTillOpen] = useState(false);
  const [pettyOpen, setPettyOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);

  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  const search = usePosSearch(term);
  const sales = useShiftSales(shift.data?.id);
  const petty = usePettyCash(shift.data?.id);
  const completeSale = useCompleteSale();

  const totals = useMemo(() => cartTotals(lines, toNumber(discount)), [lines, discount]);
  const takings = useMemo(
    () => round2((sales.data ?? []).reduce((n, o) => n + Number(o.total_amount || 0), 0)),
    [sales.data],
  );

  // The till is a keyboard-first surface; focus belongs in the scan box.
  useEffect(() => {
    searchRef.current?.focus();
  }, [lines.length]);

  // A hardware scanner types the code then Enter; an exact hit is added
  // straight away so scanning never needs a second keystroke.
  useEffect(() => {
    if (search.data?.exact && search.data.rows.length === 1) {
      addProduct(search.data.rows[0]!);
      setTerm('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.data]);

  function addProduct(product: ProductRow) {
    if (product.stock <= 0) {
      toast.warn('Out of stock', product.name);
      return;
    }
    setLines((current) => {
      const existing = current.find((l) => l.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.warn('No more stock', `Only ${product.stock} of ${product.name} on hand.`);
          return current;
        }
        return current.map((l) =>
          l.product_id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.price) || 0,
          // Stamped at the moment of sale. Profit reporting must value a sale
          // at what the unit cost us then, not what a replacement costs today.
          cost_price: Number(product.cost_price) || 0,
          quantity: 1,
          color: product.color,
        },
      ];
    });
  }

  function setQuantity(productId: number | null | undefined, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.product_id !== productId)
        : current.map((l) => (l.product_id === productId ? { ...l, quantity } : l)),
    );
  }

  function clearSale() {
    setLines([]);
    setDiscount('');
  }

  async function finalise(paymentMethod: string, tendered: number) {
    try {
      await completeSale.mutateAsync({
        items: lines,
        discount: toNumber(discount),
        paymentMethod,
        amountTendered: tendered,
        cashierName: cashier,
        shiftId: shift.data?.id ?? null,
      });
      toast.success('Sale complete', money(totals.total));
      clearSale();
      setTenderOpen(false);
    } catch (error) {
      toast.error('Sale failed', error instanceof Error ? error.message : undefined);
    }
  }

  const isOpen = Boolean(shift.data);

  return (
    <>
      <ModuleHeader
        title="POS Terminal"
        description={
          isOpen
            ? `Till ${shift.data!.till_id} · opened ${formatTime(shift.data!.opening_time)} by ${shift.data!.cashier_name ?? '—'}`
            : 'No till shift is open'
        }
        actions={
          isOpen ? (
            <>
              <Button
                variant="secondary"
                icon={<Wallet className="h-4 w-4" />}
                onClick={() => setPettyOpen(true)}
              >
                Petty cash
              </Button>
              <Button
                variant="secondary"
                icon={<Lock className="h-4 w-4" />}
                onClick={() => setCloseTillOpen(true)}
              >
                Close till
              </Button>
            </>
          ) : (
            <Button icon={<Unlock className="h-4 w-4" />} onClick={() => setOpenTillOpen(true)}>
              Open till
            </Button>
          )
        }
      />

      <div className="p-6">
        {!isOpen ? (
          <EmptyState
            icon={<Banknote className="h-10 w-10" />}
            title="The till is closed"
            message="Count the drawer and open a shift before ringing up sales. Everything sold is recorded against the open shift, which is what makes the cash-up add up."
            action={<Button onClick={() => setOpenTillOpen(true)}>Count in and open</Button>}
          />
        ) : (
          <>
            {/* Shift strip */}
            <div className="mb-5 grid gap-3 sm:grid-cols-4">
              <Stat label="Opening float" value={money(shift.data!.opening_float)} />
              <Stat label="Takings this shift" value={money(takings)} tone="brand" />
              <Stat
                label="Petty cash out"
                value={money((petty.data ?? []).reduce((n, e) => n + Number(e.amount || 0), 0))}
                tone={(petty.data?.length ?? 0) > 0 ? 'warn' : 'neutral'}
              />
              <Stat label="Transactions" value={String(sales.data?.length ?? 0)} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[1fr_25rem]">
              {/* ── Catalogue ─────────────────────────────────────────── */}
              <div>
                <div className="flex gap-2">
                  <Input
                    ref={searchRef}
                    label="Scan or search"
                    value={term}
                    onChange={(e) => setTerm(e.target.value)}
                    placeholder="Barcode, SKU, or product name…"
                    leading={<Search className="h-4 w-4" />}
                    autoComplete="off"
                    containerClassName="flex-1"
                  />
                  <Button
                    variant="secondary"
                    className="mt-6 h-10 shrink-0"
                    icon={<ScanLine className="h-4 w-4" />}
                    onClick={() => setScanOpen(true)}
                  >
                    Camera
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
                  {search.data?.rows.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addProduct(product)}
                      disabled={product.stock <= 0}
                      className={cn(
                        'glass flex flex-col rounded-2xl p-3 text-left transition-all',
                        'hover:-translate-y-0.5 hover:brightness-[1.03] disabled:opacity-50',
                      )}
                    >
                      <span className="line-clamp-2 text-sm font-medium text-ink">
                        {product.name}
                      </span>
                      <span className="tabular mt-1 font-display text-base font-bold text-brand-700">
                        {money(product.price)}
                      </span>
                      <span className="mt-1.5">
                        <StockBadge
                          stock={product.stock}
                          reorderLevel={product.reorder_level}
                          size="sm"
                        />
                      </span>
                    </button>
                  ))}
                </div>

                {term.length >= 2 && search.data?.rows.length === 0 && (
                  <EmptyState title="No match" message={`Nothing found for “${term}”.`} />
                )}
              </div>

              {/* ── Sale ──────────────────────────────────────────────── */}
              <div className="glass h-fit overflow-hidden rounded-2xl xl:sticky xl:top-4">
                <div className="flex items-center justify-between border-b border-hairline/70 px-4 py-3">
                  <h2 className="font-display text-base font-bold text-brand-700">Current sale</h2>
                  {lines.length > 0 && (
                    <IconButton
                      label="Clear sale"
                      variant="ghost"
                      size="sm"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={clearSale}
                    />
                  )}
                </div>

                {lines.length === 0 ? (
                  <EmptyState title="Nothing scanned yet" message="Scan an item to begin." />
                ) : (
                  <ul className="max-h-[22rem] divide-y divide-hairline/70 overflow-y-auto">
                    {lines.map((line) => (
                      <li key={line.product_id} className="flex items-center gap-2 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-ink">{line.name}</p>
                          <p className="tabular text-xs text-ink-subtle">
                            {money(line.price)} each
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <IconButton
                            label="Decrease"
                            variant="ghost"
                            size="sm"
                            icon={<Minus className="h-3.5 w-3.5" />}
                            onClick={() => setQuantity(line.product_id, line.quantity - 1)}
                          />
                          <span className="tabular w-7 text-center text-sm font-medium text-ink">
                            {line.quantity}
                          </span>
                          <IconButton
                            label="Increase"
                            variant="ghost"
                            size="sm"
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => setQuantity(line.product_id, line.quantity + 1)}
                          />
                        </div>
                        <p className="tabular w-20 shrink-0 text-right text-sm font-semibold text-ink">
                          {money(line.price * line.quantity)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="space-y-3 border-t border-hairline/70 p-4">
                  <Input
                    label="Discount (N$)"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />

                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-ink-muted">Subtotal</dt>
                      <dd className="tabular text-ink">{money(totals.subtotal)}</dd>
                    </div>
                    {totals.discount > 0 && (
                      <div className="flex justify-between text-success">
                        <dt>Discount</dt>
                        <dd className="tabular">−{money(totals.discount)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-hairline/70 pt-1.5 text-lg font-bold">
                      <dt className="text-ink">Total</dt>
                      <dd className="tabular text-brand-700">{money(totals.total)}</dd>
                    </div>
                    <div className="flex justify-between text-xs">
                      <dt className="text-ink-subtle">Includes VAT</dt>
                      <dd className="tabular text-ink-subtle">{money(totals.vat)}</dd>
                    </div>
                  </dl>

                  <Button
                    size="xl"
                    fullWidth
                    variant="lime"
                    disabled={lines.length === 0}
                    onClick={() => setTenderOpen(true)}
                    icon={<Receipt className="h-5 w-5" />}
                  >
                    Pay {lines.length > 0 ? money(totals.total) : ''}
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <BarcodeScanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onScan={(code) => setTerm(code)}
      />

      <OpenTillDialog
        open={openTillOpen}
        onClose={() => setOpenTillOpen(false)}
        cashier={cashier}
      />

      {shift.data && (
        <>
          <PettyCashDialog
            open={pettyOpen}
            onClose={() => setPettyOpen(false)}
            shiftId={shift.data.id}
            cashier={cashier}
          />
          <CloseTillDialog
            open={closeTillOpen}
            onClose={() => setCloseTillOpen(false)}
            shift={shift.data}
            closedBy={cashier}
          />
        </>
      )}

      <TenderDialog
        open={tenderOpen}
        onClose={() => setTenderOpen(false)}
        total={totals.total}
        onConfirm={finalise}
        busy={completeSale.isPending}
      />
    </>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'brand' | 'warn';
}) {
  return (
    <div className="glass rounded-2xl px-4 py-3">
      <p className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
      <p
        className={cn(
          'tabular mt-1 font-display text-xl font-bold',
          tone === 'brand' ? 'text-brand-700' : tone === 'warn' ? 'text-warn' : 'text-ink',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/* ── Open till ───────────────────────────────────────────────────────────── */

function OpenTillDialog({
  open,
  onClose,
  cashier,
}: {
  open: boolean;
  onClose: () => void;
  cashier: string;
}) {
  const toast = useToast();
  const openTill = useOpenTill();
  const [counts, setCounts] = useState<DenominationCounts>({});
  const total = denominationTotal(counts);

  async function submit() {
    try {
      await openTill.mutateAsync({ cashierName: cashier, counts, total });
      toast.success('Till open', `Counted float ${money(total)}.`);
      setCounts({});
      onClose();
    } catch (error) {
      toast.error('Could not open the till', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Count in and open the till"
      description={`Cashier: ${cashier}`}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={openTill.isPending} disabled={total <= 0}>
            Open with {money(total)}
          </Button>
        </>
      }
    >
      <Notice tone="info" className="mb-4">
        Count the drawer piece by piece. The float is the sum of what you count — nobody types it,
        so at close there is something real to reconcile against.
      </Notice>
      <DenominationCounter counts={counts} onChange={setCounts} />
    </Modal>
  );
}

/* ── Petty cash ──────────────────────────────────────────────────────────── */

function PettyCashDialog({
  open,
  onClose,
  shiftId,
  cashier,
}: {
  open: boolean;
  onClose: () => void;
  shiftId: number;
  cashier: string;
}) {
  const toast = useToast();
  const add = useAddPettyCash();
  const list = usePettyCash(shiftId);

  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [invoice, setInvoice] = useState('');
  const [paidTo, setPaidTo] = useState('');

  async function submit() {
    if (toNumber(amount) <= 0) {
      toast.warn('Enter an amount');
      return;
    }
    if (!description.trim()) {
      toast.warn('What was it for?');
      return;
    }
    if (!invoice.trim()) {
      toast.warn('Invoice number required', 'Cash out of the drawer needs a document behind it.');
      return;
    }

    try {
      await add.mutateAsync({
        shiftId,
        amount: toNumber(amount),
        description: description.trim(),
        invoiceNumber: invoice.trim(),
        paidTo: paidTo.trim() || undefined,
        createdBy: cashier,
      });
      toast.success('Petty cash recorded', money(toNumber(amount)));
      setAmount('');
      setDescription('');
      setInvoice('');
      setPaidTo('');
    } catch (error) {
      toast.error('Could not record it', error instanceof Error ? error.message : undefined);
    }
  }

  const spent = (list.data ?? []).reduce((n, e) => n + Number(e.amount || 0), 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Petty cash"
      description="Money paid out of the till during this shift"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button onClick={submit} loading={add.isPending}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Amount (N$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-autofocus
        />
        <Input
          label="Invoice number"
          required
          value={invoice}
          onChange={(e) => setInvoice(e.target.value)}
          hint="Every payment out needs a document."
        />
        <Input
          label="What for"
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Courier to Swakopmund"
          containerClassName="sm:col-span-2"
        />
        <Input
          label="Paid to"
          value={paidTo}
          onChange={(e) => setPaidTo(e.target.value)}
          containerClassName="sm:col-span-2"
        />
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <h3 className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Paid out this shift
          </h3>
          <span className="tabular text-sm font-bold text-warn">{money(spent)}</span>
        </div>

        {(list.data ?? []).length === 0 ? (
          <p className="mt-2 text-sm text-ink-subtle">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-hairline/70 rounded-xl border border-hairline">
            {list.data!.map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">{e.description}</span>
                <Badge tone="neutral" size="sm">
                  {e.receipt_number ?? 'no inv'}
                </Badge>
                <span className="tabular shrink-0 font-medium text-ink">{money(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

/* ── Tender ──────────────────────────────────────────────────────────────── */

function TenderDialog({
  open,
  onClose,
  total,
  onConfirm,
  busy,
}: {
  open: boolean;
  onClose: () => void;
  total: number;
  onConfirm: (method: string, tendered: number) => void;
  busy: boolean;
}) {
  const [method, setMethod] = useState<string>('Cash');
  const [tendered, setTendered] = useState('');

  const value = toNumber(tendered);
  const change = round2(value - total);
  const isCash = method === 'Cash';
  const short = isCash && value > 0 && change < 0;

  // Quick-tender buttons: the notes a customer actually hands over.
  const suggestions = useMemo(() => {
    const set = new Set<number>([Math.ceil(total)]);
    for (const note of [50, 100, 200, 500]) {
      const up = Math.ceil(total / note) * note;
      if (up >= total) set.add(up);
    }
    return [...set].sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Take payment"
      description={money(total)}
      size="sm"
      dismissable={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="success"
            loading={busy}
            disabled={short}
            onClick={() => onConfirm(method, value || total)}
          >
            Complete sale
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select
          label="Payment method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          options={PAYMENT_METHODS.filter((m) => m !== 'DPO Online').map((m) => ({
            value: m,
            label: m,
          }))}
        />

        {isCash && (
          <>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setTendered(String(amount))}
                  className="tabular rounded-full border border-hairline px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-brand-400 hover:bg-raised"
                >
                  {money(amount)}
                </button>
              ))}
            </div>

            <Input
              label="Cash tendered"
              type="number"
              inputMode="decimal"
              min={0}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              error={short ? 'Less than the amount due.' : null}
              data-autofocus
            />

            <div className="rounded-2xl bg-brand-600 p-4 text-white">
              <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/70">
                Change due
              </p>
              <p className="tabular font-display text-3xl font-bold">
                {money(Math.max(change, 0))}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
