import type { InvoiceRow, JobCardRow, OrderRow, QuoteRow } from './database.types';
import { supabase } from './supabase';
import { STORE } from './constants';
import { isSendableNumber, whatsappNumber } from './phone';

export type PdfDocument =
  | { kind: 'invoice'; record: InvoiceRow }
  | { kind: 'order'; record: OrderRow }
  | { kind: 'quote'; record: QuoteRow }
  | { kind: 'jobcard'; record: JobCardRow };
export type PdfChannel = 'whatsapp' | 'email';

export function documentReference(document: PdfDocument): string {
  switch (document.kind) {
    case 'invoice': return `Invoice ${document.record.invoice_number ?? `INV-${document.record.id}`}`;
    case 'order': return `Order ${document.record.id.slice(0, 8).toUpperCase()}`;
    case 'quote': return `Quote ${document.record.quote_number ?? `Q-${document.record.id}`}`;
    case 'jobcard': return `Job Card ${document.record.job_number}`;
  }
}

export async function buildSharedPdf(document: PdfDocument): Promise<Blob> {
  if (document.kind === 'jobcard') {
    const { buildJobCardPdf, customerJobCardPdfInput } = await import('./jobCardPdf');
    return buildJobCardPdf(customerJobCardPdfInput(document.record));
  }
  const pdf = await import('./documentPdf');
  switch (document.kind) {
    case 'invoice': return pdf.buildInvoiceRecordPdf(document.record);
    case 'quote': return pdf.buildQuotePdf(document.record);
    case 'order': return pdf.buildOrderPdf(document.record);
  }
}

export function validPdfRecipient(channel: PdfChannel, value: string): boolean {
  return channel === 'whatsapp'
    ? isSendableNumber(value)
    : /^[^\s@,;?&#]+@[^\s@,;?&#]+\.[^\s@,;?&#]+$/.test(value.trim());
}

/** Invoices may carry contact details only on their customer or source order. */
export async function pdfRecipient(document: PdfDocument, channel: PdfChannel): Promise<string> {
  const record = document.record;
  const direct = channel === 'email' ? record.customer_email : 'customer_phone' in record ? record.customer_phone : null;
  if (direct?.trim()) return direct.trim();
  if ('customer_id' in record && record.customer_id) {
    const { data } = await supabase.from('customers').select('phone, email').eq('id', record.customer_id).maybeSingle();
    const value = channel === 'email' ? data?.email : data?.phone;
    if (value?.trim()) return value.trim();
  }
  if (document.kind === 'invoice' && document.record.order_id) {
    const { data } = await supabase.from('orders').select('customer_phone, customer_email').eq('id', document.record.order_id).maybeSingle();
    return (channel === 'email' ? data?.customer_email : data?.customer_phone) ?? '';
  }
  return '';
}

export async function publishSharedPdf(document: PdfDocument): Promise<string> {
  const blob = await buildSharedPdf(document);
  // Use the existing staff-writable document folders. Random paths prevent
  // enumeration by document number and keep previously sent copies immutable.
  const folder = document.kind === 'jobcard' ? 'jobcards' : 'invoices';
  const path = `${folder}/${document.kind}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from('Images').upload(path, blob, {
    contentType: 'application/pdf', upsert: false,
  });
  if (error) throw new Error(`Could not upload the PDF: ${error.message}`);
  return supabase.storage.from('Images').getPublicUrl(path).data.publicUrl;
}

export function pdfMessageLink(document: PdfDocument, channel: PdfChannel, recipient: string, url: string): string {
  if (!validPdfRecipient(channel, recipient)) throw new Error('Enter a valid recipient.');
  const reference = documentReference(document);
  const body = [
    `Good day${document.record.customer_name ? ` ${document.record.customer_name}` : ''},`,
    '', `Your PDF from ${STORE.name} - ${reference}:`,
    url, '', STORE.name, STORE.phone,
  ].join('\n');
  return channel === 'whatsapp'
    ? `https://wa.me/${whatsappNumber(recipient)}?text=${encodeURIComponent(body)}`
    : `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(`${STORE.name} - ${reference}`)}&body=${encodeURIComponent(body)}`;
}

/**
 * Emails the document from the shop's own address, with the PDF attached.
 *
 * A `mailto:` link opens whatever mail client the cashier is signed into and
 * sends from their personal address — the customer gets an invoice from a
 * Gmail account, and the shop has no record it went. This goes out through
 * Resend as info@jrimporters.com, and the PDF travels with it rather than as
 * a link the customer has to click.
 *
 * The Resend key lives in the edge function, never in this bundle: the anon
 * key ships inside the site's own config.js, so nothing secret can live here.
 */
export async function emailSharedPdf(document: PdfDocument, recipient: string): Promise<void> {
  if (!validPdfRecipient('email', recipient)) throw new Error('Enter a valid email address.');

  const blob = await buildSharedPdf(document);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the PDF.'));
    reader.readAsDataURL(blob);
  });

  const reference = documentReference(document);
  const greeting = document.record.customer_name ? ` ${document.record.customer_name}` : '';
  const html = [
    `<p>Good day${greeting},</p>`,
    `<p>Please find your ${reference.toLowerCase()} attached.</p>`,
    '<p>Thank you for your business.</p>',
    `<p>${STORE.name}<br>${STORE.address}<br>${STORE.phone}</p>`,
  ].join('');
  const text = [
    `Good day${greeting},`, '',
    `Please find your ${reference.toLowerCase()} attached.`, '',
    'Thank you for your business.', '',
    STORE.name, STORE.address, STORE.phone,
  ].join('\n');

  const { data, error } = await supabase.functions.invoke('send-document', {
    body: {
      to: recipient.trim(),
      subject: `${STORE.name} - ${reference}`,
      html,
      text,
      attachment: base64,
      filename: `${reference.replace(/[^a-z0-9_-]/gi, '-')}.pdf`,
    },
  });

  if (error) throw new Error(error.message || 'The email could not be sent.');
  const result = data as { ok?: boolean; message?: string } | null;
  if (!result?.ok) throw new Error(result?.message ?? 'The email could not be sent.');
}

export async function downloadSharedPdf(document: PdfDocument): Promise<void> {
  const url = URL.createObjectURL(await buildSharedPdf(document));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${documentReference(document).replace(/[^a-z0-9_-]/gi, '-')}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
