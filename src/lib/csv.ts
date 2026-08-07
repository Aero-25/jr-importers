/**
 * A CSV reader for files exported by other people's software.
 *
 * Hand-written rather than pulled in as a dependency, because the hard parts
 * here are narrow and specific: IQ exports quote inconsistently, sometimes end
 * lines with CRLF and sometimes not, and drop a UTF-8 BOM on the front that
 * turns the first header into something that matches nothing.
 */

export interface Csv {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Splits on real record boundaries — quoted fields may contain both. */
export function parseCsv(text: string, delimiter?: string): Csv {
  // Excel writes a BOM. Left in place it becomes part of the first header, and
  // every mapping against that column silently fails to match.
  let input = text.replace(/^﻿/, '');

  // IQ follows the regional setting, so a semicolon file is common here.
  const sep = delimiter ?? guessDelimiter(input);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is a literal quote.
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === sep) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // Consume CRLF as one break rather than emitting a phantom empty row.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Trailing blank lines, and the separator lines some exports emit.
  const meaningful = rows.filter((r) => r.some((c) => c.trim() !== ''));
  if (meaningful.length === 0) return { headers: [], rows: [] };

  const headers = meaningful[0]!.map((h, index) => h.trim() || `Column ${index + 1}`);

  return {
    headers,
    rows: meaningful.slice(1).map((values) => {
      const record: Record<string, string> = {};
      headers.forEach((header, index) => {
        record[header] = (values[index] ?? '').trim();
      });
      return record;
    }),
  };
}

function guessDelimiter(input: string): string {
  const sample = input.slice(0, 4000).split(/\r?\n/).slice(0, 5).join('\n');
  const counts = [',', ';', '\t', '|'].map((d) => ({
    d,
    n: (sample.match(new RegExp(`\\${d}`, 'g')) ?? []).length,
  }));
  return counts.sort((a, b) => b.n - a.n)[0]!.n > 0 ? counts[0]!.d : ',';
}

/**
 * Guesses which column is which.
 *
 * IQ names the same field differently across its exports and versions, so this
 * scores candidates rather than looking for one exact string. It is a starting
 * point for the person mapping, never the final word — a wrong guess left
 * uncorrected would write bad data into every product.
 */
export function guessColumn(headers: string[], candidates: string[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const wanted = candidates.map(norm);

  let best = '';
  let bestScore = 0;

  for (const header of headers) {
    const h = norm(header);
    for (let i = 0; i < wanted.length; i += 1) {
      const w = wanted[i]!;
      // Earlier candidates win: they are listed most-specific first.
      const weight = wanted.length - i;
      let score = 0;
      if (h === w) score = 100 + weight;
      else if (h.startsWith(w) || w.startsWith(h)) score = 60 + weight;
      else if (h.includes(w)) score = 30 + weight;

      if (score > bestScore) {
        bestScore = score;
        best = header;
      }
    }
  }

  return best;
}

/** Money as other systems write it: "1 234,56", "N$1,234.56", "(45.00)". */
export function parseAmount(raw: string | undefined): number {
  if (!raw) return 0;
  let s = String(raw).trim();
  if (!s) return 0;

  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()]/g, '').replace(/[^\d.,-]/g, '');

  // Whichever separator appears last is the decimal point.
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');

  const value = Math.abs(Number(s.replace(/-/g, '')));
  if (!Number.isFinite(value)) return 0;
  return negative ? -value : value;
}
