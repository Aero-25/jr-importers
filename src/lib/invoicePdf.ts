import type { OrderRow } from './database.types';
import { supabase } from './supabase';
import { STORE } from './constants';
import { formatDate, money, round2 } from './format';
import { whatsappNumber } from './phone';

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const LINE: [number, number, number] = [196, 205, 218];

/** Company details a tax invoice must carry. Read live so they stay editable. */
export interface InvoiceCompany {
  legalName: string;
  addressLine1: string;
  vatNumber: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankBranchCode: string;
}

/**
 * Reads the company block from settings.
 *
 * Not hardcoded: a VAT number and banking details change, and reprinting old
 * invoices with today's bank account would be wrong anyway — but a shop that
 * has to wait for a deploy to correct its own bank account is worse.
 */
export async function loadInvoiceCompany(): Promise<InvoiceCompany> {
  const { data } = await supabase
    .from('settings')
    .select('key, value')
    .in('key', [
      'company_legal_name',
      'store_address_line1',
      'vat_number',
      'bank_name',
      'bank_account_name',
      'bank_account_number',
      'bank_branch_code',
    ]);

  // settings.value is jsonb, so a plain string arrives wrapped in quotes.
  const read = (key: string, fallback = '') => {
    const raw = (data ?? []).find((row) => row.key === key)?.value;
    if (raw === null || raw === undefined) return fallback;
    return String(typeof raw === 'string' ? raw : JSON.stringify(raw)).replace(/^"|"$/g, '') || fallback;
  };

  return {
    legalName: read('company_legal_name', STORE.name),
    addressLine1: read('store_address_line1', STORE.address),
    vatNumber: read('vat_number'),
    bankName: read('bank_name'),
    bankAccountName: read('bank_account_name'),
    bankAccountNumber: read('bank_account_number'),
    bankBranchCode: read('bank_branch_code'),
  };
}

/** A number a customer can quote back. Sequential ids are not shareable. */
export function invoiceNumber(order: Pick<OrderRow, 'id' | 'created_at'>): string {
  const stamp = String(order.created_at ?? '').slice(2, 10).replace(/-/g, '');
  return `INV${stamp}-${String(order.id).slice(0, 4).toUpperCase()}`;
}

/**
 * The A4 tax invoice.
 *
 * Laid out to match the document the shop already issues, because customers and
 * their bookkeepers recognise it — the boxed From/To header, the account strip,
 * the line table, and banking beside the totals. What it does not copy is the
 * old contact block: that invoice still carries an iway.na address the shop no
 * longer uses.
 */
export async function buildInvoicePdf(order: OrderRow, company: InvoiceCompany): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 12;
  const right = 198;
  const mid = 105;

  const box = (x: number, y: number, w: number, h: number, title: string) => {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(title, x + w / 2, y + 5, { align: 'center' });
  };

  const pair = (label: string, value: string, x: number, y: number, gap = 32) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.4);
    doc.setTextColor(...INK);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.text(value, x + gap, y);
  };

  /* Title bar */
  doc.setFillColor(240, 243, 247);
  doc.rect(left, 12, right - left, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text('TAX INVOICE', (left + right) / 2, 17.6, { align: 'center' });

  /* From / contact */
  box(left, 24, mid - left - 3, 34, 'Invoice From');
  box(mid, 24, right - mid, 34, 'Contact');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(company.legalName, left + 4, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.text(company.addressLine1, left + 4, 39.5);
  doc.text(STORE.city, left + 4, 44.5);

  pair('Telephone', STORE.phone, mid + 4, 34, 26);
  pair('Email', STORE.email, mid + 4, 39.5, 26);
  pair('VAT Reg. No', company.vatNumber || '—', mid + 4, 45, 26);
  pair('Invoice Date', formatDate(order.created_at), mid + 4, 50.5, 26);

  /* To / deliver */
  box(left, 61, mid - left - 3, 32, 'Invoice To');
  box(mid, 61, right - mid, 32, 'Deliver To');

  const customer = order.customer_name || 'Cash sale';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(customer, left + 4, 71);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  if (order.customer_phone) doc.text(order.customer_phone, left + 4, 76.5);
  if (order.customer_email) doc.text(order.customer_email, left + 4, 81.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(customer, mid + 4, 71);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  const deliver = order.delivery_address || `Collection · ${company.addressLine1}`;
  doc.text(doc.splitTextToSize(deliver, right - mid - 8) as string[], mid + 4, 76.5);

  /* Account strip */
  let y = 100;
  doc.setDrawColor(...LINE);
  doc.line(left, y - 4, right, y - 4);

  const cols: Array<[string, string, number]> = [
    ['Account No', order.customer_phone || '—', left],
    ['Invoice Date', formatDate(order.created_at), left + 42],
    ['Payment', order.payment_method || '—', left + 82],
    ['Invoice Number', invoiceNumber(order), left + 116],
    ['Page', '1 of 1', right - 14],
  ];
  doc.setFontSize(7.6);
  for (const [label, value, x] of cols) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(value, x, y + 4.6);
  }
  doc.setTextColor(...INK);
  y += 10;

  /* Lines */
  doc.setFillColor(240, 243, 247);
  doc.rect(left, y, right - left, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  y += 4.8;
  doc.text('Item Code', left + 2, y);
  doc.text('Description', left + 30, y);
  doc.text('Unit Price Incl', left + 128, y, { align: 'right' });
  doc.text('Qty', left + 148, y, { align: 'right' });
  doc.text('Line Total Incl', right - 2, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  const items = order.items ?? [];
  for (const item of items) {
    if (y > 232) {
      doc.addPage();
      y = 20;
    }
    const qty = Number(item.quantity ?? 0);
    const price = Number(item.price ?? 0);

    doc.text(String(item.sku ?? '').slice(0, 14) || '—', left + 2, y);
    doc.text(String(item.name ?? '').slice(0, 52), left + 30, y);
    doc.text(money(price).replace('N$ ', ''), left + 128, y, { align: 'right' });
    doc.text(String(qty), left + 148, y, { align: 'right' });
    doc.text(money(round2(price * qty)).replace('N$ ', ''), right - 2, y, { align: 'right' });
    y += 5.4;

    if (item.imei) {
      doc.setFontSize(7.4);
      doc.setTextColor(...GREY);
      doc.text(`IMEI ${item.imei}`, left + 30, y);
      doc.setTextColor(...INK);
      doc.setFontSize(8.6);
      y += 4.6;
    }
  }

  doc.setDrawColor(...LINE);
  doc.line(left, y, right, y);

  /* Banking, count, totals */
  const footY = Math.max(y + 8, 236);
  box(left, footY, 66, 34, 'Banking Details');
  box(left + 70, footY, 40, 34, 'Number of Items');
  box(left + 114, footY, right - left - 114, 34, 'Totals');

  doc.setFontSize(8);
  pair('Bank', company.bankName || '—', left + 4, footY + 12, 22);
  pair('Account', company.bankAccountNumber || '—', left + 4, footY + 17.5, 22);
  pair('Branch', company.bankBranchCode || '—', left + 4, footY + 23, 22);
  pair('Name', company.bankAccountName || company.legalName, left + 4, footY + 28.5, 22);

  const units = items.reduce((n, i) => n + Number(i.quantity ?? 0), 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(String(units), left + 90, footY + 20, { align: 'center' });

  const total = Number(order.total_amount ?? 0);
  const vat = Number(order.vat_amount ?? 0);
  const net = Number(order.subtotal_amount ?? total - vat);
  const discount = Number(order.coupon_discount ?? 0);

  const totalRow = (label: string, value: string, ty: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 8.6);
    doc.text(label, left + 118, ty);
    doc.text(value, right - 4, ty, { align: 'right' });
  };
  totalRow('Subtotal (Exclusive)', money(net).replace('N$ ', ''), footY + 11);
  totalRow('Discount', discount ? money(discount).replace('N$ ', '') : '—', footY + 17);
  totalRow('VAT', money(vat).replace('N$ ', ''), footY + 23);
  totalRow('Total', money(total).replace('N$ ', ''), footY + 30, true);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text(
    `${company.legalName} · VAT ${company.vatNumber || '—'} · All amounts in Namibian Dollar`,
    (left + right) / 2,
    286,
    { align: 'center' },
  );

  return doc.output('blob');
}

export function invoiceFileName(order: OrderRow): string {
  return `${invoiceNumber(order)}.pdf`;
}

export async function downloadInvoicePdf(order: OrderRow): Promise<void> {
  const blob = await buildInvoicePdf(order, await loadInvoiceCompany());
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = invoiceFileName(order);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Publishes the invoice and returns a WhatsApp link to the customer carrying it.
 *
 * A link rather than an attachment for the same reason the job card is: wa.me
 * is the only way to open a chat with a number that is not in the sender's
 * contacts, and a walk-in customer never is.
 */
export async function invoiceWhatsAppLink(order: OrderRow): Promise<string> {
  const company = await loadInvoiceCompany();
  const blob = await buildInvoicePdf(order, company);
  const path = `invoices/${invoiceFileName(order)}`;

  const { error } = await supabase.storage
    .from('Images')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Could not publish the invoice: ${error.message}`);

  const { data } = supabase.storage.from('Images').getPublicUrl(path);
  const message = [
    `*${company.legalName}*`,
    `Tax Invoice *${invoiceNumber(order)}*`,
    ``,
    `Total: *${money(order.total_amount)}*`,
    ``,
    `Your invoice:`,
    data.publicUrl,
  ].join('\n');

  return `https://wa.me/${whatsappNumber(order.customer_phone)}?text=${encodeURIComponent(message)}`;
}

/** A mailto: with the invoice link — no mail server needed to get one sent. */
export async function invoiceMailtoLink(order: OrderRow): Promise<string> {
  const company = await loadInvoiceCompany();
  const blob = await buildInvoicePdf(order, company);
  const path = `invoices/${invoiceFileName(order)}`;

  await supabase.storage
    .from('Images')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  const { data } = supabase.storage.from('Images').getPublicUrl(path);

  const subject = `${company.legalName} — Tax Invoice ${invoiceNumber(order)}`;
  const body = [
    `Good day${order.customer_name ? ` ${order.customer_name.split(' ')[0]}` : ''},`,
    ``,
    `Thank you for your purchase. Your tax invoice ${invoiceNumber(order)} for ${money(order.total_amount)} is attached below.`,
    ``,
    data.publicUrl,
    ``,
    company.legalName,
    STORE.phone,
  ].join('\n');

  return `mailto:${order.customer_email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
