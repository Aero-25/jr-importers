import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Image as ImageIcon, Store } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { heroImages } from '@/data/resources';
import { DEFAULT_VAT_RATE, percent } from '@/lib/format';
import { Button, Card, Input, Notice, Panel, useToast } from '@/ui';
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
        <HeroImages />
      </div>
    </>
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
