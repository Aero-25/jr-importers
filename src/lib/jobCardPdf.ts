import {
  JOB_CARD_CHECKS,
  JOB_CARD_CONSENT,
  JOB_CARD_MEMORY_WARNING,
  JOB_CARD_TERMS,
  STORE,
} from './constants';
import type { JobCardChecks } from './database.types';
import { formatDate, money } from './format';

export interface JobCardPdfInput {
  job_number: number;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  handset_type?: string | null;
  imei?: string | null;
  fault?: string | null;
  physical_condition?: string | null;
  /** Dot indices, e.g. `1-2-5-8-9`. Omitted from the customer's copy. */
  pattern_pin?: string | null;
  deposit?: number | null;
  cost?: number | null;
  checks?: JobCardChecks;
  technician?: string | null;
  accepted_name?: string | null;
  accepted_at?: string | null;
  /** PNG data URI from the signature pad. */
  accepted_signature?: string | null;
}

const BRAND: [number, number, number] = [15, 23, 42];
const RED: [number, number, number] = [200, 30, 30];
const GREY: [number, number, number] = [110, 122, 143];

/**
 * Renders a job card as a single A4 page, following the printed pad.
 *
 * jsPDF is imported dynamically: it is ~350 KB and only a handful of people
 * ever generate a PDF, so it must not sit in the main bundle.
 */
export async function buildJobCardPdf(card: JobCardPdfInput): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 18;

  /* ── Header ────────────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...BRAND);
  doc.text('JR IMPORTERS', left, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('JOB CARD', 148, y);
  doc.setTextColor(...RED);
  doc.setFontSize(16);
  doc.text(String(card.job_number), 180, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND);
  doc.text(STORE.address, left, y);
  y += 4;
  doc.text(`Cell: ${STORE.phone}`, left, y);
  y += 4;
  doc.text(`Email: ${STORE.email}`, left, y);

  doc.setTextColor(...GREY);
  doc.setFontSize(9);
  doc.text(`Date: ${formatDate(card.created_at)}`, 148, y);
  doc.setTextColor(...BRAND);

  y += 8;
  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 7;

  /* ── Customer ──────────────────────────────────────────────────────────── */
  section(doc, 'CUSTOMER DETAILS', left, y);
  y += 6;
  y = labelled(doc, 'Name & Surname:', card.customer_name, left, y, 120);
  y = labelled(doc, 'Contact No.:', card.customer_phone, left, y, 120);

  y += 2;

  /* ── Handset ───────────────────────────────────────────────────────────── */
  section(doc, 'HANDSET DETAILS', left, y);
  // Money sits on the right of this band, as on the printed card.
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Deposit: ${money(card.deposit ?? 0)}`, 140, y);
  doc.text(`Cost: ${money(card.cost ?? 0)}`, 140, y + 5);
  y += 6;

  y = labelled(doc, 'Type of handset:', card.handset_type ?? '', left, y, 120);
  y = labelled(doc, 'IMEI No.: (15 Digits)', card.imei ?? '', left, y, 120);
  y = labelled(doc, 'Fault:', card.fault ?? '', left, y, 175, 2);
  y = labelled(doc, 'Physical condition:', card.physical_condition ?? '', left, y, 175, 2);

  /* ── Pattern / PIN ─────────────────────────────────────────────────────── */
  const patternTop = y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Pattern / Pin:', left, y + 4);

  if (card.pattern_pin) {
    if (/^[1-9](-[1-9])*$/.test(card.pattern_pin)) {
      drawPattern(doc, card.pattern_pin, left + 34, patternTop, 22);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.text(card.pattern_pin, left + 34, y + 4);
      doc.setFont('helvetica', 'normal');
    }
  } else {
    doc.setTextColor(...GREY);
    doc.text('— not provided —', left + 34, y + 4);
    doc.setTextColor(...BRAND);
  }

  /* ── Technician checklist ──────────────────────────────────────────────── */
  drawChecklist(doc, card.checks ?? {}, 150, patternTop - 2, card.technician);

  y = patternTop + 26;

  /* ── Terms ─────────────────────────────────────────────────────────────── */
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(9);
  doc.text('TERMS AND CONDITIONS', left, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const termsWidth = 128;

  for (const term of JOB_CARD_TERMS) {
    const lines = doc.splitTextToSize(`•  ${term}`, termsWidth) as string[];
    doc.text(lines, left, y);
    y += lines.length * 3.1 + 0.7;
  }

  y += 1.5;
  doc.setTextColor(...RED);
  doc.setFontSize(7.2);
  const warning = doc.splitTextToSize(JOB_CARD_MEMORY_WARNING, termsWidth) as string[];
  doc.text(warning, left, y);
  y += warning.length * 3.1 + 2;

  doc.setTextColor(...BRAND);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.text(JOB_CARD_CONSENT, left, y);
  y += 8;

  /* ── Signature ─────────────────────────────────────────────────────────── */
  const signatureTop = Math.max(y, 248);

  if (card.accepted_signature) {
    try {
      doc.addImage(card.accepted_signature, 'PNG', left, signatureTop - 18, 60, 18);
    } catch {
      // A malformed data URI must not lose the customer the whole document.
    }
  }

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.3);
  doc.line(left, signatureTop, left + 62, signatureTop);
  doc.line(left + 72, signatureTop, left + 128, signatureTop);
  doc.line(left + 138, signatureTop, right, signatureTop);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SIGNATURE OF CLIENT', left, signatureTop + 4);
  doc.text('CLIENT SIGNATURE IF RECEIVED', left + 72, signatureTop + 4);
  doc.text('DATE', left + 138, signatureTop + 4);

  if (card.accepted_name) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(`Accepted online by ${card.accepted_name}`, left, signatureTop + 8.5);
    if (card.accepted_at) {
      doc.text(formatDate(card.accepted_at), left + 138, signatureTop + 8.5);
    }
    doc.setTextColor(...BRAND);
  }

  return doc.output('blob');
}

/* ── Drawing helpers ─────────────────────────────────────────────────────── */

type Doc = import('jspdf').jsPDF;

function section(doc: Doc, title: string, x: number, y: number) {
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(11);
  doc.setTextColor(...BRAND);
  doc.text(title, x, y);
}

/**
 * A label followed by the value on a ruled line, mirroring the paper form.
 * Returns the next y position.
 */
function labelled(
  doc: Doc,
  label: string,
  value: string,
  x: number,
  y: number,
  lineTo: number,
  lines = 1,
): number {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BRAND);
  doc.text(label, x, y + 4);

  const labelWidth = doc.getTextWidth(label) + 3;
  if (value) {
    doc.setFont('helvetica', 'bold');
    const wrapped = doc.splitTextToSize(value, lineTo - labelWidth) as string[];
    doc.text(wrapped.slice(0, lines), x + labelWidth, y + 4);
    doc.setFont('helvetica', 'normal');
  }

  doc.setDrawColor(210, 214, 222);
  doc.setLineWidth(0.2);
  for (let i = 0; i < lines; i += 1) {
    doc.line(x, y + 5.5 + i * 5, x + lineTo, y + 5.5 + i * 5);
  }

  return y + 5.5 + (lines - 1) * 5 + 2.5;
}

/** The 3×3 unlock grid with the recorded stroke drawn through it. */
function drawPattern(doc: Doc, pattern: string, x: number, y: number, size: number) {
  const dots = pattern.split('-').filter(Boolean).map(Number);
  const step = size / 2;
  const at = (dot: number) => ({
    cx: x + ((dot - 1) % 3) * step,
    cy: y + Math.floor((dot - 1) / 3) * step,
  });

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.7);
  for (let i = 1; i < dots.length; i += 1) {
    const from = at(dots[i - 1]!);
    const to = at(dots[i]!);
    doc.line(from.cx, from.cy, to.cx, to.cy);
  }

  for (let dot = 1; dot <= 9; dot += 1) {
    const { cx, cy } = at(dot);
    if (dots.includes(dot)) {
      doc.setFillColor(...BRAND);
      doc.circle(cx, cy, 1.5, 'F');
    } else {
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, 1.1, 'S');
    }
  }
}

/** The bordered CHECKED BY TECHNICIAN panel. */
function drawChecklist(
  doc: Doc,
  checks: JobCardChecks,
  x: number,
  y: number,
  technician?: string | null,
) {
  const boxWidth = 46;
  const boxHeight = JOB_CARD_CHECKS.length * 5.2 + 12;

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(0.4);
  doc.rect(x, y, boxWidth, boxHeight);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND);
  doc.text('CHECKED BY', x + boxWidth / 2, y + 5, { align: 'center' });
  doc.text('TECHNICIAN', x + boxWidth / 2, y + 8.6, { align: 'center' });

  let rowY = y + 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  for (const check of JOB_CARD_CHECKS) {
    const ticked = Boolean(checks[check.key as keyof JobCardChecks]);

    doc.setDrawColor(...BRAND);
    doc.setLineWidth(0.3);
    doc.rect(x + 5, rowY - 2.6, 3.2, 3.2);

    if (ticked) {
      // Drawn rather than a glyph, so it renders without an embedded font.
      doc.setLineWidth(0.5);
      doc.line(x + 5.6, rowY - 1.1, x + 6.5, rowY - 0.1);
      doc.line(x + 6.5, rowY - 0.1, x + 7.8, rowY - 2.2);
    }

    doc.text(check.label.toUpperCase(), x + 11, rowY);
    rowY += 5.2;
  }

  if (technician) {
    doc.setFontSize(6.8);
    doc.setTextColor(...GREY);
    doc.text(technician, x + boxWidth / 2, y + boxHeight - 2.5, { align: 'center' });
    doc.setTextColor(...BRAND);
  }
}

/** Triggers a browser download of the generated card. */
export async function downloadJobCardPdf(card: JobCardPdfInput): Promise<void> {
  const blob = await buildJobCardPdf(card);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `JR-Importers-JobCard-${card.job_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
