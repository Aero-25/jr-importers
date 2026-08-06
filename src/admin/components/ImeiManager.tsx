import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanLine, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { colourSwatch } from '@/data/products';
import type { ProductImeiRow } from '@/lib/database.types';
import { Badge, Button, Input, Notice, Textarea, useToast } from '@/ui';

/**
 * Books handsets in one unit at a time.
 *
 * Phones are stocked by IMEI, so `products.stock` is not typed by hand — the
 * `sync_product_stock_from_imeis` trigger recomputes it from the available
 * rows here. That is why the stock field goes read-only as soon as the first
 * IMEI is captured: two people editing the same number is how stock drifts.
 *
 * Colour lives on the unit rather than the product, because a shipment
 * genuinely arrives as "four black, two blue" and the shop needs to sell them
 * as such.
 */
export function ImeiManager({ productId }: { productId: number }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [bulk, setBulk] = useState('');
  const [colour, setColour] = useState('');

  const list = useQuery<ProductImeiRow[], Error>({
    queryKey: keys.list('product_imeis', { product: productId }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_imeis')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = list.data ?? [];
  const available = rows.filter((r) => r.status === 'available');

  const byColour = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of available) {
      const key = row.color?.trim() || 'Unspecified';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [available]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: keys.table('product_imeis') });
    void qc.invalidateQueries({ queryKey: keys.table('products') });
  };

  const add = useMutation<number, Error, void>({
    mutationFn: async () => {
      // One per line. "IMEI" or "IMEI, colour" — a per-line colour wins over
      // the box above, so a mixed shipment can be pasted in one go.
      const entries = bulk
        .split(/[\n\r]+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [rawImei, rawColour] = line.split(/[,;\t]/);
          return {
            imei: (rawImei ?? '').replace(/\D/g, ''),
            color: (rawColour ?? colour).trim() || null,
          };
        })
        .filter((e) => e.imei.length > 0);

      const bad = entries.filter((e) => e.imei.length !== 15);
      if (bad.length > 0) {
        throw new Error(
          `${bad.length} entr${bad.length === 1 ? 'y is' : 'ies are'} not 15 digits — check ${bad
            .slice(0, 3)
            .map((e) => e.imei)
            .join(', ')}`,
        );
      }
      if (entries.length === 0) throw new Error('Paste at least one IMEI.');

      const seen = new Set(rows.map((r) => r.imei));
      const fresh = entries.filter((e) => !seen.has(e.imei));
      if (fresh.length === 0) throw new Error('Those IMEIs are already booked in.');

      const { error } = await supabase.from('product_imeis').insert(
        fresh.map((e) => ({
          product_id: productId,
          imei: e.imei,
          color: e.color,
          status: 'available',
        })),
      );
      if (error) throw new Error(error.message);
      return fresh.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} handset${count === 1 ? '' : 's'} booked in`, 'Stock updated.');
      setBulk('');
      invalidate();
    },
    onError: (error) => toast.error('Could not book them in', error.message),
  });

  const remove = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('product_imeis').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success('Removed');
      invalidate();
    },
    onError: (error) => toast.error('Could not remove', error.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
          Handsets by IMEI
        </p>
        <span className="tabular text-xs text-ink-subtle">
          {available.length} available · {rows.length} total
        </span>
      </div>

      {byColour.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {byColour.map(([name, count]) => (
            <span
              key={name}
              className="inline-flex items-center gap-2 rounded-full border border-hairline px-3 py-1 text-xs text-ink"
            >
              <span
                aria-hidden
                className="h-3 w-3 rounded-full border border-black/15"
                style={{ background: colourSwatch(name === 'Unspecified' ? null : name) }}
              />
              {name}
              <span className="tabular font-semibold">{count}</span>
            </span>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-hairline p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Input
            label="Colour for this batch"
            value={colour}
            onChange={(e) => setColour(e.target.value)}
            placeholder="Midnight Black"
            hint="Used for any line that does not name its own colour."
          />
          <Button
            icon={<ScanLine className="h-4 w-4" />}
            onClick={() => add.mutate()}
            loading={add.isPending}
          >
            Book in
          </Button>
        </div>

        <Textarea
          label="IMEI numbers"
          rows={4}
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          className="mt-3 font-mono text-sm"
          placeholder={'356938035643809\n356938035643810, Blue\n356938035643811, Blue'}
          hint="One per line. Add a comma and a colour to override the batch colour."
        />
      </div>

      {rows.length === 0 ? (
        <Notice tone="warn" title="No handsets booked in yet">
          Until at least one IMEI is captured this product falls back to the plain stock number,
          and the shop cannot offer colours for it.
        </Notice>
      ) : (
        <ul className="max-h-56 divide-y divide-hairline overflow-y-auto rounded-xl border border-hairline">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2">
              <span
                aria-hidden
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/15"
                style={{ background: colourSwatch(row.color) }}
              />
              <span className="tabular flex-1 font-mono text-xs text-ink">{row.imei}</span>
              <span className="truncate text-xs text-ink-muted">{row.color ?? '—'}</span>
              <Badge tone={row.status === 'available' ? 'success' : 'neutral'} size="sm">
                {row.status}
              </Badge>
              {/* Sold units stay on the record — they are the sale's audit trail. */}
              {row.status === 'available' && (
                <button
                  type="button"
                  aria-label={`Remove ${row.imei}`}
                  onClick={() => remove.mutate(row.id)}
                  className="rounded p-1 text-ink-subtle transition-colors hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
