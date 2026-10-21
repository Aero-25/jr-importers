import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Download, Image as ImageIcon, Smartphone, Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { heroImages } from '@/data/resources';
import { ADMIN_APK_URL } from '@/lib/constants';
import { BUILD_TIME, buildLabel, checkForUpdate, isInstalledApp } from '@/lib/buildInfo';
import { DEFAULT_VAT_RATE, percent } from '@/lib/format';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Notice, Panel, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { MfaPanel } from '../components/MfaPanel';

/** Store settings, merchandising, and the housekeeping jobs staff can trigger. */
export default function Settings() {
  return (
    <>
      <ModuleHeader title="Settings" description="Store configuration and housekeeping." />
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <MfaPanel />
        <StoreSettings />
        <Housekeeping />
        <MobileApp />
        <HeroImages />
        <PortalLogins />
      </div>
    </>
  );
}

/**
 * Giving a company a portal login.
 *
 * Deliberately a shop action rather than a signup. Email confirmation is off
 * on this project, so anybody can register any address — if a trade account
 * could be self-claimed, a stranger would see dealer pricing by typing a
 * customer's address into a form. The login has to exist in Supabase first;
 * this binds it to the company it buys for.
 */
function PortalLogins() {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [search, setSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [busy, setBusy] = useState(false);

  const existing = useQuery({
    queryKey: ['company_portal_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('company_portal_users')
        .select('id, email, active, customer_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const matches = useQuery({
    queryKey: ['customers', 'portal-search', search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const safe = search.replace(/[,()*]/g, ' ').trim();
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, email')
        .ilike('name', `%${safe}%`)
        .limit(8);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const link = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('link_portal_login', {
        p_email: email.trim(),
        p_customer_id: customerId,
      });
      if (error) throw new Error(error.message);
      const reply = data as unknown as { ok?: boolean; message?: string };
      if (!reply?.ok) throw new Error(reply?.message ?? 'Could not link that login.');
      toast.success('Portal access granted', reply.message);
      setEmail('');
      setSearch('');
      setCustomerId('');
      void qc.invalidateQueries({ queryKey: ['company_portal_users'] });
    } catch (e) {
      toast.error('Could not give that login access', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Company portal logins" />
      <CardBody className="space-y-4">
        <p className="text-sm text-ink-subtle">
          Account customers sign in at <code>/portal</code> to see the weekly trade prices and
          request a quote. Create the login in Supabase first, then bind it to the company here.
        </p>

        <Field label="Login email" htmlFor="portal-email">
          <Input
            id="portal-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="buyer@company.com"
          />
        </Field>

        <Field label="Company" htmlFor="portal-company">
          <Input
            id="portal-company"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCustomerId('');
            }}
            placeholder="Namib Mills…"
          />
        </Field>

        {search.trim().length >= 2 && !customerId && (
          <ul className="divide-y divide-hairline/70 rounded-xl border border-hairline">
            {(matches.data ?? []).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-raised"
                  onClick={() => {
                    setCustomerId(c.id as string);
                    setSearch(c.name as string);
                  }}
                >
                  {c.name as string}
                </button>
              </li>
            ))}
            {(matches.data ?? []).length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-subtle">No customer by that name.</li>
            )}
          </ul>
        )}

        <Button disabled={!email.trim() || !customerId || busy} onClick={() => void link()}>
          {busy ? 'Granting…' : 'Give this login trade access'}
        </Button>

        {(existing.data ?? []).length > 0 && (
          <ul className="divide-y divide-hairline/70 border-t border-hairline pt-2 text-sm">
            {(existing.data ?? []).map((row) => (
              <li key={row.id as number} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-ink">{row.email as string}</span>
                <Badge tone={row.active ? 'lime' : 'neutral'}>
                  {row.active ? 'active' : 'off'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

function MobileApp() {
  return (
    <Panel
      title="Mobile app"
      description="This console, packaged as an Android app."
      actions={<Smartphone aria-hidden className="h-4 w-4 text-ink-muted" />}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Installs on a phone or tablet — useful for POS on a handheld or checking stock on the
          floor. It carries its own copy of the console, so it keeps working with no signal.
        </p>
        <p className="text-sm text-ink-muted">
          That copy is fixed at the moment the app was built: it does not update itself.
          Reinstalling is what picks up anything that has shipped since.
        </p>

        <BuildStamp />
        <a
          href={ADMIN_APK_URL}
          className="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-brand-500 px-4 text-sm font-medium text-white transition-colors hover:bg-brand-400 active:bg-brand-600"
        >
          <Download aria-hidden className="h-4 w-4" />
          Download for Android
        </a>
        <p className="text-xs text-ink-subtle">
          Android only. After downloading, allow "Install unknown apps" for your browser, then open
          the file to install.
        </p>
      </div>
    </Panel>
  );
}

function StoreSettings() {
  const toast = useToast();
  const qc = useQueryClient();

  const settings = useQuery({
    queryKey: keys.list('settings'),
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const vatSetting = settings.data?.find((row) => row.key === 'vat_rate');
  const [vatRate, setVatRate] = useState('');
  const [busy, setBusy] = useState(false);

  const currentRate = vatSetting ? Number(vatSetting.value) : DEFAULT_VAT_RATE;

  async function saveVat() {
    const value = Number(vatRate) / 100;
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      toast.warn('Enter a percentage between 0 and 100');
      return;
    }

    setBusy(true);
    const { error } = await supabase
      .from('settings')
      .upsert({ key: 'vat_rate', value }, { onConflict: 'key' });
    setBusy(false);

    if (error) {
      toast.error('Could not save', error.message);
      return;
    }
    toast.success('VAT rate saved', 'Reload the console for it to take effect everywhere.');
    void qc.invalidateQueries({ queryKey: keys.table('settings') });
  }

  return (
    <Panel
      title="Store"
      description="Tax and pricing defaults."
      actions={<Store aria-hidden className="h-4 w-4 text-ink-muted" />}
    >
      <div className="space-y-3">
        <div className="rounded-lg bg-raised p-3">
          <p className="text-xs uppercase tracking-wide text-ink-muted">Current VAT rate</p>
          <p className="tabular font-display text-2xl font-semibold text-ink">
            {percent(currentRate, 1)}
          </p>
        </div>

        <Input
          label="New VAT rate (%)"
          type="number"
          min={0}
          max={100}
          step="0.5"
          value={vatRate}
          onChange={(e) => setVatRate(e.target.value)}
          placeholder="15"
          hint="Namibian standard rate is 15%. Prices are stored VAT-inclusive."
        />

        <Button onClick={saveVat} loading={busy} disabled={!vatRate}>
          Save VAT rate
        </Button>
      </div>
    </Panel>
  );
}

function Housekeeping() {
  const toast = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  /**
   * Frees stock held by checkouts that were abandoned.
   * Ordinarily this would run on a schedule; exposing it here means staff can
   * unblock a sold-out-but-not-really product without waiting for pg_cron.
   */
  async function expireReservations() {
    setBusy(true);
    const { data, error } = await supabase.rpc('expire_stale_reservations');
    setBusy(false);

    if (error) {
      toast.error('Could not run the sweep', error.message);
      return;
    }

    const released = Number(data ?? 0);
    if (released === 0) toast.info('Nothing to release', 'No reservations have expired.');
    else toast.success(`${released} reservation${released === 1 ? '' : 's'} released`);

    void qc.invalidateQueries({ queryKey: keys.table('products') });
    void qc.invalidateQueries({ queryKey: keys.table('orders') });
  }

  return (
    <Panel
      title="Housekeeping"
      description="Maintenance jobs you can run on demand."
      actions={<Clock aria-hidden className="h-4 w-4 text-ink-muted" />}
    >
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium text-ink">Release expired stock reservations</p>
          <p className="mt-0.5 text-sm text-ink-muted">
            Checkout holds stock for 30 minutes. If a customer never pays, this returns those units
            to available and cancels the order.
          </p>
        </div>
        <Button variant="secondary" onClick={expireReservations} loading={busy}>
          Run now
        </Button>

        <Notice tone="info">
          Schedule this hourly with <code className="font-mono text-xs">pg_cron</code> so it does
          not depend on someone remembering.
        </Notice>
      </div>
    </Panel>
  );
}

function HeroImages() {
  const toast = useToast();
  const list = heroImages.useList();
  const create = heroImages.useCreate();
  const remove = heroImages.useRemove();

  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  async function add() {
    if (!url.trim()) {
      toast.warn('Add an image URL');
      return;
    }
    try {
      await create.mutateAsync({
        image_url: url.trim(),
        title: title.trim() || null,
        order_index: (list.data?.length ?? 0) + 1,
        active: true,
      });
      toast.success('Banner added');
      setUrl('');
      setTitle('');
    } catch (error) {
      toast.error('Could not add', error instanceof Error ? error.message : undefined);
    }
  }

  return (
    <Panel
      title="Home page banners"
      description="Images merchandised on the storefront."
      className="lg:col-span-2"
      actions={<ImageIcon aria-hidden className="h-4 w-4 text-ink-muted" />}
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Input
            label="Image URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
          <Input label="Caption" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Button onClick={add} loading={create.isPending}>
            Add banner
          </Button>
        </div>

        {list.data && list.data.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {list.data.map((banner) => (
              <li key={banner.id}>
                <Card className="overflow-hidden">
                  <img
                    src={banner.image_url}
                    alt={banner.title ?? ''}
                    loading="lazy"
                    className="aspect-video w-full object-cover"
                  />
                  <div className="flex items-center justify-between gap-2 p-2">
                    <span className="truncate text-xs text-ink-muted">{banner.title ?? '—'}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void remove.mutateAsync(banner.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

/**
 * Which build this device is running, and whether it is behind.
 *
 * Shown to everyone: in a browser it answers "did my fix actually ship?", and
 * on the installed app it answers "is this till stale?" — which nothing could
 * tell you before.
 */
function BuildStamp() {
  const [state, setState] = useState<{ stale: boolean; serverBuild: string | null } | null>(null);

  useEffect(() => {
    let live = true;
    void checkForUpdate().then((result) => {
      if (live) setState(result);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!BUILD_TIME) return null;

  return (
    <div className="rounded-lg border border-hairline bg-raised px-3 py-2.5 text-xs">
      <p className="text-ink-muted">
        This device is running the build from{' '}
        <span className="font-semibold text-ink">{buildLabel()}</span>.
      </p>
      {state?.stale && (
        <p className="mt-1 font-semibold text-danger">
          A newer build is available{state.serverBuild ? ` (${buildLabel(state.serverBuild)})` : ''}.
          {isInstalledApp()
            ? ' Download and reinstall the app to pick it up.'
            : ' Refresh the page to pick it up.'}
        </p>
      )}
    </div>
  );
}
