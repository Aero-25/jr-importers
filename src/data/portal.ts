/**
 * The company portal.
 *
 * An account customer signs in and sees the same prices the weekly dealer list
 * went out with, then asks for a quote against them.
 *
 * Everything about money comes from the server. The catalogue is a function
 * that returns only what a buyer may see — the dealer price lives in the same
 * row as the supplier cost and the margin, and row security filters rows rather
 * than columns, so the shape of that function is the wall. A quote request
 * carries a line and a quantity and nothing else: a price posted from here
 * would be a price the customer set.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface PortalCompany {
  ok: boolean;
  customer_id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  account_code?: string | null;
  terms?: string | null;
}

export interface PortalItem {
  item_id: number;
  product_id: number | null;
  brand: string;
  display_name: string;
  storage_gb: number | null;
  five_g: boolean;
  price: number;
  in_stock: boolean;
  on_hand: number;
  image: string | null;
  week_start: string;
}

export interface PortalQuote {
  id: number;
  quote_number: string;
  created_at: string;
  valid_until: string | null;
  status: string;
  total_amount: number;
  items: Array<{ name?: string; quantity?: number; price?: number; line_total?: number }>;
}

const KEY = ['portal'] as const;

/** Which company this login buys for, if any. */
export function usePortalCompany() {
  return useQuery<PortalCompany, Error>({
    queryKey: [...KEY, 'me'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_me');
      if (error) throw new Error(error.message);
      return (data ?? { ok: false }) as unknown as PortalCompany;
    },
  });
}

/** This week's dealer prices — the same ones the list went out with. */
export function usePortalCatalogue(enabled: boolean) {
  return useQuery<PortalItem[], Error>({
    queryKey: [...KEY, 'catalogue'],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_catalogue');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as unknown as PortalItem[];
    },
  });
}

export function usePortalQuotes(enabled: boolean) {
  return useQuery<PortalQuote[], Error>({
    queryKey: [...KEY, 'quotes'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('portal_my_quotes');
      if (error) throw new Error(error.message);
      return (Array.isArray(data) ? data : []) as unknown as PortalQuote[];
    },
  });
}

export interface QuoteRequestResult {
  quote_id: number;
  quote_number: string;
  total: number;
  valid_until: string | null;
  emailed: boolean;
  emailTo?: string;
  emailProblem?: string;
}

/**
 * Asks for a quote, then has it emailed.
 *
 * The quote is raised first and the email sent second, deliberately: if the
 * mail fails the request still reached the shop and appears in the console,
 * which is better than a company believing nobody heard them.
 */
export function useRequestQuote() {
  const qc = useQueryClient();
  return useMutation<
    QuoteRequestResult,
    Error,
    { lines: Array<{ item_id: number; quantity: number }>; note: string }
  >({
    mutationFn: async ({ lines, note }) => {
      const { data, error } = await supabase.rpc('portal_request_quote', {
        p_items: lines as unknown as never,
        p_note: note.trim() === '' ? null : note.trim(),
      });
      if (error) throw new Error(error.message);

      const reply = data as unknown as {
        ok: boolean;
        message?: string;
        quote_id?: number;
        quote_number?: string;
        total?: number;
        valid_until?: string | null;
      };
      if (!reply?.ok) throw new Error(reply?.message ?? 'The quote could not be raised.');

      const result: QuoteRequestResult = {
        quote_id: reply.quote_id!,
        quote_number: reply.quote_number!,
        total: Number(reply.total ?? 0),
        valid_until: reply.valid_until ?? null,
        emailed: false,
      };

      try {
        const { data: sent, error: mailError } = await supabase.functions.invoke('portal-quote', {
          body: { quote_id: reply.quote_id },
        });
        if (mailError) throw new Error(mailError.message);
        const mail = sent as { ok?: boolean; to?: string; message?: string } | null;
        result.emailed = Boolean(mail?.ok);
        result.emailTo = mail?.to;
        if (!mail?.ok) result.emailProblem = mail?.message;
      } catch (e) {
        // The quote exists either way; say so rather than implying it is lost.
        result.emailProblem = (e as Error).message;
      }

      return result;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
  });
}
