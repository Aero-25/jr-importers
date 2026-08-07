import { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import type { createResource } from '@/data/crud';
import { formatDate, formatDateTime, money, toDateInput, toNumber, truncate } from '@/lib/format';
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  Pagination,
  Input,
  Modal,
  Notice,
  Select,
  Textarea,
  type Column,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';
import { StaffLogin } from '../components/StaffLogin';
import { RECORD_SPECS, type FieldSpec, type RecordSpec } from './recordSpecs';

type AnyRow = Record<string, unknown>;
type Resource = ReturnType<typeof createResource>;

/**
 * Renders a whole console module from a `RecordSpec`.
 *
 * Thirteen of the console's modules are the same shape — search a table, scan
 * a list, open a record, edit fields, save. Describing them as data rather
 * than duplicating a screen thirteen times means a fix to focus handling or
 * error reporting lands in all of them at once.
 */
export default function Records({ resource: specKey }: { resource: string }) {
  const spec = RECORD_SPECS[specKey];

  if (!spec) {
    return (
      <div className="p-8">
        <Notice tone="danger" title="Unknown module">
          No record specification is registered for “{specKey}”.
        </Notice>
      </div>
    );
  }

  return <RecordsModule key={specKey} spec={spec} />;
}

/** Fifty rows fills a laptop screen without making the browser sort a thousand. */
const PAGE_SIZE = 50;

function RecordsModule({ spec }: { spec: RecordSpec }) {
  const resource = spec.resource as unknown as Resource;
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<AnyRow | 'new' | null>(null);

  // Filtering changes what "page 3" means, so it starts again from the top.
  function searchFor(term: string) {
    setSearch(term);
    setPage(0);
  }

  const list = resource.usePage(
    { search: search ? { term: search, columns: spec.searchColumns as never } : undefined },
    page,
    PAGE_SIZE,
  );

  const columns = useMemo<Column<AnyRow>[]>(
    () =>
      spec.fields
        .filter((field) => field.inList)
        .map((field) => ({
          key: field.key,
          header: field.label,
          align: field.align,
          secondary: field.secondary,
          render: (row) => renderCell(field, row[field.key]),
          sortValue: (row) => sortValueOf(field, row[field.key]),
        })),
    [spec.fields],
  );

  return (
    <>
      <ModuleHeader
        title={spec.title}
        description={spec.description}
        actions={
          spec.readOnly ? undefined : (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>
              {spec.createLabel ?? 'New'}
            </Button>
          )
        }
      />

      <div className="p-6">
        <Input
          label="Search"
          value={search}
          onChange={(e) => searchFor(e.target.value)}
          placeholder={`Search ${spec.title.toLowerCase()}…`}
          leading={<Search className="h-4 w-4" />}
          containerClassName="mb-4 max-w-md"
        />

        <div className="overflow-hidden rounded-card border border-hairline bg-surface">
          <DataTable
            rows={(list.data?.rows ?? []) as AnyRow[]}
            columns={columns}
            rowKey={(row) => String(row.id)}
            loading={list.isLoading}
            onRowClick={setEditing}
            empty={{
              title: search ? 'Nothing matches' : `No ${spec.title.toLowerCase()} yet`,
              message: search
                ? 'Try a different search term.'
                : spec.readOnly
                  ? 'Records appear here as customers send them.'
                  : undefined,
            }}
            footer={
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={list.data?.total ?? 0}
                onPage={setPage}
              />
            }
          />
        </div>
      </div>

      {editing && (
        <RecordDialog spec={spec} record={editing} onClose={() => setEditing(null)} />
      )}
    </>
  );
}

function renderCell(field: FieldSpec, value: unknown) {
  if (value === null || value === undefined || value === '') {
    return <span className="text-xs text-ink-subtle">—</span>;
  }

  switch (field.type) {
    case 'money':
      return <span className="tabular font-medium">{money(value as number)}</span>;
    case 'number':
      return <span className="tabular">{String(value)}</span>;
    case 'date':
      return <span className="text-sm">{formatDate(value as string)}</span>;
    case 'checkbox':
      return value ? (
        <Badge tone="success" size="sm">
          Yes
        </Badge>
      ) : (
        <Badge tone="neutral" size="sm">
          No
        </Badge>
      );
    case 'select':
      return (
        <Badge tone={toneForStatus(String(value))} size="sm">
          {String(value)}
        </Badge>
      );
    case 'readonly':
      // `created_at`-style keys are timestamps; anything else prints as text.
      return /_at$|^last_/.test(field.key) ? (
        <span className="text-xs text-ink-muted">{formatDateTime(value as string)}</span>
      ) : (
        <span className="text-sm">{truncate(String(value), 80)}</span>
      );
    default:
      return <span className="text-sm">{truncate(String(value), 60)}</span>;
  }
}

function sortValueOf(field: FieldSpec, value: unknown): string | number {
  if (value === null || value === undefined) return field.type === 'money' ? -1 : '';
  if (field.type === 'money' || field.type === 'number') return Number(value) || 0;
  if (field.type === 'checkbox') return value ? 1 : 0;
  return String(value);
}

function toneForStatus(status: string) {
  const s = status.toLowerCase();
  if (/paid|accepted|completed|received|active|converted|notified/.test(s)) return 'success';
  if (/draft|new|waiting|in_progress|sent|ordered/.test(s)) return 'info';
  if (/pending|quoted|deposit|partially/.test(s)) return 'warn';
  if (/cancelled|declined|expired|void|disputed|closed/.test(s)) return 'danger';
  return 'neutral';
}

function RecordDialog({
  spec,
  record,
  onClose,
}: {
  spec: RecordSpec;
  record: AnyRow | 'new';
  onClose: () => void;
}) {
  const toast = useToast();
  const resource = spec.resource as unknown as Resource;
  const create = resource.useCreate();
  const update = resource.useUpdate();
  const remove = resource.useRemove();

  const isNew = record === 'new';
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const raw = isNew ? undefined : record[field.key];
      initial[field.key] =
        field.type === 'checkbox'
          ? (raw ?? true)
          : field.type === 'date'
            ? raw
              ? toDateInput(raw as string)
              : ''
            : (raw ?? '');
    }
    return initial;
  });

  function set(key: string, value: unknown) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const missing = spec.fields.find(
      (field) => field.required && !String(form[field.key] ?? '').trim(),
    );
    if (missing) {
      toast.warn(`${missing.label} is required`);
      return;
    }

    // Read-only fields are display-only projections of server state; sending
    // them back would fight triggers like `times_used`.
    const values: Record<string, unknown> = {};
    for (const field of spec.fields) {
      if (field.type === 'readonly') continue;
      const raw = form[field.key];

      if (field.type === 'checkbox') values[field.key] = Boolean(raw);
      else if (field.type === 'money' || field.type === 'number')
        values[field.key] = raw === '' ? null : toNumber(raw as string);
      else values[field.key] = String(raw ?? '').trim() || null;
    }

    try {
      if (isNew) {
        await create.mutateAsync(values as never);
        toast.success(`${spec.title.replace(/s$/, '')} created`);
      } else {
        await update.mutateAsync({ id: record.id as string | number, values: values as never });
        toast.success('Saved');
      }
      onClose();
    } catch (error) {
      toast.error('Could not save', error instanceof Error ? error.message : undefined);
    }
  }

  const editable = spec.fields.filter((field) => !spec.readOnly || field.type === 'readonly');

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={isNew ? `New ${spec.title.replace(/s$/, '').toLowerCase()}` : spec.title}
        size="lg"
        footer={
          spec.readOnly ? (
            <Button onClick={onClose}>Close</Button>
          ) : (
            <>
              {!isNew && (
                <Button
                  variant="danger"
                  className="mr-auto"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete
                </Button>
              )}
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={save} loading={create.isPending || update.isPending}>
                {isNew ? 'Create' : 'Save changes'}
              </Button>
            </>
          )
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          {editable.map((field, index) => (
            <FieldControl
              key={field.key}
              field={field}
              value={form[field.key]}
              onChange={(value) => set(field.key, value)}
              disabled={spec.readOnly}
              autoFocus={index === 0 && !spec.readOnly}
            />
          ))}
        </div>

        {/* Staff only. The record says what somebody may do; this says whether
            they can get through the door at all, and the two were separate
            with nothing in the console joining them up. */}
        {spec.table === 'users' && !isNew && (
          <div className="mt-4">
            <StaffLogin email={String(form.email ?? '')} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (isNew) return;
          try {
            await remove.mutateAsync(record.id as string | number);
            toast.success('Deleted');
            onClose();
          } catch (error) {
            toast.error('Could not delete', error instanceof Error ? error.message : undefined);
          }
          setConfirmDelete(false);
        }}
        title="Delete this record?"
        message="This cannot be undone. If the record is referenced elsewhere, deactivate it instead."
        confirmLabel="Delete"
        loading={remove.isPending}
      />
    </>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  disabled,
  autoFocus,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const wide = field.wide ? 'sm:col-span-2' : undefined;
  const common = { label: field.label, hint: field.hint, required: field.required, disabled };

  switch (field.type) {
    case 'readonly':
      return (
        <div className={wide}>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {field.label}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-ink">
            {value === null || value === undefined || value === ''
              ? '—'
              : /_at$|^last_/.test(field.key)
                ? formatDateTime(value as string)
                : String(value)}
          </p>
        </div>
      );

    case 'checkbox':
      return (
        <div className={wide}>
          <Checkbox
            label={field.label}
            hint={field.hint}
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
          />
        </div>
      );

    case 'select':
      return (
        <Select
          {...common}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          options={[...(field.options ?? [])]}
          placeholder="—"
          containerClassName={wide}
        />
      );

    case 'textarea':
      return (
        <Textarea
          {...common}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          className={wide}
        />
      );

    case 'money':
    case 'number':
      return (
        <Input
          {...common}
          type="number"
          inputMode="decimal"
          step={field.type === 'money' ? '0.01' : '1'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          containerClassName={wide}
          autoFocus={autoFocus}
        />
      );

    case 'date':
      return (
        <Input
          {...common}
          type="date"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          containerClassName={wide}
        />
      );

    default:
      return (
        <Input
          {...common}
          type={field.type === 'text' ? 'text' : field.type}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          containerClassName={wide}
          autoFocus={autoFocus}
        />
      );
  }
}
