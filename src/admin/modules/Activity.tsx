import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import type { ActivityLogRow } from '@/lib/database.types';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, EmptyState, Input, Modal, Select, Skeleton } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

const ACTION_TONE: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
  insert: 'success',
  update: 'info',
  delete: 'danger',
};

const WATCHED = [
  'products',
  'users',
  'job_cards',
  'expenses',
  'refunds',
  'settings',
  'suppliers',
  'coupons',
  'laybys',
  'till_shifts',
];

function useActivity(filters: { entity?: string; action?: string; search?: string }) {
  return useQuery<ActivityLogRow[], Error>({
    queryKey: keys.list('activity_log', filters),
    queryFn: async () => {
      let query = supabase.from('activity_log').select('*');
      if (filters.entity) query = query.eq('entity', filters.entity);
      if (filters.action) query = query.eq('action', filters.action);

      const term = filters.search?.trim();
      if (term) query = query.or(`actor.ilike.%${term}%,summary.ilike.%${term}%`);

      const { data, error } = await query.order('id', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/**
 * The audit trail.
 *
 * Recorded by database trigger rather than from this console, so it also
 * captures changes made from a script, the SQL editor, or a screen that does
 * not exist yet. Nothing here can be edited — there is no write policy on the
 * table at all, and a log anyone can edit is not a log.
 */
export default function Activity() {
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ActivityLogRow | null>(null);

  const activity = useActivity({
    entity: entity || undefined,
    action: action || undefined,
    search: search || undefined,
  });
  const rows = activity.data ?? [];

  return (
    <>
      <ModuleHeader
        title="Activity log"
        description="Every change to stock, money, access and customer records — and who made it."
      />

      <div className="space-y-4 p-6">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search by person or what changed…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="max-w-[12rem]">
            <option value="">Everything</option>
            {WATCHED.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="max-w-[10rem]">
            <option value="">Any action</option>
            <option value="insert">Created</option>
            <option value="update">Changed</option>
            <option value="delete">Deleted</option>
          </Select>
        </div>

        {activity.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing recorded yet"
            message="Changes to products, staff, refunds, job cards and settings appear here as they happen."
          />
        ) : (
          <ol className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            {rows.map((row) => (
              <li key={row.id} className="border-b border-hairline/70 last:border-b-0">
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised"
                >
                  <Badge tone={ACTION_TONE[row.action] ?? 'neutral'} size="sm">
                    {row.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{row.summary}</p>
                    <p className="truncate text-xs text-ink-subtle">
                      {row.actor ?? 'unknown'} · {relativeTime(row.created_at)}
                    </p>
                  </div>
                  {row.changes && (
                    <span className="shrink-0 text-xs text-ink-subtle">
                      {Object.keys(row.changes).length} field
                      {Object.keys(row.changes).length === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {selected && <ChangeDialog row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function ChangeDialog({ row, onClose }: { row: ActivityLogRow; onClose: () => void }) {
  const entries = Object.entries(row.changes ?? {});

  return (
    <Modal
      open
      onClose={onClose}
      title={row.summary ?? 'Change'}
      description={`${row.actor ?? 'unknown'} · ${formatDateTime(row.created_at)}`}
      size="lg"
    >
      {entries.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No field-level detail was recorded for this {row.action}.
        </p>
      ) : (
        <ul className="divide-y divide-hairline/70 rounded-xl border border-hairline">
          {entries.map(([field, value]) => {
            const pair = Array.isArray(value) ? value : [null, value];
            return (
              <li key={field} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[10rem_1fr]">
                <span className="text-sm font-medium text-ink">{field.replace(/_/g, ' ')}</span>
                <span className="flex flex-wrap items-center gap-2 text-sm">
                  <Value value={pair[0]} tone="was" />
                  <span aria-hidden className="text-ink-subtle">
                    →
                  </span>
                  <Value value={pair[1]} tone="now" />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}

function Value({ value, tone }: { value: unknown; tone: 'was' | 'now' }) {
  const text =
    value === null || value === undefined
      ? '—'
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value);

  return (
    <code
      className={cn(
        'max-w-full truncate rounded-md px-2 py-0.5 text-xs',
        tone === 'was'
          ? 'bg-raised text-ink-muted line-through decoration-ink-subtle/60'
          : 'bg-lime-500/15 font-semibold text-ink',
      )}
    >
      {text}
    </code>
  );
}
