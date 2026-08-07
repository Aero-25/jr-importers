import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellOff, Check, MessageCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import type { AlertRow } from '@/lib/database.types';
import { CASHUP_WHATSAPP } from '@/lib/cashUpPdf';
import { relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, EmptyState, Skeleton, StatTile, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

const TONE: Record<string, 'danger' | 'warn' | 'info'> = {
  critical: 'danger',
  warn: 'warn',
  info: 'info',
};

export function useAlerts(includeCleared = false) {
  return useQuery<AlertRow[], Error>({
    queryKey: keys.list('alerts', { cleared: includeCleared }),
    refetchInterval: 300_000,
    queryFn: async () => {
      let query = supabase.from('alerts').select('*');
      if (!includeCleared) query = query.is('acknowledged_at', null);

      const { data, error } = await query.order('id', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * Things that should come and find you.
 *
 * Raised by a scheduled job in the database, not by this screen, so they fire
 * when nobody has the console open — which is the only time they matter. Each
 * one is keyed to the fact behind it, so a low-stock warning appears once and
 * stays put rather than arriving again every morning.
 */
export default function Alerts() {
  const toast = useToast();
  const qc = useQueryClient();
  const [showCleared, setShowCleared] = useState(false);

  const alerts = useAlerts(showCleared);
  const rows = alerts.data ?? [];
  const open = rows.filter((a) => !a.acknowledged_at);
  const critical = open.filter((a) => a.severity === 'critical');

  const clear = useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('acknowledge_alert', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('alerts') }),
  });

  // No WhatsApp API is configured, so the digest is a pre-filled message the
  // owner sends to themselves in one tap. Honest about what it is rather than
  // pretending something automatic is happening.
  const digest = open.length
    ? `https://wa.me/${CASHUP_WHATSAPP}?text=${encodeURIComponent(
        [
          '*JR Importers — needs attention*',
          '',
          ...open.slice(0, 15).map((a) => `• ${a.title}${a.detail ? ` — ${a.detail}` : ''}`),
          open.length > 15 ? `…and ${open.length - 15} more` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      )}`
    : null;

  return (
    <>
      <ModuleHeader
        title="Needs attention"
        description="Raised automatically, twice a day, whether anyone is looking or not."
        actions={
          <>
            {digest && (
              <Button
                variant="success"
                icon={<MessageCircle className="h-4 w-4" />}
                onClick={() => window.open(digest, '_blank', 'noopener')}
              >
                Send digest
              </Button>
            )}
            <Button variant="secondary" onClick={() => setShowCleared((s) => !s)}>
              {showCleared ? 'Hide cleared' : 'Show cleared'}
            </Button>
          </>
        }
      />

      <div className="space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatTile
            label="Needs attention"
            value={open.length}
            tone={open.length > 0 ? 'warn' : 'success'}
          />
          <StatTile
            label="Urgent"
            value={critical.length}
            tone={critical.length > 0 ? 'danger' : 'success'}
          />
        </div>

        {alerts.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<BellOff className="h-10 w-10" />}
            title="Nothing needs you"
            message="Low stock, till variances over N$50, refunds waiting on approval, job cards going quiet and deliveries not yet in stock all appear here."
          />
        ) : (
          <ul className="space-y-2">
            {rows.map((a) => (
              <li
                key={a.id}
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3',
                  a.acknowledged_at
                    ? 'border-hairline opacity-55'
                    : a.severity === 'critical'
                      ? 'border-danger/40 bg-danger/5'
                      : 'border-hairline bg-surface',
                )}
              >
                <Badge tone={TONE[a.severity] ?? 'info'} size="sm">
                  {a.severity === 'critical' ? 'urgent' : a.severity}
                </Badge>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{a.title}</p>
                  {a.detail && <p className="truncate text-xs text-ink-subtle">{a.detail}</p>}
                </div>

                <span className="shrink-0 text-xs text-ink-subtle">
                  {relativeTime(a.created_at)}
                </span>

                {!a.acknowledged_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Check className="h-4 w-4" />}
                    onClick={async () => {
                      try {
                        await clear.mutateAsync(a.id);
                      } catch (error) {
                        toast.error('Could not clear it', error instanceof Error ? error.message : undefined);
                      }
                    }}
                  >
                    Done
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
