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
import type {
  DenominationCounts,
  LineItem,
  OrderRow,
  ProductRow,
  TillShiftRow,
} from '@/lib/database.types';
import {
  useAddPettyCash,
  useOpenShift,
  useOpenTill,
  usePettyCash,
  usePosSearch,
  useShiftSales,
} from '@/data/till';
import { useOfflineSales } from '@/data/offlineSales';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { cartTotals } from '@/data/cart';
import {
  ImeiChooser,
  linesNeedingImeis,
  useAvailableUnits,
} from '../components/ImeiChooser';
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
  StockBadge,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { DenominationCounter, denominationTotal } from '../components/DenominationCounter';
import { CloseTillDialog } from './CloseTill';
import { InvoiceDialog } from '../components/InvoiceDialog';

export default function Pos() {
  const { profile } = useAuth();
  const toast = useToast();
  const cashier = profile?.full_name ?? profile?.email ?? 'Staff';

  const shift = useOpenShift();
  const [openTillOpen, setOpenTillOpen] = useState(false);
  const [closeTillOpen, setCloseTillOpen] = useState(false);
  // Snapshot of the shift being closed. The dialog must outlive the open-shift
  // query: closing invalidates it, it refetches null, and the reconciliation
  // step would unmount before the cashier can read it.
  const [closingShift, setClosingShift] = useState<TillShiftRow | null>(null);
  const [pettyOpen, setPettyOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [tenderOpen, setTenderOpen] = useState(false);

  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState('');

  const searchRef = useRef<HTMLInputElement>(null);
  // On-hand stock at the moment each product was added, so the + button can
  // stop at the same cap addProduct enforces instead of failing at payment.
  const stockCaps = useRef<Record<number, number>>({});
  const search = usePosSearch(term);
  const sales = useShiftSales(shift.data?.id);
  const petty = usePettyCash(shift.data?.id);
  const till = useOfflineSales();
  const [selling, setSelling] = useState(false);
  // Held after a sale so the invoice can be issued without hunting for the
  // order again — which is the only moment the customer is still standing there.
  const [invoiceFor, setInvoiceFor] = useState<OrderRow | null>(null);

  const totals = useMemo(() => cartTotals(lines, toNumber(discount)), [lines, discount]);

  // Which serials are on the shelf for what is in the cart, and which lines
  // still have not said which handset is leaving.
  const { units: unitPools, loading: unitsLoading } = useAvailableUnits(lines);
  const needsImeis = useMemo(() => linesNeedingImeis(lines, unitPools), [lines, unitPools]);
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
    if (product.id != null) stockCaps.current[product.id] = product.stock;
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

  function increment(line: LineItem) {
    const cap = line.product_id != null ? stockCaps.current[line.product_id] : undefined;
    if (cap !== undefined && line.quantity >= cap) {
      toast.warn('No more stock', `Only ${cap} of ${line.name} on hand.`);
      return;
    }
    setQuantity(line.product_id, line.quantity + 1);
  }

  function clearSale() {
    setLines([]);
    setDiscount('');
  }

  async function finalise(
    paymentMethod: string,
    tendered: number,
    customer: { id?: string | null; name?: string | null; phone?: string | null } | null,
  ) {
    setSelling(true);
    try {
      const sold = await till.sell({
        items: lines,
        discount: toNumber(discount),
        paymentMethod,
        amountTendered: tendered,
        cashierName: cashier,
        shiftId: shift.data?.id ?? null,
        customer: customer ?? undefined,
      });

      const outcome = sold.outcome;
      if (sold.order) setInvoiceFor(sold.order);

      if (outcome === 'queued') {
        toast.warn(
          'Saved on this device',
          `${money(totals.total)} — no line to the server. It will post itself the moment the connection returns.`,
        );
      } else {
        toast.success('Sale complete', money(totals.total));
      }
      clearSale();
      setTenderOpen(false);
    } catch (error) {
      toast.error('Sale failed', error instanceof Error ? error.message : undefined);
    } finally {
      setSelling(false);
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
                onClick={() => {
                  setClosingShift(shift.data!);
                  setCloseTillOpen(true);
                }}
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
            {/* The cashier has to be able to tell, at a glance, whether what
                they just rang up has actually left the building. */}
            {(!till.online || till.pending.length > 0 || till.stuck.length > 0) && (
              <div className="mb-4 space-y-2">
                {(!till.online || till.pending.length > 0) && (
                  <Notice
                    tone={till.online ? 'info' : 'warn'}
                    title={till.online ? 'Catching up' : 'Working offline'}
                  >
                    {till.pending.length > 0
                      ? `${till.pending.length} sale${till.pending.length === 1 ? '' : 's'} saved on this device, ${till.syncing ? 'posting now' : 'waiting for the line'}. Keep selling — nothing is lost.`
                      : 'No line to the server. Sales are saved on this device and post themselves when it returns.'}
                  </Notice>
                )}
                {till.stuck.length > 0 && (
                  <Notice tone="danger" title={`${till.stuck.length} sale(s) could not be posted`}>
                    These were rung up and taken, but the server keeps refusing them. Do not re-ring
                    them — the money is already in the drawer. Show this to whoever maintains the
                    system: {till.stuck[0]?.lastError ?? 'no error recorded'}
                  </Notice>
                )}
              </div>
            )}

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
                      <li key={line.product_id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
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
                            size="md"
                            icon={<Minus className="h-3.5 w-3.5" />}
                            onClick={() => setQuantity(line.product_id, line.quantity - 1)}
                          />
                          <span className="tabular w-8 text-center text-sm font-medium text-ink">
                            {line.quantity}
                          </span>
                          <IconButton
                            label="Increase"
                            variant="ghost"
                            size="md"
                            icon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => increment(line)}
                          />
                        </div>
                        <p className="tabular w-20 shrink-0 text-right text-sm font-semibold text-ink">
                          {money(line.price * line.quantity)}
                        </p>
                        {line.product_id != null && (
                          <ImeiChooser
                            compact
                            line={line}
                            units={unitPools[line.product_id] ?? []}
                            loading={unitsLoading}
                            onChange={(imeis) =>
                              setLines((current) =>
                                current.map((l) =>
                                  l.product_id === line.product_id
                                    ? // `imei` mirrors the first so the dispatch
                                      // note and older screens keep working.
                                      { ...l, imeis, imei: imeis[0] ?? null }
                                    : l,
                                ),
                              )
                            }
                          />
                        )}
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

                  {/* Held, not merely prompted. Offering the choice is not
                      enough: the busiest moment of the day is exactly when it
                      gets skipped, and a phone sold without its IMEI cannot be
                      matched to a warranty claim afterwards. */}
                  {needsImeis.length > 0 && (
                    <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Choose the handset going out for{' '}
                      {needsImeis.map((l) => l.name).join(', ')} before taking payment.
                    </p>
                  )}
                  <Button
                    size="xl"
                    fullWidth
                    variant="lime"
                    disabled={lines.length === 0 || needsImeis.length > 0}
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
        <PettyCashDialog
          open={pettyOpen}
          onClose={() => setPettyOpen(false)}
          shiftId={shift.data.id}
          cashier={cashier}
        />
      )}

      {closingShift && (
        <CloseTillDialog
          open={closeTillOpen}
          onClose={() => {
            setCloseTillOpen(false);
            setClosingShift(null);
          }}
          shift={closingShift}
          closedBy={cashier}
        />
      )}

      <TenderDialog
        open={tenderOpen}
        onClose={() => setTenderOpen(false)}
        total={totals.total}
        onConfirm={finalise}
        busy={selling}
      />

      {/* Offered the moment the sale lands, because that is the only time the
          customer is still standing there to say where to send it. */}
      {invoiceFor && (
        <InvoiceDialog order={invoiceFor} onClose={() => setInvoiceFor(null)} />
      )}
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
  onConfirm: (
    method: string,
    tendered: number,
    customer: { id?: string | null; name?: string | null; phone?: string | null } | null,
  ) => void;
  busy: boolean;
}) {
  // Deliberately unset. A method that defaults to Cash books every card
  // sale as cash whenever the cashier does not think to change it — which is
  // how a card sale landed in the cash column and left the drawer short.
  const [method, setMethod] = useState<string | null>(null);
  const [tendered, setTendered] = useState('');

  // Account sale is the default: the shop knows its customers, and their
  // cellphone number is their account number. How the money arrives — cash,
  // card, EFT — is a separate question, asked regardless.
  const [mode, setMode] = useState<'account' | 'walkin'>('account');
  const [phone, setPhone] = useState('');
  const [newName, setNewName] = useState('');

  const digits = phone.replace(/\D/g, '');
  const account = useQuery({
    queryKey: keys.list('customers', { account: digits }),
    enabled: mode === 'account' && digits.length >= 6,
    queryFn: async () => {
      const tail = digits.slice(-7);
      // Both columns, because the number can live in either. IQ used the
      // customer's cellphone AS their account code, so of the 2,492 accounts
      // carried over only 803 have a `phone` — searching that alone left two
      // thirds of the shop's customers unreachable at the till, including
      // anyone who quoted the number printed on their own statement.
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email, phone, account_code')
        .or(`phone.ilike.%${tail}%,account_code.ilike.%${tail}%`)
        .limit(3);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const matched = (account.data ?? [])[0] ?? null;
  const accountIncomplete = mode === 'account' && digits.length < 6;
  // Hold "Complete sale" until the lookup lands: confirming against a
  // half-finished search would open a duplicate account for a known number.
  const accountLookupPending = mode === 'account' && digits.length >= 6 && account.isLoading;

  async function confirm() {
    if (mode === 'walkin') {
      onConfirm(method!, toNumber(tendered) || total, null);
      return;
    }

    if (matched) {
      onConfirm(method!, toNumber(tendered) || total, {
        id: matched.id,
        name: matched.name,
        phone: matched.phone ?? phone.trim(),
      });
      return;
    }

    // A number the book does not know opens an account on the spot when a
    // name is given — best-effort: offline, the sale still goes through with
    // the details carried on the order itself.
    let id: string | null = null;
    const name = newName.trim() || 'Account customer';
    try {
      const { data } = await supabase
        .from('customers')
        .insert({ name, phone: phone.trim() })
        .select('id')
        .single();
      id = (data as { id: string } | null)?.id ?? null;
    } catch {
      // Offline or refused — the order still records name and number.
    }
    onConfirm(method!, toNumber(tendered) || total, { id, name, phone: phone.trim() });
  }

  const value = toNumber(tendered);
  const change = round2(value - total);
  const isCash = method === 'Cash';
  const methodMissing = method === null;
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
            disabled={short || methodMissing || accountIncomplete || accountLookupPending}
            onClick={() => void confirm()}
          >
            Complete sale
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-1 rounded-xl border border-hairline p-1">
          {(
            [
              ['account', 'Account sale'],
              ['walkin', 'Walk-in'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={cn(
                'flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                mode === value ? 'bg-brand-600 text-white' : 'text-ink-muted hover:bg-raised',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'account' && (
          <div>
            <Input
              label="Account number (cellphone)"
              type="tel"
              inputMode="tel"
              placeholder="081…"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-autofocus
            />
            {matched ? (
              <p className="mt-1 text-sm font-medium text-success">
                {/* Most accounts carried over from IQ have no phone of their
                    own — the number IS the account code — so fall back to it
                    rather than printing a dangling separator. */}
                {[matched.name, matched.phone ?? matched.account_code]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            ) : digits.length >= 6 && !account.isLoading ? (
              <div className="mt-2">
                <p className="text-sm text-danger">No account with this number.</p>
                <Input
                  label="Customer name — opens the account"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  containerClassName="mt-1"
                />
              </div>
            ) : null}
          </div>
        )}

        <div>
          <p className="text-sm font-medium text-ink">
            Payment method
            {methodMissing && <span className="ml-1 text-brand-600">*</span>}
          </p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {PAYMENT_METHODS.filter((m) => m !== 'DPO Online').map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors',
                  method === m
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-hairline text-ink hover:border-brand-400 hover:bg-raised',
                )}
              >
                {m}
              </button>
            ))}
          </div>
          {methodMissing && (
            <p className="mt-1.5 text-xs text-ink-muted">
              Choose how the money arrived before completing the sale.
            </p>
          )}
        </div>

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
