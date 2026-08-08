import { useState, type FormEvent } from 'react';
import { Link, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarClock, LogOut, Package } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { orderItems, useMyOrders } from '@/data/orders';
import { laybySuggestedInstalment, useMyLaybys } from '@/data/laybys';
import type { LaybyRow } from '@/lib/database.types';
import { formatDate, money, toNumber } from '@/lib/format';
import { Button, Card, EmptyState, Input, LoadingScreen, Notice, StatusBadge, useToast } from '@/ui';
import { startInstalmentPayment } from './Laybuy';
import { useSeo } from '../seo';

export default function Account() {
  const { ready, isAuthenticated } = useAuth();
  if (!ready) return <LoadingScreen label="Checking your session…" />;

  return (
    <Routes>
      <Route path="sign-in" element={<SignIn />} />
      <Route path="register" element={<Register />} />
      <Route path="*" element={isAuthenticated ? <Overview /> : <SignIn />} />
    </Routes>
  );
}

function Overview() {
  useSeo({ title: 'My account', noIndex: true });

  const { profile, user, signOut } = useAuth();
  const orders = useMyOrders(user?.email);
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink">
            {profile?.full_name ?? 'My account'}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">{user?.email}</p>
        </div>
        <Button
          variant="secondary"
          icon={<LogOut className="h-4 w-4" />}
          onClick={async () => {
            await signOut();
            navigate('/');
          }}
        >
          Sign out
        </Button>
      </div>

      <LaybySection />

      <section className="mt-8">
        <h2 className="font-display text-xl font-semibold text-ink">Your orders</h2>

        {orders.isLoading ? (
          <LoadingScreen label="Loading orders…" />
        ) : orders.data && orders.data.length > 0 ? (
          <ul className="mt-4 space-y-3">
            {orders.data.map((order) => (
              <li key={order.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs text-ink-muted">
                        {order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-0.5 text-sm text-ink">{formatDate(order.created_at)}</p>
                    </div>
                    <StatusBadge status={order.status} />
                    <p className="tabular font-display text-lg font-semibold text-ink">
                      {money(order.total_amount)}
                    </p>
                  </div>
                  <p className="mt-2 truncate text-xs text-ink-subtle">
                    {orderItems(order)
                      .map((item) => `${item.quantity}× ${item.name}`)
                      .join(', ')}
                  </p>
                  <Link
                    to={`/order/${order.id}`}
                    className="mt-2 inline-block text-sm text-brand-400 hover:underline"
                  >
                    View details →
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<Package className="h-10 w-10" />}
            title="No orders yet"
            message="Once you place an order it will show up here."
            action={
              <Link
                to="/shop"
                className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-400"
              >
                Start shopping
              </Link>
            }
          />
        )}
      </section>
    </div>
  );
}

/**
 * The customer's laybuys: progress, balance, and paying an instalment by
 * card. Any amount is accepted; the suggested figure is simply the balance
 * spread over what remains of the three months.
 */
function LaybySection() {
  const { user, profile } = useAuth();
  const toast = useToast();
  const laybys = useMyLaybys(user?.id);

  if (!laybys.data || laybys.data.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
        <CalendarClock aria-hidden className="h-5 w-5 text-brand-400" />
        Your laybuys
      </h2>
      <ul className="mt-4 space-y-3">
        {laybys.data.map((layby) => (
          <li key={layby.id}>
            <LaybyCard
              layby={layby}
              email={profile?.email ?? user?.email ?? ''}
              name={profile?.full_name ?? ''}
              onError={(message) => toast.error('Could not start the payment', message)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LaybyCard({
  layby,
  email,
  name,
  onError,
}: {
  layby: LaybyRow;
  email: string;
  name: string;
  onError: (message?: string) => void;
}) {
  const balance = Number(layby.balance_amount) || 0;
  const total = Number(layby.total_amount) || 0;
  const paidShare = total > 0 ? Math.min(1, (total - balance) / total) : 0;
  const overdue =
    layby.status === 'active' && layby.due_date !== null && layby.due_date < new Date().toISOString().slice(0, 10);

  const [amount, setAmount] = useState(() => String(laybySuggestedInstalment(balance) || ''));
  const [busy, setBusy] = useState(false);

  const itemName = layby.items?.[0]?.name ?? 'Laybuy';

  async function payNow() {
    const value = Math.min(Math.max(toNumber(amount), 0), balance);
    if (value <= 0) {
      onError('Enter an amount to pay.');
      return;
    }
    setBusy(true);
    try {
      await startInstalmentPayment({
        laybyId: layby.id,
        laybyNumber: layby.layby_number ?? String(layby.id),
        amount: value,
        email,
        name,
      });
      // The browser is navigating to DPO; nothing more happens here.
    } catch (error) {
      setBusy(false);
      onError(error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">
            {layby.layby_number ?? `#${layby.id}`} · {itemName}
            {layby.color ? ` · ${layby.color}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">
            Paid {money(total - balance)} of {money(total)}
            {layby.due_date ? ` · due ${formatDate(layby.due_date)}` : ''}
          </p>
        </div>
        <StatusBadge status={layby.status} />
      </div>

      <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised">
        <div
          className="h-full rounded-full bg-brand-400 transition-all"
          style={{ width: `${Math.round(paidShare * 100)}%` }}
        />
      </div>

      {layby.status === 'completed' ? (
        <p className="mt-3 text-sm text-success">
          Fully paid — collect your phone at the shop.
        </p>
      ) : layby.status === 'cancelled' ? (
        <p className="mt-3 text-sm text-ink-muted">
          This laybuy was closed. Speak to the shop about using what was paid toward something
          else.
        </p>
      ) : (
        <>
          {overdue && (
            <Notice tone="warn" className="mt-3" title="Past its due date">
              Laybuy payments are not refundable. Pay the balance, or speak to the shop about an
              extension or putting what you have paid toward something else.
            </Notice>
          )}
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <Input
              label={`Pay toward the ${money(balance)} balance`}
              type="number"
              inputMode="decimal"
              min={0}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              containerClassName="w-44"
            />
            <Button loading={busy} onClick={() => void payNow()}>
              Pay by card
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

function SignIn() {
  useSeo({ title: 'Sign in', noIndex: true });

  const { signIn, resetPassword } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') ?? '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
      navigate(next, { replace: true });
    } catch (error) {
      toast.error('Could not sign in', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-ink-muted">Track orders and check out faster.</p>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          Sign in
        </Button>
      </form>

      <div className="mt-4 flex justify-between text-sm">
        <Link to="/account/register" className="text-brand-400 hover:underline">
          Create an account
        </Link>
        <button
          type="button"
          className="text-ink-subtle hover:text-ink"
          onClick={async () => {
            if (!email.trim()) {
              toast.warn('Enter your email first');
              return;
            }
            try {
              await resetPassword(email);
              toast.success('Check your inbox', 'We sent a reset link.');
            } catch (error) {
              toast.error('Could not send reset', error instanceof Error ? error.message : undefined);
            }
          }}
        >
          Forgot password?
        </button>
      </div>
    </div>
  );
}

function Register() {
  useSeo({ title: 'Create an account', noIndex: true });

  const { signUp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.warn('Password too short', 'Use at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      await signUp(email, password, { name, phone });
      toast.success('Account created', 'Check your email if confirmation is required.');
      navigate('/account');
    } catch (error) {
      toast.error('Could not register', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-2xl font-bold text-ink">Create an account</h1>

      <Notice tone="info" className="mt-4">
        We only use your details to process and deliver your orders.
      </Notice>

      <form onSubmit={submit} className="mt-6 space-y-3">
        <Input
          label="Full name"
          required
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+264 …"
        />
        <Input
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hint="At least 8 characters."
        />
        <Button type="submit" fullWidth size="lg" loading={busy}>
          Create account
        </Button>
      </form>

      <p className="mt-4 text-sm text-ink-muted">
        Already registered?{' '}
        <Link to="/account/sign-in" className="text-brand-400 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
