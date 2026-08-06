import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LineItem, OrderRow, TillShiftRow } from '@/lib/database.types';
import { CASH_METHODS } from '@/lib/constants';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';
import { keys } from './keys';

/* ── Till shifts ─────────────────────────────────────────────────────────── */

/** The shift this till is currently trading under, if any. */
export function useOpenShift(tillId = 1) {
  return useQuery<TillShiftRow | null, Error>({
    queryKey: keys.openTill(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('till_shifts')
        .select('*')
        .eq('till_id', tillId)
        .eq('status', 'Open')
        .order('opening_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export function useOpenTill() {
  const qc = useQueryClient();
  return useMutation<
    TillShiftRow,
    Error,
    { tillId?: number; cashierName: string; openingFloat: number }
  >({
    mutationFn: async ({ tillId = 1, cashierName, openingFloat }) => {
      const { data, error } = await supabase
        .from('till_shifts')
        .insert({
          till_id: tillId,
          cashier_name: cashierName,
          opening_float: openingFloat,
          status: 'Open',
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('till_shifts') }),
  });
}

/**
 * Closes a shift and records the cash variance.
 *
 * Expected cash is the opening float plus cash takings — card and EFT never
 * touch the drawer, so counting them here would manufacture a shortfall.
 */
export function useCloseTill() {
  const qc = useQueryClient();

  return useMutation<TillShiftRow, Error, { shift: TillShiftRow; countedCash: number }>({
    mutationFn: async ({ shift, countedCash }) => {
      const { data: sales, error: salesError } = await supabase
        .from('orders')
        .select('total_amount, payment_method')
        .gte('created_at', shift.opening_time)
        .in('status', ['Paid', 'Completed']);
      if (salesError) throw new Error(salesError.message);

      const rows = sales ?? [];
      const totalSales = round2(rows.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0));
      const cashSales = round2(
        rows
          .filter((row) => CASH_METHODS.includes(row.payment_method ?? ''))
          .reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0),
      );
      const expectedCash = round2(Number(shift.opening_float) + cashSales);

      const { data, error } = await supabase
        .from('till_shifts')
        .update({
          closing_time: new Date().toISOString(),
          expected_cash: expectedCash,
          actual_cash: round2(countedCash),
          cash_variance: round2(countedCash - expectedCash),
          total_sales: totalSales,
          cash_sales: cashSales,
          card_sales: round2(totalSales - cashSales),
          transaction_count: rows.length,
          status: 'Closed',
        })
        .eq('id', shift.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('till_shifts') }),
  });
}

/* ── Sales ───────────────────────────────────────────────────────────────── */

export interface PosSaleInput {
  items: LineItem[];
  discount: number;
  paymentMethod: string;
  amountTendered?: number;
  customer?: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null };
  cashierName: string;
  notes?: string | null;
}

/**
 * Rings up a counter sale.
 *
 * Writes the order as already `Paid`, then calls the same
 * `reserve_order_stock` transaction the storefront uses, so counter sales and
 * web orders decrement stock through exactly one code path.
 */
export function useCompleteSale() {
  const qc = useQueryClient();

  return useMutation<OrderRow, Error, PosSaleInput>({
    mutationFn: async (input) => {
      const subtotal = round2(
        input.items.reduce((sum, line) => sum + line.price * line.quantity, 0),
      );
      const discount = round2(Math.min(Math.max(input.discount, 0), subtotal));
      const total = round2(subtotal - discount);
      const { net, vat } = vatFromInclusive(total, DEFAULT_VAT_RATE);

      const { data: order, error } = await supabase
        .from('orders')
        .insert({
          user_id: input.customer?.id ?? null,
          customer_name: input.customer?.name ?? 'Walk-in customer',
          customer_email: input.customer?.email ?? null,
          customer_phone: input.customer?.phone ?? null,
          items: input.items,
          subtotal,
          subtotal_amount: net,
          vat_amount: vat,
          total_amount: total,
          coupon_discount: discount || null,
          payment_method: input.paymentMethod,
          delivery_method: 'Collection',
          status: 'Paid',
          paid_at: new Date().toISOString(),
          notes: [input.notes, `Sold by ${input.cashierName}`].filter(Boolean).join(' · '),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      const { data: reservation, error: reserveError } = await supabase.rpc(
        'reserve_order_stock',
        { p_order_id: order.id },
      );

      if (reserveError) {
        await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', order.id);
        throw new Error(reserveError.message);
      }

      const result = reservation as { ok?: boolean; message?: string } | null;
      if (result && result.ok === false) {
        await supabase.from('orders').update({ status: 'Cancelled' }).eq('id', order.id);
        throw new Error(result.message ?? 'Not enough stock to complete this sale.');
      }

      return order;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('orders') });
      void qc.invalidateQueries({ queryKey: keys.table('products') });
      void qc.invalidateQueries({ queryKey: keys.table('till_shifts') });
    },
  });
}

/**
 * Till lookup: exact barcode/SKU first, then a name contains-match.
 *
 * A scanner types the full barcode and presses Enter, so an exact hit has to
 * win even when the digits also appear inside some other product's name.
 */
export function usePosSearch(term: string) {
  const query = term.trim();

  return useQuery({
    queryKey: keys.list('products', { pos: query }),
    enabled: query.length >= 2,
    staleTime: 10_000,
    queryFn: async () => {
      const safe = query.replace(/[,()]/g, ' ').trim();

      const { data: exact, error: exactError } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .or(`barcode.eq.${safe},sku.eq.${safe}`)
        .limit(1);
      if (exactError) throw new Error(exactError.message);
      if (exact && exact.length > 0) return { rows: exact, exact: true };

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .or(`name.ilike.%${safe}%,brand.ilike.%${safe}%,sku.ilike.%${safe}%`)
        .order('name')
        .limit(24);
      if (error) throw new Error(error.message);
      return { rows: data ?? [], exact: false };
    },
  });
}
