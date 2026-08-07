import type { RefundRow } from './database.types';
import { STORE } from './constants';
import { formatDateTime, money } from './format';

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const RED: [number, number, number] = [198, 40, 40];

/**
 * The customer's proof that money was returned.
 *
 * Deliberately a credit note and not a reversed invoice: the original sale
 * still happened and still appears in the books. Overwriting it would leave the
 * day's takings unable to explain themselves.
 */
export async function buildCreditNotePdf(refund: RefundRow): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('CREDIT NOTE', left, y);

  doc.setFontSize(13);
  doc.setTextColor(...RED);
  doc.text(`No. ${refund.refund_number}`, right, y, { align: 'right' });
  doc.setTextColor(...INK);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...GREY);
  doc.text(`${STORE.name} · ${STORE.address}`, left, y);
  y += 4.2;
  doc.text(`${STORE.phone} · ${STORE.email}`, left, y);
  doc.text(formatDateTime(refund.approved_at ?? refund.created_at), right, y, { align: 'right' });

  y += 7;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 8;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('Customer', left, y);
  doc.text('Original sale', left + 96, y);
  y += 5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(refund.customer_name || '—', left, y);
  doc.text(refund.original_reference || refund.order_id?.slice(0, 8) || '—', left + 96, y);
  y += 4.8;
  doc.text(refund.customer_phone || '', left, y);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.text('Item', left, y);
  doc.text('Qty', left + 118, y, { align: 'right' });
  doc.text('Unit', left + 150, y, { align: 'right' });
  doc.text('Total', right, y, { align: 'right' });
  y += 1.8;
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 4.4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  for (const line of refund.items ?? []) {
    doc.text(String(line.name).slice(0, 62), left, y);
    doc.text(String(line.quantity), left + 118, y, { align: 'right' });
    doc.text(money(line.unit_price), left + 150, y, { align: 'right' });
    doc.text(money(line.line_total), right, y, { align: 'right' });
    y += 4.6;

    // Says on the customer's copy whether the unit came back to us, which is
    // the difference between a return and a goodwill payment.
    if (!line.restock) {
      doc.setFontSize(7.6);
      doc.setTextColor(...GREY);
      doc.text('not returned to stock', left + 4, y);
      doc.setTextColor(...INK);
      doc.setFontSize(9);
      y += 4;
    }
    if (line.imei) {
      doc.setFontSize(7.6);
      doc.setTextColor(...GREY);
      doc.text(`IMEI ${line.imei}`, left + 4, y);
      doc.setTextColor(...INK);
      doc.setFontSize(9);
      y += 4;
    }
  }

  y += 1;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.line(left + 110, y, right, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Refunded', left + 110, y);
  doc.text(money(refund.total_amount), right, y, { align: 'right' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`Paid back by ${refund.method}`, left + 110, y);
  doc.setTextColor(...INK);

  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Reason', left, y);
  y += 4.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const reason = doc.splitTextToSize(refund.reason, right - left) as string[];
  doc.text(reason, left, y);
  y += reason.length * 4.4;

  const sigY = Math.min(Math.max(y + 20, 240), 262);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(left, sigY, left + 80, sigY);
  doc.line(left + 100, sigY, right, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CUSTOMER SIGNATURE', left, sigY + 4);
  doc.text('AUTHORISED BY', left + 100, sigY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(...GREY);
  if (refund.approved_by) doc.text(refund.approved_by, left + 100, sigY + 8.6);
  doc.text(`Raised by ${refund.requested_by ?? '—'} · ${STORE.name}`, left, 288);

  return doc.output('blob');
}

export async function downloadCreditNotePdf(refund: RefundRow): Promise<void> {
  const blob = await buildCreditNotePdf(refund);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `JR-CreditNote-${refund.refund_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
