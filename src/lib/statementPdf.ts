import type { ClientStatement } from '@/data/statements';
import { STORE } from './constants';
import { formatDate, money } from './format';
import {
  BRAND_GREEN,
  BRAND_GREEN_SOFT,
  loadBrandLogo,
  loadInvoiceCompany,
} from './invoicePdf';

/**
 * A client statement as an A4 document.
 *
 * Same green letterhead as the tax invoice and the quotation, because a
 * customer who is sent one of each should be able to see they came from the
 * same shop. Where it differs from those is the body: an invoice lists goods,
 * a statement lists movement on an account, so the table carries a balance
 * column and the totals block is an ageing summary rather than a VAT split.
 */

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const LINE: [number, number, number] = [196, 205, 218];
const OVERDUE: [number, number, number] = [176, 32, 32];

/** Where the transaction table has to stop to leave room for the totals. */
const BODY_BOTTOM = 226;

/**
 * Table geometry, in mm from the left margin.
 *
 * Charges, payments and the balance are right-aligned to their x, so the text
 * to their left has to stop short of where the widest amount begins, not where
 * its anchor sits. AMOUNT_WIDTH is that reservation: without it a description
 * is trimmed to a column that does not exist and prints underneath the money.
 */
const COL = { date: 2, reference: 24, description: 66, charges: 132, payments: 156 };
const AMOUNT_WIDTH = 18;

function amount(value: number): string {
  return money(value).replace('N$ ', '');
}

export function statementFileName(statement: ClientStatement): string {
  const who = (statement.account_code || statement.customer_name || 'client')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `Statement-${who}-${statement.asAt}.pdf`;
}

export async function buildClientStatementPdf(statement: ClientStatement): Promise<Blob> {
  const company = await loadInvoiceCompany();
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 12;
  const right = 198;
  const mid = 105;

  /**
   * Trims to the column rather than to a character count.
   *
   * A fixed slice is set for the shortest description and cuts the longest
   * ones mid-word anyway; measuring the text keeps every column's worth of
   * detail and stops "Samsung Galaxy A16" running into the charges.
   */
  const fit = (text: string, width: number) => {
    if (doc.getTextWidth(text) <= width) return text;
    let out = text;
    while (out.length > 1 && doc.getTextWidth(`${out}…`) > width) out = out.slice(0, -1);
    return `${out.trimEnd()}…`;
  };

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

  /* Title bar */
  const logo = await loadBrandLogo();
  doc.setFillColor(...BRAND_GREEN_SOFT);
  doc.rect(left, 12, right - left, 8, 'F');
  doc.setFillColor(...BRAND_GREEN);
  doc.rect(left, 12, 1.6, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND_GREEN);
  doc.text('STATEMENT OF ACCOUNT', (left + right) / 2, 17.6, { align: 'center' });
  doc.setTextColor(...INK);

  /* From / To */
  box(left, 24, mid - left - 3, 36, 'From');
  box(mid, 24, right - mid, 36, 'Statement To');

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
  doc.text(statement.customer_name || '—', mid + 4, 33);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  statement.contact.filter(Boolean).slice(0, 5).forEach((line, i) => {
    doc.text(String(line).slice(0, 46), mid + 4, 37.8 + i * 4.4);
  });

  /* Reference strip */
  let y = 67;
  doc.setFontSize(7.6);
  const period = statement.from
    ? `${formatDate(statement.from)} to ${formatDate(statement.asAt)}`
    : `Up to ${formatDate(statement.asAt)}`;
  const cols: Array<[string, string]> = [
    ['Account', statement.account_code || statement.customer_name || '—'],
    ['Statement Date', formatDate(statement.asAt)],
    ['Period', period],
    ['Balance Due', amount(statement.closingBalance)],
  ];
  const step = (right - left) / cols.length;
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

  /* Column headings, repeated on every page the table runs onto. */
  const heading = () => {
    doc.setFillColor(...BRAND_GREEN_SOFT);
    doc.rect(left, y, right - left, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...BRAND_GREEN);
    y += 4.8;
    doc.text('Date', left + COL.date, y);
    doc.text('Reference', left + COL.reference, y);
    doc.text('Description', left + COL.description, y);
    doc.text('Charges', left + COL.charges, y, { align: 'right' });
    doc.text('Payments', left + COL.payments, y, { align: 'right' });
    doc.text('Balance', right - 2, y, { align: 'right' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    doc.setTextColor(...INK);
  };
  heading();

  /* Brought forward. Undated when the statement runs from the beginning:
     stamping today's date on an opening line of zero reads as a transaction
     that happened today. */
  doc.setFont('helvetica', 'bold');
  if (statement.from) doc.text(formatDate(statement.from), left + COL.date, y);
  doc.text('Balance brought forward', left + COL.reference, y);
  doc.text(amount(statement.openingBalance), right - 2, y, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  y += 5.8;

  let striped = false;
  for (const line of statement.lines) {
    if (y + 6 > BODY_BOTTOM) {
      doc.addPage();
      y = 20;
      heading();
      striped = false;
    }

    if (striped) {
      doc.setFillColor(249, 250, 249);
      doc.rect(left, y - 3.8, right - left, 5.6, 'F');
    }
    striped = !striped;

    doc.setTextColor(...INK);
    doc.text(formatDate(line.date), left + COL.date, y);
    doc.text(fit(String(line.reference), COL.description - COL.reference - 3), left + COL.reference, y);
    // Off-account lines are marked in the description rather than dropped: the
    // customer's laybys and refunds are part of their history, they simply
    // are not part of what the account balance says they owe.
    const description = `${line.type}${line.detail ? ` — ${line.detail}` : ''}${line.onAccount ? '' : ' *'}`;
    doc.text(fit(description, COL.charges - COL.description - AMOUNT_WIDTH), left + COL.description, y);
    if (line.charge) doc.text(amount(line.charge), left + COL.charges, y, { align: 'right' });
    if (line.payment) doc.text(amount(line.payment), left + COL.payments, y, { align: 'right' });
    if (line.balance !== null) doc.text(amount(line.balance), right - 2, y, { align: 'right' });
    y += 5.6;
  }

  doc.setDrawColor(...LINE);
  doc.line(left, y, right, y);

  if (statement.lines.some((line) => !line.onAccount)) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(...GREY);
    y += 4.4;
    doc.text(
      '* Shown for your records only — laybys and refunds do not form part of the account balance.',
      left,
      y,
      { maxWidth: right - left },
    );
    doc.setTextColor(...INK);
    doc.setFontSize(8.6);
  }

  /* Ageing and totals, anchored to the foot of the page. A statement that
     runs long pushes them onto a page of their own rather than over the
     footer — the balance due is the one number that must always be legible. */
  let baseY = Math.max(y + 12, 236);
  if (baseY + 34 > 281) {
    doc.addPage();
    baseY = 24;
  }

  box(left, baseY, 110, 34, 'Age Analysis');
  box(left + 114, baseY, right - left - 114, 34, 'Summary');

  doc.setFontSize(8);
  const buckets: Array<[string, number]> = [
    ['Current', statement.aging.current],
    ['30 Days', statement.aging.d30],
    ['60 Days', statement.aging.d60],
    ['90+ Days', statement.aging.d90],
  ];
  const bucketStep = 110 / buckets.length;
  buckets.forEach(([label, value], i) => {
    const x = left + 6 + i * bucketStep;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    doc.text(label, x, baseY + 14);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...(i >= 2 && value > 0 ? OVERDUE : GREY));
    doc.text(amount(value), x, baseY + 21);
    doc.setTextColor(...INK);
  });

  const summaryRow = (label: string, value: string, ty: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 10 : 8.6);
    doc.setTextColor(...(bold ? BRAND_GREEN : INK));
    doc.text(label, left + 118, ty);
    doc.text(value, right - 4, ty, { align: 'right' });
    doc.setTextColor(...INK);
  };
  summaryRow('Brought forward', amount(statement.openingBalance), baseY + 11);
  summaryRow('Charges', amount(statement.charges), baseY + 17);
  summaryRow('Payments', amount(statement.payments), baseY + 23);
  summaryRow('Balance Due', amount(statement.closingBalance), baseY + 31, true);

  /* Banking, on its own line under the boxes where there is room for it. */
  const bankY = baseY + 40;
  if (bankY < 278) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(...INK);
    doc.text('Banking Details', left, bankY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GREY);
    doc.text(
      [
        `Bank ${company.bankName || '—'}`,
        `Account ${company.bankAccountNumber || '—'}`,
        `Branch ${company.bankBranchCode || '—'}`,
        statement.account_code ? `Reference ${statement.account_code}` : '',
      ]
        .filter(Boolean)
        .join('   ·   '),
      left + 26,
      bankY,
    );
    doc.setTextColor(...INK);
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

export async function downloadClientStatementPdf(statement: ClientStatement): Promise<void> {
  const blob = await buildClientStatementPdf(statement);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = statementFileName(statement);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
