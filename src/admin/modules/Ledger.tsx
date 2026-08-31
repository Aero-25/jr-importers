import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import type { AccountTransactionRow } from '@/lib/database.types';
import { customers, suppliers } from '@/data/resources';
import { useAuth } from '@/auth/AuthProvider';
import { formatDate, money, round2, toDateInput, toNumber } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Button,
  Card,
  DataTable,
  Input,
  Modal,
  Select,
  StatTile,
  Textarea,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

type Kind = 'debtor' | 'creditor';

interface PartyBalance {
  id: string;
  name: string;
  balance: number;
  lastActivity: string | null;
}

/**
 * Debtors and creditors, both driven by `account_transactions`.
 *
 * Sign convention, per the migration: positive raises what is owed (a charge),
 * negative reduces it (a payment or credit note). A party's balance is simply
 * the sum of their lines.
 */
export default function Ledger() {
  const [kind, setKind] = useState<Kind>('debtor');
  const [entryOpen, setEntryOpen] = useState(false);

  const ledger = useQuery<AccountTransactionRow[], Error>({
    queryKey: keys.list('account_transactions', { kind }),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('account_transactions')
        .select('*')
        .eq('account_type', kind)
        .order('txn_date', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const balances = useMemo<PartyBalance[]>(() => {
    const map = new Map<string, PartyBalance>();

    for (const row of ledger.data ?? []) {
      // Bills posted for a party not in the book carry a null id; group those
      // by name so two unknown suppliers don't collapse into one balance.
      const partyId = kind === 'debtor' ? row.customer_id : row.supplier_id;
      const id =
        partyId != null ? String(partyId) : `name:${row.party_name ?? 'Unnamed account'}`;
      const existing = map.get(id);
      const amount = Number(row.amount) || 0;

      if (existing) {
        existing.balance = round2(existing.balance + amount);
        if (!existing.lastActivity || row.txn_date > existing.lastActivity) {
          existing.lastActivity = row.txn_date;
        }
      } else {
        map.set(id, {
          id,
          name: row.party_name ?? 'Unnamed account',
          balance: round2(amount),
          lastActivity: row.txn_date,
        });
      }
    }

    return [...map.values()].sort((a, b) => b.balance - a.balance);
  }, [ledger.data, kind]);

  const outstanding = round2(balances.reduce((sum, party) => sum + Math.max(party.balance, 0), 0));
  const overpaid = round2(
    balances.reduce((sum, party) => sum + Math.min(party.balance, 0), 0),
  );

  const balanceColumns: Column<PartyBalance>[] = [
    {
      key: 'name',
      header: kind === 'debtor' ? 'Customer' : 'Supplier',
      render: (party) => <span className="text-ink">{party.name}</span>,
      sortValue: (party) => party.name,
    },
    {
      key: 'last',
      header: 'Last activity',
      secondary: true,
      render: (party) => (
        <span className="text-xs text-ink-muted">{formatDate(party.lastActivity)}</span>
      ),
      sortValue: (party) => party.lastActivity ?? '',
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right',
      render: (party) => (
        <span
          className={cn(
            'tabular font-medium',
            party.balance > 0 ? 'text-warn' : party.balance < 0 ? 'text-info' : 'text-ink-muted',
          )}
        >
          {money(party.balance)}
        </span>
      ),
      sortValue: (party) => party.balance,
    },
  ];

  const txnColumns: Column<AccountTransactionRow>[] = [
    {
      key: 'date',
      header: 'Date',
      render: (row) => <span className="text-sm">{formatDate(row.txn_date)}</span>,
      sortValue: (row) => row.txn_date,
      width: '8rem',
    },
    {
      key: 'party',
      header: 'Account',
      render: (row) => <span className="text-ink">{row.party_name ?? '—'}</span>,
      sortValue: (row) => row.party_name ?? '',
    },
    {
      key: 'type',
      header: 'Type',
      secondary: true,
      render: (row) => <span className="text-sm capitalize text-ink-muted">{row.txn_type}</span>,
      sortValue: (row) => row.txn_type,
    },
    {
      key: 'reference',
      header: 'Reference',
      secondary: true,
      render: (row) => <span className="text-xs text-ink-subtle">{row.reference ?? '—'}</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span
          className={cn(
            'tabular font-medium',
            Number(row.amount) < 0 ? 'text-success' : 'text-ink',
          )}
        >
          {money(row.amount)}
        </span>
      ),
      sortValue: (row) => Number(row.amount),
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Debtors & creditors"
        description="Account balances built from the transaction ledger."
        actions={
          <>
            <Select
              value={kind}
              onChange={(e) => setKind(e.target.value as Kind)}
              aria-label="Ledger"
              options={[
                { value: 'debtor', label: 'Debtors (owed to us)' },
                { value: 'creditor', label: 'Creditors (we owe)' },
              ]}
              containerClassName="w-56"
            />
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEntryOpen(true)}>
              Add entry
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label={kind === 'debtor' ? 'Owed to us' : 'We owe'}
            value={money(outstanding)}
            tone={outstanding > 0 ? 'warn' : 'neutral'}
          />
          <StatTile label="Accounts with a balance" value={balances.filter((p) => p.balance !== 0).length} />
          <StatTile
            label="Credit balances"
            value={money(Math.abs(overpaid))}
            sub="Paid ahead or credited"
            tone="info"
          />
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-hairline px-5 py-3.5">
            <h2 className="font-display text-base font-semibold text-ink">Balances by account</h2>
          </div>
          <DataTable
            rows={balances}
            columns={balanceColumns}
            rowKey={(party) => party.id}
            loading={ledger.isLoading}
            defaultSort={{ key: 'balance', direction: 'desc' }}
            empty={{ title: 'No account activity yet' }}
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-hairline px-5 py-3.5">
            <h2 className="font-display text-base font-semibold text-ink">Transactions</h2>
          </div>
          <DataTable
            rows={ledger.data ?? []}
            columns={txnColumns}
            rowKey={(row) => row.id}
            loading={ledger.isLoading}
            defaultSort={{ key: 'date', direction: 'desc' }}
            empty={{ title: 'No transactions recorded' }}
            dense
          />
        </Card>
      </div>

      {entryOpen && <EntryDialog kind={kind} onClose={() => setEntryOpen(false)} />}
    </>
  );
}

function EntryDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const { profile } = useAuth();

  const customerList = customers.useList({}, { enabled: kind === 'debtor' });
  const supplierList = suppliers.useList({}, { enabled: kind === 'creditor' });

  const [partyId, setPartyId] = useState('');
  const [txnType, setTxnType] = useState(kind === 'debtor' ? 'invoice' : 'bill');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(toDateInput(new Date()));
  const [busy, setBusy] = useState(false);

  const parties =
    kind === 'debtor'
      ? (customerList.data ?? []).map((c) => ({ value: String(c.id), label: c.name ?? c.email ?? String(c.id) }))
      : (supplierList.data ?? []).map((s) => ({ value: String(s.id), label: s.name }));

  // Payments and credit notes reduce the balance, so they post as negatives.
  const isReducing = txnType === 'payment' || txnType === 'credit_note';

  async function save() {
    if (!partyId) {
      toast.warn('Choose an account');
      return;
    }
    const value = toNumber(amount);
    if (value <= 0) {
      toast.warn('Enter an amount greater than zero');
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('account_transactions').insert({
      account_type: kind,
      customer_id: kind === 'debtor' ? partyId : null,
      supplier_id: kind === 'creditor' ? Number(partyId) : null,
      party_name: parties.find((p) => p.value === partyId)?.label ?? null,
      txn_type: txnType,
      amount: isReducing ? -value : value,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
      txn_date: date,
      created_by: profile?.full_name ?? profile?.email ?? null,
    });
    setBusy(false);

    if (error) {
      toast.error('Could not save the entry', error.message);
      return;
    }

    toast.success('Entry recorded');
    void qc.invalidateQueries({ queryKey: keys.table('account_transactions') });
    onClose();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={kind === 'debtor' ? 'New debtor entry' : 'New creditor entry'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Record entry
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          label={kind === 'debtor' ? 'Customer' : 'Supplier'}
          required
          value={partyId}
          onChange={(e) => setPartyId(e.target.value)}
          placeholder="Choose…"
          options={parties}
          containerClassName="sm:col-span-2"
        />
        <Select
          label="Entry type"
          value={txnType}
          onChange={(e) => setTxnType(e.target.value)}
          options={
            kind === 'debtor'
              ? ['invoice', 'payment', 'credit_note', 'opening']
              : ['bill', 'payment', 'credit_note', 'opening']
          }
        />
        <Input
          label="Amount (N$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          hint={isReducing ? 'Recorded as a reduction of the balance.' : 'Increases the balance.'}
        />
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input
          label="Reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Invoice or receipt number"
        />
        <Textarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="sm:col-span-2"
        />
      </div>
    </Modal>
  );
}
