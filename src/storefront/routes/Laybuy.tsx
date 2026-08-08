import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CalendarClock, Lock } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useProduct } from '@/data/products';
import {
  LAYBY_TERMS,
  laybyDeposit,
  laybySuggestedInstalment,
  useOpenLayby,
  usePayLayby,
} from '@/data/laybys';
import { createDpoPayment, dpoPayUrl, verifyDpoPayment } from '@/lib/dpo';
import { money, formatDate } from '@/lib/format';
import { Button, Card, Checkbox, Input, LoadingScreen, Notice, useToast } from '@/ui';
import { useSeo } from '../seo';

/**
 * Laybuy on the online shop.
 *
 * A 10% deposit by card opens the laybuy and reserves the phone; the rest is
 * paid off in any amounts within 3 months — online by card, or in the shop —
 * and the phone is handed over once fully paid. No refunds on laybuys: a
 * lapsed one becomes store credit or an extension, at the shop's discretion.
 * The database enforces all of that; these pages only collect the money.
 */

const PENDING_OPEN = 'laybuy-pending';
const PENDING_PAY = 'laybuy-pay-pending';

interface PendingOpen {
  reference: string;
  productId: number;
  color: string | null;
  name: string;
  phone: string;
  email: string;
}

interface PendingPay {
  reference: string;
  laybyId: number;
  amount: number;
}

/** Kicks off a DPO card payment for an instalment. Used here and in Account. */
export async function startInstalmentPayment(options: {
  laybyId: number;
  laybyNumber: string;
  amount: number;
  email: string;
  name: string;
}) {
  const reference = `LBPAY-${options.laybyId}-${Date.now()}`;
  const pending: PendingPay = {
    reference,
    laybyId: options.laybyId,
    amount: options.amount,
  };
  sessionStorage.setItem(PENDING_PAY, JSON.stringify(pending));

  const token = await createDpoPayment({
    amount: options.amount,
    reference,
    description: `Laybuy instalment ${options.laybyNumber}`,
    redirectUrl: `${window.location.origin}/laybuy/pay/${options.laybyId}/confirm`,
    customerEmail: options.email,
    customerFirstName: options.name,
  });
  window.location.assign(dpoPayUrl(token.transToken));
}

/* ── Step 1: the offer, the terms, the deposit ───────────────────────────── */

export function LaybuyStart() {
  useSeo({ title: 'Laybuy', path: '/laybuy', noIndex: true });

  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user, profile, isAuthenticated } = useAuth();
  const { data: product, isLoading } = useProduct(Number(id));

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile?.full_name && !name) setName(profile.full_name);
    if (profile?.email && !email) setEmail(profile.email);
    if (profile?.phone && !phone) setPhone(profile.phone);
  }, [profile, name, email, phone]);

  if (isLoading) return <LoadingScreen label="Loading…" />;
  if (!product || !product.active || product.category !== 'Smartphones') {
    return <Navigate to="/shop" replace />;
  }
  if (!isAuthenticated) {
    return <Navigate to={`/account/sign-in?next=/laybuy/${id}`} replace />;
  }

  const price = Number(product.price);
  const deposit = laybyDeposit(price);
  const monthly = laybySuggestedInstalment(price - deposit);
  const color = params.get('color');
  const due = new Date();
  due.setMonth(due.getMonth() + LAYBY_TERMS.months);

  async function payDeposit() {
    if (!agreed) {
      toast.warn('Please accept the terms', 'Laybuys are not refundable.');
      return;
    }
    setBusy(true);
    try {
      const reference = `LBOPEN-${product!.id}-${user?.id?.slice(0, 8) ?? ''}-${Date.now()}`;
      const pending: PendingOpen = {
        reference,
        productId: product!.id,
        color,
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim(),
      };
      sessionStorage.setItem(PENDING_OPEN, JSON.stringify(pending));

      const token = await createDpoPayment({
        amount: deposit,
        reference,
        description: `Laybuy deposit — ${product!.name}`.slice(0, 180),
        redirectUrl: `${window.location.origin}/laybuy/${product!.id}/confirm`,
        customerEmail: email.trim(),
        customerFirstName: name.trim(),
        customerPhone: phone.trim(),
      });
      window.location.assign(dpoPayUrl(token.transToken));
    } catch (error) {
      setBusy(false);
      toast.error(
        'Could not start the payment',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="flex items-center gap-2 font-display text-3xl font-bold tracking-tight text-ink">
        <CalendarClock aria-hidden className="h-7 w-7 text-brand-400" />
        Lay-buy this phone
      </h1>

      <Card className="mt-6 p-5">
        <p className="font-display text-lg font-semibold text-ink">{product.name}</p>
        {color && <p className="text-sm text-ink-muted">Colour: {color}</p>}

        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-muted">Price</dt>
            <dd className="tabular text-ink">{money(price)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt className="text-ink">Deposit due now (10%)</dt>
            <dd className="tabular text-ink">{money(deposit)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Then about</dt>
            <dd className="tabular text-ink">{money(monthly)} / month</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-muted">Fully paid by</dt>
            <dd className="tabular text-ink">{formatDate(due.toISOString())}</dd>
          </div>
        </dl>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">Your details</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="Phone"
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+264 …"
          />
          <Input
            label="Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            containerClassName="sm:col-span-2"
          />
        </div>
      </Card>

      <Card className="mt-4 p-5">
        <h2 className="font-display text-lg font-semibold text-ink">The terms, plainly</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>The phone is reserved for you the moment the deposit is paid.</li>
          <li>
            Pay the balance in any amounts, online or in the shop, within {LAYBY_TERMS.months}{' '}
            months. You collect the phone once it is fully paid.
          </li>
          <li>
            <strong className="text-ink">Laybuy payments are not refundable.</strong> If the laybuy
            lapses, what you have paid can go toward something else in the shop, or the shop may
            agree to extend the laybuy.
          </li>
        </ul>
        <div className="mt-3">
          <Checkbox
            label="I understand and accept the laybuy terms, including that payments are not refundable."
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
        </div>
      </Card>

      <Button
        size="lg"
        fullWidth
        className="mt-5"
        loading={busy}
        icon={<Lock className="h-4 w-4" />}
        onClick={() => void payDeposit()}
      >
        Pay {money(deposit)} deposit by card
      </Button>
      <p className="mt-3 text-center text-xs text-ink-subtle">
        You will be taken to DPO, our card payment provider, and brought straight back.
      </p>
      <p className="mt-1 text-center text-xs text-ink-subtle">
        <button className="underline" onClick={() => navigate(-1)}>
          Go back
        </button>
      </p>
    </div>
  );
}

/* ── Step 2: back from DPO with the deposit — open the laybuy ────────────── */

export function LaybuyConfirm() {
  useSeo({ title: 'Confirming laybuy', path: '/laybuy', noIndex: true });

  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const open = useOpenLayby();
  const ran = useRef(false);

  const [state, setState] = useState<
    | { phase: 'checking' }
    | { phase: 'done'; laybyNumber: string }
    | { phase: 'failed'; message: string }
  >({ phase: 'checking' });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const token =
          params.get('TransactionToken') ?? params.get('TransID') ?? params.get('ID');
        if (!token) throw new Error('The payment reference is missing from the return link.');

        const raw = sessionStorage.getItem(PENDING_OPEN);
        if (!raw) {
          throw new Error(
            'This browser has no record of the laybuy being started. If your card was charged, contact the shop — the payment reference is safe with DPO.',
          );
        }
        const pending = JSON.parse(raw) as PendingOpen;

        const verdict = await verifyDpoPayment(token);
        if (!verdict.paid) {
          throw new Error(verdict.explanation || 'The payment was not completed.');
        }

        const reply = await open.mutateAsync({
          productId: pending.productId,
          color: pending.color,
          customerName: pending.name,
          customerPhone: pending.phone,
          customerEmail: pending.email,
          reference: pending.reference,
        });

        sessionStorage.removeItem(PENDING_OPEN);
        setState({ phase: 'done', laybyNumber: reply.layby_number ?? '' });
      } catch (error) {
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : 'Something went wrong.',
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === 'checking') return <LoadingScreen label="Confirming your deposit…" />;

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      {state.phase === 'done' ? (
        <>
          <Notice tone="success" title={`Laybuy ${state.laybyNumber} is open`}>
            Your deposit is in and the phone is reserved for you. Pay the balance any time within{' '}
            {LAYBY_TERMS.months} months — online from your account, or in the shop.
          </Notice>
          <div className="mt-5 flex gap-3">
            <Button onClick={() => window.location.assign('/account')}>View my laybuys</Button>
            <Link to="/shop" className="self-center text-sm text-ink-muted underline">
              Keep shopping
            </Link>
          </div>
        </>
      ) : (
        <>
          <Notice tone="danger" title="The laybuy could not be opened">
            {state.message}
          </Notice>
          <div className="mt-5 flex gap-3">
            <Button onClick={() => window.history.back()}>Try again</Button>
            <Link to={`/laybuy/${id}`} className="self-center text-sm text-ink-muted underline">
              Back to the laybuy page
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Step 3, repeated: back from DPO with an instalment ──────────────────── */

export function LaybuyPayConfirm() {
  useSeo({ title: 'Confirming payment', path: '/laybuy', noIndex: true });

  const [params] = useSearchParams();
  const pay = usePayLayby();
  const ran = useRef(false);

  const [state, setState] = useState<
    | { phase: 'checking' }
    | { phase: 'done'; balance: number; completed: boolean }
    | { phase: 'failed'; message: string }
  >({ phase: 'checking' });

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      try {
        const token =
          params.get('TransactionToken') ?? params.get('TransID') ?? params.get('ID');
        if (!token) throw new Error('The payment reference is missing from the return link.');

        const raw = sessionStorage.getItem(PENDING_PAY);
        if (!raw) {
          throw new Error(
            'This browser has no record of the payment being started. If your card was charged, contact the shop — the payment reference is safe with DPO.',
          );
        }
        const pending = JSON.parse(raw) as PendingPay;

        const verdict = await verifyDpoPayment(token);
        if (!verdict.paid) {
          throw new Error(verdict.explanation || 'The payment was not completed.');
        }

        // DPO's verified amount outranks what this browser remembers.
        const amount = verdict.amount > 0 ? verdict.amount : pending.amount;
        const reply = await pay.mutateAsync({
          laybyId: pending.laybyId,
          amount,
          reference: pending.reference,
        });

        sessionStorage.removeItem(PENDING_PAY);
        setState({
          phase: 'done',
          balance: reply.balance ?? 0,
          completed: reply.status === 'completed',
        });
      } catch (error) {
        setState({
          phase: 'failed',
          message: error instanceof Error ? error.message : 'Something went wrong.',
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === 'checking') return <LoadingScreen label="Confirming your payment…" />;

  return (
    <div className="mx-auto max-w-xl px-4 py-14">
      {state.phase === 'done' ? (
        <>
          <Notice
            tone="success"
            title={state.completed ? 'Paid in full — the phone is yours' : 'Payment received'}
          >
            {state.completed
              ? 'Your laybuy is fully paid. Come collect your phone — bring the account you paid with.'
              : `Balance remaining: ${money(state.balance)}.`}
          </Notice>
          <div className="mt-5">
            <Button onClick={() => window.location.assign('/account')}>Back to my account</Button>
          </div>
        </>
      ) : (
        <>
          <Notice tone="danger" title="The payment could not be recorded">
            {state.message}
          </Notice>
          <div className="mt-5">
            <Button onClick={() => window.location.assign('/account')}>Back to my account</Button>
          </div>
        </>
      )}
    </div>
  );
}
