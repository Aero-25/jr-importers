// Renders a job card as a single A4 page, following the printed pad.
//
// jsPDF is imported dynamically: it is ~350KB and only a handful of people ever
// generate a PDF, so it must not sit in the main bundle.

import { CHECKS, CONSENT, MEMORY_WARNING, STORE, TERMS } from './jobCards.js';

const INK = [15, 23, 42];
const RED = [200, 30, 30];
const GREY = [110, 122, 143];

const money = (v) => `N$ ${Number(v || 0).toFixed(2)}`;
const shortDate = (v) => {
  if (!v) return '';
  try {
    return new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

export async function buildJobCardPdf(card) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const left = 14;
  const right = 196;
  let y = 18;

  /* header */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.setTextColor(...INK);
  doc.text('JR IMPORTERS', left, y);

  doc.setFontSize(13);
  doc.text('JOB CARD', 148, y);
  doc.setTextColor(...RED);
  doc.setFontSize(16);
  doc.text(String(card.job_number), 180, y);

  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...INK);
  doc.text(STORE.address, left, y);
  y += 4;
  doc.text(`Cell: ${STORE.phone}`, left, y);
  y += 4;
  doc.text(`Email: ${STORE.email}`, left, y);

  doc.setTextColor(...GREY);
  doc.setFontSize(9);
  doc.text(`Date: ${shortDate(card.created_at)}`, 148, y);
  doc.setTextColor(...INK);

  y += 8;
  doc.setDrawColor(...INK);
  doc.setLineWidth(0.5);
  doc.line(left, y, right, y);
  y += 7;

  /* customer */
  section(doc, 'CUSTOMER DETAILS', left, y);
  y += 6;
  y = labelled(doc, 'Name & Surname:', card.customer_name, left, y, 120);
  y = labelled(doc, 'Contact No.:', card.customer_phone, left, y, 120);
  y += 2;

  /* handset */
  section(doc, 'HANDSET DETAILS', left, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Deposit: ${money(card.deposit)}`, 140, y);
  doc.text(`Cost: ${money(card.cost)}`, 140, y + 5);
  y += 6;

  y = labelled(doc, 'Type of handset:', card.handset_type || '', left, y, 120);
  y = labelled(doc, 'IMEI No.: (15 Digits)', card.imei || '', left, y, 120);
  y = labelled(doc, 'Fault:', card.fault || '', left, y, 175, 2);
  y = labelled(doc, 'Physical condition:', card.physical_condition || '', left, y, 175, 2);

  /* pattern + technician panel */
  const panelTop = y;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Pattern / Pin:', left, y + 4);

  if (card.pattern_pin && /^[1-9](-[1-9])*$/.test(card.pattern_pin)) {
    drawPattern(doc, card.pattern_pin, left + 34, panelTop, 22);
  } else if (card.pattern_pin) {
    doc.setFont('helvetica', 'bold');
    doc.text(String(card.pattern_pin), left + 34, y + 4);
    doc.setFont('helvetica', 'normal');
  } else {
    doc.setTextColor(...GREY);
    doc.text('— not provided —', left + 34, y + 4);
    doc.setTextColor(...INK);
  }

  drawChecklist(doc, card.checks || {}, 150, panelTop - 2, card.technician);
  y = panelTop + 26;

  /* terms */
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(9);
  doc.text('TERMS AND CONDITIONS', left, y);
  y += 4.5;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  const width = 128;

  for (const term of TERMS) {
    const lines = doc.splitTextToSize(`•  ${term}`, width);
    doc.text(lines, left, y);
    y += lines.length * 3.1 + 0.7;
  }

  y += 1.5;
  doc.setTextColor(...RED);
  const warning = doc.splitTextToSize(MEMORY_WARNING, width);
  doc.text(warning, left, y);
  y += warning.length * 3.1 + 2;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.text(CONSENT, left, y);

  /* signature */
  const sigY = Math.max(y + 8, 248);

  if (card.accepted_signature) {
    try {
      doc.addImage(card.accepted_signature, 'PNG', left, sigY - 18, 60, 18);
    } catch {
      // A malformed data URI must not cost the customer the whole document.
    }
  }

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.3);
  doc.line(left, sigY, left + 62, sigY);
  doc.line(left + 72, sigY, left + 128, sigY);
  doc.line(left + 138, sigY, right, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('SIGNATURE OF CLIENT', left, sigY + 4);
  doc.text('CLIENT SIGNATURE IF RECEIVED', left + 72, sigY + 4);
  doc.text('DATE', left + 138, sigY + 4);

  if (card.accepted_name) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GREY);
    doc.text(`Accepted online by ${card.accepted_name}`, left, sigY + 8.5);
    if (card.accepted_at) doc.text(shortDate(card.accepted_at), left + 138, sigY + 8.5);
  }

  return doc.output('blob');
}

export async function downloadJobCardPdf(card) {
  const blob = await buildJobCardPdf(card);
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `JR-Importers-JobCard-${card.job_number}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking immediately can cancel the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/* ---------------------------------------------------------------- helpers */

function section(doc, title, x, y) {
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(title, x, y);
}

// A label followed by the value on a ruled line, mirroring the paper form.
function labelled(doc, label, value, x, y, lineTo, lines = 1) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(label, x, y + 4);

  const labelWidth = doc.getTextWidth(label) + 3;
  if (value) {
    doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(String(value), lineTo - labelWidth).slice(0, lines), x + labelWidth, y + 4);
    doc.setFont('helvetica', 'normal');
  }

  doc.setDrawColor(210, 214, 222);
  doc.setLineWidth(0.2);
  for (let i = 0; i < lines; i += 1) doc.line(x, y + 5.5 + i * 5, x + lineTo, y + 5.5 + i * 5);

  return y + 5.5 + (lines - 1) * 5 + 2.5;
}

function drawPattern(doc, pattern, x, y, size) {
  const dots = pattern.split('-').filter(Boolean).map(Number);
  const step = size / 2;
  const at = (d) => ({ cx: x + ((d - 1) % 3) * step, cy: y + Math.floor((d - 1) / 3) * step });

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.7);
  for (let i = 1; i < dots.length; i += 1) {
    const a = at(dots[i - 1]);
    const b = at(dots[i]);
    doc.line(a.cx, a.cy, b.cx, b.cy);
  }

  for (let d = 1; d <= 9; d += 1) {
    const { cx, cy } = at(d);
    if (dots.includes(d)) {
      doc.setFillColor(...INK);
      doc.circle(cx, cy, 1.5, 'F');
    } else {
      doc.setDrawColor(...GREY);
      doc.setLineWidth(0.3);
      doc.circle(cx, cy, 1.1, 'S');
    }
  }
}

function drawChecklist(doc, checks, x, y, technician) {
  const w = 46;
  const h = CHECKS.length * 5.2 + 12;

  doc.setDrawColor(...INK);
  doc.setLineWidth(0.4);
  doc.rect(x, y, w, h);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...INK);
  doc.text('CHECKED BY', x + w / 2, y + 5, { align: 'center' });
  doc.text('TECHNICIAN', x + w / 2, y + 8.6, { align: 'center' });

  let rowY = y + 14;
  doc.setFont('helvetica', 'normal');

  for (const check of CHECKS) {
    doc.setDrawColor(...INK);
    doc.setLineWidth(0.3);
    doc.rect(x + 5, rowY - 2.6, 3.2, 3.2);

    if (checks[check.key]) {
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
    doc.text(String(technician), x + w / 2, y + h - 2.5, { align: 'center' });
    doc.setTextColor(...INK);
  }
}
