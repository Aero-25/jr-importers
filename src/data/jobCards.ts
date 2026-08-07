import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { JobCardChecks, JobCardRow } from '@/lib/database.types';
import { config } from '@/lib/env';
import { JOB_CARD_QUOTE_THRESHOLD, STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { whatsappNumber } from '@/lib/phone';
import { publishJobCardPdf } from '@/lib/jobCardPdf';
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
 * Written to be read on a phone: who it is from and what it concerns first,
 * then one clear instruction, then the links. WhatsApp's own emphasis is used
 * rather than shouting in capitals, and the shop's hours are included because
 * the most common reply to any of these is "when are you open".
 */
function jobCardMessage(
  card: {
    job_number: number;
    customer_name: string;
    handset_type: string | null;
    accepted_at?: string | null;
    accept_token: string;
  },
  pdfUrl: string | null,
): string {
  const firstName = card.customer_name.trim().split(/\s+/)[0] ?? '';
  const handset = card.handset_type?.trim();
  const accepted = Boolean(card.accepted_at);

  const lines = [
    `*${STORE.name.toUpperCase()}*`,
    `Job Card *#${card.job_number}*${handset ? ` — ${handset}` : ''}`,
    ``,
    `Good day${firstName ? ` ${firstName}` : ''},`,
    ``,
  ];

  if (accepted) {
    lines.push(
      `Thank you for accepting your job card. We will be in touch as soon as your handset is ready.`,
      ``,
      `You can check the status of your repair here at any time:`,
      ``,
      jobCardUrl(card.accept_token),
      ``,
    );
  } else {
    lines.push(
      `Thank you for booking ${handset ? `your ${handset}` : 'your handset'} in with us.`,
      ``,
      `Please open the link below to read our terms and accept the job card. We start work as soon as it is accepted.`,
      ``,
      jobCardUrl(card.accept_token),
      ``,
    );
  }

  if (pdfUrl) {
    lines.push(accepted ? `Your signed job card (PDF):` : `Your copy of the job card (PDF):`, pdfUrl, ``);
  }

  lines.push(
    `Please quote *#${card.job_number}* on any enquiry.`,
    ``,
    STORE.hours,
    STORE.address,
    STORE.phone,
  );

  return lines.join('\n');
}

/**
 * A `wa.me` deep link staff tap to send the card from their own WhatsApp.
 *
 * Deliberately a deep link rather than the system share sheet, even though the
 * share sheet could attach the PDF as a real file: customers are almost never
 * saved in the staff member's contacts, and the share sheet gives no way to
 * message a number that is not. The link addresses the chat directly, and the
 * PDF rides along as a URL.
 */
export function jobCardWhatsAppLink(
  card: {
    job_number: number;
    customer_name: string;
    customer_phone: string;
    handset_type: string | null;
    accepted_at?: string | null;
    accept_token: string;
  },
  pdfUrl: string | null = null,
): string {
  return `https://wa.me/${whatsappNumber(card.customer_phone)}?text=${encodeURIComponent(
    jobCardMessage(card, pdfUrl),
  )}`;
}

export function quoteWhatsAppLink(
  card: {
    job_number: number;
    customer_name: string;
    customer_phone: string;
    handset_type?: string | null;
    quote_amount: number | null;
    quote_note?: string | null;
    accept_token: string;
  },
  pdfUrl: string | null = null,
): string {
  const firstName = card.customer_name.trim().split(/\s+/)[0] ?? '';
  const handset = card.handset_type?.trim();

  const lines = [
    `*${STORE.name.toUpperCase()}*`,
    `Job Card *#${card.job_number}*${handset ? ` — ${handset}` : ''}`,
    ``,
    `Good day${firstName ? ` ${firstName}` : ''},`,
    ``,
    `We have assessed your handset and prepared a quote.`,
    ``,
    `Quoted repair cost: *${money(card.quote_amount)}*`,
  ];

  if (card.quote_note?.trim()) lines.push(card.quote_note.trim());

  lines.push(
    ``,
    `As per our terms, repairs above ${money(JOB_CARD_QUOTE_THRESHOLD)} need your approval before we begin. Please approve or decline here:`,
    ``,
    jobCardUrl(card.accept_token),
    ``,
  );

  if (pdfUrl) lines.push(`Your job card (PDF):`, pdfUrl, ``);

  lines.push(
    `The handset is safe with us until we hear from you.`,
    ``,
    STORE.hours,
    STORE.address,
    STORE.phone,
  );

  return `https://wa.me/${whatsappNumber(card.customer_phone)}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/**
 * Publishes the customer's PDF, then hands back the addressed WhatsApp link.
 *
 * A failure to publish must not block the send — the acceptance link is the
 * part that matters, and a customer who can accept but has no PDF attached is
 * far better off than one who receives nothing because storage was down.
 */
export async function buildJobCardSendLink(
  card: JobCardRow,
  kind: 'card' | 'quote' = 'card',
): Promise<{ href: string; pdfUrl: string | null }> {
  let pdfUrl: string | null = null;
  try {
    pdfUrl = await publishJobCardPdf(card, card.accept_token);
  } catch {
    pdfUrl = null;
  }

  return {
    href: kind === 'quote' ? quoteWhatsAppLink(card, pdfUrl) : jobCardWhatsAppLink(card, pdfUrl),
    pdfUrl,
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
