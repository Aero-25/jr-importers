import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Siren } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import type { ClientErrorRow } from '@/lib/database.types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, EmptyState, Modal, Skeleton, StatTile, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

function useFaults(showResolved: boolean) {
  return useQuery<ClientErrorRow[], Error>({
    queryKey: keys.list('client_errors', { resolved: showResolved }),
    refetchInterval: 120_000,
    queryFn: async () => {
      let query = supabase.from('client_errors').select('*');
      if (!showResolved) query = query.is('resolved_at', null);

      const { data, error } = await query.order('last_seen', { ascending: false }).limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useResolveFault() {
  const qc = useQueryClient();
  return useMutation<void, Error, number>({
    mutationFn: async (id) => {
      const { error } = await supabase.rpc('resolve_client_error', { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.table('client_errors') }),
  });
}

/**
 * Faults reported by the browser.
 *
 * Marking one resolved is a claim, not a fix — if the same fault happens again
 * the database clears the resolution and it returns to this list, because a
 * fault that comes back was never resolved.
 */
export default function Faults() {
  const toast = useToast();
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<ClientErrorRow | null>(null);

  const faults = useFaults(showResolved);
  const resolve = useResolveFault();
  const rows = faults.data ?? [];

  const open = rows.filter((r) => !r.resolved_at);
  const occurrences = rows.reduce((n, r) => n + r.seen_count, 0);

  return (
    <>
      <ModuleHeader
        title="Faults"
        description="Errors the console and the shop hit in real use, grouped so a loop counts once."
        actions={
          <Button variant="secondary" onClick={() => setShowResolved((s) => !s)}>
            {showResolved ? 'Hide resolved' : 'Show resolved'}
          </Button>
        }
      />

      <div className="space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Open faults"
            value={open.length}
            tone={open.length > 0 ? 'danger' : 'success'}
          />
          <StatTile label="Total occurrences" value={occurrences} />
          <StatTile
            label="Most recent"
            value={rows[0] ? relativeTime(rows[0].last_seen) : '—'}
          />
        </div>

        {faults.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Siren className="h-10 w-10" />}
            title="Nothing has gone wrong"
            message="Faults appear here the moment somebody hits one, with the screen and the steps that led to it. An empty list is the right answer."
          />
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-hairline/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                >
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      row.resolved_at ? 'bg-ink-subtle' : 'bg-danger',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{row.message}</p>
                    <p className="truncate text-xs text-ink-subtle">
                      {row.surface ?? '—'} · {row.actor ?? 'unknown'} · {relativeTime(row.last_seen)}
                    </p>
                  </div>
                  <Badge tone={row.seen_count > 5 ? 'danger' : 'neutral'} size="sm">
                    ×{row.seen_count}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <Modal
          open
          onClose={() => setSelected(null)}
          title={selected.message}
          description={`Seen ${selected.seen_count} time${selected.seen_count === 1 ? '' : 's'} · first ${formatDateTime(selected.first_seen)}`}
          size="xl"
          footer={
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
              {!selected.resolved_at && (
                <Button
                  variant="success"
                  icon={<Check className="h-4 w-4" />}
                  loading={resolve.isPending}
                  onClick={async () => {
                    try {
                      await resolve.mutateAsync(selected.id);
                      toast.success('Marked resolved', 'It will come back here if it happens again.');
                      setSelected(null);
                    } catch (error) {
                      toast.error('Could not update', error instanceof Error ? error.message : undefined);
                    }
                  }}
                >
                  Mark resolved
                </Button>
              )}
            </>
          }
        >
          <div className="space-y-4">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="Screen" value={selected.surface ?? '—'} />
              <Detail label="Who hit it" value={selected.actor ?? 'unknown'} />
              <Detail label="Last seen" value={formatDateTime(selected.last_seen)} />
              <Detail
                label="Status"
                value={
                  selected.resolved_at
                    ? `Resolved by ${selected.resolved_by ?? '—'}`
                    : 'Open'
                }
              />
            </dl>

            {selected.url && (
              <p className="break-all rounded-lg bg-raised px-3 py-2 text-xs text-ink-muted">
                {selected.url}
              </p>
            )}

            {selected.stack && (
              <div className="overflow-x-auto rounded-xl border border-hairline bg-raised">
                <pre className="p-3 text-xs leading-relaxed text-ink-muted">{selected.stack}</pre>
              </div>
            )}

            {selected.user_agent && (
              <p className="break-all text-xs text-ink-subtle">{selected.user_agent}</p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
