import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  DenominationCounts,
  ExpenseRow,
  LineItem,
  OrderRow,
  ShiftStockLine,
  TillShiftRow,
} from '@/lib/database.types';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';
import { keys } from './keys';

/** Everything the cash-up report needs, computed server-side. */
export interface CashUp {
  ok: boolean;
  shift_id: number;
  till_id: number;
  cashier: string | null;
  closed_by: string | null;
  status: string;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  cash_sales: number;
  card_sales: number;
  eft_sales: number;
  other_sales: number;
  total_sales: number;
  transaction_count: number;
  petty_cash: number;
  /** Approved refunds in this shift. Only the cash ones come out of the drawer. */
  refunds: number;
  cash_refunds: number;
  refund_count: number;
  expected_cash: number;
  counted_cash: number;
  variance: number;
  opening_denominations: DenominationCounts;
  closing_denominations: DenominationCounts;
  stock_count: ShiftStockLine[];
  stock_lines_off: number;
  stock_variance_total: number;
  notes: string | null;
}

/* ── Shifts ──────────────────────────────────────────────────────────────── */

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

export function useShifts(limit = 60) {
  return useQuery<TillShiftRow[], Error>({
    queryKey: keys.list('till_shifts', { recent: limit }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('till_shifts')
        .select('*')
        .order('opening_time', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Opens a till against a counted drawer.
 *
 * The float is the sum of the denominations, never a typed figure — a typed
 * float is an assertion, a counted one is evidence, and at close the gap
 * between the two is the only number worth discussing.
 */
export function useOpenTill() {
  const qc = useQueryClient();

  return useMutation<
    TillShiftRow,
    Error,
    { tillId?: number; cashierName: string; counts: DenominationCounts; total: number }
  >({
    mutationFn: async ({ tillId = 1, cashierName, counts, total }) => {
      const { data: existing } = await supabase
        .from('till_shifts')
        .select('id')
        .eq('till_id', tillId)
        .eq('status', 'Open')
        .maybeSingle();
      if (existing) throw new Error('This till already has an open shift. Close it first.');

      const { data, error } = await supabase
        .from('till_shifts')
        .insert({
          till_id: tillId,
          cashier_name: cashierName,
          opening_float: total,
          opening_denominations: counts,
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
 * Closes a shift.
 *
 * Totals come from `till_cash_up` rather than being recomputed here, so the
 * figure written onto the shift is the same one the report shows. The phone
 * count is stored for the report and deliberately does not touch stock.
 */
export function useCloseTill() {
  const qc = useQueryClient();

  return useMutation<
    CashUp,
    Error,
    {
      shift: TillShiftRow;
      counts: DenominationCounts;
      counted: number;
      stockCount: ShiftStockLine[];
      closedBy: string;
      notes?: string;
    }
  >({
    mutationFn: async ({ shift, counts, counted, stockCount, closedBy, notes }) => {
      const variance = stockCount.reduce((n, line) => n + Math.abs(line.variance), 0);

      const { error: saveError } = await supabase
        .from('till_shifts')
        .update({
          closing_denominations: counts,
          actual_cash: counted,
          closing_stock_count: stockCount,
          stock_variance_total: variance,
          closed_by: closedBy,
          notes: notes ?? null,
        })
        .eq('id', shift.id);
      if (saveError) throw new Error(saveError.message);

      // Ask the server for the reconciliation, then persist its numbers.
      const summary = await fetchCashUp(shift.id);

      const { error: closeError } = await supabase
        .from('till_shifts')
        .update({
          closing_time: new Date().toISOString(),
          expected_cash: summary.expected_cash,
          cash_variance: summary.variance,
          total_sales: summary.total_sales,
          cash_sales: summary.cash_sales,
          card_sales: round2(summary.card_sales + summary.eft_sales + summary.other_sales),
          petty_cash_total: summary.petty_cash,
          transaction_count: summary.transaction_count,
          status: 'Closed',
        })
        .eq('id', shift.id);
      if (closeError) throw new Error(closeError.message);

      return summary;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('till_shifts') });
      void qc.invalidateQueries({ queryKey: keys.table('expenses') });
    },
  });
}

export async function fetchCashUp(shiftId: number): Promise<CashUp> {
  const { data, error } = await supabase.rpc('till_cash_up', { p_shift_id: shiftId });
  if (error) throw new Error(error.message);

  const result = data as unknown as CashUp;
  if (!result?.ok) throw new Error('Could not build the cash-up for that shift.');
  return result;
}

export function useCashUp(shiftId: number | null | undefined) {
  return useQuery<CashUp, Error>({
    queryKey: ['cash_up', shiftId],
    enabled: Boolean(shiftId),
    staleTime: 10_000,
    queryFn: () => fetchCashUp(shiftId!),
  });
}

/* ── Petty cash ──────────────────────────────────────────────────────────── */

/**
 * Money taken out of the drawer during a shift.
 *
 * Recorded in the ordinary expenses ledger with the shift attached, rather
 * than a separate petty-cash table: it is a real business expense that also
 * happens to reduce the cash on hand, and keeping one ledger means the monthly
 * expense report is complete without anyone remembering to merge two lists.
 */
export function usePettyCash(shiftId: number | null | undefined) {
  return useQuery<ExpenseRow[], Error>({
    queryKey: keys.list('expenses', { shift: shiftId }),
    enabled: Boolean(shiftId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('till_shift_id', shiftId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useAddPettyCash() {
  const qc = useQueryClient();

  return useMutation<
    ExpenseRow,
    Error,
    {
      shiftId: number;
      amount: number;
      description: string;
      invoiceNumber: string;
      paidTo?: string;
      category?: string;
      createdBy: string;
    }
  >({
    mutationFn: async (input) => {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          till_shift_id: input.shiftId,
          amount: round2(input.amount),
          description: input.description,
          receipt_number: input.invoiceNumber,
          supplier_vendor: input.paidTo ?? null,
          category: input.category ?? 'Petty cash',
          payment_method: 'Cash',
          expense_date: new Date().toISOString().slice(0, 10),
          created_by: input.createdBy,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('expenses') });
      void qc.invalidateQueries({ queryKey: ['cash_up'] });
    },
  });
}

/**
 * Corrects the counted cash on a closed shift.
 *
 * The original count is kept beside the new one server-side. An amendment that
 * erases what it replaced is not a correction, it is a rewrite — and the whole
 * value of a cash-up is that it records what was actually found in the drawer.
 */
export function useAmendCashUp() {
  const qc = useQueryClient();

  return useMutation<
    TillShiftRow,
    Error,
    { shiftId: number; counts: DenominationCounts; reason: string; notes?: string }
  >({
    mutationFn: async ({ shiftId, counts, reason, notes }) => {
      const { data, error } = await supabase.rpc('amend_cash_up', {
        p_shift_id: shiftId,
        p_counts: counts as unknown as never,
        p_reason: reason,
        p_notes: notes ?? null,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; shift?: TillShiftRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not amend the cash-up.');
      return result.shift!;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('till_shifts') });
      void qc.invalidateQueries({ queryKey: keys.dashboard('') });
    },
  });
}

/* ── Sales ───────────────────────────────────────────────────────────────── */

export interface PosSaleInput {
  items: LineItem[];
  discount: number;
  paymentMethod: string;
  amountTendered?: number;
  customer?: { id?: string | null; name?: string | null; phone?: string | null };
  cashierName: string;
  shiftId: number | null;
  notes?: string | null;
}

/**
 * Rings up a counter sale.
 *
 * Stamped with the shift so the cash-up is a query rather than a
 * reconstruction from timestamps, and decremented through the same
 * `reserve_order_stock` transaction the storefront uses — counter sales and
 * web orders move stock down exactly one code path.
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
          customer_name: input.customer?.name || 'Walk-in customer',
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
          till_shift_id: input.shiftId,
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
      void qc.invalidateQueries({ queryKey: ['cash_up'] });
    },
  });
}

/** Sales rung up on a given shift, for the report and the on-screen list. */
export function useShiftSales(shiftId: number | null | undefined) {
  return useQuery<OrderRow[], Error>({
    queryKey: keys.list('orders', { shift: shiftId }),
    enabled: Boolean(shiftId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('till_shift_id', shiftId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Till lookup: exact barcode/SKU first, then a name contains-match.
 *
 * A scanner types the full barcode and presses Enter, so an exact hit has to
 * win even when those digits also appear inside another product's name.
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
