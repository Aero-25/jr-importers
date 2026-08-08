import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { LaybyRow } from '@/lib/database.types';
import { keys } from './keys';

/** Laybuy terms, shown on the shop and enforced by the database functions. */
export const LAYBY_TERMS = {
  depositRate: 0.1,
  months: 3,
} as const;

export function laybyDeposit(price: number): number {
  return Math.round(price * LAYBY_TERMS.depositRate * 100) / 100;
}

/** The nudge, not a rule: what paying it off evenly would look like. */
export function laybySuggestedInstalment(balance: number): number {
  return Math.round((balance / LAYBY_TERMS.months) * 100) / 100;
}

/** The signed-in customer's laybuys. RLS only ever returns their own rows. */
export function useMyLaybys(userId: string | null | undefined) {
  return useQuery<LaybyRow[], Error>({
    queryKey: keys.list('laybys', { mine: userId ?? '' }),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('laybys')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as LaybyRow[];
    },
  });
}

interface RpcReply {
  ok: boolean;
  message?: string;
  layby_id?: number;
  layby_number?: string;
  deposit?: number;
  balance?: number;
  status?: string;
  existing?: boolean;
  duplicate?: boolean;
}

/** Opens the laybuy after the deposit payment has been verified with DPO. */
export function useOpenLayby() {
  const qc = useQueryClient();
  return useMutation<RpcReply, Error, {
    productId: number;
    color: string | null;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    reference: string;
  }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('open_online_layby', {
        p_product_id: input.productId,
        p_color: input.color,
        p_customer_name: input.customerName,
        p_customer_phone: input.customerPhone,
        p_customer_email: input.customerEmail,
        p_reference: input.reference,
      });
      if (error) throw new Error(error.message);
      const reply = data as unknown as RpcReply;
      if (!reply?.ok) throw new Error(reply?.message ?? 'The laybuy could not be opened.');
      return reply;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.table('laybys') });
      void qc.invalidateQueries({ queryKey: keys.table('products') });
    },
  });
}

/** Records a verified instalment. The database caps it at the balance. */
export function usePayLayby() {
  const qc = useQueryClient();
  return useMutation<RpcReply, Error, { laybyId: number; amount: number; reference: string }>({
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('pay_online_layby', {
        p_layby_id: input.laybyId,
        p_amount: input.amount,
        p_reference: input.reference,
      });
      if (error) throw new Error(error.message);
      const reply = data as unknown as RpcReply;
      if (!reply?.ok) throw new Error(reply?.message ?? 'The payment could not be recorded.');
      return reply;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('laybys') }),
  });
}
