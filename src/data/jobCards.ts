import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JobCardChecks, JobCardRow } from '@/lib/database.types';
import { config } from '@/lib/env';
import { STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { whatsappNumber } from '@/lib/phone';
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
  // A real file plus a query string, not a routed path. This is the one URL
  // customers receive rather than click through to, so it must not depend on
  // host rewrite rules to resolve.
  // Falls back to wherever the console is being used from, so a missing or
  // blank SITE_URL degrades to a link that at least resolves rather than one
  // that fails in the customer's hand.
  const origin =
    config.SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return `${origin}/jobcard/?t=${encodeURIComponent(token)}`;
}

/**
 * The message the customer receives with their job card.
 *
 * Deliberately almost empty. Everything that was in here — handset, condition,
 * fees, terms, hours, address — is on the job card itself, and repeating it in
 * a WhatsApp message gave somebody a wall of text to scroll past on the way to
 * the only thing that matters, which is the link.
 *
 * The PDF is not attached or linked either. It is delivered by the approve
 * page the moment they accept, so the document they end up holding is the one
 * with their acceptance on it rather than an unsigned copy sent beforehand.
 */
function jobCardMessage(card: {
  job_number: number;
  accepted_at?: string | null;
  accept_token: string;
}): string {
  const accepted = Boolean(card.accepted_at);

  return [
    `*${STORE.name}*`,
    `Job Card *#${card.job_number}*`,
    ``,
    accepted
      ? `Your signed job card:`
      : `Please approve your job card here. Your PDF copy downloads as soon as you do.`,
    ``,
    jobCardUrl(card.accept_token),
  ].join('\n');
}

/**
 * A `wa.me` deep link staff tap to send the card from their own WhatsApp.
 *
 * Deliberately a deep link rather than the system share sheet: customers are
 * almost never in the staff member's contacts, and the share sheet gives no way
 * to message a number that is not.
 */
export function jobCardWhatsAppLink(card: {
  job_number: number;
  accepted_at?: string | null;
  accept_token: string;
  customer_phone: string;
}): string {
  return `https://wa.me/${whatsappNumber(card.customer_phone)}?text=${encodeURIComponent(
    jobCardMessage(card),
  )}`;
}

/**
 * The quote message. Same restraint, with the one number that cannot be left
 * out — a quote the customer has to open a link to read is not a quote.
 */
export function quoteWhatsAppLink(card: {
  job_number: number;
  customer_phone: string;
  quote_amount: number | null;
  accept_token: string;
}): string {
  const message = [
    `*${STORE.name}*`,
    `Job Card *#${card.job_number}*`,
    ``,
    `Quote to repair: *${money(card.quote_amount)}*`,
    ``,
    `Please approve or decline here:`,
    ``,
    jobCardUrl(card.accept_token),
  ].join('\n');

  return `https://wa.me/${whatsappNumber(card.customer_phone)}?text=${encodeURIComponent(message)}`;
}

/**
 * The addressed WhatsApp link for a card or a quote.
 *
 * No longer publishes a PDF first. The customer receives their copy from the
 * approve page at the moment they accept, which means the document they keep
 * carries their acceptance — and it removes a permanently public file holding a
 * customer's name, number and IMEI from storage altogether.
 */
export function buildJobCardSendLink(
  card: JobCardRow,
  kind: 'card' | 'quote' = 'card',
): { href: string; pdfUrl: null } {
  return {
    href: kind === 'quote' ? quoteWhatsAppLink(card) : jobCardWhatsAppLink(card),
    pdfUrl: null,
  };
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
