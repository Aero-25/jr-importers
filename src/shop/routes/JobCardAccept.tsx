import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Check, Download, Phone, X } from 'lucide-react';
import {
  useAcceptJobCard,
  useGuestJobCard,
  useRespondToQuote,
  type PublicJobCard,
} from '@/data/jobCards';
import {
  JOB_CARD_CONSENT,
  JOB_CARD_MEMORY_WARNING,
  JOB_CARD_TERMS,
  STORE,
} from '@/lib/constants';
import { downloadJobCardPdf } from '@/lib/jobCardPdf';
import { formatDate, formatDateTime, money } from '@/lib/format';
import {
  Button,
  Card,
  Checkbox,
  ErrorState,
  Input,
  LoadingScreen,
  Notice,
  SignaturePad,
  useToast,
} from '@/ui';
import { useSeo } from '../seo';

/**
 * The link a customer receives on WhatsApp.
 *
 * Deliberately outside the shop chrome: someone arriving here is completing a
 * repair booking, not browsing, and half of them will be standing in a queue.
 * The whole page is one column and works on a small screen.
 */
export default function JobCardAccept() {
  const { token } = useParams<{ token: string }>();
  const { data: card, isLoading, isError, error, refetch } = useGuestJobCard(token);

  useSeo({ title: 'Your job card', noIndex: true });

  if (isLoading) return <LoadingScreen label="Loading your job card…" />;

  if (isError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <AlertTriangle aria-hidden className="mx-auto h-12 w-12 text-warn" />
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Link not valid</h1>
        <p className="mt-2 text-ink-muted">
          This job card link has expired or is incorrect. Please contact us and we will send a new
          one.
        </p>
        <a
          href={`tel:${STORE.phone.replace(/\s/g, '')}`}
          className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-brand-500 px-5 text-sm font-medium text-white"
        >
          <Phone aria-hidden className="h-4 w-4" />
          Call {STORE.phone}
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
      <Header card={card} />

      {/* A pending quote is the more urgent ask, so it comes first. */}
      {card.quote_sent_at && !card.quote_responded_at && token && (
        <QuoteApproval card={card} token={token} />
      )}

      <Details card={card} />

      {card.accepted_at ? (
        <Accepted card={card} />
      ) : (
        token && <AcceptForm card={card} token={token} />
      )}

      <footer className="mt-8 text-center text-xs text-ink-subtle">
        <p className="font-medium text-ink-muted">{STORE.name}</p>
        <p>{STORE.address}</p>
        <p>
          {STORE.phone} · {STORE.email}
        </p>
      </footer>
    </div>
  );
}

function Header({ card }: { card: PublicJobCard }) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div className="flex items-center gap-3">
        <img src="/icon.svg" alt="" width={40} height={40} className="h-10 w-10" />
        <div>
          <p className="font-display text-lg font-bold leading-tight text-ink">JR Importers</p>
          <p className="text-xs text-ink-muted">{STORE.address}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-2xs font-semibold uppercase tracking-wider text-ink-muted">Job card</p>
        <p className="tabular font-display text-2xl font-bold text-brand-400">{card.job_number}</p>
        <p className="text-2xs text-ink-subtle">{formatDate(card.created_at)}</p>
      </div>
    </header>
  );
}

function Details({ card }: { card: PublicJobCard }) {
  const rows: Array<[string, string | null | undefined]> = [
    ['Name', card.customer_name],
    ['Contact', card.customer_phone],
    ['Handset', card.handset_type],
    ['IMEI', card.imei],
    ['Reported fault', card.fault],
    ['Condition received', card.physical_condition],
  ];

  return (
    <Card className="mb-4 p-4">
      <h2 className="font-display text-base font-semibold text-ink">Booking details</h2>

      <dl className="mt-3 divide-y divide-hairline">
        {rows
          .filter(([, value]) => Boolean(value))
          .map(([label, value]) => (
            <div key={label} className="grid grid-cols-3 gap-3 py-2 text-sm">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="col-span-2 break-words text-ink">{value}</dd>
            </div>
          ))}

        <div className="grid grid-cols-3 gap-3 py-2 text-sm">
          <dt className="text-ink-muted">Deposit paid</dt>
          <dd className="tabular col-span-2 text-ink">{money(card.deposit)}</dd>
        </div>
        {Number(card.cost) > 0 && (
          <div className="grid grid-cols-3 gap-3 py-2 text-sm">
            <dt className="text-ink-muted">Cost</dt>
            <dd className="tabular col-span-2 text-ink">{money(card.cost)}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}

function Terms() {
  return (
    <div className="rounded-lg border border-hairline bg-canvas p-3">
      <h3 className="text-xs font-bold uppercase tracking-wide text-ink">Terms and conditions</h3>
      <ul className="mt-2 space-y-1.5">
        {JOB_CARD_TERMS.map((term) => (
          <li key={term} className="flex gap-2 text-xs leading-relaxed text-ink-muted">
            <span aria-hidden className="text-ink-subtle">
              •
            </span>
            <span>{term}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-bold leading-relaxed text-danger">
        {JOB_CARD_MEMORY_WARNING}
      </p>
    </div>
  );
}

function AcceptForm({ card, token }: { card: PublicJobCard; token: string }) {
  const toast = useToast();
  const accept = useAcceptJobCard();

  const [name, setName] = useState(card.customer_name);
  const [signature, setSignature] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  async function submit() {
    if (!agreed) {
      toast.warn('Please tick the box', 'You need to confirm you have read the terms.');
      return;
    }
    if (!name.trim()) {
      toast.warn('Please enter your full name');
      return;
    }
    if (!signature) {
      toast.warn('Please sign', 'Draw your signature in the box above.');
      return;
    }

    try {
      const result = await accept.mutateAsync({ token, name, signature });
      toast.success(
        result.already ? 'Already accepted' : 'Thank you — job card accepted',
        'Your PDF is downloading.',
      );
      // The signature is not returned by the guest RPC, so pass the local copy
      // straight into the PDF rather than re-fetching something we cannot see.
      await downloadJobCardPdf({
        ...result.jobCard,
        accepted_signature: signature,
      });
    } catch (error) {
      toast.error('Could not accept', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Card className="p-4">
      <h2 className="font-display text-base font-semibold text-ink">Accept your job card</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Please read the terms, sign below, and we will start work on your handset.
      </p>

      <div className="mt-4 space-y-4">
        <Terms />

        <Input
          label="Your full name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />

        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Signature <span className="text-danger">*</span>
          </p>
          <SignaturePad onChange={setSignature} />
        </div>

        <Checkbox
          label={JOB_CARD_CONSENT}
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />

        <Button
          fullWidth
          size="lg"
          onClick={submit}
          loading={accept.isPending}
          disabled={!agreed || !signature}
          icon={<Check className="h-4 w-4" />}
        >
          Accept and receive my PDF
        </Button>
      </div>
    </Card>
  );
}

function Accepted({ card }: { card: PublicJobCard }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      // The stored signature stays server-side; this copy is the record of
      // acceptance rather than a second signed original.
      await downloadJobCardPdf(card);
    } catch (error) {
      toast.error('Could not build the PDF', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <BadgeCheck aria-hidden className="mt-0.5 h-6 w-6 shrink-0 text-success" />
        <div>
          <h2 className="font-display text-base font-semibold text-ink">Job card accepted</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            Accepted by {card.accepted_name} on {formatDateTime(card.accepted_at)}.
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-raised p-3">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Current status</p>
        <p className="font-display text-lg font-semibold text-ink">{card.status}</p>
      </div>

      <Button
        fullWidth
        variant="secondary"
        className="mt-4"
        onClick={download}
        loading={busy}
        icon={<Download className="h-4 w-4" />}
      >
        Download my job card PDF
      </Button>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs text-ink-subtle hover:text-ink">
          View the terms you accepted
        </summary>
        <div className="mt-2">
          <Terms />
        </div>
      </details>
    </Card>
  );
}

/** Clause 9: repairs over N$350 need the customer's go-ahead. */
function QuoteApproval({ card, token }: { card: PublicJobCard; token: string }) {
  const toast = useToast();
  const respond = useRespondToQuote();

  async function answer(approved: boolean) {
    try {
      await respond.mutateAsync({ token, approved });
      toast.success(
        approved ? 'Repair approved' : 'Repair declined',
        approved ? 'We will start work right away.' : 'We will contact you about collection.',
      );
    } catch (error) {
      toast.error('Could not send your response', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Card className="mb-4 border-gold-500/40 p-4">
      <Notice tone="warn" title="Your approval is needed">
        We have assessed your handset. Repairs over N$350 need your go-ahead before we start.
      </Notice>

      <div className="mt-3 rounded-lg bg-raised p-3">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Quoted repair cost</p>
        <p className="tabular font-display text-3xl font-bold text-ink">
          {money(card.quote_amount)}
        </p>
        {card.quote_note && <p className="mt-1.5 text-sm text-ink-muted">{card.quote_note}</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <Button
          fullWidth
          variant="success"
          size="lg"
          onClick={() => answer(true)}
          loading={respond.isPending}
          icon={<Check className="h-4 w-4" />}
        >
          Approve repair
        </Button>
        <Button
          fullWidth
          variant="outline"
          size="lg"
          onClick={() => answer(false)}
          disabled={respond.isPending}
          icon={<X className="h-4 w-4" />}
        >
          Decline
        </Button>
      </div>
    </Card>
  );
}
