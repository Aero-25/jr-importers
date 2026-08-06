import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Search, Trash2, Wallet } from 'lucide-react';
import type { LineItem, ProductRow } from '@/lib/database.types';
import { useCompleteSale, useCloseTill, useOpenShift, useOpenTill, usePosSearch } from '@/data/pos';
import { cartTotals } from '@/data/cart';
import { useAuth } from '@/auth/AuthProvider';
import { PAYMENT_METHODS } from '@/lib/constants';
import { money, round2, toNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Button,
  Card,
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

export default function Pos() {
  const { profile } = useAuth();
  const toast = useToast();
  const cashierName = profile?.full_name ?? profile?.email ?? 'Staff';

  const [term, setTerm] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [tenderOpen, setTenderOpen] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const search = usePosSearch(term);
  const shift = useOpenShift();
  const completeSale = useCompleteSale();

  const totals = useMemo(() => cartTotals(lines, toNumber(discount)), [lines, discount]);

  // The till is a keyboard-first surface: focus belongs in the scan box
  // whenever the operator is not deliberately somewhere else.
  useEffect(() => {
    searchRef.current?.focus();
  }, [lines.length]);

  // A barcode scanner sends the code then Enter. When the lookup was exact,
  // add it straight to the sale so scanning never needs a second keystroke.
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
      const existing = current.find((line) => line.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) {
          toast.warn('No more stock', `Only ${product.stock} of ${product.name} on hand.`);
          return current;
        }
        return current.map((line) =>
          line.product_id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [
        ...current,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.price) || 0,
          quantity: 1,
          color: product.color,
        },
      ];
    });
  }

  function setQuantity(productId: number | null | undefined, quantity: number) {
    setLines((current) =>
      quantity <= 0
        ? current.filter((line) => line.product_id !== productId)
        : current.map((line) =>
            line.product_id === productId ? { ...line, quantity } : line,
          ),
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
        cashierName,
      });
      toast.success('Sale complete', money(totals.total));
      clearSale();
      setTenderOpen(false);
    } catch (error) {
      toast.error('Sale failed', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <>
      <ModuleHeader
        title="POS Terminal"
        description={
          shift.data
            ? `Till ${shift.data.till_id} open · float ${money(shift.data.opening_float)}`
            : 'No till shift open'
        }
        actions={
          <Button
            variant={shift.data ? 'secondary' : 'primary'}
            icon={<Wallet className="h-4 w-4" />}
            onClick={() => setShiftOpen(true)}
          >
            {shift.data ? 'Close till' : 'Open till'}
          </Button>
        }
      />

      <div className="p-6">
        {!shift.data && (
          <Notice tone="warn" className="mb-4" title="No till shift is open">
            You can still ring up sales, but cash reconciliation needs an open shift.
          </Notice>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <div>
            <Input
              ref={searchRef}
              label="Scan or search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Barcode, SKU, or product name…"
              leading={<Search className="h-4 w-4" />}
              autoComplete="off"
            />

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">
              {search.data?.rows.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  disabled={product.stock <= 0}
                  className={cn(
                    'flex flex-col rounded-card border border-hairline bg-surface p-3 text-left',
                    'transition-colors hover:border-brand-400 disabled:opacity-50',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-medium text-ink">{product.name}</span>
                  <span className="tabular mt-1 font-display text-base font-semibold text-ink">
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

          <Card className="flex h-fit flex-col xl:sticky xl:top-4">
            <div className="border-b border-hairline px-4 py-3">
              <h2 className="font-display text-base font-semibold text-ink">Current sale</h2>
            </div>

            {lines.length === 0 ? (
              <EmptyState title="Nothing scanned yet" message="Scan an item to begin." />
            ) : (
              <ul className="max-h-80 divide-y divide-hairline overflow-y-auto">
                {lines.map((line) => (
                  <li key={line.product_id} className="flex items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{line.name}</p>
                      <p className="tabular text-xs text-ink-subtle">{money(line.price)} each</p>
                    </div>

                    <div className="flex items-center gap-0.5">
                      <IconButton
                        label="Decrease"
                        variant="ghost"
                        size="sm"
                        icon={<Minus className="h-3.5 w-3.5" />}
                        onClick={() => setQuantity(line.product_id, line.quantity - 1)}
                      />
                      <span className="tabular w-7 text-center text-sm text-ink">
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

                    <p className="tabular w-20 shrink-0 text-right text-sm font-medium text-ink">
                      {money(line.price * line.quantity)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            <div className="space-y-3 border-t border-hairline p-4">
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
                <div className="flex justify-between border-t border-hairline pt-1.5 text-lg font-bold">
                  <dt className="text-ink">Total</dt>
                  <dd className="tabular text-ink">{money(totals.total)}</dd>
                </div>
                <div className="flex justify-between text-xs">
                  <dt className="text-ink-subtle">Includes VAT</dt>
                  <dd className="tabular text-ink-subtle">{money(totals.vat)}</dd>
                </div>
              </dl>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={clearSale}
                  disabled={lines.length === 0}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  Clear
                </Button>
                <Button
                  size="xl"
                  fullWidth
                  disabled={lines.length === 0}
                  onClick={() => setTenderOpen(true)}
                >
                  Pay
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <TenderDialog
        open={tenderOpen}
        onClose={() => setTenderOpen(false)}
        total={totals.total}
        onConfirm={finalise}
        busy={completeSale.isPending}
      />

      <ShiftDialog open={shiftOpen} onClose={() => setShiftOpen(false)} cashierName={cashierName} />
    </>
  );
}

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

  const tenderedValue = toNumber(tendered);
  const change = round2(tenderedValue - total);
  const isCash = method === 'Cash';
  const shortfall = isCash && tenderedValue > 0 && change < 0;

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
            disabled={shortfall}
            onClick={() => onConfirm(method, tenderedValue || total)}
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
            <Input
              label="Cash tendered"
              type="number"
              inputMode="decimal"
              min={0}
              value={tendered}
              onChange={(e) => setTendered(e.target.value)}
              error={shortfall ? 'Less than the amount due.' : null}
              data-autofocus
            />

            <div className="rounded-lg bg-raised p-3">
              <p className="text-xs uppercase tracking-wide text-ink-muted">Change due</p>
              <p className="tabular font-display text-2xl font-bold text-success">
                {money(Math.max(change, 0))}
              </p>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function ShiftDialog({
  open,
  onClose,
  cashierName,
}: {
  open: boolean;
  onClose: () => void;
  cashierName: string;
}) {
  const toast = useToast();
  const shift = useOpenShift();
  const openTill = useOpenTill();
  const closeTill = useCloseTill();
  const [amount, setAmount] = useState('');

  const isClosing = Boolean(shift.data);

  async function submit() {
    try {
      if (shift.data) {
        const result = await closeTill.mutateAsync({
          shift: shift.data,
          countedCash: toNumber(amount),
        });
        const variance = Number(result.cash_variance ?? 0);
        if (Math.abs(variance) < 0.01) {
          toast.success('Till balanced', `Expected ${money(result.expected_cash)}.`);
        } else {
          toast.warn(
            variance > 0 ? 'Till over' : 'Till short',
            `${money(Math.abs(variance))} against an expected ${money(result.expected_cash)}.`,
          );
        }
      } else {
        await openTill.mutateAsync({ cashierName, openingFloat: toNumber(amount) });
        toast.success('Till open', `Float ${money(toNumber(amount))}.`);
      }
      setAmount('');
      onClose();
    } catch (error) {
      toast.error('Could not update the till', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isClosing ? 'Close till' : 'Open till'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={openTill.isPending || closeTill.isPending}>
            {isClosing ? 'Close shift' : 'Open shift'}
          </Button>
        </>
      }
    >
      <Input
        label={isClosing ? 'Cash counted in drawer (N$)' : 'Opening float (N$)'}
        type="number"
        inputMode="decimal"
        min={0}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={
          isClosing
            ? 'Count the drawer before submitting; the variance is recorded against your name.'
            : 'The cash you are starting the shift with.'
        }
        data-autofocus
      />
    </Modal>
  );
}
