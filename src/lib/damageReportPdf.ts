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
  /** How it happened. Included only when recorded. */
  cause?: string | null;
  discontinued?: boolean | null;
  signed_by?: string | null;
  claim_reference?: string | null;
  notes?: string | null;
  reported_date?: string | null;
  created_at?: string | null;
}

const INK: [number, number, number] = [0, 0, 0];
const LEFT = 22;
const RIGHT = 188;

/** The shop's letterhead banner, or null when it cannot be fetched. */
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

/** `20.08.2026`, the format the shop's own reports use. */
function stamp(value?: string | null): string {
  const date = value ? new Date(value) : new Date();
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}.${m}.${date.getFullYear()}`;
}

/**
 * Builds the damage report letter.
 *
 * Modelled on the report the shop already sends: addressed to the insurer and
 * their handler, stating what was assessed and why the handset cannot be
 * repaired, recommending replacement, signed, over the shop's letterhead.
 * The wording is fixed; only the details change.
 */
export async function buildDamageReportPdf(report: DamageReportPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const letterhead = await loadLetterhead();

  doc.setTextColor(...INK);
  let y = 26;

  /* ── Addressee, with the date out to the right ─────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(report.insurer_name || 'To whom it may concern', LEFT, y);
  doc.setFont('helvetica', 'normal');
  doc.text(stamp(report.reported_date ?? report.created_at), RIGHT, y, { align: 'right' });

  if (report.insurer_contact) {
    y += 5.5;
    doc.text(report.insurer_contact, LEFT, y);
  }
  if (report.insurer_phone) {
    y += 5.5;
    doc.text(report.insurer_phone, LEFT, y);
  }

  /* ── Subject ───────────────────────────────────────────────────────────── */
  y += 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Damage Report – ${report.product_name}`, LEFT, y);

  y += 12;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text('To whom it may concern:', LEFT, y);

  /* ── Body ──────────────────────────────────────────────────────────────── */
  const width = RIGHT - LEFT;
  const write = (text: string, gap = 8) => {
    const lines = doc.splitTextToSize(text, width) as string[];
    // A letter that spills must break at a paragraph, never mid-sentence.
    if (y + lines.length * 5.6 > 240) {
      doc.addPage();
      y = 26;
    }
    y += gap;
    doc.text(lines, LEFT, y, { lineHeightFactor: 1.45 });
    y += (lines.length - 1) * 5.6;
  };

  const device = report.product_name;
  const imei = report.imei ? ` (IMEI ${report.imei})` : '';
  const because = report.finding ? ` due to ${report.finding}` : '';

  write(
    `Please note that the ${device}${imei} has been assessed and it has been determined `
      + `that the phone is not repairable${because}.`,
    10,
  );

  if (report.description?.trim()) {
    write(`It has also been assessed that ${report.description.trim()}.`);
  }

  if (report.cause?.trim()) {
    write(`Cause of damage: ${report.cause.trim()}.`);
  }

  write(
    `We recommend that the device needs to be replaced.${
      report.discontinued ? ` The ${device} has been discontinued.` : ''
    }`,
  );

  if (report.notes?.trim()) write(report.notes.trim());

  write('See attached quotation.');

  /* ── Sign-off ──────────────────────────────────────────────────────────── */
  y += 14;
  doc.text('Regards,', LEFT, y);
  y += 12;
  doc.text(report.signed_by || '', LEFT, y);

  y += 6;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(LEFT, y, RIGHT, y);

  y += 6;
  doc.setFontSize(10.5);
  doc.text('JR Importers Walvis Bay', LEFT, y);
  y += 5;
  doc.text(STORE.address.replace(/,\s*Walvis Bay$/i, ''), LEFT, y);
  y += 5;
  doc.text(STORE.phone.replace(/^\+264\s*/, '0').replace(/\s+/g, ''), LEFT, y);

  /* The reference is ours, not the letter's — kept small and out of the way
     so the page still reads as the shop's own report. */
  if (report.report_number || report.claim_reference) {
    y += 8;
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      [report.report_number, report.claim_reference && `Ref ${report.claim_reference}`]
        .filter(Boolean)
        .join('  ·  '),
      LEFT,
      y,
    );
    doc.setTextColor(...INK);
  }

  /* ── Letterhead, at the foot of the last page ──────────────────────────── */
  if (letterhead) {
    try {
      const props = doc.getImageProperties(letterhead);
      const w = 92;
      const h = (props.height / props.width) * w;
      const pageHeight = doc.internal.pageSize.getHeight();
      const top = Math.max(y + 10, pageHeight - h - 16);
      doc.addImage(letterhead, 'JPEG', LEFT, top, w, h);
    } catch {
      /* Banner unavailable: the typed footer above already identifies us. */
    }
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
