import type { CashUp } from '@/data/till';
import { supabase } from './supabase';
import { STORE } from './constants';
import { formatDateTime, money } from './format';

const INK: [number, number, number] = [13, 38, 63];
const GREY: [number, number, number] = [110, 122, 143];
const RED: [number, number, number] = [198, 40, 40];
const GREEN: [number, number, number] = [22, 143, 79];

/** Where the cash-up is sent when a shift closes. */
export const CASHUP_WHATSAPP = '264811447669';

const label = (face: string) =>
  Number(face) >= 1 ? `N$${Number(face)}` : `${Math.round(Number(face) * 100)}c`;

/**
 * The shift report.
 *
 * Laid out as an accountant would read it: how the drawer opened, what was
 * taken and by which tender, what left the drawer, what the till therefore
 * *should* hold, and what was actually counted. The variance is stated once,
 * in one place, and coloured — a shift report that buries the variance is a
 * shift report nobody checks.
 */
export async function buildCashUpPdf(report: CashUp): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 18;

  const line = (yy: number) => {
    doc.setDrawColor(...GREY);
    doc.setLineWidth(0.2);
    doc.line(left, yy, right, yy);
  };

  const LIME: [number, number, number] = [214, 240, 168];

  const row = (
    text: string,
    value: string,
    opts: { bold?: boolean; colour?: [number, number, number]; highlight?: boolean } = {},
  ) => {
    // Cash is the only tender that has to be in the drawer, so it is banded on
    // the page the same way it is on screen.
    if (opts.highlight) {
      doc.setFillColor(...LIME);
      doc.rect(left - 1.5, y - 3.8, right - left + 3, 5.8, 'F');
    }
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.bold ? 11 : 9.6);
    doc.setTextColor(...(opts.colour ?? INK));
    doc.text(text, left, y);
    doc.text(value, right, y, { align: 'right' });
    y += opts.bold ? 7 : 5.6;
    doc.setTextColor(...INK);
  };

  /* Header */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(...INK);
  doc.text('CASH UP', left, y);

  doc.setFontSize(11);
  doc.text(`Shift #${report.shift_id}`, right, y, { align: 'right' });

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.6);
  doc.setTextColor(...GREY);
  doc.text(`${STORE.name} · ${STORE.address}`, left, y);
  doc.text(`Till ${report.till_id}`, right, y, { align: 'right' });
  y += 4.4;
  doc.text(`Opened ${formatDateTime(report.opened_at)}`, left, y);
  if (report.closed_at) doc.text(`Closed ${formatDateTime(report.closed_at)}`, right, y, { align: 'right' });
  y += 4.4;
  doc.text(`Cashier: ${report.cashier ?? '—'}`, left, y);
  if (report.closed_by) doc.text(`Closed by: ${report.closed_by}`, right, y, { align: 'right' });

  y += 6;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 8;

  /* Takings */
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TAKINGS', left, y);
  y += 6;

  row('Cash', money(report.cash_sales), { highlight: true });
  row('Card', money(report.card_sales));
  row('EFT', money(report.eft_sales));
  if (report.other_sales > 0) row('Other tenders', money(report.other_sales));
  line(y - 2);
  y += 2;
  row(`Total sales  (${report.transaction_count} transactions)`, money(report.total_sales), { bold: true });
  if (report.refunds > 0) {
    row('Less refunds', `− ${money(report.refunds)}`);
    row('Net takings', money(report.total_sales - report.refunds), { bold: true });
  }
  y += 3;

  /* Drawer */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DRAWER', left, y);
  y += 6;

  row('Opening float (counted)', money(report.opening_float));
  row('Cash takings', money(report.cash_sales), { highlight: true });
  row('Petty cash paid out', `− ${money(report.petty_cash)}`);
  if (report.cash_refunds > 0) {
    row(`Refunds paid out (${report.refund_count})`, `− ${money(report.cash_refunds)}`);
  }
  line(y - 2);
  y += 2;
  row('Expected in drawer', money(report.expected_cash), { bold: true });
  row('Counted in drawer', money(report.counted_cash), { bold: true });

  const over = report.variance > 0.005;
  const short = report.variance < -0.005;
  row(
    short ? 'SHORT' : over ? 'OVER' : 'BALANCED',
    money(Math.abs(report.variance)),
    { bold: true, colour: short ? RED : over ? RED : GREEN },
  );
  y += 4;

  /* Denominations, side by side */
  const denomBlock = (title: string, counts: Record<string, number>, x: number) => {
    let dy = y;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.6);
    doc.setTextColor(...INK);
    doc.text(title, x, dy);
    dy += 4.6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.4);
    const entries = Object.entries(counts ?? {})
      .filter(([, qty]) => Number(qty) > 0)
      .sort((a, b) => Number(b[0]) - Number(a[0]));

    if (entries.length === 0) {
      doc.setTextColor(...GREY);
      doc.text('not counted', x, dy);
      doc.setTextColor(...INK);
      dy += 4.4;
    }
    for (const [face, qty] of entries) {
      doc.text(`${label(face)} × ${qty}`, x, dy);
      doc.text(money(Number(face) * Number(qty)), x + 62, dy, { align: 'right' });
      dy += 4.4;
    }
    return dy;
  };

  const leftEnd = denomBlock('OPENING COUNT', report.opening_denominations, left);
  const rightEnd = denomBlock('CLOSING COUNT', report.closing_denominations, left + 78);
  y = Math.max(leftEnd, rightEnd) + 4;

  /* Phone count — advisory, and said so plainly */
  const countLines = report.stock_count ?? [];
  const offLines = countLines.filter((l) => l.variance !== 0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('PHONE COUNT', left, y);
  y += 5.6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.setTextColor(...GREY);
  doc.text('Advisory only — this count does not adjust system stock.', left, y);
  doc.setTextColor(...INK);
  y += 5.4;

  if (countLines.length === 0) {
    doc.setTextColor(...GREY);
    doc.text('No phone count recorded for this shift.', left, y);
    doc.setTextColor(...INK);
    y += 5;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...(offLines.length > 0 ? RED : GREEN));
    doc.text(
      offLines.length > 0
        ? `${countLines.length} handsets counted · ${offLines.length} do not match`
        : `${countLines.length} handsets counted · all matched`,
      left,
      y,
    );
    doc.setTextColor(...INK);
    y += 5.6;

    const columns = () => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.4);
      doc.text('Handset', left, y);
      doc.text('System', left + 108, y, { align: 'right' });
      doc.text('Counted', left + 138, y, { align: 'right' });
      doc.text('Variance', right, y, { align: 'right' });
      y += 1.6;
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.2);
      doc.line(left, y, right, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
    };
    columns();

    // Every line is listed, not only the discrepancies. The report is the
    // evidence that the count happened at all, and a list of exceptions cannot
    // show the difference between "counted and correct" and "never counted".
    for (const l of countLines) {
      if (y > 276) {
        doc.addPage();
        y = 18;
        columns();
      }

      const off = l.variance !== 0;
      doc.setTextColor(...(off ? RED : INK));
      doc.setFont('helvetica', off ? 'bold' : 'normal');
      doc.text(String(l.name).slice(0, 52), left, y);
      doc.text(String(l.system_qty), left + 108, y, { align: 'right' });
      doc.text(String(l.counted_qty), left + 138, y, { align: 'right' });
      if (off) {
        doc.text(`${l.variance > 0 ? '+' : ''}${l.variance}`, right, y, { align: 'right' });
      } else {
        doc.setTextColor(...GREY);
        doc.text('—', right, y, { align: 'right' });
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...INK);
      y += 4.6;
    }

    if (offLines.length > 0) {
      y += 2;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...RED);
      doc.text(
        `${offLines.length} line(s) do not match — investigate before adjusting stock.`,
        left,
        y,
      );
      doc.setTextColor(...INK);
      doc.setFont('helvetica', 'normal');
      y += 5;
    }
  }

  if (report.notes) {
    y += 3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('NOTES', left, y);
    y += 4.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.6);
    const wrapped = doc.splitTextToSize(report.notes, right - left) as string[];
    doc.text(wrapped, left, y);
    y += wrapped.length * 4.2;
  }

  /* Signatures */
  // A long stock count can run onto a second page; the signatures follow the
  // content rather than being stamped over the tail of the table.
  if (y > 236) {
    doc.addPage();
    y = 18;
  }
  const sigY = Math.min(Math.max(y + 14, 250), 268);
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(left, sigY, left + 74, sigY);
  doc.line(left + 96, sigY, right, sigY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('CASHIER', left, sigY + 4);
  doc.text('MANAGER', left + 96, sigY + 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.4);
  doc.setTextColor(...GREY);
  doc.text(`Generated ${formatDateTime(new Date())} · ${STORE.name}`, left, 288);

  return doc.output('blob');
}

export function cashUpFileName(report: CashUp): string {
  const stamp = (report.closed_at ?? report.opened_at ?? '').slice(0, 10);
  return `JR-CashUp-Shift${report.shift_id}-${stamp || 'draft'}.pdf`;
}

export async function downloadCashUpPdf(report: CashUp): Promise<void> {
  const blob = await buildCashUpPdf(report);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = cashUpFileName(report);
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Summary text that accompanies the report, however it is sent. */
function summaryText(report: CashUp): string {
  const short = report.variance < -0.005 ? 'SHORT' : report.variance > 0.005 ? 'OVER' : 'Balanced';
  return [
    `*${STORE.name} — Cash up*`,
    `Shift #${report.shift_id} · Till ${report.till_id}`,
    `Cashier: ${report.cashier ?? '—'}`,
    '',
    `Sales: ${money(report.total_sales)} (${report.transaction_count} txns)`,
    `Cash: ${money(report.cash_sales)} · Card: ${money(report.card_sales)} · EFT: ${money(report.eft_sales)}`,
    `Petty cash out: ${money(report.petty_cash)}`,
    '',
    `Expected: ${money(report.expected_cash)}`,
    `Counted: ${money(report.counted_cash)}`,
    `*${short}: ${money(Math.abs(report.variance))}*`,
    report.stock_lines_off > 0
      ? `⚠ Phone count: ${report.stock_lines_off} line(s) do not match`
      : 'Phone count: all matched',
  ].join('\n');
}

export type ShareOutcome = 'attached' | 'link' | 'cancelled';

/**
 * Sends the cash-up to the owner, attaching the PDF where the device allows it.
 *
 * A `wa.me` deep link carries text only — there is no way to attach a file to
 * one. The Web Share API can hand the actual PDF to the system share sheet,
 * which is where WhatsApp picks it up as a real attachment; that path works on
 * the phone the till is actually closed from.
 *
 * Desktop browsers largely cannot share files, so there the report is published
 * to storage and the message carries a link. Either way the owner gets the same
 * numbers in the message body, so the summary is readable without opening
 * anything.
 */
export async function shareCashUp(report: CashUp, prepared?: File): Promise<ShareOutcome> {
  const text = summaryText(report);

  // Built ahead of the tap where possible. Safari treats an await before
  // navigator.share() as spending the user activation, so rendering the PDF
  // inside the click handler makes the share silently fail on the exact device
  // the till is closed from.
  const file = prepared ?? (await prepareCashUpFile(report));
  const canAttach =
    typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });

  if (canAttach) {
    try {
      await navigator.share({ files: [file], title: `Cash up — shift #${report.shift_id}`, text });
      return 'attached';
    } catch (error) {
      // Dismissing the share sheet throws AbortError; that is a choice, not a
      // failure, so do not fall through and open WhatsApp behind their back.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
    }
  }

  window.open(await cashUpWhatsAppLink(report, file), '_blank', 'noopener');
  return 'link';
}

/** Renders the report as a shareable file, ready before the share is tapped. */
export async function prepareCashUpFile(report: CashUp): Promise<File> {
  const blob = await buildCashUpPdf(report);
  return new File([blob], cashUpFileName(report), { type: 'application/pdf' });
}

/** Publishes the report and returns a WhatsApp deep link carrying its URL. */
export async function cashUpWhatsAppLink(report: CashUp, existing?: Blob): Promise<string> {
  const blob = existing ?? (await buildCashUpPdf(report));
  const path = `cashups/${cashUpFileName(report)}`;

  const { error } = await supabase.storage
    .from('Images')
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) throw new Error(`Could not upload the report: ${error.message}`);

  const { data } = supabase.storage.from('Images').getPublicUrl(path);
  const message = `${summaryText(report)}

Full report:
${data.publicUrl}`;

  return `https://wa.me/${CASHUP_WHATSAPP}?text=${encodeURIComponent(message)}`;
}
