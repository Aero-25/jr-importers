import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { GrvRow, PurchaseOrderRow } from '@/lib/database.types';
import { keys } from './keys';

export interface ReceiptResult {
  lines: number;
  units: number;
  imeis: number;
  /** Tracked products where fewer serials were captured than units received. */
  short_on_serials: Array<{ name: string; received: number; serials: number }>;
  /** Products whose stock figure just became the serial count. */
  switched_to_serials: Array<{ name: string; stock_before: number; stock_after: number }>;
}

export function useGrvs(search = '') {
  return useQuery<GrvRow[], Error>({
    queryKey: keys.list('grvs', { search }),
    queryFn: async () => {
      let query = supabase.from('grvs').select('*');
      // Commas and parens break out of the PostgREST `or` grammar, and supplier
      // names here really do contain them — "(Pty) Ltd" is the usual suffix.
      const term = search.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        query = query.or(`supplier_name.ilike.%${term}%,supplier_invoice_no.ilike.%${term}%`);
      }
      const { data, error } = await query.order('id', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useOpenPurchaseOrders() {
  return useQuery<PurchaseOrderRow[], Error>({
    queryKey: keys.list('purchase_orders', { open: true }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .not('status', 'in', '("Received","Cancelled")')
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.table('grvs') });
  void qc.invalidateQueries({ queryKey: keys.table('purchase_orders') });
  // Receiving moves stock, cost prices and serials all at once.
  void qc.invalidateQueries({ queryKey: keys.table('products') });
  void qc.invalidateQueries({ queryKey: keys.table('product_imeis') });
}

export function useSaveGrv() {
  const qc = useQueryClient();

  return useMutation<GrvRow, Error, Partial<GrvRow> & { id?: number }>({
    mutationFn: async ({ id, ...values }) => {
      const query = id
        ? supabase.from('grvs').update(values).eq('id', id).select().single()
        : supabase.from('grvs').insert(values).select().single();
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => invalidate(qc),
  });
}

/**
 * Posts a delivery into stock.
 *
 * Deliberately a mutation over an RPC rather than a set of table writes: stock,
 * cost, serials and the movement record have to move together or the note stops
 * being an explanation of anything.
 */
export function useReceiveGrv() {
  const qc = useQueryClient();

  return useMutation<ReceiptResult, Error, number>({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('receive_grv', { p_id: id });
      if (error) throw new Error(error.message);

      const result = data as unknown as ReceiptResult & { ok: boolean; message?: string };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not receive this delivery.');
      return result;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useGrvFromPurchaseOrder() {
  const qc = useQueryClient();

  return useMutation<GrvRow, Error, number>({
    mutationFn: async (poId) => {
      const { data, error } = await supabase.rpc('grv_from_purchase_order', { p_po_id: poId });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; grv?: GrvRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not start a delivery.');
      return result.grv!;
    },
    onSuccess: () => invalidate(qc),
  });
}

/**
 * The whole active catalogue in one read, for matching invoice lines locally.
 * At the shop's size this is a small payload; matching in the browser keeps
 * the invoice reader free of round trips.
 */
export async function fetchIntakeCatalog() {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, barcode, color, cost_price')
    .eq('active', true);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Product lookup for adding lines to a delivery. */
export function useProductLookup(term: string) {
  return useQuery({
    queryKey: keys.list('products', { intake: term }),
    enabled: term.trim().length > 1,
    queryFn: async () => {
      const t = term.trim().replace(/[,()]/g, ' ').trim();
      if (!t) return [];
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku, barcode, color, cost_price, stock, category')
        .eq('active', true)
        .or(`name.ilike.%${t}%,sku.ilike.%${t}%,barcode.eq.${t}`)
        .order('name')
        .limit(20);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
