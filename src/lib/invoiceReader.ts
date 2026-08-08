import { parseAmount } from '@/lib/csv';

/**
 * Reads a supplier's PDF invoice in the browser and structures it.
 *
 * Digital invoices carry a text layer, so no OCR and no paid service is
 * involved — pdf.js extracts positioned text, rows are rebuilt from the
 * y-coordinates, and a rules-based parser finds the header fields and the
 * line items. A rules parser is deliberately humble: everything it produces
 * lands in the delivery dialog as a draft for staff to check against the
 * paper, and lines it cannot place are handed over rather than guessed.
 *
 * (Not to be confused with `invoicePdf.ts`, which writes the shop's own
 * tax invoices. This file reads other people's.)
 */

export interface ParsedInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface ParsedInvoice {
  supplier: string | null;
  invoiceNumber: string | null;
  /** ISO yyyy-mm-dd, day-first when the format is ambiguous (dd/mm locally). */
  invoiceDate: string | null;
  vatAmount: number | null;
  totalAmount: number | null;
  lines: ParsedInvoiceLine[];
}

/** A catalogue row the matcher scores invoice lines against. */
export interface CatalogProduct {
  id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  color: string | null;
  cost_price: number;
}

export async function readInvoicePdf(file: File): Promise<ParsedInvoice> {
  const rows = await extractRows(file);

  // A digital invoice yields hundreds of characters. Next to nothing means a
  // scan or a photo wrapped in a PDF — say so instead of parsing noise.
  if (rows.join('').replace(/\s/g, '').length < 40) {
    throw new Error(
      'This PDF has no readable text — it looks like a scan or photo. Type the delivery in manually.',
    );
  }

  return parseInvoiceRows(rows);
}

/** Rebuilds visual rows: text items grouped by y position, sorted by x. */
async function extractRows(file: File): Promise<string[]> {
  // Loaded lazily so this module stays importable outside the browser —
  // the parser half is exercised by tests that never touch pdf.js.
  const [{ getDocument, GlobalWorkerOptions }, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl;

  const data = await file.arrayBuffer();
  const pdf = await getDocument({ data }).promise;

  const rows: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const byY = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const x = item.transform[4] as number;
      const y = item.transform[5] as number;
      // Items within ~3 units vertically belong to the same visual row.
      const key = [...byY.keys()].find((k) => Math.abs(k - y) <= 3) ?? y;
      const row = byY.get(key) ?? [];
      row.push({ x, str: item.str });
      byY.set(key, row);
    }

    const ordered = [...byY.entries()].sort((a, b) => b[0] - a[0]); // top first
    for (const [, items] of ordered) {
      items.sort((a, b) => a.x - b.x);
      rows.push(items.map((i) => i.str.trim()).join(' ').replace(/\s+/g, ' ').trim());
    }
  }
  return rows.filter(Boolean);
}

/** Amount-looking tokens: 12, 1,234.56, 1 234,56, N$4,500.00 … */
const AMOUNT_TOKEN = /(?:N?\$|R)?\s?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{1,2})?(?![\d%])/g;

const SUMMARY_ROW = /\b(sub\s?-?total|total|vat|tax|amount\s+due|balance|discount|change|deposit|delivery|shipping|freight|rounding|e\.?\s*&\s*o\.?\s*e)\b/i;
const HEADER_ROW = /\b(description|qty|quantity|unit\s*price|price|amount|code|item)\b.*\b(total|amount|price)\b/i;

/** Exported for tests: the parser half, fed with pre-extracted text rows. */
export function parseInvoiceRows(rows: string[]): ParsedInvoice {
  const parsed: ParsedInvoice = {
    supplier: supplierFrom(rows),
    invoiceNumber: findInvoiceNumber(rows),
    invoiceDate: findDate(rows),
    vatAmount: null,
    totalAmount: null,
    lines: [],
  };

  for (const row of rows) {
    if (SUMMARY_ROW.test(row)) {
      const amounts = amountsIn(row);
      const last = amounts[amounts.length - 1];
      if (last === undefined) continue;
      if (/\b(vat|tax)\b/i.test(row) && !/registration|reg\s*no/i.test(row)) {
        parsed.vatAmount = parsed.vatAmount ?? last;
      }
      if (/\b(total|amount\s+due|balance\s+due)\b/i.test(row) && !/sub\s?-?total/i.test(row)) {
        // Several rows may say "total"; the invoice total is the largest.
        parsed.totalAmount = Math.max(parsed.totalAmount ?? 0, last);
      }
      continue;
    }
    if (HEADER_ROW.test(row)) continue;

    const line = parseLineRow(row);
    if (line) parsed.lines.push(line);
  }

  return parsed;
}

const DATE_IN_ROW = /\b\d{1,2}[/.-]\d{1,2}[/.-]20\d{2}\b/;
const PAGE_IN_ROW = /\b\d+\s+of\s+\d+\b/i;

/**
 * A line row is one where quantity × unit price equals one of the trailing
 * amounts. That arithmetic check is what separates real item rows from
 * addresses, phone numbers and VAT registration lines. Rows carrying a date
 * or a "1 of 1" are header furniture, never stock — R&R's account strip
 * (JRI003 29/07/2026 …) taught that one.
 */
function parseLineRow(row: string): ParsedInvoiceLine | null {
  if (DATE_IN_ROW.test(row) || PAGE_IN_ROW.test(row)) return null;

  const tokens = [...row.matchAll(AMOUNT_TOKEN)]
    .map((m) => ({ raw: m[0], value: parseAmount(m[0]), index: m.index ?? 0 }))
    .filter((t) => Number.isFinite(t.value) && t.value >= 0);
  if (tokens.length < 2) return null;

  // Try every (qty, unit, total) combination, preferring the rightmost total
  // and the qty closest to the start — the near-universal column order.
  for (let k = tokens.length - 1; k >= 2; k--) {
    for (let i = 0; i < k; i++) {
      const qty = tokens[i]!;
      if (!Number.isInteger(qty.value) || qty.value < 1 || qty.value > 9999) continue;
      for (let j = 0; j < k; j++) {
        if (j === i) continue;
        const unit = tokens[j]!;
        const total = tokens[k]!;
        if (unit.value <= 0) continue;
        if (Math.abs(qty.value * unit.value - total.value) <= 0.05) {
          return {
            description: descriptionFrom(row, [qty, unit, total]),
            quantity: qty.value,
            unitPrice: unit.value,
            lineTotal: total.value,
          };
        }
      }
    }
  }

  // Two amounts that agree: a single unit, price repeated as the line total.
  if (tokens.length === 2) {
    const [a, b] = tokens as [(typeof tokens)[0], (typeof tokens)[0]];
    if (a.value > 0 && Math.abs(a.value - b.value) <= 0.005) {
      return {
        description: descriptionFrom(row, [a, b]),
        quantity: 1,
        unitPrice: a.value,
        lineTotal: b.value,
      };
    }
  }

  // A zero-priced item row — labour, warranty, a freebie. R&R prints
  // "LAB002 Richard Repair 1.00 0.00 0.00": the unit and total columns are
  // both zero at the end of the row, and the quantity is the last plain
  // integer before them (item codes like LAB002 shed digit tokens earlier in
  // the row, which must not be mistaken for the quantity). Kept, so the
  // count of lines read matches the paper; the dialog leaves it out of stock.
  if (tokens.length >= 2 && /[a-z]{3,}/i.test(row)) {
    const beforeLast = tokens[tokens.length - 2]!;
    const last = tokens[tokens.length - 1]!;
    if (beforeLast.value === 0 && last.value === 0) {
      const qty = tokens
        .slice(0, -2)
        .reverse()
        .find((t) => Number.isInteger(t.value) && t.value >= 1 && t.value <= 9999);
      return {
        description: descriptionFrom(row, [beforeLast, last, ...(qty ? [qty] : [])]),
        quantity: qty?.value ?? 1,
        unitPrice: 0,
        lineTotal: 0,
      };
    }
  }

  return null;
}

function descriptionFrom(
  row: string,
  used: Array<{ raw: string; index: number }>,
): string {
  let text = row;
  // Blank out the used tokens from the right so indexes stay valid.
  for (const t of [...used].sort((a, b) => b.index - a.index)) {
    text = text.slice(0, t.index) + ' '.repeat(t.raw.length) + text.slice(t.index + t.raw.length);
  }
  // Whatever numeric columns remain to the right of the quantity — discount
  // percentages, VAT-per-line — are furniture, not description.
  const cutFrom = Math.min(...used.map((t) => t.index));
  const head = text.slice(0, cutFrom);
  const tail = text.slice(cutFrom).replace(AMOUNT_TOKEN, (m) => ' '.repeat(m.length));
  return (head + tail).replace(/\s+/g, ' ').trim();
}

function amountsIn(row: string): number[] {
  return [...row.matchAll(AMOUNT_TOKEN)]
    .map((m) => parseAmount(m[0]))
    .filter((n) => Number.isFinite(n));
}

/** Contact columns share the row with the name in boxed layouts — cut them. */
function stripContactNoise(row: string): string {
  return row
    .replace(/\s*\b(telephone|tel\b|fax|e[\s-]?mail|vat\s+reg|vat\s+registration|invoice\s+date|p\s?o\s+box|cell)\b.*$/i, '')
    .replace(/\s*\b(tax\s+invoice|invoice|quotation|statement)\b.*$/i, '')
    .trim();
}

function supplierFrom(rows: string[]): string | null {
  // Boxed layouts label the seller outright — the rows after "Invoice From"
  // are the company block, interleaved with the contact column beside it.
  const fromIndex = rows.findIndex((r) => /^invoice\s+from\b/i.test(r.trim()));
  if (fromIndex >= 0) {
    for (const row of rows.slice(fromIndex + 1, fromIndex + 4)) {
      const cleaned = stripContactNoise(row);
      if (cleaned.length >= 3 && /[a-z]/i.test(cleaned)) return cleaned;
    }
  }

  for (const row of rows.slice(0, 8)) {
    if (/^(tax\s+)?invoice|^quotation|^statement|^page\b/i.test(row)) continue;
    if (!/[a-z]/i.test(row)) continue;
    if (row.length < 3) continue;
    const cleaned = stripContactNoise(row);
    if (cleaned) return cleaned;
  }
  return null;
}

function findInvoiceNumber(rows: string[]): string | null {
  // The confident form first: INV12345 stands alone anywhere on the page.
  for (const row of rows) {
    const m = row.match(/\b(INV[-\s]?\d{3,})\b/i);
    if (m && m[1]) return m[1].replace(/\s+/g, '');
  }
  // Then the labelled form — but an invoice number always carries a digit,
  // and never looks like a date. Without those two rules, "Invoice From" and
  // "Invoice Date 29/07/2026" both volunteer their neighbours.
  for (const row of rows) {
    const m = row.match(
      /(?:tax\s+invoice|invoice|inv)\s*(?:no|number|nr|#)?\s*[:#.]?\s+([A-Z0-9][\w\-\/]{2,})/i,
    );
    const candidate = m?.[1];
    if (!candidate) continue;
    if (!/\d/.test(candidate)) continue;
    if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(candidate)) continue;
    return candidate;
  }
  return null;
}

const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

function findDate(rows: string[]): string | null {
  const dated = rows.filter((r) => /date/i.test(r));
  for (const row of [...dated, ...rows]) {
    // yyyy-mm-dd
    let m = row.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
    // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy — day first, as written locally
    m = row.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](20\d{2})\b/);
    if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
    // 3 Aug 2026 / 03 August 2026
    m = row.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
    if (m) {
      const month = MONTHS.indexOf(m[2]!.slice(0, 3).toLowerCase()) + 1;
      if (month > 0) return iso(Number(m[3]), month, Number(m[1]));
    }
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/* ── Matching parsed lines to the catalogue ──────────────────────────────── */

export interface MatchResult {
  matched: Array<{ product: CatalogProduct; line: ParsedInvoiceLine }>;
  unmatched: ParsedInvoiceLine[];
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 1);

/**
 * Words that mean the line is a spare part or a service, not the device
 * itself. "Ulefone Armor 22 small pcb chargingport" contains the phone's
 * full name — only the vocabulary tells it apart from the phone.
 */
const PART_WORDS = new Set([
  'pcb', 'board', 'port', 'chargingport', 'charging', 'lcd', 'screen',
  'digitizer', 'battery', 'housing', 'flex', 'glass', 'lens', 'repair',
  'labour', 'labor', 'service', 'replacement', 'speaker', 'buzzer', 'mic',
  'microphone', 'antenna', 'cover', 'backcover', 'frame', 'connector',
  'button', 'ribbon', 'camera',
]);

/**
 * SKU or barcode appearing verbatim in the line is decisive. Otherwise the
 * product's name-tokens must be covered almost entirely — and every token
 * that carries a digit (A15, X13, 128GB: the model designators) must appear,
 * because those are what tell a handset from its spare part. "Ulefone Armor
 * 22 small pcb chargingport" once matched the Armor X13 handset on brand
 * words alone; a wrong match posted into stock is worse than a line handed
 * back for a human to place.
 */
export function matchInvoiceLines(
  lines: ParsedInvoiceLine[],
  catalog: CatalogProduct[],
): MatchResult {
  const result: MatchResult = { matched: [], unmatched: [] };

  for (const line of lines) {
    const haystack = line.description.toLowerCase();
    const words = new Set(tokenize(line.description));

    let best: { product: CatalogProduct; score: number } | null = null;
    for (const product of catalog) {
      const sku = product.sku?.toLowerCase();
      const barcode = product.barcode?.toLowerCase();
      if (
        (sku && sku.length > 2 && haystack.includes(sku)) ||
        (barcode && haystack.includes(barcode))
      ) {
        best = { product, score: 1 };
        break;
      }
      const nameTokens = tokenize(product.name);
      if (nameTokens.length === 0) continue;

      const modelTokens = nameTokens.filter((t) => /\d/.test(t));
      if (!modelTokens.every((t) => words.has(t))) continue;

      // Part-vocabulary in the description that the product's own name does
      // not carry means this line is ABOUT the product, not the product.
      const nameSet = new Set(nameTokens);
      if ([...words].some((w) => PART_WORDS.has(w) && !nameSet.has(w))) continue;

      const hit = nameTokens.filter((t) => words.has(t)).length;
      const score = hit / nameTokens.length;
      if (hit >= 2 && score >= 0.7 && (!best || score > best.score)) {
        best = { product, score };
      }
    }

    if (best) result.matched.push({ product: best.product, line });
    else result.unmatched.push(line);
  }

  return result;
}
