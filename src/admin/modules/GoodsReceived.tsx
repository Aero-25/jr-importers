import { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileSearch,
  PackageCheck,
  Plus,
  ScanLine,
  Trash2,
  Truck,
} from 'lucide-react';
import type { GrvRow, IntakeLine } from '@/lib/database.types';
import {
  fetchIntakeCatalog,
  useGrvFromPurchaseOrder,
  useGrvs,
  useOpenPurchaseOrders,
  useProductLookup,
  useReceiveGrv,
  useSaveGrv,
  type ReceiptResult,
} from '@/data/goodsReceived';
import { matchInvoiceLines, readInvoicePdf, type ParsedInvoiceLine } from '@/lib/invoiceReader';
import { suppliers } from '@/data/resources';
import { formatDate, money, round2, toNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  DataTable,
  Input,
  Modal,
  Notice,
  Select,
  Textarea,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';

/**
 * Goods received.
 *
 * Stock used to appear with no provenance — thousands of units against two
 * movements and no purchase orders. Receiving is now a posting: it adds the
 * stock, stamps the cost, captures the serials and writes the movement in one
 * transaction, and it can only happen once per note.
 */
export default function GoodsReceived() {
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GrvRow | 'new' | null>(null);
  const [receipt, setReceipt] = useState<ReceiptResult | null>(null);

  const toast = useToast();
  const grvs = useGrvs(search);
  const orders = useOpenPurchaseOrders();
  const fromPo = useGrvFromPurchaseOrder();

  const rows = grvs.data ?? [];
  const drafts = rows.filter((g) => !g.posted_at);

  const columns: Column<GrvRow>[] = [
    {
      key: 'id',
      header: 'GRV',
      render: (g) => <span className="tabular font-semibold text-ink">#{g.id}</span>,
      sortValue: (g) => g.id,
      width: '5rem',
    },
    {
      key: 'supplier',
      header: 'Supplier',
      render: (g) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{g.supplier_name || '—'}</p>
          <p className="truncate text-xs text-ink-subtle">
            {g.supplier_invoice_no ? `Invoice ${g.supplier_invoice_no}` : 'No invoice number'}
          </p>
        </div>
      ),
      sortValue: (g) => g.supplier_name ?? '',
    },
    {
      key: 'date',
      header: 'Invoice date',
      secondary: true,
      render: (g) => <span className="text-xs text-ink-muted">{formatDate(g.invoice_date)}</span>,
      sortValue: (g) => g.invoice_date ?? '',
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (g) => (
        <span className="tabular text-ink">
          {(g.items ?? []).reduce((n, l) => n + Number(l.quantity ?? 0), 0)}
        </span>
      ),
      sortValue: (g) => (g.items ?? []).reduce((n, l) => n + Number(l.quantity ?? 0), 0),
    },
    {
      key: 'value',
      header: 'Value',
      align: 'right',
      render: (g) => <span className="tabular font-medium">{money(g.total_amount)}</span>,
      sortValue: (g) => Number(g.total_amount ?? 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (g) =>
        g.posted_at ? (
          <Badge tone="success" size="sm" icon={<CheckCircle2 className="h-3 w-3" />}>
            In stock
          </Badge>
        ) : (
          <Badge tone="warn" size="sm">
            Draft
          </Badge>
        ),
      sortValue: (g) => (g.posted_at ? 1 : 0),
    },
  ];

  async function startFromPo(poId: number) {
    try {
      const grv = await fromPo.mutateAsync(poId);
      setEditing(grv);
      toast.success('Delivery started', 'Adjust the quantities to what actually arrived.');
    } catch (error) {
      toast.error('Could not start it', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <>
      <ModuleHeader
        title="Goods received"
        description="Book deliveries in against the supplier invoice. Stock only moves when you post."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New delivery
          </Button>
        }
      />

      <div className="space-y-5 p-6">
        {(orders.data ?? []).length > 0 && (
          <div className="rounded-2xl border border-hairline bg-raised/60 p-4">
            <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
              Purchase orders still outstanding
            </h3>
            <ul className="flex flex-wrap gap-2">
              {(orders.data ?? []).map((po) => (
                <li key={po.id}>
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Truck className="h-4 w-4" />}
                    loading={fromPo.isPending}
                    onClick={() => void startFromPo(po.id)}
                  >
                    PO #{po.id} · {po.supplier_name ?? '—'} · {money(po.total_amount)}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {drafts.length > 0 && (
          <Notice tone="warn" title={`${drafts.length} delivery(s) not yet in stock`}>
            Nothing on a draft note counts as stock. Open it, check it against the invoice, and
            post it.
          </Notice>
        )}

        <Input
          placeholder="Search by supplier or invoice number…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(g) => g.id}
            loading={grvs.isLoading}
            onRowClick={setEditing}
            defaultSort={{ key: 'id', direction: 'desc' }}
            empty={{
              title: 'No deliveries recorded',
              message: 'Book the next one in here and the stock will have a paper trail.',
            }}
          />
        </div>
      </div>

      {editing && (
        <GrvDialog
          grv={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onPosted={(result) => {
            setEditing(null);
            setReceipt(result);
          }}
        />
      )}

      {receipt && <ReceiptDialog result={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

/* ── Capturing a delivery ────────────────────────────────────────────────── */

function GrvDialog({
  grv,
  onClose,
  onPosted,
}: {
  grv: GrvRow | null;
  onClose: () => void;
  onPosted: (result: ReceiptResult) => void;
}) {
  const toast = useToast();
  const save = useSaveGrv();
  const receive = useReceiveGrv();

  const posted = Boolean(grv?.posted_at);

  const [supplier, setSupplier] = useState(grv?.supplier_name ?? '');
  const [invoiceNo, setInvoiceNo] = useState(grv?.supplier_invoice_no ?? '');
  const [invoiceDate, setInvoiceDate] = useState(
    grv?.invoice_date ?? new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState(grv?.notes ?? '');
  const [lines, setLines] = useState<IntakeLine[]>(grv?.items ?? []);
  const [term, setTerm] = useState('');
  const [scanFor, setScanFor] = useState<number | null>(null);

  // The invoice reader. Parsed lines that matched a product land straight in
  // `lines`; the rest wait in `pending` until staff place or dismiss them.
  const pdfRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [pending, setPending] = useState<ParsedInvoiceLine[]>([]);
  const [resolving, setResolving] = useState<number | null>(null);
  const [readSummary, setReadSummary] = useState<string | null>(null);

  const lookup = useProductLookup(term);
  const total = useMemo(() => round2(lines.reduce((n, l) => n + l.line_total, 0)), [lines]);
  const units = useMemo(() => lines.reduce((n, l) => n + l.quantity, 0), [lines]);
  const serials = useMemo(() => lines.reduce((n, l) => n + l.imeis.length, 0), [lines]);

  function addProduct(p: {
    id: number;
    name: string;
    sku: string | null;
    color: string | null;
    cost_price: number;
  }) {
    // Picking a result while placing an unmatched invoice line carries that
    // line's quantity and cost across, and settles it.
    const fromInvoice = resolving !== null ? pending[resolving] : undefined;
    if (resolving !== null) {
      setPending((current) => current.filter((_, i) => i !== resolving));
      setResolving(null);
    }

    const quantity = fromInvoice?.quantity ?? 1;
    const unitCost = fromInvoice?.unitPrice ?? Number(p.cost_price) ?? 0;

    setTerm('');
    setLines((current) =>
      current.some((l) => l.product_id === p.id)
        ? current
        : [
            ...current,
            {
              product_id: p.id,
              name: p.name,
              sku: p.sku,
              color: p.color,
              quantity,
              unit_cost: unitCost,
              line_total: round2(quantity * unitCost),
              imeis: [],
            },
          ],
    );
  }

  async function readInvoice(file: File) {
    setReading(true);
    try {
      const parsed = await readInvoicePdf(file);
      const catalog = await fetchIntakeCatalog();

      // Zero-priced rows are labour, warranty or freebies — counted so the
      // line tally matches the paper, but never offered as stock.
      const priced = parsed.lines.filter((l) => l.lineTotal > 0);
      const zeroCount = parsed.lines.length - priced.length;
      const { matched, unmatched } = matchInvoiceLines(priced, catalog);

      if (parsed.supplier && !supplier.trim()) setSupplier(parsed.supplier);
      if (parsed.invoiceNumber && !invoiceNo.trim()) setInvoiceNo(parsed.invoiceNumber);
      if (parsed.invoiceDate) setInvoiceDate(parsed.invoiceDate);

      setLines((current) => {
        const next = [...current];
        for (const { product, line } of matched) {
          if (next.some((l) => l.product_id === product.id)) continue;
          next.push({
            product_id: product.id,
            name: product.name,
            sku: product.sku,
            color: product.color,
            quantity: line.quantity,
            unit_cost: line.unitPrice,
            line_total: round2(line.quantity * line.unitPrice),
            imeis: [],
          });
        }
        return next;
      });
      setPending(unmatched);

      if (parsed.lines.length === 0) {
        setReadSummary(
          'No line items could be read from that PDF — its layout is unfamiliar. Add the lines by hand, and consider sending this invoice layout to whoever maintains the system.',
        );
      } else {
        const totalNote =
          parsed.totalAmount !== null
            ? ` The invoice says ${money(parsed.totalAmount)} — compare it with the total below.`
            : '';
        const zeroNote =
          zeroCount > 0
            ? ` ${zeroCount} zero-priced line${zeroCount === 1 ? '' : 's'} (labour or warranty) left out.`
            : '';
        setReadSummary(
          `Read ${parsed.lines.length} line${parsed.lines.length === 1 ? '' : 's'}: ${matched.length} matched to products, ${unmatched.length} need placing.${zeroNote} Check every quantity and cost against the document before posting.${totalNote}`,
        );
      }
    } catch (error) {
      toast.error(
        'Could not read that PDF',
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setReading(false);
      if (pdfRef.current) pdfRef.current.value = '';
    }
  }

  function patch(index: number, values: Partial<IntakeLine>) {
    setLines((current) =>
      current.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, ...values };
        next.line_total = round2(next.quantity * next.unit_cost);
        return next;
      }),
    );
  }

  function addSerial(index: number, raw: string) {
    const imei = raw.trim();
    if (!imei) return;
    setLines((current) =>
      current.map((l, i) =>
        i !== index || l.imeis.includes(imei) ? l : { ...l, imeis: [...l.imeis, imei] },
      ),
    );
  }

  async function persist(): Promise<GrvRow | null> {
    try {
      return await save.mutateAsync({
        id: grv?.id,
        supplier_name: supplier.trim() || null,
        supplier_invoice_no: invoiceNo.trim() || null,
        invoice_date: invoiceDate || null,
        notes: notes.trim() || null,
        items: lines,
        total_amount: total,
        status: 'Draft',
        purchase_order_id: grv?.purchase_order_id ?? null,
        po_number: grv?.po_number ?? null,
      });
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined);
      return null;
    }
  }

  async function post() {
    if (lines.length === 0) {
      toast.warn('Nothing to receive', 'Add what arrived first.');
      return;
    }
    // Saved before posting so the note that gets posted is the one on screen.
    const saved = await persist();
    if (!saved) return;

    try {
      onPosted(await receive.mutateAsync(saved.id));
    } catch (error) {
      toast.error('Could not receive it', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={grv ? `Delivery #${grv.id}` : 'New delivery'}
        description={
          posted
            ? `Received into stock on ${formatDate(grv!.posted_at)} by ${grv!.posted_by ?? '—'}`
            : 'Nothing counts as stock until this is posted.'
        }
        size="xl"
        footer={
          posted ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button
                variant="secondary"
                loading={save.isPending}
                onClick={() => void persist().then((r) => r && toast.success('Draft saved'))}
              >
                Save draft
              </Button>
              <Button
                variant="success"
                icon={<PackageCheck className="h-4 w-4" />}
                loading={receive.isPending || save.isPending}
                onClick={post}
              >
                Receive into stock
              </Button>
            </>
          )
        }
      >
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <SupplierSelect value={supplier} onChange={setSupplier} disabled={posted} />
            <Input
              label="Supplier invoice no."
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              disabled={posted}
            />
            <Input
              label="Invoice date"
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              disabled={posted}
            />
          </div>

          {!posted && (
            <div className="flex items-end gap-2">
              <input
                ref={pdfRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void readInvoice(file);
                }}
              />
              <Button
                variant="secondary"
                icon={<FileSearch className="h-4 w-4" />}
                loading={reading}
                onClick={() => pdfRef.current?.click()}
              >
                Read invoice PDF
              </Button>
            </div>
          )}

          {readSummary && !posted && (
            <Notice tone={pending.length > 0 ? 'danger' : 'info'} title="Read from the invoice">
              {readSummary}
            </Notice>
          )}

          {!posted && pending.length > 0 && (
            <div className="rounded-xl border border-danger/40 bg-danger/5 p-3">
              <p className="text-sm font-semibold text-danger">
                {pending.length === 1 ? 'This line was' : 'These lines were'} not found in your
                products
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                “Place” fills the search box below — pick the right product and the quantity and
                cost carry over. Nothing here reaches stock until it is placed.
              </p>
              <ul className="mt-2 space-y-2">
                {pending.map((line, index) => (
                  <li
                    key={`${line.description}-${index}`}
                    className={cn(
                      'flex flex-wrap items-center gap-2 rounded-lg border border-danger/40 bg-surface px-3 py-2',
                      resolving === index && 'border-brand-400',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">
                      {line.description || '(no description read)'}
                    </span>
                    <span className="tabular shrink-0 text-xs text-ink-subtle">
                      {line.quantity} × {money(line.unitPrice)}
                    </span>
                    <Button
                      size="sm"
                      variant={resolving === index ? 'primary' : 'secondary'}
                      onClick={() => {
                        setResolving(index);
                        setTerm(line.description.slice(0, 40));
                      }}
                    >
                      Place
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<Trash2 className="h-4 w-4" />}
                      onClick={() => {
                        setPending((c) => c.filter((_, i) => i !== index));
                        if (resolving === index) setResolving(null);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!posted && (
            <div>
              <Input
                label="Add what arrived"
                placeholder="Search by name, SKU or barcode…"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
              />
              {(lookup.data ?? []).length > 0 && (
                <ul className="mt-2 max-h-40 divide-y divide-hairline/70 overflow-y-auto rounded-xl border border-hairline">
                  {(lookup.data ?? []).map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-raised"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                        <span className="tabular shrink-0 text-xs text-ink-subtle">
                          {p.stock} on hand · cost {money(p.cost_price)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-hairline p-6 text-center text-sm text-ink-muted">
              Nothing on this delivery yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {lines.map((line, index) => (
                <li key={line.product_id ?? index} className="rounded-xl border border-hairline p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:gap-3">
                    <div className="min-w-[10rem] flex-1">
                      <p className="text-sm font-medium text-ink">{line.name}</p>
                      <p className="text-xs text-ink-subtle">{line.sku ?? '—'}</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                      <Input
                        label="Qty"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        className="w-20"
                        disabled={posted}
                        value={line.quantity || ''}
                        onChange={(e) =>
                          patch(index, { quantity: Math.max(0, Math.floor(toNumber(e.target.value))) })
                        }
                      />
                      <Input
                        label="Unit cost"
                        type="number"
                        inputMode="decimal"
                        className="w-28"
                        disabled={posted}
                        value={line.unit_cost || ''}
                        onChange={(e) => patch(index, { unit_cost: toNumber(e.target.value) })}
                      />
                      <span className="tabular pb-2 text-sm font-semibold text-ink">
                        {money(line.line_total)}
                      </span>
                      {!posted && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={<Trash2 className="h-4 w-4" />}
                          onClick={() => setLines((c) => c.filter((_, i) => i !== index))}
                        >
                          <span className="sr-only">Remove</span>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Serials. Optional by design — a delivery is not held up at
                      the counter because nobody had time to scan every box. */}
                  <div className="mt-3 border-t border-hairline/70 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'text-xs font-medium',
                          line.imeis.length < line.quantity ? 'text-warn' : 'text-success',
                        )}
                      >
                        {line.imeis.length} of {line.quantity} IMEIs captured
                      </span>
                      {!posted && (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<ScanLine className="h-4 w-4" />}
                            onClick={() => setScanFor(index)}
                          >
                            Scan
                          </Button>
                          <Input
                            placeholder="or type an IMEI and press Enter"
                            className="max-w-[16rem]"
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              e.preventDefault();
                              addSerial(index, e.currentTarget.value);
                              e.currentTarget.value = '';
                            }}
                          />
                        </>
                      )}
                    </div>

                    {line.imeis.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {line.imeis.map((imei) => (
                          <li key={imei}>
                            <button
                              type="button"
                              disabled={posted}
                              onClick={() =>
                                patch(index, { imeis: line.imeis.filter((i) => i !== imei) })
                              }
                              className="tabular rounded-md bg-raised px-2 py-1 text-xs text-ink transition-colors hover:bg-danger/10 hover:text-danger disabled:hover:bg-raised disabled:hover:text-ink"
                            >
                              {imei}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Textarea
            label="Notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={posted}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white">
            <div>
              <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/70">
                Delivery value
              </p>
              <p className="tabular font-display text-2xl font-bold">{money(total)}</p>
            </div>
            <p className="tabular text-sm text-white/80">
              {units} unit{units === 1 ? '' : 's'} · {serials} IMEI{serials === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </Modal>

      {scanFor !== null && (
        <BarcodeScanner
          open
          onClose={() => setScanFor(null)}
          onScan={(code) => addSerial(scanFor, code)}
        />
      )}
    </>
  );
}

/* ── What the posting did ────────────────────────────────────────────────── */

/**
 * Supplier picked from the suppliers list, stored as plain text — freehand
 * names split one supplier's purchase history three ways, and now that
 * posting raises a creditor bill, the name is also what the ledger matches
 * the supplier account on. A name read off an invoice that is not in the
 * list yet stays selectable, so old drafts keep working.
 */
function SupplierSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const list = suppliers.useList({ orderBy: { column: 'name', ascending: true } });
  const names = useMemo(() => {
    const unique = [
      ...new Set(
        (list.data ?? []).map((row) => String(row.name ?? '').trim()).filter(Boolean),
      ),
    ];
    if (value && !unique.includes(value)) unique.unshift(value);
    return unique;
  }, [list.data, value]);

  return (
    <Select
      label="Supplier"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={names}
      placeholder={list.isLoading ? 'Loading…' : '—'}
      disabled={disabled}
    />
  );
}

function ReceiptDialog({ result, onClose }: { result: ReceiptResult; onClose: () => void }) {
  return (
    <Modal
      open
      onClose={onClose}
      title="Received into stock"
      size="lg"
      footer={<Button onClick={onClose}>Done</Button>}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-success px-5 py-4 text-white">
          <p className="tabular font-display text-3xl font-bold">{result.units} units</p>
          <p className="text-sm text-white/85">
            across {result.lines} line{result.lines === 1 ? '' : 's'} · {result.imeis} IMEI
            {result.imeis === 1 ? '' : 's'} captured
          </p>
        </div>

        {result.switched_to_serials.length > 0 && (
          <Notice tone="warn" title="These are now counted by IMEI">
            <p className="mb-2">
              The first serial captured against a product hands its stock figure over to the serial
              list for good. Whatever was on the books before has been replaced:
            </p>
            <ul className="space-y-1">
              {result.switched_to_serials.map((s) => (
                <li key={s.name} className="tabular text-sm">
                  {s.name}: {s.stock_before} → <strong>{s.stock_after}</strong>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {result.short_on_serials.length > 0 && (
          <Notice tone="warn" title="Some units have no IMEI">
            <p className="mb-2">
              These are counted by serial, so the units without one will not appear in stock until
              somebody captures them:
            </p>
            <ul className="space-y-1">
              {result.short_on_serials.map((s) => (
                <li key={s.name} className="tabular text-sm">
                  {s.name}: {s.serials} of {s.received} captured
                </li>
              ))}
            </ul>
          </Notice>
        )}
      </div>
    </Modal>
  );
}
