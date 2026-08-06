import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JobCardChecks, JobCardRow } from '@/lib/database.types';
import { config } from '@/lib/env';
import { STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { createResource } from './crud';
import { keys } from './keys';

export const jobCards = createResource('job_cards', {
  orderBy: { column: 'job_number', ascending: false },
});

/** What the guest page is allowed to see. Mirrors `job_card_public_payload`. */
export interface PublicJobCard {
  job_number: number;
  customer_name: string;
  customer_phone: string;
  handset_type: string | null;
  imei: string | null;
  fault: string | null;
  physical_condition: string | null;
  deposit: number;
  cost: number;
  handling_fee: number;
  status: string;
  checks: JobCardChecks;
  technician: string | null;
  created_at: string;
  accepted_at: string | null;
  accepted_name: string | null;
  quote_amount: number | null;
  quote_note: string | null;
  quote_sent_at: string | null;
  quote_responded_at: string | null;
  quote_approved: boolean | null;
}

/* ── Staff side ──────────────────────────────────────────────────────────── */

export function useJobCards(filters: { search?: string; status?: string } = {}) {
  return useQuery<JobCardRow[], Error>({
    queryKey: keys.list('job_cards', filters),
    queryFn: async () => {
      let query = supabase.from('job_cards').select('*');

      if (filters.status) query = query.eq('status', filters.status);

      const term = filters.search?.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        const columns = ['customer_name', 'customer_phone', 'imei', 'handset_type', 'fault'];
        const filter = columns.map((c) => `${c}.ilike.%${term}%`);
        // A bare number is almost always someone reading a card number aloud.
        if (/^\d+$/.test(term)) filter.push(`job_number.eq.${term}`);
        query = query.or(filter.join(','));
      }

      const { data, error } = await query.order('job_number', { ascending: false }).limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Sends a quote for approval.
 *
 * Only meaningful above the N$350 threshold in the terms; below it the shop is
 * already authorised to proceed, so the console does not offer the action.
 */
export function useSendQuote() {
  const qc = useQueryClient();

  return useMutation<JobCardRow, Error, { id: number; amount: number; note?: string | null }>({
    mutationFn: async ({ id, amount, note }) => {
      const { data, error } = await supabase
        .from('job_cards')
        .update({
          quote_amount: amount,
          quote_note: note ?? null,
          quote_sent_at: new Date().toISOString(),
          quote_responded_at: null,
          quote_approved: null,
          status: 'Awaiting quote approval',
        })
        .eq('id', id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('job_cards') }),
  });
}

/* ── Guest side ──────────────────────────────────────────────────────────── */

export function useGuestJobCard(token: string | undefined) {
  return useQuery<PublicJobCard | null, Error>({
    queryKey: ['job_card_guest', token],
    enabled: Boolean(token),
    // The customer may be re-opening the link after staff updated the card.
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_job_card', { p_token: token! });
      if (error) throw new Error(error.message);

      const result = data as unknown as { found: boolean; job_card?: PublicJobCard };
      return result?.found ? (result.job_card ?? null) : null;
    },
  });
}

export function useAcceptJobCard() {
  const qc = useQueryClient();

  return useMutation<
    { already: boolean; jobCard: PublicJobCard },
    Error,
    { token: string; name: string; signature: string }
  >({
    mutationFn: async ({ token, name, signature }) => {
      const { data, error } = await supabase.rpc('accept_job_card', {
        p_token: token,
        p_name: name,
        p_signature: signature,
        p_user_agent: navigator.userAgent,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as {
        ok: boolean;
        already?: boolean;
        message?: string;
        job_card?: PublicJobCard;
      };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not record your acceptance.');

      return { already: Boolean(result.already), jobCard: result.job_card! };
    },
    onSuccess: (_data, variables) =>
      void qc.invalidateQueries({ queryKey: ['job_card_guest', variables.token] }),
  });
}

export function useRespondToQuote() {
  const qc = useQueryClient();

  return useMutation<PublicJobCard, Error, { token: string; approved: boolean }>({
    mutationFn: async ({ token, approved }) => {
      const { data, error } = await supabase.rpc('respond_job_card_quote', {
        p_token: token,
        p_approved: approved,
      });
      if (error) throw new Error(error.message);

      const result = data as unknown as {
        ok: boolean;
        message?: string;
        job_card?: PublicJobCard;
      };
      if (!result?.ok) throw new Error(result?.message ?? 'Could not record your response.');
      return result.job_card!;
    },
    onSuccess: (_data, variables) =>
      void qc.invalidateQueries({ queryKey: ['job_card_guest', variables.token] }),
  });
}

/* ── Links ───────────────────────────────────────────────────────────────── */

export function jobCardUrl(token: string): string {
  return `${config.SITE_URL}/jobcard/${token}`;
}

/**
 * A `wa.me` deep link staff tap to send the card from their own WhatsApp.
 *
 * This needs no API credentials and works today. If a WhatsApp Business worker
 * is configured later, `sendJobCardViaWorker` takes over and this stays as the
 * manual fallback.
 */
export function jobCardWhatsAppLink(card: {
  job_number: number;
  customer_name: string;
  customer_phone: string;
  handset_type: string | null;
  accept_token: string;
}): string {
  const phone = card.customer_phone.replace(/\D/g, '');
  const firstName = card.customer_name.trim().split(/\s+/)[0] ?? '';

  const message = [
    `Hi ${firstName}, thank you for choosing ${STORE.name}.`,
    ``,
    `Job Card #${card.job_number}${card.handset_type ? ` — ${card.handset_type}` : ''}`,
    ``,
    `Please open the link below to read our terms, sign, and receive your PDF job card:`,
    jobCardUrl(card.accept_token),
    ``,
    `${STORE.address}`,
    `${STORE.phone}`,
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function quoteWhatsAppLink(card: {
  job_number: number;
  customer_name: string;
  customer_phone: string;
  quote_amount: number | null;
  accept_token: string;
}): string {
  const phone = card.customer_phone.replace(/\D/g, '');
  const firstName = card.customer_name.trim().split(/\s+/)[0] ?? '';

  const message = [
    `Hi ${firstName}, we have assessed your handset.`,
    ``,
    `Job Card #${card.job_number}`,
    `Quoted repair cost: ${money(card.quote_amount)}`,
    ``,
    `As per our terms, repairs above N$350 need your approval before we start.`,
    `Please approve or decline here:`,
    jobCardUrl(card.accept_token),
  ].join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/**
 * Automatic send, when a WhatsApp worker is configured.
 * Returns false when no worker is set so callers can fall back to the deep link.
 */
export async function sendJobCardViaWorker(params: {
  phone: string;
  message: string;
}): Promise<boolean> {
  if (!config.WHATSAPP_WORKER_URL) return false;

  try {
    const response = await fetch(config.WHATSAPP_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: params.phone.replace(/\D/g, ''), message: params.message }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
