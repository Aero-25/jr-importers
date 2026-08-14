import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RefundLine, RefundRow } from '@/lib/database.types';
import { keys } from './keys';

export interface RefundInput {
  reason: string;
  method: string;
  items: RefundLine[];
  total: number;
  orderId?: string | null;
  originalReference?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
}

export function useRefunds(filters: { status?: string; search?: string } = {}) {
  return useQuery<RefundRow[], Error>({
    queryKey: keys.list('refunds', filters),
    queryFn: async () => {
      let query = supabase.from('refunds').select('*');
      if (filters.status) query = query.eq('status', filters.status);

      const term = filters.search?.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        const parts = ['reason.ilike.%' + term + '%', 'customer_name.ilike.%' + term + '%'];
        if (/^\d+$/.test(term)) parts.push(`refund_number.eq.${term}`);
        query = query.or(parts.join(','));
      }

      const { data, error } = await query.order('refund_number', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Refunds still waiting on a manager. Drives the badge on the nav item. */
export function usePendingRefundCount() {
  return useQuery<number, Error>({
    queryKey: keys.list('refunds', { pending: true }),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('refunds')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.table('refunds') });
  // A refund puts stock back and takes cash out, so both are now stale.
  void qc.invalidateQueries({ queryKey: keys.table('products') });
  void qc.invalidateQueries({ queryKey: keys.table('till_shifts') });
}

/**
 * Raises a refund.
 *
 * A manager's request is approved on the spot by the function; a cashier's is
 * left pending. `pending` in the result says which happened, so the screen can
 * tell the person what to expect rather than guessing.
 */
export function useRequestRefund() {
  const qc = useQueryClient();

  return useMutation<{ pending: boolean; refund: RefundRow }, Error, RefundInput>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('request_refund', {
        p_reason: input.reason,
        p_method: input.method,
        p_items: input.items as unknown as never,
        p_total: input.total,
        p_order_id: input.orderId ?? null,
        p_original_reference: input.originalReference ?? null,
        p_customer_name: input.customerName ?? null,
        p_customer_phone: input.customerPhone ?? null,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as {
        ok: boolean;
        pending?: boolean;
        message?: string;
        refund?: RefundRow;
      };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not record the refund.');
      return { pending: Boolean(result.pending), refund: result.refund! };
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useApproveRefund() {
  const qc = useQueryClient();

  return useMutation<RefundRow, Error, number>({
    mutationFn: async (id) => {
      const { data, error } = await supabase.rpc('approve_refund', { p_id: id });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; refund?: RefundRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not approve the refund.');
      return result.refund!;
    },
    onSuccess: () => invalidate(qc),
  });
}

export function useDeclineRefund() {
  const qc = useQueryClient();

  return useMutation<RefundRow, Error, { id: number; reason?: string }>({
    mutationFn: async ({ id, reason }) => {
      const { data, error } = await supabase.rpc('decline_refund', {
        p_id: id,
        p_reason: reason ?? null,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as { ok: boolean; message?: string; refund?: RefundRow };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not decline the refund.');
      return result.refund!;
    },
    onSuccess: () => invalidate(qc),
  });
}

/** Recent sales, for picking the one being refunded. */
export function useRecentSales(search: string) {
  return useQuery({
    queryKey: keys.list('orders', { refundPicker: search }),
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('id, customer_name, customer_phone, total_amount, payment_method, items, created_at')
        .in('status', ['Paid', 'Completed', 'Delivered', 'Dispatched']);

      const term = search.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        query = query.or(
          `customer_name.ilike.%${term}%,customer_phone.ilike.%${term}%,payment_reference.ilike.%${term}%`,
        );
      }

      const { data, error } = await query.order('created_at', { ascending: false }).limit(25);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
