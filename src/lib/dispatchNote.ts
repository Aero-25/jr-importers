import type { OrderRow } from './database.types';
import { orderItems } from '@/data/orders';
import { STORE } from './constants';
import { formatDate, formatDateTime, money } from './format';

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];

/**
 * The note that travels with the parcel.
 *
 * Written for whoever is holding the box, not for the accounts file: the
 * delivery address and phone number are the largest things on the page,
 * because the only questions a driver ever has are where this goes and who to
 * ring when they cannot find it.
 *
 * Prices are deliberately omitted from the item list. A dispatch note is a
 * packing document — it gets handed to couriers and left on counters, and the
 * value of the contents is nobody else's business.
 */
export async function buildDispatchNote(order: OrderRow): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 18;

  const ref = order.id.slice(0, 8).toUpperCase();

  /* Header */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('DISPATCH NOTE', left, y);
  doc.setFontSize(13);
  doc.text(ref, right, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...GREY);
  doc.text(`${STORE.name} · ${STORE.address} · ${STORE.phone}`, left, y);
  doc.text(formatDate(new Date()), right, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 9;

  /* Deliver to — the biggest block on the page, by design */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('DELIVER TO', left, y);
  y += 7;

  doc.setTextColor(...INK);
  doc.setFontSize(17);
  doc.text(order.customer_name ?? 'Customer', left, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  const address = [
    order.delivery_address,
    [order.customer_city, order.customer_region].filter(Boolean).join(', '),
    STORE.country,
  ].filter(Boolean) as string[];

  for (const part of address) {
    for (const wrapped of doc.splitTextToSize(part, 120) as string[]) {
      doc.text(wrapped, left, y);
      y += 6;
    }
  }

  y += 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(order.customer_phone ?? 'No number on file', left, y);
  y += 6;

  if (order.customer_email) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GREY);
    doc.text(order.customer_email, left, y);
    doc.setTextColor(...INK);
    y += 6;
  }

  /* Method + courier box, to the right of the address */
  const boxY = 46;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(right - 62, boxY, 62, 34);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('METHOD', right - 58, boxY + 6);
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(order.delivery_method ?? 'Courier', right - 58, boxY + 12);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('COURIER', right - 58, boxY + 20);
  doc.setTextColor(...INK);
  doc.setFontSize(11);
  doc.text(order.courier_company ?? '—', right - 58, boxY + 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...GREY);
  doc.text('WAYBILL', right - 58, boxY + 31.5);
  doc.setTextColor(...INK);
  doc.setFontSize(9.5);
  doc.text(order.waybill_number ?? '—', right - 32, boxY + 31.5);

  y = Math.max(y + 4, boxY + 42);

  /* Contents — quantities and identifiers only, no prices */
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('CONTENTS', left, y);
  y += 6;

  doc.setTextColor(...INK);
  doc.setFontSize(8.6);
  doc.text('QTY', left, y);
  doc.text('ITEM', left + 14, y);
  doc.text('IMEI / SERIAL', right, y, { align: 'right' });
  y += 2;
  doc.line(left, y, right, y);
  y += 5;

  const items = orderItems(order);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.4);

  for (const item of items) {
    doc.setFont('helvetica', 'bold');
    doc.text(String(item.quantity), left, y);
    doc.setFont('helvetica', 'normal');

    const name = [item.name, item.color].filter(Boolean).join(' · ');
    doc.text(doc.splitTextToSize(name, 116)[0] ?? name, left + 14, y);

    doc.setFontSize(8.4);
    doc.text(item.imei ?? item.sku ?? '—', right, y, { align: 'right' });
    doc.setFontSize(9.4);
    y += 6;
  }

  const units = items.reduce((n, i) => n + i.quantity, 0);
  y += 1;
  doc.setDrawColor(...GREY);
  doc.line(left, y, right, y);
  y += 5.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.6);
  doc.text(`${items.length} line(s) · ${units} unit(s)`, left, y);
  y += 8;

  if (order.delivery_notes) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GREY);
    doc.text('DELIVERY NOTES', left, y);
    y += 5;
    doc.setTextColor(...INK);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.6);
    const wrapped = doc.splitTextToSize(order.delivery_notes, right - left) as string[];
    doc.text(wrapped, left, y);
    y += wrapped.length * 5 + 3;
  }

  /* Received-by, which is the whole point of sending a note */
  const sigY = Math.min(Math.max(y + 16, 232), 258);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(left, sigY, left + 78, sigY);
  doc.line(left + 96, sigY, left + 148, sigY);
  doc.line(left + 158, sigY, right, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('RECEIVED BY (PRINT NAME)', left, sigY + 4);
  doc.text('SIGNATURE', left + 96, sigY + 4);
  doc.text('DATE', left + 158, sigY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...GREY);
  doc.text(
    `Order ${ref} · placed ${formatDateTime(order.created_at)} · ${STORE.name}`,
    left,
    288,
  );

  return doc.output('blob');
}

export async function downloadDispatchNote(order: OrderRow): Promise<void> {
  const blob = await buildDispatchNote(order);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `JR-Dispatch-${order.id.slice(0, 8).toUpperCase()}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Sends the customer their tracking details on WhatsApp. */
export function dispatchWhatsAppLink(order: OrderRow): string {
  const phone = String(order.customer_phone ?? '').replace(/\D/g, '');
  const first = String(order.customer_name ?? '').trim().split(/\s+/)[0] ?? '';

  const message = [
    `Hi ${first}, your order from ${STORE.name} is on its way.`,
    '',
    `Order: ${order.id.slice(0, 8).toUpperCase()}`,
    order.courier_company ? `Courier: ${order.courier_company}` : '',
    order.waybill_number ? `Waybill: ${order.waybill_number}` : '',
    order.delivery_address ? `Delivering to: ${order.delivery_address}` : '',
    '',
    `Total: ${money(order.total_amount)}`,
    '',
    `Any questions, call us on ${STORE.phone}.`,
  ]
    .filter(Boolean)
    .join('\n');

  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}
