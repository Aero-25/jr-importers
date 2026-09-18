import { supabase } from '@/lib/supabase';
import type { InvoiceRow, JobCardRow, LineItem } from '@/lib/database.types';
import { round2, toNumber, vatFromInclusive } from '@/lib/format';

/**
 * A repair becoming an invoice.
 *
 * Two screens reach the same outcome — the job card raises its invoice, or
 * an invoice picks its job card — and both must produce the same line and
 * the same link, or the two routes would drift and a repair invoiced one way
 * would read differently from one invoiced the other.
 */

/** The catalogue line every repair is invoiced against. */
export const PARTS_SKU = 'SVC-PARTS';

export interface PartsProduct {
  id: number;
  name: string;
  sku: string | null;
  cost_price: number;
}

export async function fetchPartsProduct(): Promise<PartsProduct> {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, sku, cost_price')
    .eq('sku', PARTS_SKU)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`The ${PARTS_SKU} service line is missing from the catalogue.`);
  return data as PartsProduct;
}

/**
 * What the customer is invoiced for a repair.
 *
 * The approved quote where there is one, otherwise the cost written on the
 * card, plus the handling fee; less whatever deposit they paid at intake,
 * since that money is already in the drawer and the invoice is for what is
 * still owed. The reasoning is spelled out on the line so nobody has to
 * reverse-engineer it at the counter.
 */
export function repairCharge(job: JobCardRow): { amount: number; basis: string } {
  const quoted = job.quote_approved && job.quote_amount != null ? toNumber(job.quote_amount) : null;
  const work = quoted ?? toNumber(job.cost);
  const fee = toNumber(job.handling_fee);
  const deposit = toNumber(job.deposit);
  const amount = round2(Math.max(0, work + fee - deposit));
  const parts = [
    `${quoted != null ? 'Approved quote' : 'Repair'} ${work.toFixed(2)}`,
    fee > 0 ? `handling ${fee.toFixed(2)}` : '',
    deposit > 0 ? `less deposit ${deposit.toFixed(2)}` : '',
  ].filter(Boolean);
  return { amount, basis: parts.join(', ') };
}

/** The PARTS line for a repair, worded so the invoice says which repair. */
export function repairLine(job: JobCardRow, parts: PartsProduct): LineItem {
  const { amount } = repairCharge(job);
  const what = [job.handset_type, job.fault].filter((v) => v && String(v).trim()).join(' · ');
  return {
    product_id: parts.id,
    name: `Repair — Job #${job.job_number}${what ? ` · ${what}` : ''}`,
    sku: parts.sku,
    color: null,
    price: amount,
    cost_price: toNumber(parts.cost_price),
    quantity: 1,
    line_total: amount,
  };
}

/** The invoice already raised for a job card, if there is one. */
export async function invoiceForJobCard(jobCardId: number): Promise<Pick<InvoiceRow, 'id' | 'invoice_number' | 'status' | 'total_amount'> | null> {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, invoice_number, status, total_amount')
    .eq('job_card_id', jobCardId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Pick<InvoiceRow, 'id' | 'invoice_number' | 'status' | 'total_amount'> | null) ?? null;
}

/**
 * Raises the invoice for a repair, or returns the one already raised.
 *
 * Left unpaid ('sent'): the customer settles it when they collect, at the
 * till or on account, and that is where the payment gets recorded. Raising
 * it paid here would claim money that has not been taken.
 */
export async function raiseInvoiceForJobCard(job: JobCardRow): Promise<{ id: number; invoice_number: string | null; existed: boolean }> {
  const existing = await invoiceForJobCard(job.id);
  if (existing) return { id: existing.id, invoice_number: existing.invoice_number, existed: true };

  const parts = await fetchPartsProduct();
  const line = repairLine(job, parts);
  const { net, vat, gross } = vatFromInclusive(line.line_total ?? 0);
  const { basis } = repairCharge(job);

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      job_card_id: job.id,
      customer_id: job.customer_id,
      customer_name: job.customer_name,
      customer_email: job.customer_email,
      items: [line],
      subtotal_amount: net,
      vat_amount: vat,
      total_amount: gross,
      status: 'sent',
      doc_type: 'invoice',
      notes: `Job card #${job.job_number}: ${basis}.`,
    })
    .select('id, invoice_number')
    .single();
  if (error) throw new Error(error.message);
  return { id: (data as { id: number }).id, invoice_number: (data as { invoice_number: string | null }).invoice_number, existed: false };
}
