import { STORE } from './constants';

export interface DamageReportPdfInput {
  report_number: string;
  /** Who the letter is addressed to, e.g. "Sanlam Insurance". */
  insurer_name?: string | null;
  insurer_contact?: string | null;
  insurer_phone?: string | null;
  product_name: string;
  imei?: string | null;
  /** The assessment conclusion, e.g. "water damage". */
  finding?: string | null;
  /** The components found damaged. */
  description: string;
  /** How it happened. */
  cause?: string | null;
  discontinued?: boolean | null;
  signed_by?: string | null;
  claim_type?: string | null;
  claim_reference?: string | null;
  claim_amount?: number | null;
  purchase_invoice?: string | null;
  customer_name?: string | null;
  incident_date?: string | null;
  notes?: string | null;
  reported_date?: string | null;
  created_at?: string | null;
}

const INK: [number, number, number] = [17, 24, 39];
const GREEN: [number, number, number] = [22, 101, 52];
const SOFT: [number, number, number] = [240, 247, 242];
const GREY: [number, number, number] = [110, 122, 143];
const HAIR: [number, number, number] = [214, 223, 232];

const LEFT = 20;
const RIGHT = 190;
const WIDTH = RIGHT - LEFT;

async function loadLetterhead(): Promise<string | null> {
  try {
    const res = await fetch('/letterhead.jpg');
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** `03.09.2026`, the format the shop's own reports use. */
function stamp(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}.${date.getFullYear()}`;
}

/** "broken screen" -> "Broken screen". Leaves existing capitals alone. */
function sentence(text: string): string {
  const t = text.trim().replace(/[.\s]+$/, '');
  if (!t) return '';
  return /^[A-Z]/.test(t) ? t : t.charAt(0).toUpperCase() + t.slice(1);
}

/** Lowercases a fragment so it reads inside a sentence. */
function clause(text: string): string {
  const t = text.trim().replace(/[.\s]+$/, '');
  // Leave anything with internal capitals alone — model names, brands.
  return /[A-Z]/.test(t.slice(1)) ? t : t.charAt(0).toLowerCase() + t.slice(1);
}

export async function buildDamageReportPdf(report: DamageReportPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const letterhead = await loadLetterhead();

  /* ── Letterhead, at the top where a letterhead belongs ─────────────────── */
  let y = 14;
  let headerBottom = y;

  if (letterhead) {
    try {
      const props = doc.getImageProperties(letterhead);
      const w = 58;
      const h = (props.height / props.width) * w;
      doc.addImage(letterhead, 'JPEG', LEFT, y, w, h);
      headerBottom = y + h;
    } catch {
      /* Unreadable banner: the typed block below still identifies the shop. */
    }
  }

  if (!letterhead || headerBottom === y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...GREEN);
    doc.text('JR IMPORTERS', LEFT, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GREY);
    doc.text('Smart phones, tablets, accessories and repairs', LEFT, y + 12);
    headerBottom = y + 16;
  }

  /* Title block, set against the banner. */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text('DAMAGE REPORT', RIGHT, y + 8, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...GREEN);
  doc.text(report.report_number, RIGHT, y + 14.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GREY);
  doc.text(stamp(report.reported_date ?? report.created_at), RIGHT, y + 20, { align: 'right' });

  y = Math.max(headerBottom, y + 24) + 6;

  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.8);
  doc.line(LEFT, y, RIGHT, y);
  y += 10;

  /* ── Addressee ─────────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREY);
  doc.text('TO', LEFT, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(...INK);
  doc.text(report.insurer_name || 'To whom it may concern', LEFT, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  for (const line of [report.insurer_contact, report.insurer_phone].filter(Boolean)) {
    y += 5;
    doc.text(String(line), LEFT, y);
  }
  y += 12;

  /* ── Subject ───────────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(...GREEN);
  doc.text(`Damage Report – ${report.product_name}`, LEFT, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text('To whom it may concern:', LEFT, y);
  y += 8;

  const write = (text: string, gap = 6) => {
    const lines = doc.splitTextToSize(text, WIDTH) as string[];
    if (y + lines.length * 5.4 > 250) {
      doc.addPage();
      y = 20;
    }
    y += gap;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(...INK);
    doc.text(lines, LEFT, y, { lineHeightFactor: 1.45 });
    y += (lines.length - 1) * 5.4;
  };

  const device = report.product_name;
  // A handset can be too badly damaged to read its IMEI off. Saying so is
  // better than leaving a gap, which an assessor will simply query — and far
  // better than "N/A", which reads as though nobody looked.
  const imeiText = report.imei?.trim() || 'Not recoverable';
  const ident = report.imei?.trim()
    ? `${device} (IMEI ${report.imei.trim()})`
    : `${device} (IMEI not recoverable)`;
  const because = report.finding ? ` due to ${clause(report.finding)}` : '';

  write(
    `Please note that the ${ident} has been assessed and it has been determined that `
      + `the device is not repairable${because}.`,
    0,
  );

  /* ── Assessment panel ──────────────────────────────────────────────────── */
  const rows: Array<[string, string]> = [];
  rows.push(['Device', device]);
  rows.push(['IMEI', imeiText]);
  if (report.finding) rows.push(['Not repairable due to', sentence(report.finding)]);
  if (report.description?.trim()) rows.push(['Damage found', sentence(report.description)]);
  if (report.cause?.trim()) rows.push(['Cause of damage', sentence(report.cause)]);
  if (report.incident_date) rows.push(['Date of incident', stamp(report.incident_date)]);
  if (report.purchase_invoice) rows.push(['Purchase invoice', report.purchase_invoice]);
  if (report.customer_name) rows.push(['Customer', report.customer_name]);
  if (report.claim_reference) rows.push(['Claim reference', report.claim_reference]);

  y += 9;
  const panelTop = y;
  const rowHeights = rows.map(([, value]) => {
    const lines = doc.splitTextToSize(value, WIDTH - 52) as string[];
    return Math.max(6.4, lines.length * 4.9 + 1.6);
  });
  const panelHeight = rowHeights.reduce((n, h) => n + h, 0) + 12;

  if (panelTop + panelHeight > 258) {
    doc.addPage();
    y = 20;
  }

  doc.setFillColor(...SOFT);
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.2);
  doc.roundedRect(LEFT, y, WIDTH, panelHeight, 2.5, 2.5, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...GREEN);
  doc.text('ASSESSMENT', LEFT + 5, y + 6.5);

  let ry = y + 12.5;
  rows.forEach(([labelText, value], i) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(labelText.toUpperCase(), LEFT + 5, ry);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(value, WIDTH - 52) as string[];
    doc.text(lines, LEFT + 52, ry);
    ry += rowHeights[i] ?? 6.4;
  });
  y += panelHeight + 4;

  /* ── Recommendation ────────────────────────────────────────────────────── */
  write(
    `We recommend that the device needs to be replaced.${
      report.discontinued ? ` The ${device} has been discontinued.` : ''
    }`,
  );
  if (report.notes?.trim()) write(sentence(report.notes) + '.');
  write('See attached quotation.');

  /* ── Sign-off ──────────────────────────────────────────────────────────── */
  y += 16;
  if (y > 250) {
    doc.addPage();
    y = 30;
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(...INK);
  doc.text('Regards,', LEFT, y);

  y += 16;
  doc.setDrawColor(...HAIR);
  doc.setLineWidth(0.3);
  doc.line(LEFT, y, LEFT + 62, y);
  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(report.signed_by || STORE.name, LEFT, y);
  y += 4.6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GREY);
  doc.text('for JR Importers Walvis Bay', LEFT, y);

  /* ── Footer, on every page ─────────────────────────────────────────────── */
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p += 1) {
    doc.setPage(p);
    doc.setDrawColor(...HAIR);
    doc.setLineWidth(0.2);
    doc.line(LEFT, 276, RIGHT, 276);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(...GREEN);
    doc.text('JR Importers Walvis Bay', LEFT, 281.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    doc.text(
      `${STORE.address}  ·  ${STORE.phone}  ·  ${STORE.email}`,
      LEFT,
      286,
    );
    doc.text(
      pages > 1 ? `${report.report_number}  ·  Page ${p} of ${pages}` : report.report_number,
      RIGHT,
      286,
      { align: 'right' },
    );
  }

  return doc.output('blob');
}

export function damageReportFileName(reportNumber: string, product?: string | null): string {
  const who = (product ?? '').replace(/[^A-Za-z0-9 ]+/g, '').trim();
  return `Damage Report${who ? ` - ${who}` : ''} (${reportNumber}).pdf`;
}

export async function downloadDamageReportPdf(report: DamageReportPdfInput): Promise<void> {
  const blob = await buildDamageReportPdf(report);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = damageReportFileName(report.report_number, report.product_name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
