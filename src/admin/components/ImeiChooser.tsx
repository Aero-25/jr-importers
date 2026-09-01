import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import type { LineItem } from '@/lib/database.types';

/** One sellable handset offered to a line. */
export type ImeiUnit = {
  imei: string | null;
  color: string | null;
  serial_number: string | null;
};

/** The serials already picked for a line, whichever field they were stored in. */
export function chosenImeis(line: LineItem): string[] {
  return line.imeis ?? (line.imei ? [line.imei] : []);
}

/**
 * Lines that still need a handset chosen.
 *
 * A line needs one when the product has serialised units in stock and fewer
 * have been picked than the line sells. Used to hold a sale until the cashier
 * has said which phone is going out of the door — offering the choice is not
 * enough, because the busiest moment of the day is exactly when it gets
 * skipped.
 */
export function linesNeedingImeis(
  lines: LineItem[],
  units: Record<number, ImeiUnit[]>,
): LineItem[] {
  return lines.filter((line) => {
    const id = line.product_id;
    if (id == null) return false;
    const pool = units[id] ?? [];
    if (pool.length === 0) return false;
    return chosenImeis(line).length < Math.max(1, Number(line.quantity) || 1);
  });
}

/**
 * Load the available units for whatever products are on a document, in one
 * query rather than one per line.
 */
export function useAvailableUnits(lines: LineItem[]) {
  const productIds = useMemo(
    () => [...new Set(lines.map((l) => l.product_id).filter((id): id is number => Boolean(id)))],
    [lines],
  );
  const [units, setUnits] = useState<Record<number, ImeiUnit[]>>({});
  const [loading, setLoading] = useState(false);
  const key = productIds.join(',');

  useEffect(() => {
    if (productIds.length === 0) {
      setUnits({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void supabase
      .from('product_imeis')
      .select('product_id, imei, color, serial_number')
      .in('product_id', productIds)
      .eq('status', 'available')
      .order('imei')
      .then(({ data }) => {
        if (cancelled) return;
        const grouped: Record<number, ImeiUnit[]> = {};
        for (const row of (data ?? []) as Array<Record<string, unknown>>) {
          const id = Number(row.product_id);
          (grouped[id] ??= []).push({
            imei: (row.imei as string) ?? null,
            color: (row.color as string) ?? null,
            serial_number: (row.serial_number as string) ?? null,
          });
        }
        setUnits(grouped);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { units, loading };
}

/**
 * Choose which physical handsets a line covers.
 *
 * A serialised product is not interchangeable stock: the customer leaves with
 * one particular IMEI, and that is what a warranty claim, an insurance policy
 * and a police report are all matched against. Selling "a RugKing 3 Pro"
 * without recording which one leaves the shop unable to answer any of them.
 *
 * Only units still marked available are offered, and never more than the line
 * quantity, so one handset cannot be promised to two customers.
 */
export function ImeiChooser({
  line,
  units,
  loading,
  onChange,
  compact,
}: {
  line: LineItem;
  units: ImeiUnit[];
  loading: boolean;
  onChange: (imeis: string[]) => void;
  /** Tighter styling for the till, where the cart column is narrow. */
  compact?: boolean;
}) {
  const chosen = chosenImeis(line);
  const qty = Math.max(1, Number(line.quantity) || 1);

  if (loading) return <p className="w-full text-2xs text-ink-subtle">Loading serial numbers…</p>;
  if (units.length === 0) {
    return compact ? null : (
      <p className="w-full text-xs text-ink-subtle">
        No serialised units in stock for this product — nothing to pick.
      </p>
    );
  }

  const short = chosen.length < qty;

  return (
    <div className="w-full">
      <p className="text-2xs font-medium uppercase tracking-wide text-ink-muted">
        {short ? 'Choose the handset' : 'Serial numbers'}
        <span
          className={cn(
            'ml-2 font-normal normal-case tracking-normal',
            short ? 'text-amber-700' : 'text-ink-subtle',
          )}
        >
          {chosen.length} of {qty} chosen
        </span>
      </p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {units.map((unit) => {
          const value = unit.imei ?? unit.serial_number ?? '';
          if (!value) return null;
          const on = chosen.includes(value);
          // Full only blocks adding — a chosen unit can always come off again.
          const full = chosen.length >= qty && !on;
          return (
            <button
              key={value}
              type="button"
              disabled={full}
              onClick={() => onChange(on ? chosen.filter((i) => i !== value) : [...chosen, value])}
              className={cn(
                'rounded-md border px-2 py-1 font-mono text-2xs transition-colors',
                on
                  ? 'border-lime-500 bg-lime-50 text-brand-800'
                  : full
                    ? 'cursor-not-allowed border-hairline text-ink-subtle opacity-50'
                    : 'border-hairline text-ink hover:bg-raised',
              )}
            >
              {value}
              {unit.color ? <span className="ml-1 font-sans text-ink-subtle">{unit.color}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
