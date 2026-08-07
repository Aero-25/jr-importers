import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Download, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import type { DenominationCounts, ShiftStockLine, TillShiftRow } from '@/lib/database.types';
import { useCloseTill, type CashUp } from '@/data/till';
import { downloadCashUpPdf, shareCashUp } from '@/lib/cashUpPdf';
import { useCashUpFile } from '../hooks/useCashUpFile';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, Modal, Notice, Textarea, useToast } from '@/ui';
import { DenominationCounter, denominationTotal } from '../components/DenominationCounter';

type Step = 'cash' | 'phones' | 'done';

/**
 * Closing a shift, in the order the work actually happens: count the drawer,
 * count the phones, then read the reconciliation.
 *
 * The phone count is advisory by design — it is recorded and any discrepancy
 * is flagged on the report, but it never writes to stock. A miscount at the
 * end of a busy Friday should raise a question, not silently rewrite the
 * inventory. Correcting stock stays a deliberate act via Stock Takes.
 */
export function CloseTillDialog({
  open,
  onClose,
  shift,
  closedBy,
}: {
  open: boolean;
  onClose: () => void;
  shift: TillShiftRow;
  closedBy: string;
}) {
  const toast = useToast();
  const closeTill = useCloseTill();

  const [step, setStep] = useState<Step>('cash');
  const [counts, setCounts] = useState<DenominationCounts>({});
  const [countedPhones, setCountedPhones] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState('');
  const [report, setReport] = useState<CashUp | null>(null);
  const [sharing, setSharing] = useState(false);
  const cashUpFile = useCashUpFile(report);

  const phones = useQuery({
    queryKey: keys.list('products', { stockTake: 'phones' }),
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, stock, sku')
        .eq('active', true)
        .eq('category', 'Smartphones')
        .order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const counted = denominationTotal(counts);

  const stockLines = useMemo<ShiftStockLine[]>(
    () =>
      (phones.data ?? []).map((p) => {
        const raw = countedPhones[p.id];
        // Un-entered lines count as matching: a blank is "not counted", not a
        // claim that there are zero on the shelf.
        const countedQty = raw === undefined || raw === '' ? p.stock : Math.max(0, Number(raw) || 0);
        return {
          product_id: p.id,
          name: p.name,
          system_qty: p.stock,
          counted_qty: countedQty,
          variance: countedQty - p.stock,
        };
      }),
    [phones.data, countedPhones],
  );

  const offLines = stockLines.filter((l) => l.variance !== 0);
  const untouched = (phones.data ?? []).filter(
    (p) => countedPhones[p.id] === undefined || countedPhones[p.id] === '',
  ).length;

  async function submit() {
    try {
      const summary = await closeTill.mutateAsync({
        shift,
        counts,
        counted,
        stockCount: stockLines,
        closedBy,
        notes: notes.trim() || undefined,
      });
      setReport(summary);
      setStep('done');
      toast.success('Till closed', `Shift #${summary.shift_id} reconciled.`);
    } catch (error) {
      toast.error('Could not close the till', error instanceof Error ? error.message : undefined);
    }
  }

  async function share() {
    if (!report) return;
    setSharing(true);
    try {
      const outcome = await shareCashUp(report, cashUpFile);
      if (outcome === 'link') {
        toast.info('PDF link sent', 'This device cannot attach files, so WhatsApp opened with a link to the report.');
      }
    } catch (error) {
      toast.error('Could not share the report', error instanceof Error ? error.message : undefined);
    } finally {
      setSharing(false);
    }
  }

  function finish() {
    setStep('cash');
    setCounts({});
    setCountedPhones({});
    setNotes('');
    setReport(null);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={step === 'done' ? finish : onClose}
      title={
        step === 'cash'
          ? 'Close till — count the drawer'
          : step === 'phones'
            ? 'Close till — count the phones'
            : `Cash up — shift #${report?.shift_id}`
      }
      description={
        step === 'done' ? undefined : `Till ${shift.till_id} · opened by ${shift.cashier_name ?? '—'}`
      }
      size="xl"
      dismissable={!closeTill.isPending}
      footer={
        step === 'cash' ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={() => setStep('phones')}
              disabled={counted <= 0}
              iconRight={<ArrowRight className="h-4 w-4" />}
            >
              Next: count phones
            </Button>
          </>
        ) : step === 'phones' ? (
          <>
            <Button
              variant="ghost"
              icon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setStep('cash')}
            >
              Back
            </Button>
            <Button variant="danger" onClick={submit} loading={closeTill.isPending}>
              Close the till
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() => report && void downloadCashUpPdf(report)}
            >
              Download PDF
            </Button>
            <Button
              variant="success"
              icon={<MessageCircle className="h-4 w-4" />}
              onClick={share}
              loading={sharing}
            >
              Send on WhatsApp
            </Button>
            <Button onClick={finish}>Done</Button>
          </>
        )
      }
    >
      {step === 'cash' && (
        <>
          <Notice tone="info" className="mb-4">
            Count everything in the drawer, including the float you started with. The difference
            against what the till expects is calculated for you.
          </Notice>
          <DenominationCounter counts={counts} onChange={setCounts} />
        </>
      )}

      {step === 'phones' && (
        <div className="space-y-4">
          <Notice tone="warn" title="This count does not change stock">
            Discrepancies are recorded on the cash-up report so they can be investigated. To
            actually correct stock, do a Stock Take.
          </Notice>

          {phones.isLoading ? (
            <p className="py-8 text-center text-sm text-ink-muted">Loading handsets…</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-hairline">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-hairline bg-raised/60">
                    <th className="px-3 py-2 text-left text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Handset
                    </th>
                    <th className="px-3 py-2 text-right text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      System
                    </th>
                    <th className="px-3 py-2 text-right text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Counted
                    </th>
                    <th className="px-3 py-2 text-right text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      Variance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(phones.data ?? []).map((p) => {
                    const raw = countedPhones[p.id] ?? '';
                    const line = stockLines.find((l) => l.product_id === p.id);
                    const off = (line?.variance ?? 0) !== 0;

                    return (
                      <tr key={p.id} className="border-b border-hairline/60 last:border-0">
                        <td className="px-3 py-2">
                          <p className="truncate text-ink">{p.name}</p>
                          {p.sku && (
                            <p className="truncate font-mono text-2xs text-ink-subtle">{p.sku}</p>
                          )}
                        </td>
                        <td className="tabular px-3 py-2 text-right text-ink-muted">{p.stock}</td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            inputMode="numeric"
                            value={raw}
                            placeholder={String(p.stock)}
                            onChange={(e) =>
                              setCountedPhones((c) => ({ ...c, [p.id]: e.target.value }))
                            }
                            aria-label={`Counted quantity for ${p.name}`}
                            className="tabular h-9 w-20 rounded-lg border border-hairline bg-surface px-2 text-center text-ink focus:border-brand-400 focus:outline-none"
                          />
                        </td>
                        <td
                          className={cn(
                            'tabular px-3 py-2 text-right font-semibold',
                            off ? 'text-danger' : 'text-ink-subtle',
                          )}
                        >
                          {line && line.variance !== 0
                            ? `${line.variance > 0 ? '+' : ''}${line.variance}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 text-sm">
            {offLines.length > 0 ? (
              <Badge tone="danger" icon={<AlertTriangle className="h-3 w-3" />}>
                {offLines.length} line(s) do not match
              </Badge>
            ) : (
              <Badge tone="success" icon={<Check className="h-3 w-3" />}>
                Everything counted matches
              </Badge>
            )}
            {untouched > 0 && (
              <span className="text-xs text-ink-subtle">
                {untouched} line(s) left blank — treated as matching.
              </span>
            )}
          </div>

          <Textarea
            label="Notes for the report"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the owner should know about this shift."
          />
        </div>
      )}

      {step === 'done' && report && <CashUpSummary report={report} />}
    </Modal>
  );
}

/** The reconciliation, on screen. Same numbers the PDF carries. */
export function CashUpSummary({ report }: { report: CashUp }) {
  const short = report.variance < -0.005;
  const over = report.variance > 0.005;

  return (
    <div className="space-y-5">
      <div
        className={cn(
          'rounded-2xl p-5 text-white',
          short || over ? 'bg-danger' : 'bg-success',
        )}
      >
        <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/75">
          {short ? 'Till is short' : over ? 'Till is over' : 'Till balanced'}
        </p>
        <p className="tabular font-display text-4xl font-bold">
          {money(Math.abs(report.variance))}
        </p>
        <p className="tabular mt-1 text-sm text-white/85">
          Expected {money(report.expected_cash)} · Counted {money(report.counted_cash)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Takings
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Line label="Cash" value={money(report.cash_sales)} highlight />
            <Line label="Card" value={money(report.card_sales)} />
            <Line label="EFT" value={money(report.eft_sales)} />
            {report.other_sales > 0 && <Line label="Other" value={money(report.other_sales)} />}
            <Line
              label={`Total (${report.transaction_count} txns)`}
              value={money(report.total_sales)}
              bold
            />
            {report.refunds > 0 && (
              <Line label="Less refunds" value={`− ${money(report.refunds)}`} />
            )}
            {report.refunds > 0 && (
              <Line label="Net takings" value={money(report.total_sales - report.refunds)} bold />
            )}
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Drawer
          </h3>
          <dl className="space-y-1.5 text-sm">
            <Line label="Opening float" value={money(report.opening_float)} />
            <Line label="Cash takings" value={money(report.cash_sales)} highlight />
            <Line label="Petty cash out" value={`− ${money(report.petty_cash)}`} />
            {report.cash_refunds > 0 && (
              <Line
                label={`Refunds paid out (${report.refund_count})`}
                value={`− ${money(report.cash_refunds)}`}
              />
            )}
            <Line label="Expected" value={money(report.expected_cash)} bold />
            <Line label="Counted" value={money(report.counted_cash)} bold />
          </dl>
        </section>
      </div>

      <section>
        <h3 className="mb-2 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
          Phone count
        </h3>
        {(report.stock_count ?? []).length === 0 ? (
          <p className="text-sm text-ink-muted">No phone count was recorded for this shift.</p>
        ) : (
          <>
            <p
              className={cn(
                'mb-2 text-sm font-semibold',
                report.stock_lines_off > 0 ? 'text-danger' : 'text-success',
              )}
            >
              {report.stock_count.length} handsets counted
              {report.stock_lines_off > 0
                ? ` · ${report.stock_lines_off} do not match`
                : ' · all matched'}
            </p>
            {/* The full count, not just the exceptions: the report has to show
                that the count was done, which a list of discrepancies cannot. */}
            <ul
              className={cn(
                'max-h-64 divide-y divide-hairline/70 overflow-y-auto rounded-xl border',
                report.stock_lines_off > 0 ? 'border-danger/40' : 'border-hairline',
              )}
            >
              {report.stock_count.map((l) => (
                <li
                  key={l.product_id}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2 text-sm',
                    l.variance !== 0 && 'bg-danger/5',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-ink">{l.name}</span>
                  <span className="tabular text-xs text-ink-muted">
                    system {l.system_qty} · counted {l.counted_qty}
                  </span>
                  <span
                    className={cn(
                      'tabular w-10 shrink-0 text-right font-bold',
                      l.variance !== 0 ? 'text-danger' : 'text-ink-subtle',
                    )}
                  >
                    {l.variance === 0 ? '—' : `${l.variance > 0 ? '+' : ''}${l.variance}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * `highlight` marks cash.
 *
 * Card and EFT are reported for completeness but settle at the bank; cash is
 * the only tender that has to be in the drawer at the end of the shift, so it
 * is the line the variance is actually explained by and reads that way.
 */
function Line({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: string;
  bold?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between',
        bold && 'border-t border-hairline/70 pt-1.5 font-bold text-ink',
        highlight && '-mx-2 rounded-lg bg-lime-500/15 px-2 py-1 font-semibold text-ink',
      )}
    >
      <dt className={bold || highlight ? '' : 'text-ink-muted'}>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
