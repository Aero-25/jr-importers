import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  isStuck,
  pendingSales,
  queueSale,
  recordFailure,
  removeSale,
  type QueuedSale,
} from '@/lib/offlineQueue';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';
import { keys } from './keys';
import type { PosSaleInput } from './till';

/**
 * Posts one queued sale.
 *
 * Kept identical to the online path on purpose — the same insert, the same
 * `reserve_order_stock` call — so an offline sale is not a second kind of sale
 * with its own bugs. The two differences are deliberate: the order carries the
 * time it was rung up rather than the time it synced, and its id is the id
 * generated on the device, which is what makes a retry safe.
 */
async function postSale(sale: QueuedSale): Promise<void> {
  const subtotal = round2(sale.items.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const discount = round2(Math.min(Math.max(sale.discount, 0), subtotal));
  const total = round2(subtotal - discount);
  const { net, vat } = vatFromInclusive(total, DEFAULT_VAT_RATE);

  const { error } = await supabase.from('orders').insert({
    id: sale.id,
    user_id: sale.customer?.id ?? null,
    customer_name: sale.customer?.name || 'Walk-in customer',
    customer_phone: sale.customer?.phone ?? null,
    items: sale.items,
    subtotal,
    subtotal_amount: net,
    vat_amount: vat,
    total_amount: total,
    coupon_discount: discount || null,
    payment_method: sale.paymentMethod,
    delivery_method: 'Collection',
    status: 'Paid',
    created_at: sale.takenAt,
    paid_at: sale.takenAt,
    till_shift_id: sale.shiftId,
    notes: [sale.notes, `Sold by ${sale.cashierName}`, 'Rung up offline']
      .filter(Boolean)
      .join(' · '),
  });

  // A duplicate primary key means this sale already landed — the response was
  // lost, not the sale. Treat it as done rather than ringing it up twice.
  if (error && error.code !== '23505') throw new Error(error.message);

  const { data, error: reserveError } = await supabase.rpc('reserve_order_stock', {
    p_order_id: sale.id,
  });
  if (reserveError) throw new Error(reserveError.message);

  const result = data as unknown as { ok?: boolean; message?: string };
  if (result && result.ok === false) {
    // The sale happened — a customer walked out with the phone. Stock simply
    // cannot go where the system thought it would, so the order stands and the
    // discrepancy is flagged rather than the sale being discarded.
    await supabase
      .from('orders')
      .update({ notes: `Rung up offline · stock conflict on sync: ${result.message ?? 'unknown'}` })
      .eq('id', sale.id);
  }
}

export interface OfflineState {
  online: boolean;
  pending: QueuedSale[];
  stuck: QueuedSale[];
  syncing: boolean;
}

/**
 * Watches the connection and drains the queue whenever it comes back.
 *
 * `navigator.onLine` only tells you the device has an interface, not that the
 * server is reachable, so a failed post is what actually marks us offline —
 * the flag is treated as a hint, never as proof.
 */
export function useOfflineSales() {
  const qc = useQueryClient();
  const [state, setState] = useState<OfflineState>({
    online: navigator.onLine,
    pending: [],
    stuck: [],
    syncing: false,
  });

  const refresh = useCallback(async () => {
    const rows = await pendingSales();
    setState((s) => ({ ...s, pending: rows.filter((r) => !isStuck(r)), stuck: rows.filter(isStuck) }));
  }, []);

  const sync = useCallback(async () => {
    const rows = (await pendingSales()).filter((r) => !isStuck(r));
    if (rows.length === 0) {
      await refresh();
      return;
    }

    setState((s) => ({ ...s, syncing: true }));
    let anyFailed = false;

    for (const sale of rows) {
      try {
        await postSale(sale);
        await removeSale(sale.id);
      } catch (error) {
        anyFailed = true;
        await recordFailure(sale, error instanceof Error ? error.message : 'Unknown error');
        // Stop at the first failure: the line is almost certainly still down,
        // and hammering it burns the attempt counter on every sale at once.
        break;
      }
    }

    setState((s) => ({ ...s, syncing: false, online: !anyFailed }));
    await refresh();
    void qc.invalidateQueries({ queryKey: keys.table('orders') });
    void qc.invalidateQueries({ queryKey: keys.table('products') });
  }, [qc, refresh]);

  useEffect(() => {
    void refresh();

    const onOnline = () => {
      setState((s) => ({ ...s, online: true }));
      void sync();
    };
    const onOffline = () => setState((s) => ({ ...s, online: false }));

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // A retry timer as well as the event: the browser fires `online` when the
    // interface returns, which is often before anything is actually routable.
    const timer = window.setInterval(() => void sync(), 30_000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  /** Rings up a sale, taking the offline path only when the online one fails. */
  const sell = useCallback(
    async (input: PosSaleInput): Promise<'posted' | 'queued'> => {
      const sale = await queueSale({
        items: input.items,
        discount: input.discount,
        paymentMethod: input.paymentMethod,
        amountTendered: input.amountTendered,
        customer: input.customer,
        cashierName: input.cashierName,
        shiftId: input.shiftId,
        notes: input.notes,
      });

      try {
        // Queued first, then posted immediately. Writing to the queue before
        // the network attempt is what guarantees a sale is never lost to a
        // request that dies halfway.
        await postSale(sale);
        await removeSale(sale.id);
        await refresh();
        void qc.invalidateQueries({ queryKey: keys.table('orders') });
        void qc.invalidateQueries({ queryKey: keys.table('products') });
        return 'posted';
      } catch (error) {
        await recordFailure(sale, error instanceof Error ? error.message : 'Unknown error');
        setState((s) => ({ ...s, online: false }));
        await refresh();
        return 'queued';
      }
    },
    [qc, refresh],
  );

  return { ...state, sell, sync, refresh };
}
