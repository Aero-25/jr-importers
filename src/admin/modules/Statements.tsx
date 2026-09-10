import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Search, UserSearch } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import type { CustomerRow } from '@/lib/database.types';
import { useClientStatement, type StatementLine, type StatementRange } from '@/data/statements';
import { formatDate, money, toDateInput } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Input,
  Notice,
  StatTile,
  type Column,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { PdfActions } from '../components/PdfActions';

/**
 * Client statements.
 *
 * The counter question this answers is "what has this customer done with us,
 * and what do they owe" — asked over the phone, at the desk, and by the
 * customer's own accounts department. Before this it could only be answered by
 * reading four screens and adding up by hand.
 *
 * It sits under Invoices because that is where staff go looking for it, and it
 * is manager-gated because `account_transactions` is: the ledger's RLS policy
 * is `is_admin()`, so a cashier opening this would be shown a statement with
 * the account movements silently missing, which is worse than being told no.
 */

/** 'custom' is what typing in the date boxes leaves you on — no chip lit. */
type Preset = 'all' | 'month' | 'quarter' | 'year' | 'custom';

function presetRange(preset: Preset): StatementRange {
  const now = new Date();
  const to = toDateInput(now);
  switch (preset) {
    case 'month':
      return { from: toDateInput(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case 'quarter':
      return { from: toDateInput(new Date(now.getFullYear(), now.getMonth() - 2, 1)), to };
    case 'year':
      return { from: toDateInput(new Date(now.getFullYear(), 0, 1)), to };
    case 'all':
    default:
      return { from: null, to: null };
  }
}

export default function Statements() {
  const navigate = useNavigate();
  const [customer, setCustomer] = useState<CustomerRow | null>(null);
  const [preset, setPreset] = useState<Preset>('all');
  const [range, setRange] = useState<StatementRange>({ from: null, to: null });

  const statement = useClientStatement(customer, range);
  const data = statement.data;

  function choosePreset(next: Preset) {
    setPreset(next);
    setRange(presetRange(next));
  }

  const columns = useMemo<Column<StatementLine>[]>(
    () => [
      {
        key: 'date',
        header: 'Date',
        width: '7.5rem',
        render: (line) => <span className="text-sm">{formatDate(line.date)}</span>,
        sortValue: (line) => `${line.date}${line.at}`,
      },
      {
        key: 'type',
        header: 'Transaction',
        render: (line) => (
          <div className="min-w-0">
            <span className="text-ink">{line.type}</span>
            {!line.onAccount && (
              <Badge tone="neutral" size="sm" className="ml-2 align-middle">
                {/* The reason travels with the badge: "off account" on its own
                    invites the reader to assume the line is a mistake. */}
                <span title={line.note ?? 'Outside the account balance.'}>Off account</span>
              </Badge>
            )}
            {line.detail && (
              <p className="truncate text-xs text-ink-subtle">{line.detail}</p>
            )}
          </div>
        ),
        sortValue: (line) => line.type,
      },
      {
        key: 'reference',
        header: 'Reference',
        secondary: true,
        render: (line) => <span className="text-xs text-ink-muted">{line.reference}</span>,
        sortValue: (line) => line.reference,
      },
      {
        key: 'charge',
        header: 'Charge',
        align: 'right',
        render: (line) => (
          <span className="tabular text-ink">{line.charge ? money(line.charge) : '—'}</span>
        ),
        sortValue: (line) => line.charge,
      },
      {
        key: 'payment',
        header: 'Payment',
        align: 'right',
        render: (line) => (
          <span className="tabular text-success">{line.payment ? money(line.payment) : '—'}</span>
        ),
        sortValue: (line) => line.payment,
      },
      {
        key: 'balance',
        header: 'Balance',
        align: 'right',
        render: (line) => (
          <span
            className={cn(
              'tabular font-medium',
              line.balance === null
                ? 'text-ink-subtle'
                : line.balance > 0.005
                  ? 'text-warn'
                  : 'text-ink-muted',
            )}
          >
            {line.balance === null ? '—' : money(line.balance)}
          </span>
        ),
        sortValue: (line) => line.balance ?? 0,
      },
    ],
    [],
  );

  const offAccount = (data?.lines ?? []).some((line) => !line.onAccount);

  return (
    <>
      <ModuleHeader
        title="Client statements"
        description="Every transaction on one customer's account — invoices, payments, laybys and refunds."
        actions={
          <Button
            variant="secondary"
            icon={<Receipt className="h-4 w-4" />}
            onClick={() => navigate('/invoices')}
          >
            Back to invoices
          </Button>
        }
      />

      <div className="space-y-6 p-6">
        <Card className="p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
            <CustomerSearch value={customer} onPick={setCustomer} />

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Period</p>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['all', 'All history'],
                    ['month', 'This month'],
                    ['quarter', 'Last 3 months'],
                    ['year', 'This year'],
                  ] as Array<[Preset, string]>
                ).map(([key, label]) => (
                  <Button
                    key={key}
                    size="sm"
                    variant={preset === key ? 'primary' : 'ghost'}
                    onClick={() => choosePreset(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <Input
                  label="From"
                  type="date"
                  value={range.from ?? ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setPreset('custom');
                    setRange((r) => ({ ...r, from: e.target.value || null }));
                  }}
                  containerClassName="w-44"
                />
                <Input
                  label="To"
                  type="date"
                  value={range.to ?? ''}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setPreset('custom');
                    setRange((r) => ({ ...r, to: e.target.value || null }));
                  }}
                  containerClassName="w-44"
                />
                <p className="pb-2 text-xs text-ink-subtle">
                  Anything before the start date is carried in as the opening balance.
                </p>
              </div>
            </div>
          </div>
        </Card>

        {!customer && (
          <Card>
            <EmptyState
              icon={<UserSearch className="h-10 w-10" />}
              title="Pick a client to pull their statement"
              message="Search by name, IQ account code, phone or email. The statement covers everything on that account — invoices raised, till sales, payments received, laybys and refunds."
            />
          </Card>
        )}

        {customer && statement.isError && (
          <ErrorState
            title="Could not build the statement"
            error={statement.error}
            onRetry={() => void statement.refetch()}
          />
        )}

        {customer && data && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile
                label="Brought forward"
                value={money(data.openingBalance)}
                sub={data.from ? `Before ${formatDate(data.from)}` : 'Account opened'}
              />
              <StatTile label="Charged" value={money(data.charges)} tone="info" />
              <StatTile label="Paid" value={money(data.payments)} tone="success" />
              <StatTile
                label="Balance due"
                value={money(data.closingBalance)}
                sub={`As at ${formatDate(data.asAt)}`}
                tone={data.closingBalance > 0.005 ? 'warn' : 'success'}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ['Current', data.aging.current, 'neutral'],
                  ['30 days', data.aging.d30, 'info'],
                  ['60 days', data.aging.d60, 'warn'],
                  ['90+ days', data.aging.d90, 'danger'],
                ] as Array<[string, number, 'neutral' | 'info' | 'warn' | 'danger']>
              ).map(([label, value, tone]) => (
                <StatTile
                  key={label}
                  label={label}
                  value={money(value)}
                  tone={value > 0.005 ? tone : 'neutral'}
                />
              ))}
            </div>

            {data.laybyBalance > 0.005 && (
              <Notice tone="info" title={`${money(data.laybyBalance)} still to run on laybys`}>
                Layby instalments are listed below but sit outside the account balance — the goods
                stay with us until the layby is settled.
              </Notice>
            )}

            {data.closingBalance > data.credit_limit && data.credit_limit > 0 && (
              <Notice tone="warn" title="Over their credit limit">
                {money(data.closingBalance)} owing against a limit of {money(data.credit_limit)}.
              </Notice>
            )}

            <div>
              <PdfActions document={{ kind: 'statement', record: data }} />
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-5 py-3.5">
                  <div>
                    <h2 className="font-display text-base font-semibold text-ink">
                      {data.customer_name}
                    </h2>
                    <p className="text-xs text-ink-muted">
                      {[
                        data.account_code ? `Account ${data.account_code}` : null,
                        data.from
                          ? `${formatDate(data.from)} — ${formatDate(data.asAt)}`
                          : `Everything up to ${formatDate(data.asAt)}`,
                        `${data.lines.length} of ${data.transactionCount} transactions`,
                      ]
                        .filter(Boolean)
                        .join('  ·  ')}
                    </p>
                  </div>
                </div>
                <DataTable
                  rows={data.lines}
                  columns={columns}
                  rowKey={(line) => line.id}
                  loading={statement.isFetching}
                  defaultSort={{ key: 'date', direction: 'asc' }}
                  empty={{
                    title: 'No transactions in this period',
                    message: 'Widen the dates, or pick "All history".',
                  }}
                  dense
                />
              </Card>
              {offAccount && (
                <p className="mt-2 text-xs text-ink-subtle">
                  Lines marked <span className="font-medium">off account</span> are shown for
                  completeness but do not move the balance: laybys and their instalments, refunds
                  against sales already settled, and invoice history carried over from IQ, which is
                  already inside the opening balance.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

/**
 * Server-side search, not a dropdown of every customer: the book carries 2,492
 * accounts, and the counter searches by whatever the customer says — their
 * name, the account code on their old IQ statement, or a phone number.
 */
function CustomerSearch({
  value,
  onPick,
}: {
  value: CustomerRow | null;
  onPick: (customer: CustomerRow) => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<CustomerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (!open || q.length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setBusy(true);
      const like = `%${q.replace(/[%,]/g, '')}%`;
      void supabase
        .from('customers')
        .select('*')
        .or(`name.ilike.${like},account_code.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
        .order('name')
        .limit(20)
        .then(({ data }) => {
          if (cancelled) return;
          setResults(data ?? []);
          setBusy(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, open]);

  return (
    <div>
      <Input
        label="Client"
        value={term}
        placeholder="Search name, account, phone or email"
        leading={<Search className="h-4 w-4" />}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        hint={value ? `Showing ${value.name ?? value.email ?? 'this account'}` : undefined}
      />
      {open && term.trim().length >= 2 && (
        <div className="relative">
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {busy && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
            {!busy && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">No customer matches that.</li>
            )}
            {results.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-sunken"
                  onClick={() => {
                    onPick(customer);
                    setTerm(customer.name ?? customer.email ?? '');
                    setOpen(false);
                  }}
                >
                  <span className="text-sm font-medium text-ink">{customer.name ?? '—'}</span>
                  <span className="text-xs text-ink-muted">
                    {[customer.account_code, customer.phone, customer.email]
                      .filter(Boolean)
                      .join('  ·  ') || 'no contact details'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
