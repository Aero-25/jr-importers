import type { OrderRow } from './database.types';
import { orderItems } from '@/data/orders';
import { STORE } from './constants';
import { formatDate, formatDateTime, money } from './format';
import { whatsappNumber } from './phone';

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

  /*
    Deliberately no contents list.

    The note travels taped to the outside of a parcel and is read by couriers,
    depot staff and whoever is at the gate. Printing "Samsung S24 Ultra" and an
    IMEI on it tells every one of them exactly what is worth stealing and how to
    identify it afterwards. The courier needs to know where it goes and how many
    pieces there are; nobody in that chain needs to know what is inside.

    What was shipped is on the invoice, which goes to the customer.
  */
  doc.setDrawColor(...GREY);
  doc.setLineWidth(0.2);
  doc.line(left, y, right, y);
  y += 6;

  const items = orderItems(order);
  const units = items.reduce((n, i) => n + i.quantity, 0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text('PARCEL', left, y);
  y += 8;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(`${units} item${units === 1 ? '' : 's'}`, left, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(`${items.length} line${items.length === 1 ? '' : 's'}`, left + 46, y);
  doc.setTextColor(...INK);
  y += 9;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(...GREY);
  doc.text('Contents are not listed on this note. Check against the invoice on delivery.', left, y);
  doc.setTextColor(...INK);
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
  const phone = whatsappNumber(order.customer_phone);
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
