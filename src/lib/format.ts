/**
 * Formatting for a Namibian retailer.
 *
 * Money is the reason this file exists. Every amount that reaches a customer,
 * a till slip or a ledger goes through `money()` so rounding, the currency
 * mark and the thousands separator are identical everywhere.
 */

export const CURRENCY = 'NAD';
export const CURRENCY_SYMBOL = 'N$';

/** Namibian VAT. Overridable per-store via the `settings` table (key `vat_rate`). */
export const DEFAULT_VAT_RATE = 0.15;

const LOCALE = 'en-NA';

const moneyFormatter = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** `1234.5` -> `"N$ 1 234,50"`. Nullish and NaN render as a zero amount. */
export function money(value: number | string | null | undefined): string {
  return `${CURRENCY_SYMBOL} ${moneyFormatter.format(toNumber(value))}`;
}

/** Digits only — for table cells that carry the currency in the column header. */
export function amount(value: number | string | null | undefined): string {
  return moneyFormatter.format(toNumber(value));
}

/** `1250000` -> `"N$ 1,3M"`. Dashboard tiles only; never on a document. */
export function moneyCompact(value: number | string | null | undefined): string {
  return `${CURRENCY_SYMBOL} ${compactFormatter.format(toNumber(value))}`;
}

/**
 * Coerces anything the database or a form hands us into a usable number.
 * Postgres `numeric` arrives as a string over the wire often enough that this
 * cannot be assumed away.
 */
export function toNumber(value: number | string | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rounds to cents using half-away-from-zero.
 *
 * `Math.round` breaks ties toward +Infinity, which makes refunds and
 * negative ledger lines round the wrong way. Retail expects |x| to round up.
 */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value * 100;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / 100;
}

/* ── VAT ─────────────────────────────────────────────────────────────────── */

/** Splits a VAT-inclusive total into its net and tax parts. */
export function vatFromInclusive(
  inclusiveTotal: number,
  rate: number = DEFAULT_VAT_RATE,
): { net: number; vat: number; gross: number } {
  const gross = round2(inclusiveTotal);
  const net = round2(gross / (1 + rate));
  return { net, vat: round2(gross - net), gross };
}

/** Adds VAT to a VAT-exclusive amount. */
export function vatFromExclusive(
  exclusiveTotal: number,
  rate: number = DEFAULT_VAT_RATE,
): { net: number; vat: number; gross: number } {
  const net = round2(exclusiveTotal);
  const vat = round2(net * rate);
  return { net, vat, gross: round2(net + vat) };
}

/* ── Numbers ─────────────────────────────────────────────────────────────── */

export function integer(value: number | string | null | undefined): string {
  return new Intl.NumberFormat(LOCALE).format(Math.trunc(toNumber(value)));
}

export function percent(value: number | null | undefined, fractionDigits = 0): string {
  return `${(toNumber(value) * 100).toFixed(fractionDigits)}%`;
}

/* ── Dates ───────────────────────────────────────────────────────────────── */

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const timeFormatter = new Intl.DateTimeFormat(LOCALE, {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function parse(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(value: string | Date | null | undefined, fallback = '—'): string {
  const d = parse(value);
  return d ? dateFormatter.format(d) : fallback;
}

export function formatDateTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = parse(value);
  return d ? dateTimeFormatter.format(d) : fallback;
}

export function formatTime(value: string | Date | null | undefined, fallback = '—'): string {
  const d = parse(value);
  return d ? timeFormatter.format(d) : fallback;
}

/** `"2 hours ago"`, `"in 3 days"`. Used for order age and reservation expiry. */
export function relativeTime(value: string | Date | null | undefined): string {
  const d = parse(value);
  if (!d) return '—';

  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const deltaSeconds = (d.getTime() - Date.now()) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];

  for (const [unit, seconds] of units) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return rtf.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return rtf.format(Math.round(deltaSeconds), 'second');
}

/** `YYYY-MM-DD` in local time — the shape Postgres `date` columns expect. */
export function toDateInput(value: string | Date | null | undefined): string {
  const d = parse(value) ?? new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* ── Text ────────────────────────────────────────────────────────────────── */

export function initials(name: string | null | undefined, max = 2): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, max)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** URL-safe slug used for product permalinks: `/product/142-samsung-galaxy-a16`. */
export function slugify(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
