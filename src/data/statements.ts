import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  AccountTransactionRow,
  CustomerRow,
  InvoiceRow,
  LaybyRow,
  LineItem,
  RefundRow,
} from '@/lib/database.types';
import { round2, toDateInput, toNumber } from '@/lib/format';
import { keys } from './keys';

/**
 * A client statement: everything that has happened on one customer's account,
 * in the order it happened, with the balance carried down the page.
 *
 * The shop's history of a customer is spread over four tables, and no single
 * one of them can answer "what has this client done with us":
 *
 *   - `account_transactions` is the account itself — opening balances carried
 *     over from IQ, invoices raised on account, receipts, credit notes.
 *   - `invoices` also holds documents that never touched the ledger: every
 *     till sale (the trigger raises one per paid order) and the IQ document
 *     history.
 *   - `laybys` are instalment sales that post nowhere near the ledger.
 *   - `refunds` are money handed back, keyed to the order, not the customer.
 *
 * So the statement is assembled here rather than read from one table, and each
 * line says whether it moves the account balance. Getting that distinction
 * wrong is how a statement double-counts: an IQ invoice from 2024 is already
 * inside the opening balance, and a till sale settled in cash owes nothing.
 */

export interface StatementLine {
  /** Unique within a statement — table plus row id, so React keys are stable. */
  id: string;
  /** `YYYY-MM-DD`, the day the statement sorts and ages by. */
  date: string;
  /** Full timestamp where the source has one; breaks ties within a day. */
  at: string;
  type: string;
  reference: string;
  detail: string;
  /** Increases what is owed. Always positive. */
  charge: number;
  /** Reduces what is owed. Always positive. */
  payment: number;
  /**
   * False for lines shown for completeness but deliberately outside the
   * account balance: IQ history (already in the opening balance), laybys and
   * their instalments (never posted to the ledger), refunds against till
   * sales that were settled at the counter.
   */
  onAccount: boolean;
  /** Balance after this line. Null on lines that do not move the account. */
  balance: number | null;
  /** Why a line sits outside the balance. Printed under the table. */
  note: string | null;
  source: 'ledger' | 'invoice' | 'layby' | 'refund';
}

export interface StatementAging {
  current: number;
  d30: number;
  d60: number;
  d90: number;
}

export interface StatementParty {
  customer_id: string | null;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  account_code: string | null;
  credit_limit: number;
  /** Address lines for the document's "Statement To" box. */
  contact: string[];
}

export interface ClientStatement extends StatementParty {
  /** The date the statement is drawn to. */
  asAt: string;
  from: string | null;
  to: string | null;
  /** Account balance the day before `from`. Zero when the period is open-ended. */
  openingBalance: number;
  closingBalance: number;
  charges: number;
  payments: number;
  lines: StatementLine[];
  /** Everything, including what falls outside the chosen period. */
  transactionCount: number;
  /** Still owed on active laybys. Not part of the account balance. */
  laybyBalance: number;
  aging: StatementAging;
}

export interface StatementRange {
  from: string | null;
  to: string | null;
}

export interface StatementSources {
  ledger: AccountTransactionRow[];
  invoices: InvoiceRow[];
  laybys: LaybyRow[];
  refunds: RefundRow[];
}

const LEDGER_LABELS: Record<string, string> = {
  opening: 'Opening balance',
  invoice: 'Invoice',
  bill: 'Bill',
  payment: 'Payment received',
  credit_note: 'Credit note',
};

/** `'iq-import'` rows are history: the debt itself sits in the opening balance. */
function isHistory(invoice: InvoiceRow): boolean {
  return invoice.source === 'iq-import';
}

/**
 * What the document was actually for.
 *
 * A statement whose every line reads "Invoice" tells the customer nothing they
 * could check against their own records, which is the whole job of the
 * description column. In order of what a reader would recognise:
 *
 *   1. The goods, from the invoice's own line items.
 *   2. What IQ recorded, for documents carried over from it.
 *   3. The customer's own order number, or the comment typed on the invoice.
 *
 * On the IQ side the shop's actual export (IQ SaaS 2023.1, Documents grid)
 * holds free text in exactly three places, and the names are not what a
 * shape-based guess expects: `LONGDESC` is the note typed on the document
 * ("Old Mutual Official Order 122187 / Claim no. 123315331"), `FAULTDES` is a
 * workshop fault line ("TOUCH AND LCD REPLACEMENT"), and `MEMO` is rarely
 * used. A generic /descript/ pattern matched none of these, so every one of
 * the 200-odd documents that did carry a description printed its order
 * number, or nothing. Those names are tried first, by name; the pattern
 * search stays as a fallback for an export from a differently-named version.
 *
 * `ORDERNUM` is the customer's own order or PO number and is on ~950
 * documents. It is a reference, not a description, and is labelled as such.
 * It is often purely numeric ("17367") — that is still the number the
 * customer's buyer will look for, so it is kept where a bare number in a
 * description field would be dropped.
 */
const IQ_DESCRIPTION_FIELDS = ['LONGDESC', 'FAULTDES', 'JOBDES', 'MEMO'];
const IQ_REFERENCE_FIELDS = ['ORDERNUM', 'RealOrderNum'];
const IQ_DESCRIPTION_KEY = /descript|comment|narrat|remark|memo|detail|message/i;
const IQ_REFERENCE_KEY = /yourref|custref|customerref|orderno|ordernum|order_no|purchase|reference/i;

/** Codes, totals, dates and account numbers describe nothing. */
function readableValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text.length < 3) return '';
  if (/^[\d\s.,:/-]+$/.test(text)) return '';
  return text;
}

/** An order number may be all digits; only placeholder junk is refused. */
function referenceValue(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text.length < 2) return '';
  if (/^[\s.,:/-]+$/.test(text)) return '';
  return text;
}

function iqDescription(iq: Record<string, string> | null): string {
  if (!iq) return '';

  for (const key of IQ_DESCRIPTION_FIELDS) {
    const text = readableValue(iq[key]);
    if (text) return text;
  }
  for (const key of IQ_REFERENCE_FIELDS) {
    const text = referenceValue(iq[key]);
    if (text) return `Your order ${text}`;
  }

  const entries = Object.entries(iq);
  for (const [key, value] of entries) {
    if (!IQ_DESCRIPTION_KEY.test(key)) continue;
    const text = readableValue(value);
    if (text) return text;
  }
  for (const [key, value] of entries) {
    if (!IQ_REFERENCE_KEY.test(key)) continue;
    const text = referenceValue(value);
    if (text) return `Your order ${text}`;
  }
  return '';
}

/** "Galaxy A16 x2, Screen protector" — the goods, as the customer saw them. */
function itemSummary(items: LineItem[]): string {
  const named = (items ?? []).filter((item) => item?.name);
  if (!named.length) return '';
  const shown = named
    .slice(0, 3)
    .map((item) => (Number(item.quantity) > 1 ? `${item.name} x${item.quantity}` : item.name))
    .join(', ');
  return named.length > 3 ? `${shown} +${named.length - 3} more` : shown;
}

function invoiceDescription(invoice: InvoiceRow): string {
  return (
    itemSummary(invoice.items ?? []) ||
    iqDescription(invoice.iq_data) ||
    invoice.notes?.trim() ||
    (invoice.po_number ? `Your PO ${invoice.po_number}` : '') ||
    ''
  );
}

function invoiceReference(invoice: InvoiceRow): string {
  return invoice.invoice_number ?? `INV-${invoice.id}`;
}

function laybyReference(layby: LaybyRow): string {
  return layby.layby_number ?? `LAY-${layby.id}`;
}

export function statementParty(customer: CustomerRow): StatementParty {
  // Most addresses already end in the town, so appending the city repeats it.
  // Compared case-insensitively, the first line wins — same rule the invoice
  // document uses, so the two read alike.
  const seen = new Set<string>();
  const contact = [
    customer.account_code ? `Account ${customer.account_code}` : '',
    ...(customer.address ?? '').split('\n').map((line) => line.trim()),
    [customer.city, customer.region].filter(Boolean).join(', '),
    customer.phone ?? '',
    customer.email ?? '',
  ].filter((line) => {
    const key = line.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    customer_id: customer.id,
    customer_name: customer.name ?? customer.email ?? 'Account customer',
    customer_email: customer.email,
    customer_phone: customer.phone,
    account_code: customer.account_code,
    credit_limit: toNumber(customer.credit_limit),
    contact,
  };
}

/**
 * Ages what is still open, oldest charge first.
 *
 * Payments are not matched to the invoice they settled — the ledger does not
 * record that — so they are allocated against the oldest open charge, which is
 * both the convention on a statement and the assumption a customer paying an
 * account makes.
 */
function ageOpenCharges(lines: StatementLine[], asAt: Date): StatementAging {
  const open = lines
    .filter((line) => line.onAccount && line.charge > 0)
    .map((line) => ({ date: line.date, left: line.charge }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let credit = lines.reduce((sum, line) => sum + (line.onAccount ? line.payment : 0), 0);
  for (const charge of open) {
    if (credit <= 0) break;
    const used = Math.min(charge.left, credit);
    charge.left = round2(charge.left - used);
    credit = round2(credit - used);
  }

  const aging: StatementAging = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const charge of open) {
    if (charge.left <= 0.005) continue;
    const days = Math.max(
      0,
      Math.floor((asAt.getTime() - new Date(`${charge.date}T00:00:00`).getTime()) / 86_400_000),
    );
    const bucket = days <= 30 ? 'current' : days <= 60 ? 'd30' : days <= 90 ? 'd60' : 'd90';
    aging[bucket] = round2(aging[bucket] + charge.left);
  }
  return aging;
}

export function buildStatement(
  party: StatementParty,
  sources: StatementSources,
  range: StatementRange = { from: null, to: null },
  asAt: Date = new Date(),
): ClientStatement {
  const lines: StatementLine[] = [];

  // Invoices raised from the console post their own ledger charge. Taking the
  // invoice as well would bill the customer twice for one document.
  const posted = new Set(
    sources.ledger
      .filter((row) => row.doc_type === 'invoice' && row.doc_id)
      .map((row) => String(row.doc_id)),
  );

  for (const row of sources.ledger) {
    const amount = toNumber(row.amount);
    lines.push({
      id: `ledger-${row.id}`,
      date: row.txn_date,
      at: row.created_at ?? `${row.txn_date}T00:00:00`,
      type: LEDGER_LABELS[row.txn_type] ?? row.txn_type,
      reference: row.reference ?? (row.doc_id ? `${row.doc_type ?? 'doc'} ${row.doc_id}` : '—'),
      detail: [row.method, row.notes].filter(Boolean).join(' · '),
      charge: amount > 0 ? round2(amount) : 0,
      payment: amount < 0 ? round2(-amount) : 0,
      onAccount: true,
      balance: null,
      note: null,
      source: 'ledger',
    });
  }

  for (const invoice of sources.invoices) {
    if (posted.has(String(invoice.id))) continue;
    const total = toNumber(invoice.total_amount);
    const history = isHistory(invoice);
    const reference = invoiceReference(invoice);
    // A credit note comes over as a document with a negative total. Left in the
    // charges column it reads as a bill for minus five thousand dollars.
    const credit = total < 0;

    lines.push({
      id: `invoice-${invoice.id}`,
      date: toDateInput(invoice.created_at),
      at: invoice.created_at,
      type: credit ? 'Credit note' : 'Invoice',
      reference,
      detail: invoiceDescription(invoice),
      charge: credit ? 0 : round2(total),
      payment: credit ? round2(-total) : 0,
      onAccount: !history,
      balance: null,
      note: history ? 'Carried over from IQ — already inside the opening balance.' : null,
      source: 'invoice',
    });

    // A till sale is invoiced and settled in the same breath. Showing only the
    // charge would tell a customer they owe for a phone they paid cash for.
    if (!history && !credit && invoice.status === 'paid') {
      lines.push({
        id: `invoice-${invoice.id}-settled`,
        date: toDateInput(invoice.paid_at ?? invoice.created_at),
        at: invoice.paid_at ?? invoice.created_at,
        type: 'Payment received',
        reference: `${reference} settled`,
        detail: invoice.payment_method ?? '',
        charge: 0,
        payment: round2(total),
        onAccount: true,
        balance: null,
        note: null,
        source: 'invoice',
      });
    }
  }

  let laybyBalance = 0;
  for (const layby of sources.laybys) {
    const reference = laybyReference(layby);
    if (layby.status !== 'cancelled') laybyBalance = round2(laybyBalance + toNumber(layby.balance_amount));

    lines.push({
      id: `layby-${layby.id}`,
      date: toDateInput(layby.created_at),
      at: layby.created_at,
      type: 'Layby opened',
      reference,
      detail: itemSummary(layby.items ?? []),
      charge: round2(toNumber(layby.total_amount)),
      payment: 0,
      onAccount: false,
      balance: null,
      note: 'Layby — goods stay with us until it is settled, so it is not on the account balance.',
      source: 'layby',
    });

    (layby.payments ?? []).forEach((payment, index) => {
      lines.push({
        id: `layby-${layby.id}-payment-${index}`,
        date: toDateInput(payment.date),
        // A layby payment records only the day, so it would otherwise sort
        // ahead of the agreement it pays off when both fall on one date.
        at: `${toDateInput(payment.date)}T23:59:00`,
        type: 'Layby instalment',
        reference,
        detail: [payment.method, payment.by].filter(Boolean).join(' · '),
        charge: 0,
        payment: round2(toNumber(payment.amount)),
        onAccount: false,
        balance: null,
        note: null,
        source: 'layby',
      });
    });
  }

  for (const refund of sources.refunds) {
    // A pending or declined refund never left the drawer, so it is not yet a
    // transaction on the client. `refunds_status_check` allows exactly three.
    if (refund.status !== 'Approved') continue;
    lines.push({
      id: `refund-${refund.id}`,
      date: toDateInput(refund.approved_at ?? refund.created_at),
      at: refund.approved_at ?? refund.created_at,
      type: 'Refund',
      reference: `RF-${refund.refund_number}`,
      detail: [refund.method, refund.reason].filter(Boolean).join(' · '),
      charge: 0,
      payment: round2(toNumber(refund.total_amount)),
      onAccount: false,
      balance: null,
      note: 'Money returned against a sale that was already settled.',
      source: 'refund',
    });
  }

  lines.sort((a, b) => (a.date === b.date ? (a.at < b.at ? -1 : a.at > b.at ? 1 : 0) : a.date < b.date ? -1 : 1));

  const upToDate = range.to ? lines.filter((line) => line.date <= range.to!) : lines;
  const before = range.from ? upToDate.filter((line) => line.date < range.from!) : [];
  const within = range.from ? upToDate.filter((line) => line.date >= range.from!) : upToDate;

  const openingBalance = round2(
    before.reduce((sum, line) => sum + (line.onAccount ? line.charge - line.payment : 0), 0),
  );

  let running = openingBalance;
  for (const line of within) {
    if (!line.onAccount) continue;
    running = round2(running + line.charge - line.payment);
    line.balance = running;
  }

  const charges = round2(within.reduce((sum, l) => sum + (l.onAccount ? l.charge : 0), 0));
  const payments = round2(within.reduce((sum, l) => sum + (l.onAccount ? l.payment : 0), 0));

  return {
    ...party,
    asAt: range.to ?? toDateInput(asAt),
    from: range.from,
    to: range.to,
    openingBalance,
    closingBalance: running,
    charges,
    payments,
    lines: within,
    transactionCount: lines.length,
    laybyBalance,
    aging: ageOpenCharges(upToDate, range.to ? new Date(`${range.to}T00:00:00`) : asAt),
  };
}

/** Enough history for any statement a shop counter is asked for. */
const MAX_ROWS = 2000;

async function fetchSources(customerId: string): Promise<StatementSources> {
  const [ledger, invoices, laybys] = await Promise.all([
    supabase
      .from('account_transactions')
      .select('*')
      .eq('account_type', 'debtor')
      .eq('customer_id', customerId)
      .order('txn_date', { ascending: true })
      .limit(MAX_ROWS),
    supabase
      .from('invoices')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS),
    supabase
      .from('laybys')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS),
  ]);

  for (const result of [ledger, invoices, laybys]) {
    if (result.error) throw new Error(result.error.message);
  }

  // Refunds carry the order, not the customer, so they are reached through the
  // invoices raised from those orders.
  const orderIds = (invoices.data ?? [])
    .map((invoice) => invoice.order_id)
    .filter((id): id is string => Boolean(id));

  let refunds: RefundRow[] = [];
  if (orderIds.length) {
    const { data, error } = await supabase
      .from('refunds')
      .select('*')
      .in('order_id', orderIds)
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);
    refunds = data ?? [];
  }

  return {
    ledger: ledger.data ?? [],
    invoices: invoices.data ?? [],
    laybys: laybys.data ?? [],
    refunds,
  };
}

export function useClientStatement(customer: CustomerRow | null, range: StatementRange) {
  return useQuery<ClientStatement, Error>({
    queryKey: keys.statement(customer?.id ?? 'none', range),
    enabled: Boolean(customer),
    queryFn: async () => {
      const row = customer!;
      return buildStatement(statementParty(row), await fetchSources(row.id), range);
    },
  });
}
