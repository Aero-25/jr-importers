/**
 * Bulk pricing: the weekly supplier list, priced and sent.
 *
 * The arithmetic is not here. Costs, markups, VAT and the stock snapshot are
 * computed by `bulk_generate_list` in the database, in numeric, inside one
 * transaction — so a price list is a consistent statement about one Monday
 * rather than whatever the browser happened to add up. This module uploads,
 * reads back, edits markups and starts a distribution.
 *
 * Nothing here writes to `products`. These are special weekly prices for a
 * dealer list; the shop's own selling prices and cost prices are untouched.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ParsedSupplierList } from '@/lib/supplierPriceList';

export type StockStatus = 'in_stock' | 'on_order' | 'out_of_stock';
export type ListStatus = 'draft' | 'approved' | 'sent' | 'superseded';

export interface PriceListRow {
  id: number;
  upload_id: number | null;
  week_start: string;
  import_vat_rate: number;
  sales_vat_rate: number;
  default_markup: number;
  product_count: number;
  in_stock_count: number;
  on_order_count: number;
  status: ListStatus;
  generated_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface PriceListItem {
  id: number;
  list_id: number;
  variant_key: string;
  display_name: string;
  model: string | null;
  storage_gb: number | null;
  five_g: boolean;
  supplier_cost: number;
  import_vat: number;
  landed_cost: number;
  markup_pct: number;
  price_excl_vat: number;
  sales_vat: number;
  final_price: number;
  stock_status: StockStatus;
  stock_qty: number;
  product_id: number | null;
}

export interface Recipient {
  id: number;
  name: string | null;
  email: string;
  active: boolean;
  opted_out_at: string | null;
  notes: string | null;
}

export interface Delivery {
  id: number;
  distribution_id: number;
  email: string;
  name: string | null;
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
  error: string | null;
  sent_at: string | null;
}

export interface Distribution {
  id: number;
  list_id: number;
  subject: string;
  file_name: string | null;
  recipient_count: number;
  started_by: string | null;
  trigger: 'manual' | 'scheduled' | 'test' | 'retry';
  created_at: string;
  finished_at: string | null;
}

export interface BulkDashboard {
  this_week: string;
  rates: {
    import_vat: number;
    sales_vat: number;
    default_markup: number;
    auto_send: boolean;
    require_approval: boolean;
  };
  latest_upload: {
    id: number; file_name: string; at: string; rows: number; phones: number; skipped: number;
  } | null;
  latest_list: {
    id: number; week: string; status: ListStatus; products: number;
    in_stock: number; on_order: number; at: string; current_week: boolean;
  } | null;
  latest_distribution: {
    id: number; at: string; trigger: string; recipients: number;
    sent: number; failed: number; pending: number;
  } | null;
  recipients: { total: number; active: number };
  markups_overridden: number;
}

const BULK = ['bulk_pricing'] as const;
const key = (...parts: unknown[]): unknown[] => [...BULK, ...parts];

const fail = (message: string): never => {
  throw new Error(message);
};

/* ── Dashboard ───────────────────────────────────────────────────────────── */

export function useBulkDashboard() {
  return useQuery<BulkDashboard, Error>({
    queryKey: key('dashboard'),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('bulk_dashboard');
      if (error) throw new Error(error.message);
      return data as unknown as BulkDashboard;
    },
  });
}

/* ── Upload ──────────────────────────────────────────────────────────────── */

/**
 * Saves a parsed supplier list, then prices it.
 *
 * Two calls rather than one: the upload is a record of what the supplier sent,
 * and generating is a separate decision that can be repeated after the markups
 * are edited without re-reading the file.
 */
export function useSaveUpload() {
  const qc = useQueryClient();
  return useMutation<
    { uploadId: number; listId: number },
    Error,
    { fileName: string; parsed: ParsedSupplierList }
  >({
    mutationFn: async ({ fileName, parsed }) => {
      if (parsed.rows.length === 0) {
        fail('No Samsung phones were found in that file. Check the import preview for why.');
      }

      const { data: uploadId, error } = await supabase.rpc('bulk_save_upload', {
        p_file_name: fileName,
        p_rows: parsed.rows as unknown as never,
        p_skipped: parsed.skipped as unknown as never,
        p_supplier_name: parsed.supplierName,
        p_list_date: parsed.listDate,
      });
      if (error) throw new Error(error.message);

      const { data: listId, error: genError } = await supabase.rpc('bulk_generate_list', {
        p_upload_id: uploadId as unknown as number,
      });
      if (genError) throw new Error(genError.message);

      return { uploadId: uploadId as unknown as number, listId: listId as unknown as number };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/* ── Lists and their lines ───────────────────────────────────────────────── */

export function usePriceLists() {
  return useQuery<PriceListRow[], Error>({
    queryKey: key('lists'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_price_lists')
        .select('*')
        .order('week_start', { ascending: false })
        .order('id', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PriceListRow[];
    },
  });
}

/** The newest list that is not superseded — what the screens work on. */
export function useCurrentList() {
  const lists = usePriceLists();
  const current = (lists.data ?? []).find((l) => l.status !== 'superseded') ?? null;
  return { ...lists, current };
}

export function usePriceListItems(listId: number | null | undefined) {
  return useQuery<PriceListItem[], Error>({
    queryKey: key('items', listId ?? 0),
    enabled: Boolean(listId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_price_list_items')
        .select('*')
        .eq('list_id', listId!)
        .order('display_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as PriceListItem[];
    },
  });
}

/* ── Markups ─────────────────────────────────────────────────────────────── */

/**
 * Sets one handset's markup and reprices the draft.
 *
 * The markup is stored against the variant, so next Monday's upload inherits
 * it. Repricing happens server-side rather than in the table the admin is
 * looking at: the displayed figure and the stored figure must be the same
 * number, and only one of them can be authoritative.
 */
export function useSetMarkup() {
  const qc = useQueryClient();
  return useMutation<void, Error, { variantKey: string; markup: number; label?: string; listId: number }>({
    mutationFn: async ({ variantKey, markup, label, listId }) => {
      const { error } = await supabase.rpc('bulk_set_markup', {
        p_variant_key: variantKey,
        p_markup: markup,
        p_label: label ?? null,
      });
      if (error) throw new Error(error.message);

      const { error: recalcError } = await supabase.rpc('bulk_recalculate', { p_list_id: listId });
      if (recalcError) throw new Error(recalcError.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/** Back to the default — and stays on the default if the default later changes. */
export function useClearMarkup() {
  const qc = useQueryClient();
  return useMutation<void, Error, { variantKey: string; listId: number }>({
    mutationFn: async ({ variantKey, listId }) => {
      const { error } = await supabase.rpc('bulk_clear_markup', { p_variant_key: variantKey });
      if (error) throw new Error(error.message);
      const { error: recalcError } = await supabase.rpc('bulk_recalculate', { p_list_id: listId });
      if (recalcError) throw new Error(recalcError.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/** Applies one markup to a set of handsets, then reprices once. */
export function useBulkSetMarkups() {
  const qc = useQueryClient();
  return useMutation<void, Error, { variantKeys: string[]; markup: number; listId: number }>({
    mutationFn: async ({ variantKeys, markup, listId }) => {
      for (const variantKey of variantKeys) {
        const { error } = await supabase.rpc('bulk_set_markup', {
          p_variant_key: variantKey,
          p_markup: markup,
          p_label: null,
        });
        if (error) throw new Error(error.message);
      }
      const { error } = await supabase.rpc('bulk_recalculate', { p_list_id: listId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/**
 * Approves the list and stores the PDF a scheduled send will post.
 *
 * The attachment is built in the browser, and on a Monday morning there is no
 * browser — so the copy that goes out automatically has to exist before then.
 * Approval is the moment the prices are settled, so that is when it is written.
 */
export function useApproveList() {
  const qc = useQueryClient();
  return useMutation<void, Error, { listId: number; weekStart: string; pdf: Blob }>({
    mutationFn: async ({ listId, weekStart, pdf }) => {
      const { error } = await supabase.rpc('bulk_approve_list', { p_list_id: listId });
      if (error) throw new Error(error.message);

      const path = `bulk/${weekStart}-${listId}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('Images')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) {
        // The list is approved either way; only the unattended send is lost,
        // and saying so beats implying the Monday job will work.
        throw new Error(
          `Approved, but the PDF could not be stored (${uploadError.message}). `
            + 'A scheduled send will be skipped until it is approved again.',
        );
      }

      const { error: pathError } = await supabase.rpc('bulk_set_pdf_path', {
        p_list_id: listId,
        p_path: path,
      });
      if (pathError) throw new Error(pathError.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/* ── Recipients ──────────────────────────────────────────────────────────── */

export function useRecipients() {
  return useQuery<Recipient[], Error>({
    queryKey: key('recipients'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_recipients')
        .select('*')
        .order('active', { ascending: false })
        .order('name', { nullsFirst: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Recipient[];
    },
  });
}

export function useSaveRecipient() {
  const qc = useQueryClient();
  return useMutation<void, Error, { id?: number; name: string; email: string; active?: boolean }>({
    mutationFn: async ({ id, name, email, active }) => {
      const row = {
        name: name.trim() || null,
        email: email.trim().toLowerCase(),
        ...(active === undefined ? {} : { active }),
        updated_at: new Date().toISOString(),
      };
      const { error } = id
        ? await supabase.from('bulk_recipients').update(row).eq('id', id)
        : await supabase.from('bulk_recipients').insert(row);
      if (error) {
        throw new Error(
          error.code === '23505' ? 'That address is already on the list.' : error.message,
        );
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

export function useDeleteRecipient() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('bulk_recipients').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/** Pasted or imported addresses, one per line: `name, email` or just `email`. */
export function useImportRecipients() {
  const qc = useQueryClient();
  return useMutation<{ added: number; skipped: number }, Error, string>({
    mutationFn: async (text) => {
      const rows: Array<{ name: string | null; email: string }> = [];
      for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (!line) continue;
        const parts = line.split(/[,;\t]/).map((p) => p.trim());
        const email = parts.find((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p));
        if (!email) continue;
        const name = parts.find((p) => p !== email && p.length > 0) ?? null;
        rows.push({ name, email: email.toLowerCase() });
      }
      if (rows.length === 0) fail('No email addresses were found in that text.');

      const { error, count } = await supabase
        .from('bulk_recipients')
        .upsert(rows, { onConflict: 'email', ignoreDuplicates: true, count: 'exact' });
      if (error) throw new Error(error.message);
      return { added: count ?? rows.length, skipped: rows.length - (count ?? rows.length) };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/* ── Distribution ────────────────────────────────────────────────────────── */

export function useDistributions() {
  return useQuery<Distribution[], Error>({
    queryKey: key('distributions'),
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as Distribution[];
      // Poll while something is still in flight, then stop.
      return rows.some((d) => d.finished_at === null) ? 4000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_distributions')
        .select('*')
        .order('id', { ascending: false })
        .limit(40);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Distribution[];
    },
  });
}

export function useDeliveries(distributionId: number | null) {
  return useQuery<Delivery[], Error>({
    queryKey: key('deliveries', distributionId ?? 0),
    enabled: Boolean(distributionId),
    refetchInterval: (query) => {
      const rows = (query.state.data ?? []) as Delivery[];
      return rows.some((d) => d.status === 'pending' || d.status === 'sending') ? 3000 : false;
    },
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bulk_deliveries')
        .select('*')
        .eq('distribution_id', distributionId!)
        .order('id');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Delivery[];
    },
  });
}

/**
 * Queues the list to every selected recipient, then asks the worker to run.
 *
 * The queue is created in one transaction server-side, so the set of people who
 * will be written to is fixed before a single email goes out. The worker is an
 * edge function: it keeps sending whether or not this browser stays open, and
 * a `unique (distribution_id, email)` means re-running it cannot send twice.
 */
export function useSendPriceList() {
  const qc = useQueryClient();
  return useMutation<
    { distributionId: number; recipients: number; sent: number; failed: number },
    Error,
    { listId: number; recipientIds: number[] | null; subject: string; body: string; pdf: Blob; fileName: string }
  >({
    mutationFn: async ({ listId, recipientIds, subject, body, pdf, fileName }) => {
      const { data, error } = await supabase.rpc('bulk_start_distribution', {
        p_list_id: listId,
        p_recipient_ids: recipientIds,
        p_subject: subject,
        p_body: body,
        p_file_name: fileName,
        p_trigger: 'manual',
      });
      if (error) throw new Error(error.message);

      const reply = data as unknown as { ok: boolean; message?: string; distribution_id?: number; recipients?: number };
      if (!reply?.ok) fail(reply?.message ?? 'The distribution could not be started.');

      // The attachment travels once, with the instruction to run the queue —
      // not once per recipient.
      const attachment = await blobToBase64(pdf);
      const { data: ran, error: runError } = await supabase.functions.invoke('bulk-dispatch', {
        body: {
          distribution_id: reply.distribution_id,
          attachment,
          filename: fileName,
        },
      });
      if (runError) throw new Error(runError.message);

      const result = ran as { sent?: number; failed?: number } | null;
      return {
        distributionId: reply.distribution_id!,
        recipients: reply.recipients ?? 0,
        sent: result?.sent ?? 0,
        failed: result?.failed ?? 0,
      };
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

export function useRetryFailed() {
  const qc = useQueryClient();
  return useMutation<number, Error, { distributionId: number; pdf: Blob; fileName: string }>({
    mutationFn: async ({ distributionId, pdf, fileName }) => {
      const { data, error } = await supabase.rpc('bulk_retry_failed', {
        p_distribution_id: distributionId,
      });
      if (error) throw new Error(error.message);
      const requeued = (data as unknown as number) ?? 0;
      if (requeued === 0) return 0;

      const attachment = await blobToBase64(pdf);
      const { error: runError } = await supabase.functions.invoke('bulk-dispatch', {
        body: { distribution_id: distributionId, attachment, filename: fileName },
      });
      if (runError) throw new Error(runError.message);
      return requeued;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/* ── Settings ────────────────────────────────────────────────────────────── */

export const BULK_SETTING_KEYS = [
  'bulk_import_vat_rate',
  'bulk_sales_vat_rate',
  'bulk_default_markup',
  'bulk_schedule_day',
  'bulk_schedule_time',
  'bulk_auto_send',
  'bulk_require_approval',
  'bulk_email_subject',
  'bulk_email_body',
] as const;

export type BulkSettingKey = (typeof BULK_SETTING_KEYS)[number];

export function useBulkSettings() {
  return useQuery<Record<string, string>, Error>({
    queryKey: key('settings'),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .in('key', BULK_SETTING_KEYS as unknown as string[]);
      if (error) throw new Error(error.message);
      const out: Record<string, string> = {};
      for (const row of data ?? []) {
        const raw = (row as { key: string; value: unknown }).value;
        out[(row as { key: string }).key] =
          typeof raw === 'string' ? raw : JSON.stringify(raw) ?? '';
      }
      return out;
    },
  });
}

export function useSaveBulkSetting() {
  const qc = useQueryClient();
  return useMutation<void, Error, { key: BulkSettingKey; value: string | number | boolean }>({
    mutationFn: async ({ key: settingKey, value }) => {
      const { error } = await supabase
        .from('settings')
        .upsert({ key: settingKey, value: value as unknown as never }, { onConflict: 'key' });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: BULK }),
  });
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** Base64 without the `data:` prefix, which is what the mail API wants. */
export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  // Chunked: a few hundred KB of PDF overflows the argument list in one call.
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode(...buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}
