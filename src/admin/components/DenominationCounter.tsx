import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { money, round2 } from '@/lib/format';

/**
 * Namibian Dollar denominations, largest first.
 *
 * Counting runs big-to-small the way a cashier actually counts a drawer, so
 * the form matches the hand movement rather than the number line.
 */
// Includes the N$30 and N$60 commemoratives, which do circulate here.
export const NAD_NOTES = [200, 100, 60, 50, 30, 20, 10] as const;
// Cents are not counted: the shop rounds to the dollar, so a cents column just
// adds fields nobody fills in and slows the count down.
export const NAD_COINS = [5, 1] as const;

export type DenominationCounts = Record<string, number>;

/** Sums a count map. Mirrors `public.denomination_total` in SQL exactly. */
export function denominationTotal(counts: DenominationCounts): number {
  return round2(
    Object.entries(counts).reduce((sum, [face, qty]) => {
      const value = Number(face);
      const pieces = Number(qty);
      if (!Number.isFinite(value) || !Number.isFinite(pieces) || pieces < 0) return sum;
      return sum + value * pieces;
    }, 0),
  );
}

const label = (face: number) => `N$${face}`;

/**
 * Counts a cash drawer piece by piece.
 *
 * The float is the sum of what was counted, never a number someone types. That
 * is the whole point: a typed float is an assertion, a counted one is evidence,
 * and at close the difference between them is the only thing worth arguing
 * about.
 */
export function DenominationCounter({
  counts,
  onChange,
  disabled,
  className,
}: {
  counts: DenominationCounts;
  onChange: (counts: DenominationCounts) => void;
  disabled?: boolean;
  className?: string;
}) {
  const total = useMemo(() => denominationTotal(counts), [counts]);
  const pieces = useMemo(
    () => Object.values(counts).reduce((n, q) => n + (Number(q) || 0), 0),
    [counts],
  );

  const set = (face: number, value: string) => {
    const qty = Math.max(0, Math.floor(Number(value) || 0));
    const next = { ...counts };
    if (qty === 0) delete next[String(face)];
    else next[String(face)] = qty;
    onChange(next);
  };

  const row = (face: number) => {
    const qty = counts[String(face)] ?? 0;
    const line = round2(face * qty);

    return (
      <div
        key={face}
        className={cn(
          'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
          qty > 0 ? 'bg-lime-500/10' : 'bg-transparent',
        )}
      >
        <span className="tabular w-16 shrink-0 text-sm font-semibold text-ink">{label(face)}</span>

        <span className="text-xs text-ink-subtle">×</span>

        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          disabled={disabled}
          value={qty === 0 ? '' : qty}
          onChange={(e) => set(face, e.target.value)}
          placeholder="0"
          aria-label={`Number of ${label(face)} pieces`}
          className={cn(
            'tabular h-10 w-20 rounded-lg border border-hairline bg-surface px-2 text-center text-sm text-ink',
            'focus:border-brand-400 focus:outline-none disabled:opacity-60',
          )}
        />

        <span
          className={cn(
            'tabular ml-auto text-sm',
            line > 0 ? 'font-medium text-ink' : 'text-ink-subtle',
          )}
        >
          {money(line)}
        </span>
      </div>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-1.5 px-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Notes
          </h3>
          <div className="space-y-0.5">{NAD_NOTES.map(row)}</div>
        </section>

        <section>
          <h3 className="mb-1.5 px-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Coins
          </h3>
          <div className="space-y-0.5">{NAD_COINS.map(row)}</div>
        </section>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-brand-600 px-5 py-4 text-white">
        <div>
          <p className="text-2xs font-bold uppercase tracking-[0.14em] text-white/70">
            Counted total
          </p>
          <p className="tabular font-display text-3xl font-bold">{money(total)}</p>
        </div>
        <p className="tabular text-sm text-white/80">
          {pieces} {pieces === 1 ? 'piece' : 'pieces'}
        </p>
      </div>
    </div>
  );
}
