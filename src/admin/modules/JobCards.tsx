import { useState } from 'react';
import {
  BadgeCheck,
  Copy,
  Download,
  FileText,
  MessageCircle,
  Plus,
  Search,
  Smartphone,
} from 'lucide-react';
import type { JobCardChecks, JobCardRow } from '@/lib/database.types';
import {
  jobCardUrl,
  jobCardWhatsAppLink,
  jobCards,
  quoteWhatsAppLink,
  useJobCards,
  useSendQuote,
} from '@/data/jobCards';
import { useAuth } from '@/auth/AuthProvider';
import {
  JOB_CARD_CHECKS,
  JOB_CARD_HANDLING_FEE,
  JOB_CARD_QUOTE_THRESHOLD,
  JOB_CARD_STATUSES,
  JOB_CARD_STATUS_TONE,
} from '@/lib/constants';
import { downloadJobCardPdf } from '@/lib/jobCardPdf';
import { formatDate, formatDateTime, money, relativeTime, toNumber } from '@/lib/format';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Input,
  Modal,
  Notice,
  PatternLock,
  Select,
  Textarea,
  type Column,
  type Tone,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

export default function JobCards() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<JobCardRow | 'new' | null>(null);

  const list = useJobCards({ search, status: status || undefined });

  const columns: Column<JobCardRow>[] = [
    {
      key: 'number',
      header: 'No.',
      render: (card) => (
        <span className="tabular font-display text-base font-bold text-brand-300">
          {card.job_number}
        </span>
      ),
      sortValue: (card) => card.job_number,
      width: '5.5rem',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (card) => (
        <div className="min-w-0">
          <p className="truncate text-ink">{card.customer_name}</p>
          <p className="truncate text-xs text-ink-subtle">{card.customer_phone}</p>
        </div>
      ),
      sortValue: (card) => card.customer_name,
    },
    {
      key: 'handset',
      header: 'Handset',
      render: (card) => (
        <div className="min-w-0">
          <p className="truncate text-sm text-ink">{card.handset_type ?? '—'}</p>
          <p className="truncate font-mono text-2xs text-ink-subtle">{card.imei ?? ''}</p>
        </div>
      ),
      sortValue: (card) => card.handset_type ?? '',
    },
    {
      key: 'fault',
      header: 'Fault',
      secondary: true,
      render: (card) => (
        <span className="line-clamp-2 text-sm text-ink-muted">{card.fault ?? '—'}</span>
      ),
    },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      render: (card) => <span className="tabular font-medium">{money(card.cost)}</span>,
      sortValue: (card) => Number(card.cost),
    },
    {
      key: 'accepted',
      header: 'Signed',
      render: (card) =>
        card.accepted_at ? (
          <Badge tone="success" size="sm" icon={<BadgeCheck className="h-3 w-3" />}>
            Yes
          </Badge>
        ) : (
          <Badge tone="warn" size="sm">
            Waiting
          </Badge>
        ),
      sortValue: (card) => (card.accepted_at ? 1 : 0),
    },
    {
      key: 'status',
      header: 'Status',
      render: (card) => (
        <Badge tone={(JOB_CARD_STATUS_TONE[card.status] ?? 'neutral') as Tone} size="sm">
          {card.status}
        </Badge>
      ),
      sortValue: (card) => card.status,
    },
    {
      key: 'age',
      header: 'Booked in',
      secondary: true,
      render: (card) => (
        <span className="text-xs text-ink-muted" title={formatDateTime(card.created_at)}>
          {relativeTime(card.created_at)}
        </span>
      ),
      sortValue: (card) => card.created_at,
    },
  ];

  return (
    <>
      <ModuleHeader
        title="Job Cards"
        description="Repair intake. Customers sign on their own phone and get a PDF."
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
            New job card
          </Button>
        }
      />

      <div className="p-6">
        <div className="mb-4 flex flex-wrap gap-3">
          <Input
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Card number, name, phone, IMEI, handset…"
            leading={<Search className="h-4 w-4" />}
            containerClassName="min-w-64 flex-1"
          />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="All statuses"
            options={JOB_CARD_STATUSES.map((s) => ({ value: s, label: s }))}
            containerClassName="w-56"
          />
        </div>

        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <DataTable
            rows={list.data ?? []}
            columns={columns}
            rowKey={(card) => card.id}
            loading={list.isLoading}
            onRowClick={setEditing}
            defaultSort={{ key: 'number', direction: 'desc' }}
            empty={{
              title: 'No job cards yet',
              message: 'Book in a repair to create the first one.',
              action: <Button onClick={() => setEditing('new')}>New job card</Button>,
            }}
          />
        </div>
      </div>

      {editing && <JobCardDialog card={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const BLANK = {
  customer_name: '',
  customer_phone: '',
  customer_email: '',
  handset_type: '',
  imei: '',
  fault: '',
  physical_condition: '',
  pattern_pin: '',
  deposit: '',
  cost: '',
  technician: '',
  status: 'Awaiting acceptance',
  notes: '',
};

function JobCardDialog({ card, onClose }: { card: JobCardRow | 'new'; onClose: () => void }) {
  const toast = useToast();
  const { profile } = useAuth();
  const create = jobCards.useCreate();
  const update = jobCards.useUpdate();
  const remove = jobCards.useRemove();
  const sendQuote = useSendQuote();

  const isNew = card === 'new';
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [saved, setSaved] = useState<JobCardRow | null>(isNew ? null : card);

  const [checks, setChecks] = useState<JobCardChecks>(() => (isNew ? {} : (card.checks ?? {})));
  const [form, setForm] = useState(() =>
    isNew
      ? BLANK
      : {
          customer_name: card.customer_name,
          customer_phone: card.customer_phone,
          customer_email: card.customer_email ?? '',
          handset_type: card.handset_type ?? '',
          imei: card.imei ?? '',
          fault: card.fault ?? '',
          physical_condition: card.physical_condition ?? '',
          pattern_pin: card.pattern_pin ?? '',
          deposit: String(card.deposit ?? ''),
          cost: String(card.cost ?? ''),
          technician: card.technician ?? '',
          status: card.status,
          notes: card.notes ?? '',
        },
  );

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(): Promise<JobCardRow | null> {
    if (!form.customer_name.trim() || !form.customer_phone.trim()) {
      toast.warn('Name and contact number are required');
      return null;
    }

    const values = {
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      customer_email: form.customer_email.trim() || null,
      handset_type: form.handset_type.trim() || null,
      imei: form.imei.trim() || null,
      fault: form.fault.trim() || null,
      physical_condition: form.physical_condition.trim() || null,
      pattern_pin: form.pattern_pin.trim() || null,
      deposit: toNumber(form.deposit),
      cost: toNumber(form.cost),
      handling_fee: JOB_CARD_HANDLING_FEE,
      checks,
      technician: form.technician.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      created_by: profile?.full_name ?? profile?.email ?? null,
    };

    try {
      if (isNew || !saved) {
        const created = await create.mutateAsync(values);
        setSaved(created);
        toast.success(`Job card ${created.job_number} created`, 'Now send it to the customer.');
        return created;
      }
      const updated = await update.mutateAsync({ id: saved.id, values });
      setSaved(updated);
      toast.success('Job card saved');
      return updated;
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined);
      return null;
    }
  }

  /** Save first if needed — the WhatsApp link needs a persisted token. */
  async function ensureSaved(): Promise<JobCardRow | null> {
    if (saved) return saved;
    return save();
  }

  async function sendWhatsApp() {
    const record = await ensureSaved();
    if (!record) return;
    window.open(jobCardWhatsAppLink(record), '_blank', 'noopener');
  }

  async function copyLink() {
    const record = await ensureSaved();
    if (!record) return;
    try {
      await navigator.clipboard.writeText(jobCardUrl(record.accept_token));
      toast.success('Link copied');
    } catch {
      toast.warn('Could not copy', jobCardUrl(record.accept_token));
    }
  }

  async function downloadPdf() {
    const record = await ensureSaved();
    if (!record) return;
    try {
      await downloadJobCardPdf(record);
    } catch (error) {
      toast.error('Could not build the PDF', error instanceof Error ? error.message : undefined);
    }
  }

  const needsQuoteApproval = toNumber(form.cost) > JOB_CARD_QUOTE_THRESHOLD;

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={saved ? `Job Card ${saved.job_number}` : 'New job card'}
        description={
          saved?.accepted_at
            ? `Accepted by ${saved.accepted_name} on ${formatDate(saved.accepted_at)}`
            : 'The customer signs on their own phone via a WhatsApp link.'
        }
        size="xl"
        footer={
          <>
            {saved && !isNew && (
              <Button variant="danger" className="mr-auto" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button onClick={save} loading={create.isPending || update.isPending}>
              {saved ? 'Save changes' : 'Create job card'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {saved && (
            <div className="rounded-lg border border-hairline bg-raised p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="success"
                  icon={<MessageCircle className="h-4 w-4" />}
                  onClick={sendWhatsApp}
                >
                  Send via WhatsApp
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="h-4 w-4" />}
                  onClick={copyLink}
                >
                  Copy link
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Download className="h-4 w-4" />}
                  onClick={downloadPdf}
                >
                  Download PDF
                </Button>
                {needsQuoteApproval && (
                  <Button
                    size="sm"
                    variant="gold"
                    icon={<FileText className="h-4 w-4" />}
                    onClick={() => setQuoteOpen(true)}
                  >
                    Send quote for approval
                  </Button>
                )}
              </div>

              {saved.accepted_at ? (
                <div className="mt-3 flex items-center gap-3 border-t border-hairline pt-3">
                  {saved.accepted_signature && (
                    <img
                      src={saved.accepted_signature}
                      alt={`Signature of ${saved.accepted_name}`}
                      className="h-12 rounded bg-white px-1"
                    />
                  )}
                  <div className="text-xs">
                    <p className="font-medium text-success">
                      Signed by {saved.accepted_name}
                    </p>
                    <p className="text-ink-subtle">{formatDateTime(saved.accepted_at)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-warn">
                  Not yet accepted. The customer must open the link and sign before work starts.
                </p>
              )}

              {saved.quote_sent_at && (
                <p className="mt-2 border-t border-hairline pt-2 text-xs">
                  Quote {money(saved.quote_amount)} sent {relativeTime(saved.quote_sent_at)} —{' '}
                  {saved.quote_responded_at ? (
                    <span className={saved.quote_approved ? 'text-success' : 'text-danger'}>
                      {saved.quote_approved ? 'approved' : 'declined'} by the customer
                    </span>
                  ) : (
                    <span className="text-warn">awaiting response</span>
                  )}
                </p>
              )}
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Customer details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Name & surname"
                required
                value={form.customer_name}
                onChange={(e) => set('customer_name', e.target.value)}
                data-autofocus
              />
              <Input
                label="Contact no."
                required
                type="tel"
                value={form.customer_phone}
                onChange={(e) => set('customer_phone', e.target.value)}
                placeholder="+264 81 …"
                hint="Used for the WhatsApp acceptance link."
              />
              <Input
                label="Email (optional)"
                type="email"
                value={form.customer_email}
                onChange={(e) => set('customer_email', e.target.value)}
                containerClassName="sm:col-span-2"
              />
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Handset details
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Type of handset"
                value={form.handset_type}
                onChange={(e) => set('handset_type', e.target.value)}
                placeholder="Samsung A16 128GB"
                leading={<Smartphone className="h-4 w-4" />}
              />
              <Input
                label="IMEI no. (15 digits)"
                value={form.imei}
                onChange={(e) => set('imei', e.target.value.replace(/\D/g, '').slice(0, 15))}
                inputMode="numeric"
                error={
                  form.imei && form.imei.length !== 15
                    ? `${form.imei.length} of 15 digits`
                    : null
                }
              />
              <Textarea
                label="Fault"
                rows={2}
                value={form.fault}
                onChange={(e) => set('fault', e.target.value)}
                className="sm:col-span-2"
              />
              <Textarea
                label="Physical condition of handset"
                rows={2}
                value={form.physical_condition}
                onChange={(e) => set('physical_condition', e.target.value)}
                className="sm:col-span-2"
                hint="Record existing damage now — it protects you later."
              />

              <Input
                label="Deposit (N$)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.deposit}
                onChange={(e) => set('deposit', e.target.value)}
              />
              <Input
                label="Cost (N$)"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={(e) => set('cost', e.target.value)}
                hint={
                  needsQuoteApproval
                    ? `Above N$${JOB_CARD_QUOTE_THRESHOLD} — needs customer approval first.`
                    : `Under N$${JOB_CARD_QUOTE_THRESHOLD}; no approval needed.`
                }
              />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Pattern / PIN
              </h3>
              <PatternLock
                value={/^[1-9](-[1-9])*$/.test(form.pattern_pin) ? form.pattern_pin : ''}
                onChange={(pattern) => set('pattern_pin', pattern)}
              />
              <Input
                label="Or a PIN / password"
                value={/^[1-9](-[1-9])*$/.test(form.pattern_pin) ? '' : form.pattern_pin}
                onChange={(e) => set('pattern_pin', e.target.value)}
                containerClassName="mt-3"
                hint="Never shown on the customer's link."
              />
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Checked by technician
              </h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-lg border border-hairline p-3">
                {JOB_CARD_CHECKS.map((check) => (
                  <Checkbox
                    key={check.key}
                    label={check.label}
                    checked={Boolean(checks[check.key as keyof JobCardChecks])}
                    onChange={(e) =>
                      setChecks((current) => ({ ...current, [check.key]: e.target.checked }))
                    }
                  />
                ))}
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Input
                  label="Technician"
                  value={form.technician}
                  onChange={(e) => set('technician', e.target.value)}
                />
                <Select
                  label="Status"
                  value={form.status}
                  onChange={(e) => set('status', e.target.value)}
                  options={JOB_CARD_STATUSES.map((s) => ({ value: s, label: s }))}
                />
              </div>
            </div>
          </section>

          <Textarea
            label="Internal notes"
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            hint="Staff only — never shown to the customer."
          />
        </div>
      </Modal>

      {quoteOpen && saved && (
        <QuoteDialog
          card={saved}
          defaultAmount={toNumber(form.cost)}
          onClose={() => setQuoteOpen(false)}
          onSent={(updated) => {
            setSaved(updated);
            setQuoteOpen(false);
          }}
          sending={sendQuote.isPending}
          send={sendQuote.mutateAsync}
        />
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!saved) return;
          try {
            await remove.mutateAsync(saved.id);
            toast.success(`Job card ${saved.job_number} deleted`);
            onClose();
          } catch (error) {
            toast.error('Could not delete', error instanceof Error ? error.message : undefined);
          }
          setConfirmDelete(false);
        }}
        title="Delete this job card?"
        message="The customer's signed acceptance is deleted with it. Consider changing the status instead."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </>
  );
}

function QuoteDialog({
  card,
  defaultAmount,
  onClose,
  onSent,
  sending,
  send,
}: {
  card: JobCardRow;
  defaultAmount: number;
  onClose: () => void;
  onSent: (card: JobCardRow) => void;
  sending: boolean;
  send: (input: { id: number; amount: number; note?: string | null }) => Promise<JobCardRow>;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState(String(defaultAmount || ''));
  const [note, setNote] = useState('');

  async function submit() {
    const value = toNumber(amount);
    if (value <= 0) {
      toast.warn('Enter the quoted amount');
      return;
    }

    try {
      const updated = await send({ id: card.id, amount: value, note: note.trim() || null });
      window.open(quoteWhatsAppLink(updated), '_blank', 'noopener');
      toast.success('Quote sent for approval');
      onSent(updated);
    } catch (error) {
      toast.error('Could not send the quote', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Send quote for approval"
      description={`Job Card ${card.job_number} · ${card.customer_name}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={submit} loading={sending} icon={<MessageCircle className="h-4 w-4" />}>
            Send on WhatsApp
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Notice tone="info">
          Your terms require confirmation before starting any repair over N$
          {JOB_CARD_QUOTE_THRESHOLD}. The customer approves or declines on the same link.
        </Notice>
        <Input
          label="Quoted amount (N$)"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          data-autofocus
        />
        <Textarea
          label="What the repair involves"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Screen replacement, including fitting and 30-day parts warranty."
        />
      </div>
    </Modal>
  );
}
