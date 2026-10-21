import { useMemo, useState, type FormEvent } from 'react';
import { Building2, Check, FileText, LogOut, Package, Send } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import {
  type PortalItem,
  useRequestQuote,
  usePortalCatalogue,
  usePortalCompany,
  usePortalQuotes,
} from '@/data/portal';
import { formatDate, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  LoadingScreen,
  Notice,
  Textarea,
  useToast,
} from '@/ui';
import { useSeo } from '../seo';

/**
 * The company portal.
 *
 * Account customers — Namib Mills, Logistics Support Services and the rest —
 * sign in here and see the prices the weekly dealer list went out with, rather
 * than the shop's own. They pick quantities and ask for a quote; it reaches the
 * shop as a real quote and is emailed back with info@ copied in.
 *
 * A login is bound to a company by the shop, never claimed by signing up, so
 * there is nothing to register here. Somebody who signs in without that link
 * is told to ring rather than shown an error they cannot act on.
 */
export default function Portal() {
  useSeo({ title: 'Trade portal', noIndex: true });

  const { ready, isAuthenticated } = useAuth();
  const company = usePortalCompany();

  if (!ready) return <LoadingScreen label="Checking your session…" />;
  if (!isAuthenticated) return <SignInPrompt />;
  if (company.isLoading) return <LoadingScreen label="Opening your account…" />;
  if (!company.data?.ok) return <NotLinked />;

  return <Buying company={company.data} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">{children}</div>;
}

function SignInPrompt() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await signIn(email.trim(), password);
    } catch (error) {
      toast.error('Could not sign in', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <Building2 className="h-8 w-8 text-brand-500" aria-hidden />
        <h1 className="mt-3 font-display text-2xl font-bold text-ink">Trade portal</h1>
        <p className="mt-2 text-sm text-ink-muted">
          For account customers. Sign in to see this week&rsquo;s trade pricing and request a quote.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            aria-label="Email"
            autoComplete="username"
            required
          />
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete="current-password"
            required
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>

        <p className="mt-5 text-xs text-ink-subtle">
          Accounts are opened by JR Importers. To get access, call +264 81 562 9203 or email
          info@jrimporters.com.
        </p>
      </div>
    </Shell>
  );
}

function NotLinked() {
  const { signOut } = useAuth();
  return (
    <Shell>
      <div className="mx-auto max-w-md text-center">
        <Building2 className="mx-auto h-8 w-8 text-ink-subtle" aria-hidden />
        <h1 className="mt-3 font-display text-xl font-bold text-ink">
          This login isn&rsquo;t on a trade account
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          Trade pricing is for account customers, and access is set up by us. Call
          +264 81 562 9203 or email info@jrimporters.com and we will open it for you.
        </p>
        <Button variant="ghost" className="mt-5" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </Button>
      </div>
    </Shell>
  );
}

function Buying({ company }: { company: { name?: string; account_code?: string | null } }) {
  const { signOut } = useAuth();
  const catalogue = usePortalCatalogue(true);
  const quotes = usePortalQuotes(true);
  const request = useRequestQuote();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [qty, setQty] = useState<Record<number, number>>({});
  const [note, setNote] = useState('');
  const [done, setDone] = useState<{ number: string; total: number; emailed: boolean; to?: string } | null>(null);

  const items = catalogue.data ?? [];
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((i) => !needle || i.display_name.toLowerCase().includes(needle));
  }, [items, search]);

  const chosen = useMemo(
    () => items.filter((i) => (qty[i.item_id] ?? 0) > 0),
    [items, qty],
  );
  const total = chosen.reduce((sum, i) => sum + i.price * (qty[i.item_id] ?? 0), 0);
  const weekStart = items[0]?.week_start;

  const submit = () => {
    request.mutate(
      {
        lines: chosen.map((i) => ({ item_id: i.item_id, quantity: qty[i.item_id]! })),
        note,
      },
      {
        onSuccess: (r) => {
          setDone({ number: r.quote_number, total: r.total, emailed: r.emailed, to: r.emailTo });
          setQty({});
          setNote('');
          if (!r.emailed) {
            toast.info(
              'Quote raised',
              'We have it — the email did not go out, so we will be in touch directly.',
            );
          }
        },
        onError: (e) => toast.error('Could not request the quote', e.message),
      },
    );
  };

  return (
    <Shell>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Trade portal
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold text-ink">{company.name}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {weekStart
              ? `Trade pricing for the week of ${formatDate(weekStart)}. Prices include VAT.`
              : 'Trade pricing, including VAT.'}
          </p>
        </div>
        <Button variant="ghost" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" aria-hidden /> Sign out
        </Button>
      </header>

      {done && (
        <Notice tone="success" className="mt-6">
          <strong>{done.number}</strong> raised for {money(done.total)}.{' '}
          {done.emailed
            ? `We have emailed it to ${done.to}.`
            : 'We have your request and will be in touch.'}
        </Notice>
      )}

      {catalogue.isLoading && <LoadingScreen label="Loading this week's pricing…" />}

      {!catalogue.isLoading && items.length === 0 && (
        <EmptyState
          className="mt-8"
          icon={<Package aria-hidden />}
          title="No list is out yet this week"
          message="This week’s pricing has not been published. Please try again shortly."
        />
      )}

      {items.length > 0 && (
        <>
          <div className="mt-6">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the list…"
              aria-label="Search the list"
            />
          </div>

          <div className="mt-4 overflow-x-auto rounded-2xl border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-raised text-left text-2xs uppercase tracking-[0.12em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Handset</th>
                  <th className="px-3 py-2.5">Availability</th>
                  <th className="px-3 py-2.5 text-right">Price incl. VAT</th>
                  <th className="px-3 py-2.5 text-center">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70">
                {rows.map((item) => (
                  <Row
                    key={item.item_id}
                    item={item}
                    quantity={qty[item.item_id] ?? 0}
                    onChange={(n) =>
                      setQty((prev) => {
                        const next = { ...prev };
                        if (n > 0) next[item.item_id] = n;
                        else delete next[item.item_id];
                        return next;
                      })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <section className="mt-6 rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-sm font-semibold text-ink">Request a quote</h2>
            {chosen.length === 0 ? (
              <p className="mt-1 text-sm text-ink-subtle">
                Enter a quantity against anything on the list above.
              </p>
            ) : (
              <>
                <ul className="mt-3 space-y-1 text-sm">
                  {chosen.map((i) => (
                    <li key={i.item_id} className="flex justify-between gap-4">
                      <span className="text-ink">
                        {i.display_name} &times; {qty[i.item_id]}
                      </span>
                      <span className="tabular text-ink-muted">
                        {money(i.price * (qty[i.item_id] ?? 0))}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="tabular mt-3 text-right text-base font-semibold text-ink">
                  {money(total)}
                </p>
              </>
            )}

            <Textarea
              rows={2}
              className="mt-4"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything we should know — delivery, a PO number, a deadline"
              aria-label="Note"
            />

            <Button
              className="mt-4"
              disabled={chosen.length === 0 || request.isPending}
              onClick={submit}
            >
              <Send className="h-4 w-4" aria-hidden />
              {request.isPending ? 'Sending…' : 'Request a quote'}
            </Button>
            <p className="mt-2 text-xs text-ink-subtle">
              We will email the quote to your account address and keep a copy.
            </p>
          </section>
        </>
      )}

      {(quotes.data ?? []).length > 0 && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold text-ink">
            <FileText className="mr-1.5 inline h-4 w-4" aria-hidden /> Your recent quotes
          </h2>
          <ul className="mt-3 space-y-2">
            {(quotes.data ?? []).map((q) => (
              <li key={q.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-medium text-ink">{q.quote_number}</p>
                    <p className="text-xs text-ink-subtle">
                      {formatDate(q.created_at)}
                      {q.valid_until ? ` · valid until ${formatDate(q.valid_until)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={q.status === 'Requested' ? 'warn' : 'lime'}>{q.status}</Badge>
                    <span className="tabular font-semibold text-ink">{money(q.total_amount)}</span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Shell>
  );
}

function Row({
  item,
  quantity,
  onChange,
}: {
  item: PortalItem;
  quantity: number;
  onChange: (n: number) => void;
}) {
  return (
    <tr className={cn(item.in_stock && 'bg-lime-500/5')}>
      <td className="px-4 py-2.5">
        <span className="font-medium text-ink">{item.display_name}</span>
      </td>
      <td className="px-3 py-2.5">
        {item.in_stock ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-lime-700">
            <Check className="h-3.5 w-3.5" aria-hidden /> In stock
          </span>
        ) : (
          <span className="text-xs text-ink-subtle">On order</span>
        )}
      </td>
      <td className="tabular px-3 py-2.5 text-right font-semibold text-ink">{money(item.price)}</td>
      <td className="px-3 py-2.5">
        <Input
          type="number"
          min={0}
          step={1}
          value={quantity === 0 ? '' : quantity}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          placeholder="0"
          aria-label={`Quantity of ${item.display_name}`}
          className="mx-auto w-20 text-center"
        />
      </td>
    </tr>
  );
}
