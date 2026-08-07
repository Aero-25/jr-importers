import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { AccountingPeriodRow } from '@/lib/database.types';
import { keys } from './keys';

/* ── Shapes returned by the reporting functions ──────────────────────────── */

export interface VatReturn {
  period_from: string;
  period_to: string;
  rate: number;
  period_locked: boolean;
  sales_inc: number;
  refunds_inc: number;
  net_sales_inc: number;
  output_vat: number;
  purchases_inc: number;
  expenses_inc: number;
  input_vat: number;
  payable: number;
}

export interface StockValuation {
  total_at_cost: number;
  total_units: number;
  by_category: Array<{ category: string; units: number; value: number; retail: number }>;
  dead_days: number;
  dead_value: number;
  dead_stock: Array<{ id: number; name: string; stock: number; value: number; last_sold: string | null }>;
}

export interface AgeingRow {
  customer: string;
  phone: string | null;
  total: number;
  d30: number;
  d60: number;
  d90: number;
  d90_plus: number;
}

export interface SupplierReconRow {
  supplier: string;
  deliveries: number;
  received: number;
  unposted: number;
  no_invoice_no: number;
  paid: number;
}

async function callReport<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);

  const result = data as unknown as T & { ok: boolean; message?: string };
  if (!result?.ok) throw new Error(result?.message ?? 'Could not build that report.');
  return result;
}

export function useVatReturn(from: string, to: string) {
  return useQuery<VatReturn, Error>({
    queryKey: keys.dashboard(`vat-${from}-${to}`),
    queryFn: () => callReport<VatReturn>('vat_return', { p_from: from, p_to: to }),
  });
}

export function useStockValuation(deadDays = 90) {
  return useQuery<StockValuation, Error>({
    queryKey: keys.dashboard(`valuation-${deadDays}`),
    queryFn: () => callReport<StockValuation>('stock_valuation', { p_dead_days: deadDays }),
  });
}

export function useDebtorsAgeing() {
  return useQuery<{ rows: AgeingRow[] }, Error>({
    queryKey: keys.dashboard('ageing'),
    queryFn: () => callReport<{ rows: AgeingRow[] }>('debtors_ageing', {}),
  });
}

export function useSupplierRecon(from: string, to: string) {
  return useQuery<{ rows: SupplierReconRow[] }, Error>({
    queryKey: keys.dashboard(`recon-${from}-${to}`),
    queryFn: () =>
      callReport<{ rows: SupplierReconRow[] }>('supplier_recon', { p_from: from, p_to: to }),
  });
}

/* ── Period close ────────────────────────────────────────────────────────── */

export function usePeriods() {
  return useQuery<AccountingPeriodRow[], Error>({
    queryKey: keys.table('accounting_periods'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('period_from', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useClosePeriod() {
  const qc = useQueryClient();

  return useMutation<AccountingPeriodRow, Error, { from: string; to: string; notes?: string }>({
    mutationFn: async ({ from, to, notes }) => {
      const { data, error } = await supabase.rpc('close_period', {
        p_from: from,
        p_to: to,
        p_notes: notes ?? null,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; period?: AccountingPeriodRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not close the period.');
      return result.period!;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('accounting_periods') }),
  });
}

export function useReopenPeriod() {
  const qc = useQueryClient();

  return useMutation<AccountingPeriodRow, Error, { id: number; reason: string }>({
    mutationFn: async ({ id, reason }) => {
      const { data, error } = await supabase.rpc('reopen_period', { p_id: id, p_reason: reason });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; period?: AccountingPeriodRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not reopen the period.');
      return result.period!;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('accounting_periods') }),
  });
}
