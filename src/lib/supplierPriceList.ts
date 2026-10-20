/**
 * Reads a supplier's price list and picks the Samsung phones out of it.
 *
 * The lists are hand-maintained spreadsheets: a letterhead across the first few
 * rows, a section heading, then a description and a price per line, with the
 * letterhead repeated when the page breaks. There is no header row to key off
 * and no SKU column, so the only thing to work from is the description.
 *
 * What it must get right, from a real Active Cellular list:
 *
 *   SAMSUNG A07  4/128GIG DUAL (EXPORT)          -> A07, 128GB
 *   SAMSUNG A57  256GIG (5G) DUAL (EXPORT)       -> A57, 256GB, 5G
 *   SAMSUNG S25FE 8/256GIG DUAL (EXPORT/LOCAL)   -> S25 FE, 256GB
 *   SAMSUNG A04S 3/32GIG DUAL (EXPORT)           -> A04s, 32GB
 *   SAMSUNG Z-FOLD 7 512GB DUAL (LOCAL) Silver   -> Z Fold 7, 512GB
 *   SAMSUNG X115 TAB-A9 8.7" 64GIG LTE (LOCAL)   -> skipped, a tablet
 *   I-PHONE 17 256GIG (EXPORT)                   -> skipped, not Samsung
 *
 * Storage, not RAM, identifies a handset: the shop prices by storage, so the
 * 6/128 and the 8/128 of one model are one line on the price list. The rules
 * here mirror `private.parse_handset` in SQL — the database builds the variant
 * key from the model and storage this extracts, so the two cannot drift.
 */

import { decodePart, readZipParts } from './zip';

export interface SupplierRow {
  /** `Samsung Galaxy A07 128GB 5G` — what a customer reads. */
  display_name: string;
  /** `A07`, `S26 Ultra`, `Z Fold 7`. Feeds the variant key. */
  model: string;
  storage_gb: number;
  five_g: boolean;
  /** The supplier's wording, kept so an admin can see where a line came from. */
  description: string;
  supplier_cost: number;
}

export interface SkippedRow {
  description: string;
  reason: string;
}

export interface ParsedSupplierList {
  rows: SupplierRow[];
  skipped: SkippedRow[];
  /** Two lines that reduce to the same handset. The cheaper one is used. */
  duplicates: Array<{ description: string; keptCost: number; droppedCost: number }>;
  listDate: string | null;
  supplierName: string | null;
}

// ---------------------------------------------------------------------------
// Classification — the same rules as private.is_samsung_phone
// ---------------------------------------------------------------------------

const TABLET = /\bTAB\b|TAB-|\bTABLET\b|\bMEDIAPAD\b|\bX\d{3}[A-Z]?\b/;
const ACCESSORY = /\bWATCH\b|\bBUDS\b|\bFIT\b|\bCHARGER\b|\bCOVER\b|\bCASE\b|\bEARBUD/;

function classify(upper: string): string | null {
  if (!/\bSAMSUNG\b/.test(upper)) return 'not a Samsung';
  if (TABLET.test(upper)) return 'tablet';
  if (ACCESSORY.test(upper)) return 'accessory';
  return null;
}

// ---------------------------------------------------------------------------
// The model and the storage size
// ---------------------------------------------------------------------------

/** Trade wording: which market a handset was built for, not which handset. */
function stripTradeWords(upper: string): string {
  return upper
    .replace(/\((\s*(LOCAL|EXPORT|IMPORT)\s*\/?\s*)+\)?/g, ' ')
    .replace(/\b(DUAL|LTE|SIM|NEW|GUARANTEE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readStorage(text: string): number | null {
  // The RAM/storage pair first, so "4/128GIG" reads as 128 and not as 4. Every
  // pattern insists on GB or GIG, so "5G" is never read as a 5GB handset.
  const pair = text.match(/(\d+)\s*\/\s*(\d+)\s*(?:GIG|GB)/);
  if (pair) return Number(pair[2]);
  const single = text.match(/(\d+)\s*(?:GIG|GB)/);
  return single ? Number(single[1]) : null;
}

function readModel(text: string): string | null {
  // Foldables carry a word instead of a family letter.
  const fold = text.match(/\bZ\s*-?\s*(FOLD|FLIP)\s*(\d+)\b/);
  if (fold) return `Z-${fold[1]} ${fold[2]}`;

  // "S25FE", "S25 FE", "S26 ULTRA": a suffix word that is part of the name.
  const suffixed = text.match(/\b([ASMF])\s*(\d{2,3})\s*(FE|PLUS|ULTRA|LITE)\b/);
  if (suffixed) return `${suffixed[1]}${suffixed[2]} ${suffixed[3]}`;

  // "A04S": a bare trailing letter that belongs to the model.
  const lettered = text.match(/\b([ASMF])\s*(\d{2,3})([A-Z])\b/);
  if (lettered) return `${lettered[1]}${lettered[2]}${lettered[3]}`;

  const plain = text.match(/\b([ASMF])\s*(\d{2,3})\b/);
  return plain ? `${plain[1]}${plain[2]}` : null;
}

/** `A04S` -> `A04s`, `S26 ULTRA` -> `S26 Ultra`, `Z-FOLD 7` -> `Z Fold 7`. */
function prettyModel(model: string): string {
  const fold = model.match(/^Z-(FOLD|FLIP)\s+(\d+)$/i);
  if (fold) return `Z ${fold[1]![0]!.toUpperCase()}${fold[1]!.slice(1).toLowerCase()} ${fold[2]}`;

  const suffixed = model.match(/^([ASMF]\d{2,3})\s+(FE|PLUS|ULTRA|LITE)$/i);
  if (suffixed) {
    const word = suffixed[2]!.toUpperCase();
    // FE is an initialism and stays shouted; the others are words.
    return `${suffixed[1]} ${word === 'FE' ? 'FE' : word[0]! + word.slice(1).toLowerCase()}`;
  }

  // A trailing letter is part of the model and conventionally lower case.
  return model.replace(/^([ASMF]\d{2,3})([A-Z])$/, (_m, base: string, suffix: string) =>
    `${base}${suffix.toLowerCase()}`);
}

export function describeHandset(model: string, storageGb: number, fiveG: boolean): string {
  return `Samsung Galaxy ${prettyModel(model)} ${storageGb}GB${fiveG ? ' 5G' : ''}`;
}

// ---------------------------------------------------------------------------
// Pulling description/price pairs out of the file
// ---------------------------------------------------------------------------

type Cell = string;
type Line = { text: string; cells: Cell[] };

const COLUMN_RE = /^([A-Z]+)(\d+)$/;

function columnIndex(ref: string): number {
  const match = COLUMN_RE.exec(ref);
  if (!match) return 0;
  let n = 0;
  for (const ch of match[1]!) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function linesFromXlsx(file: ArrayBuffer): Promise<Line[]> {
  const parts = await readZipParts(
    file,
    (name) =>
      name === 'xl/sharedStrings.xml' ||
      name === 'xl/workbook.xml' ||
      /^xl\/worksheets\/sheet\d+\.xml$/.test(name),
  );

  const parser = new DOMParser();

  const sharedPart = parts.get('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sharedPart) {
    const doc = parser.parseFromString(decodePart(sharedPart), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      shared.push(Array.from(si.getElementsByTagName('t')).map((t) => t.textContent ?? '').join(''));
    }
  }

  // The first worksheet. Supplier lists are one sheet; where they are not, it
  // is the first that carries the prices.
  const sheetName = [...parts.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort()[0];
  if (!sheetName) throw new Error('That workbook has no worksheets.');

  const doc = parser.parseFromString(decodePart(parts.get(sheetName)!), 'application/xml');
  const lines: Line[] = [];

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: Cell[] = [];
    for (const c of Array.from(row.getElementsByTagName('c'))) {
      const index = columnIndex(c.getAttribute('r') ?? '');
      const type = c.getAttribute('t');
      let value = '';
      if (type === 'inlineStr') {
        value = Array.from(c.getElementsByTagName('t')).map((t) => t.textContent ?? '').join('');
      } else {
        const v = c.getElementsByTagName('v')[0];
        if (v) value = type === 's' ? shared[Number(v.textContent)] ?? '' : v.textContent ?? '';
      }
      cells[index] = value.trim();
    }
    if (cells.some((c) => c)) lines.push({ text: cells.filter(Boolean).join(' '), cells });
  }

  return lines;
}

function linesFromCsv(text: string): Line[] {
  // Enough CSV for a price list: quoted fields with doubled quotes inside.
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const cells: string[] = [];
      let cur = '';
      let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]!;
        if (quoted) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; }
          else if (ch === '"') quoted = false;
          else cur += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',' || ch === ';' || ch === '\t') { cells.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      cells.push(cur.trim());
      return { text: cells.filter(Boolean).join(' '), cells };
    });
}

/** A price: a bare number, possibly with thousands separators or a currency mark. */
function readPrice(cell: string): number | null {
  const cleaned = cell.replace(/[Rr]\s*|N\$|\s|,/g, '');
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  // A price list is not going to quote a phone at four rand or four hundred
  // thousand; a number outside that is a date, a quantity or a page number.
  return value >= 50 && value <= 400_000 ? value : null;
}

// ---------------------------------------------------------------------------
// The whole job
// ---------------------------------------------------------------------------

export async function parseSupplierList(file: File): Promise<ParsedSupplierList> {
  const name = file.name.toLowerCase();
  let lines: Line[];

  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    lines = linesFromCsv(await file.text());
  } else if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    lines = await linesFromXlsx(await file.arrayBuffer());
  } else if (name.endsWith('.xls')) {
    // A true .xls is the old OLE2 binary, a different format altogether. Many
    // "price list.xls" files are really .xlsx renamed, so try before refusing.
    try {
      lines = await linesFromXlsx(await file.arrayBuffer());
    } catch {
      throw new Error(
        'That is an old-style .xls file. Open it in Excel and use File > Save As > ' +
          'Excel Workbook (.xlsx), then upload it again.',
      );
    }
  } else {
    throw new Error('Upload an .xlsx or .csv file.');
  }

  const rows: SupplierRow[] = [];
  const skipped: SkippedRow[] = [];
  const duplicates: ParsedSupplierList['duplicates'] = [];
  const byKey = new Map<string, { index: number; cost: number }>();

  let listDate: string | null = null;
  let supplierName: string | null = null;

  for (const line of lines) {
    // The letterhead carries the date and, usefully, an email we can name the
    // supplier from. It repeats on every page, so first one wins.
    if (!listDate) {
      const date = line.text.match(/DATE[-:\s]+(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/i);
      if (date) {
        const [, d, m, y] = date;
        const year = y!.length === 2 ? `20${y}` : y!;
        listDate = `${year}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
      }
    }
    if (!supplierName) {
      const email = line.text.match(/[\w.+-]+@([\w-]+)\.[\w.]+/);
      if (email) {
        supplierName = email[1]!
          .split(/[-_.]/)
          .map((w) => w[0]!.toUpperCase() + w.slice(1))
          .join(' ');
      }
    }

    // A product line is a description with a price somewhere beside it.
    const description = (line.cells.find((c) => c && readPrice(c) === null) ?? '').trim();
    if (!description || description.length < 6) continue;
    const cost = line.cells.map((c) => readPrice(c ?? '')).find((p) => p !== null) ?? null;
    if (cost === null) continue;

    const upper = description.toUpperCase();
    const reason = classify(upper);
    if (reason) {
      skipped.push({ description, reason });
      continue;
    }

    const stripped = stripTradeWords(upper);
    const model = readModel(stripped);
    const storage = readStorage(stripped);

    if (!model) {
      skipped.push({ description, reason: 'could not read the model' });
      continue;
    }
    if (!storage) {
      skipped.push({ description, reason: 'could not read the storage size' });
      continue;
    }

    const fiveG = /\b5G\b/.test(stripped);
    const key = `${model.toLowerCase()}|${storage}`;
    const seen = byKey.get(key);

    if (seen) {
      // Same handset, two RAM builds. The cheaper cost is the one to sell from.
      const [kept, dropped] = cost < seen.cost ? [cost, seen.cost] : [seen.cost, cost];
      duplicates.push({ description, keptCost: kept, droppedCost: dropped });
      if (cost < seen.cost) {
        rows[seen.index]!.supplier_cost = cost;
        rows[seen.index]!.description = description;
        seen.cost = cost;
      }
      continue;
    }

    byKey.set(key, { index: rows.length, cost });
    rows.push({
      display_name: describeHandset(model, storage, fiveG),
      model,
      storage_gb: storage,
      five_g: fiveG,
      description,
      supplier_cost: cost,
    });
  }

  rows.sort((a, b) => a.display_name.localeCompare(b.display_name));
  return { rows, skipped, duplicates, listDate, supplierName };
}
