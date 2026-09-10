import type { ClientStatement } from '@/data/statements';
import type { DamageReportRow, InvoiceRow, JobCardRow, OrderRow, QuoteRow } from './database.types';
import { supabase } from './supabase';
import { STORE } from './constants';
import { formatDate } from './format';
import { isSendableNumber, whatsappNumber } from './phone';

export type PdfDocument =
  | { kind: 'invoice'; record: InvoiceRow }
  | { kind: 'order'; record: OrderRow }
  | { kind: 'quote'; record: QuoteRow }
  | { kind: 'jobcard'; record: JobCardRow }
  | { kind: 'damage'; record: DamageReportRow }
  | { kind: 'statement'; record: ClientStatement };
export type PdfChannel = 'whatsapp' | 'email';

/**
 * Android can host WhatsApp Messenger and WhatsApp Business side-by-side. A
 * normal `wa.me` URL is handled by the browser first and can end at the Play
 * Store even though Business is installed. The Android intent below names the
 * Business package (`com.whatsapp.w4b`) so it opens the app staff actually use.
 */
export function opensWhatsAppBusinessApp(userAgent = navigator.userAgent): boolean {
  return /android/i.test(userAgent);
}

export function documentReference(document: PdfDocument): string {
  switch (document.kind) {
    case 'invoice': return `Invoice ${document.record.invoice_number ?? `INV-${document.record.id}`}`;
    case 'order': return `Order ${document.record.id.slice(0, 8).toUpperCase()}`;
    case 'quote': return `Quote ${document.record.quote_number ?? `Q-${document.record.id}`}`;
    case 'jobcard': return `Job Card ${document.record.job_number}`;
    case 'damage': return `Damage Report ${document.record.report_number}`;
    case 'statement': return `Statement ${document.record.customer_name}`;
  }
}

/**
 * Who the covering message greets.
 *
 * A damage report is a claim letter written to an insurer or a supplier, not
 * to the customer whose handset it concerns — greeting that customer would
 * address the claim to the wrong reader entirely. Everything else does go to
 * the customer.
 */
/**
 * What the file is called once it lands in someone's inbox.
 *
 * A damage report names the device as well as the report number: an assessor
 * handling a dozen claims files by handset, and "Damage-Report-DR-0007.pdf"
 * tells them nothing about which one this is.
 */
async function pdfFileName(document: PdfDocument): Promise<string> {
  if (document.kind === 'statement') {
    const { statementFileName } = await import('./statementPdf');
    return statementFileName(document.record);
  }
  if (document.kind === 'damage') {
    const { damageReportFileName } = await import('./damageReportPdf');
    return damageReportFileName(document.record.report_number, document.record.product_name);
  }
  return `${documentReference(document).replace(/[^a-z0-9_-]/gi, '-')}.pdf`;
}

function addressee(document: PdfDocument): string {
  if (document.kind !== 'damage') return document.record.customer_name?.trim() ?? '';
  const { insurer_contact, insurer_name, supplier_name } = document.record;
  return insurer_contact?.trim() || insurer_name?.trim() || supplier_name?.trim() || '';
}

export async function buildSharedPdf(document: PdfDocument): Promise<Blob> {
  if (document.kind === 'statement') {
    const { buildClientStatementPdf } = await import('./statementPdf');
    return buildClientStatementPdf(document.record);
  }
  if (document.kind === 'damage') {
    const { buildDamageReportPdf } = await import('./damageReportPdf');
    return buildDamageReportPdf(document.record);
  }
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

  // A damage report is sent to whoever is being claimed from. The insurer's
  // phone is typed straight onto the report; a supplier claim goes to the
  // supplier's own details. There is no column for an insurer's email, so on
  // that path the cashier is simply asked — better than pre-filling the
  // customer's address and having the claim go to them by accident.
  if (document.kind === 'damage') {
    const report = document.record;
    if (channel === 'whatsapp' && report.insurer_phone?.trim()) return report.insurer_phone.trim();
    if (report.supplier_id) {
      const { data } = await supabase.from('suppliers').select('phone, email').eq('id', report.supplier_id).maybeSingle();
      const value = channel === 'email' ? data?.email : data?.phone;
      if (value?.trim()) return value.trim();
    }
    return '';
  }

  const direct = channel === 'email'
    ? ('customer_email' in record ? record.customer_email : null)
    : 'customer_phone' in record ? record.customer_phone : null;
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
  // 'invoices' also carries statements: it is the folder staff may write to
  // for anything that goes out to a customer about what they were charged.
  const folder = document.kind === 'jobcard' ? 'jobcards' : document.kind === 'damage' ? 'damage' : 'invoices';
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
  const name = addressee(document);
  const body = [
    `Good day${name ? ` ${name}` : ''},`,
    '',
    document.kind === 'damage'
      ? `Please find our ${reference.toLowerCase()} from ${STORE.name}:`
      : `Your PDF from ${STORE.name} - ${reference}:`,
    url, '', STORE.name, STORE.phone,
  ].join('\n');
  if (channel === 'whatsapp') {
    const webLink = `https://wa.me/${whatsappNumber(recipient)}?text=${encodeURIComponent(body)}`;
    if (!opensWhatsAppBusinessApp()) return webLink;

    // Chrome uses browser_fallback_url only when WhatsApp Business is absent;
    // it keeps normal browser/tablet behaviour available without a dead end.
    return `intent://send?phone=${whatsappNumber(recipient)}&text=${encodeURIComponent(body)}#Intent;scheme=whatsapp;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent(webLink)};end`;
  }
  return `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(`${STORE.name} - ${reference}`)}&body=${encodeURIComponent(body)}`;
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
  const name = addressee(document);
  const greeting = name ? ` ${name}` : '';
  // A claim asks the reader for something; a sale thanks them for something.
  const claim = document.kind === 'damage';
  // "your statement john doe attached" is what lowercasing the reference gives
  // on a statement, so it names the document rather than the reference.
  const line = claim
    ? `Please find our ${reference.toLowerCase()} attached for your assessment.`
    : document.kind === 'statement'
      ? `Please find your statement of account attached, drawn to ${formatDate(document.record.asAt)}.`
      : `Please find your ${reference.toLowerCase()} attached.`;
  const closing = claim ? 'Thank you for your assistance.' : 'Thank you for your business.';

  const html = [
    `<p>Good day${greeting},</p>`,
    `<p>${line}</p>`,
    `<p>${closing}</p>`,
    `<p>${STORE.name}<br>${STORE.address}<br>${STORE.phone}</p>`,
  ].join('');
  const text = [
    `Good day${greeting},`, '',
    line, '',
    closing, '',
    STORE.name, STORE.address, STORE.phone,
  ].join('\n');

  const { data, error } = await supabase.functions.invoke('send-document', {
    body: {
      to: recipient.trim(),
      subject: `${STORE.name} - ${reference}`,
      html,
      text,
      attachment: base64,
      filename: await pdfFileName(document),
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
  link.download = await pdfFileName(document);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
