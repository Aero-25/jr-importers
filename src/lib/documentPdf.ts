import type { InvoiceRow, LineItem, QuoteRow } from './database.types';
import { supabase } from './supabase';
import {
  BRAND_GREEN,
  BRAND_GREEN_SOFT,
  loadBrandLogo,
  loadInvoiceCompany,
  type InvoiceCompany,
} from './invoicePdf';
import { STORE } from './constants';
import { formatDate, money } from './format';

/**
 * Quotes and account invoices as A4 documents — the same green visual
 * language as the till's tax invoice, because everything a customer receives
 * from the shop should look like it came from the same shop.
 */

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const LINE: [number, number, number] = [196, 205, 218];

interface DocumentSpec {
  title: 'QUOTATION' | 'TAX INVOICE';
  number: string;
  date: string | null;
  customerName: string;
  customerContact: Array<string>;
  items: LineItem[];
  subtotal: number;
  vat: number;
  total: number;
  /** e.g. "Valid until 30/08/2026" on a quote, "Due 30/08/2026" on an invoice. */
  validityLine?: string | null;
  notes?: string | null;
  /** The customer's own purchase order number, if they gave one. */
  poNumber?: string | null;
}

async function buildDocumentPdf(spec: DocumentSpec, company: InvoiceCompany): Promise<Blob> {
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
    doc.setTextColor(...BRAND_GREEN);
    doc.text(title, x + w / 2, y + 5, { align: 'center' });
    doc.setTextColor(...INK);
  };

  /* Title bar with the logo */
  const logo = await loadBrandLogo();
  doc.setFillColor(...BRAND_GREEN_SOFT);
  doc.rect(left, 12, right - left, 8, 'F');
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(left, 12, 1.6, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GREEN);
  doc.text(spec.title, (left + right) / 2, 17.6, { align: 'center' });
  doc.setTextColor(...INK);

  /* From / To */
  box(left, 24, mid - left - 3, 36, 'From');
  box(mid, 24, right - mid, 36, spec.title === 'QUOTATION' ? 'Quotation To' : 'Invoice To');

  if (logo) {
    try {
      doc.addImage(logo, 'PNG', mid - 3 - 20, 28.5, 14, 14);
    } catch {
      // A corrupt cache entry must not sink the document.
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(company.legalName, left + 4, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.text(company.addressLine1, left + 4, 37.8);
  doc.text(STORE.city, left + 4, 42.2);
  doc.text(`Tel ${STORE.phone}`, left + 4, 46.6);
  doc.text(`VAT Reg ${company.vatNumber || '—'}`, left + 4, 51);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(spec.customerName || '—', mid + 4, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  spec.customerContact
    .filter(Boolean)
    .slice(0, 5)
    .forEach((line, i) => {
      doc.text(String(line).slice(0, 46), mid + 4, 37.8 + i * 4.4);
    });

  /* Reference strip */
  let y = 67;
  doc.setFontSize(7.6);
  const cols: Array<[string, string]> = [
    [spec.title === 'QUOTATION' ? 'Quote Number' : 'Invoice Number', spec.number],
    ['Date', spec.date ? formatDate(spec.date) : '—'],
    ...(spec.validityLine
      ? ([[spec.validityLine.split(' ')[0]!, spec.validityLine.split(' ').slice(1).join(' ')]] as Array<[string, string]>)
      : []),
    ...(spec.poNumber ? ([['Your PO', spec.poNumber]] as Array<[string, string]>) : []),
  ];
  // Paging moved to the page footer, where it can count the real total. It was
  // hardcoded "1 of 1" here and lied on any document that ran over.
  const step = (right - left) / Math.max(cols.length, 1);
  cols.forEach(([label, value], i) => {
    const x = left + i * step;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(value, x, y + 4.6);
  });
  doc.setTextColor(...INK);
  y += 12;

  /* Lines */
  doc.setFillColor(...BRAND_GREEN_SOFT);
  doc.rect(left, y, right - left, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BRAND_GREEN);
  y += 4.8;
  doc.text('Code', left + 2, y);
  doc.text('Description', left + 28, y);
  doc.text('Unit Price Incl', left + 130, y, { align: 'right' });
  doc.text('Qty', left + 148, y, { align: 'right' });
  doc.text('Line Total Incl', right - 2, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...INK);
  let striped = false;
  for (const item of spec.items) {
    // The serials belong to the line, so they must not be split from it by a
    // page break.
    const serials = item.imeis?.length ? item.imeis : item.imei ? [item.imei] : [];
    const lineHeight = 5.4 + (serials.length ? 4.2 : 0);
    if (y + lineHeight > 232) {
      doc.addPage();
      y = 20;
    }

    if (striped) {
      doc.setFillColor(249, 250, 249);
      doc.rect(left, y - 3.8, right - left, lineHeight, 'F');
    }
    striped = !striped;

    const qty = Number(item.quantity ?? 0);
    const price = Number(item.price ?? 0);
    doc.setTextColor(...INK);
    doc.text(String(item.sku ?? '').slice(0, 12) || '—', left + 2, y);
    doc.text(String(item.name ?? '').slice(0, 56), left + 28, y);
    doc.text(money(price).replace('N$ ', ''), left + 130, y, { align: 'right' });
    doc.text(String(qty), left + 148, y, { align: 'right' });
    doc.text(
      money(item.line_total ?? Math.round(qty * price * 100) / 100).replace('N$ ', ''),
      right - 2,
      y,
      { align: 'right' },
    );
    y += 5.4;

    // Which physical handset left the shop. A warranty claim, an insurance
    // policy and a police report are all matched on this number, so it is
    // printed on the customer's copy rather than kept only in the system.
    if (serials.length) {
      doc.setFontSize(7.4);
      doc.setTextColor(...GREY);
      doc.text(
        `${serials.length > 1 ? 'IMEIs' : 'IMEI'}: ${serials.join('   ')}`,
        left + 28,
        y,
      );
      doc.setFontSize(8.6);
      doc.setTextColor(...INK);
      y += 4.2;
    }
  }

  doc.setDrawColor(...LINE);
  doc.line(left, y, right, y);

  /* Banking and totals */
  // Anchored to the foot of the page: a reader looking for the amount due or
  // where to pay it always finds them in the same place, whatever the document
  // holds. Long documents push them onto their own page rather than colliding.
  const footY = Math.max(y + 10, 236);
  box(left, footY, 88, 34, 'Banking Details');
  box(left + 114, footY, right - left - 114, 34, 'Totals');

  doc.setFontSize(8);
  const pair = (label: string, value: string, py: number) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, left + 4, py);
    doc.setFont('helvetica', 'normal');
    doc.text(value, left + 26, py);
  };
  // Account name is deliberately not printed: the stored value named the shop
  // as a CC, which it is not, and a payment instruction carrying the wrong
  // entity is worse than one carrying none. Bank, number and branch are enough
  // to pay against. Restore it here once settings hold the registered name.
  pair('Bank', company.bankName || '—', footY + 13);
  pair('Account', company.bankAccountNumber || '—', footY + 20);
  pair('Branch', company.bankBranchCode || '—', footY + 27);

  const totalRow = (label: string, value: string, ty: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 8.6);
    doc.setTextColor(...(bold ? BRAND_GREEN : INK));
    doc.text(label, left + 118, ty);
    doc.text(value, right - 4, ty, { align: 'right' });
    doc.setTextColor(...INK);
  };
  totalRow('Subtotal (Exclusive)', money(spec.subtotal).replace('N$ ', ''), footY + 12);
  totalRow('VAT', money(spec.vat).replace('N$ ', ''), footY + 19);
  totalRow('Total', money(spec.total).replace('N$ ', ''), footY + 29, true);

  if (spec.notes) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    doc.setTextColor(...GREY);
    doc.text(doc.splitTextToSize(spec.notes, 96) as string[], left + 4, footY - 6);
  }

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.line(left, 283, right, 283);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text(
      `${company.legalName} · VAT ${company.vatNumber || '—'} · All amounts in Namibian Dollar · E&OE`,
      (left + right) / 2,
      287.5,
      { align: 'center' },
    );
    doc.text(`Page ${page} of ${pages}`, right, 287.5, { align: 'right' });
    doc.setTextColor(...INK);
  }

  return doc.output('blob');
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadQuotePdf(quote: QuoteRow): Promise<void> {
  const company = await loadInvoiceCompany();
  const blob = await buildDocumentPdf(
    {
      title: 'QUOTATION',
      number: quote.quote_number ?? `Q-${quote.id}`,
      date: quote.created_at,
      customerName: quote.customer_name ?? '—',
      customerContact: [quote.customer_phone ?? '', quote.customer_email ?? ''],
      items: quote.items ?? [],
      subtotal: Number(quote.subtotal_amount ?? 0),
      vat: Number(quote.vat_amount ?? 0),
      total: Number(quote.total_amount ?? 0),
      validityLine: quote.valid_until ? `Valid-until ${formatDate(quote.valid_until)}` : null,
      notes: quote.notes,
    },
    company,
  );
  download(blob, `${quote.quote_number ?? `Q-${quote.id}`}.pdf`);
}

export async function downloadInvoiceRecordPdf(invoice: InvoiceRow): Promise<void> {
  const company = await loadInvoiceCompany();

  // The invoice stores the customer's name and email, but a proper tax invoice
  // needs the address and a reference the customer recognises. Both live on the
  // customer record, so fetch it where the invoice is linked to one. A failure
  // here must not stop the document printing — it only makes it less complete.
  let contact: string[] = [invoice.customer_email ?? ''];
  if (invoice.customer_id) {
    const { data } = await supabase
      .from('customers')
      .select('phone, email, address, account_code, city, region')
      .eq('id', invoice.customer_id)
      .maybeSingle();
    if (data) {
      const c = data as Record<string, string | null>;
      // Most addresses already end with the town, so appending the city field
      // printed "Windhoek" twice. Compared case-insensitively, first wins.
      const seen = new Set<string>();
      contact = [
        c.account_code ? `Account ${c.account_code}` : '',
        ...(c.address ?? '').split('\n').map((l) => l.trim()),
        [c.city, c.region].filter(Boolean).join(', '),
        c.phone ?? '',
        c.email ?? invoice.customer_email ?? '',
      ].filter((line) => {
        const key = line.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  const blob = await buildDocumentPdf(
    {
      title: 'TAX INVOICE',
      number: invoice.invoice_number ?? `INV-${invoice.id}`,
      date: invoice.created_at,
      customerName: invoice.customer_name ?? '—',
      customerContact: contact,
      items: invoice.items ?? [],
      subtotal: Number(invoice.subtotal_amount ?? 0),
      vat: Number(invoice.vat_amount ?? 0),
      total: Number(invoice.total_amount ?? 0),
      validityLine: invoice.due_date ? `Due ${formatDate(invoice.due_date)}` : null,
      poNumber: invoice.po_number ?? null,
      notes: invoice.notes ?? null,
    },
    company,
  );
  download(blob, `${invoice.invoice_number ?? `INV-${invoice.id}`}.pdf`);
}
