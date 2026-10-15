import { useMutation, useQuery } from '@tanstack/react-query';
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

/**
 * Opening and paying a laybuy online is closed.
 *
 * These two called `open_online_layby` and `pay_online_layby`, whose comments
 * said "after the deposit payment has been verified with DPO" and "records a
 * verified instalment". Nothing was verified. The browser passed an amount and
 * a reference string, and the database wrote both down and marked the laybuy
 * settled — so a customer could pay off a phone with a reference they made up
 * and collect it. The EXECUTE grants on both functions have been withdrawn.
 *
 * Verifying a DPO payment needs an outbound HTTPS call, which Postgres cannot
 * make. The Worker that can (/api/dpo-verify-token) holds no credentials for
 * the database, so there is nowhere trustworthy to put this yet. Reinstating
 * it means letting the Worker confirm the payment with DPO and record it with
 * the service key; until then a laybuy is opened and paid at the counter,
 * where take_layby_payment() checks that a staff member is doing it.
 */
const LAYBY_ONLINE_CLOSED ='Laybuys are opened and paid in the shop for now — please call us on '
  + '081 562 9203 and we will set it up.';

export function useOpenLayby() {
  return useMutation<RpcReply, Error, {
    productId: number;
    color: string | null;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    reference: string;
  }>({
    mutationFn: () => Promise.reject(new Error(LAYBY_ONLINE_CLOSED)),
  });
}

export function usePayLayby() {
  return useMutation<RpcReply, Error, { laybyId: number; amount: number; reference: string }>({
    mutationFn: () => Promise.reject(new Error(LAYBY_ONLINE_CLOSED)),
  });
}
