import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2 } from 'lucide-react';
import type { createResource } from '@/data/crud';
import { supabase } from '@/lib/supabase';
import { keys } from '@/data/keys';
import { PAYMENT_METHODS } from '@/lib/constants';
import { customers, suppliers } from '@/data/resources';
import { products } from '@/data/products';
import type { LineItem } from '@/lib/database.types';
import {
  DEFAULT_VAT_RATE,
  formatDate,
  formatDateTime,
  money,
  round2,
  toDateInput,
  toNumber,
  truncate,
} from '@/lib/format';
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
import { ImeiChooser, useAvailableUnits } from '../components/ImeiChooser';
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

  // Document lines, for specs that carry them. Prices are VAT-inclusive, so
  // the money fields are derived here and never typed.
  const [items, setItems] = useState<LineItem[]>(() =>
    !isNew && spec.lineItems && Array.isArray((record as AnyRow).items)
      ? ((record as AnyRow).items as LineItem[])
      : [],
  );
  const itemTotals = useMemo(() => {
    const total = round2(items.reduce((n, l) => n + (Number(l.line_total) || 0), 0));
    const vat = round2((total * DEFAULT_VAT_RATE) / (1 + DEFAULT_VAT_RATE));
    return { total, vat, subtotal: round2(total - vat) };
  }, [items]);

  const [form, setForm] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const field of spec.fields) {
      const raw = isNew ? undefined : record[field.key];
      initial[field.key] =
        field.type === 'checkbox'
          ? (raw ?? field.defaultChecked ?? false)
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
    // them back would fight triggers like `times_used`. Computed fields are
    // the dialog's own arithmetic, written below from the lines.
    const values: Record<string, unknown> = {};
    for (const field of spec.fields) {
      // Instalments are written by take_layby_payment, never by this form:
      // sending the array back would overwrite a payment taken at the counter
      // while the record sat open on someone else's screen.
      if (
        field.type === 'readonly' ||
        field.type === 'record' ||
        field.type === 'payments' ||
        field.computed
      )
        continue;
      const raw = form[field.key];

      if (field.type === 'checkbox') values[field.key] = Boolean(raw);
      else if (field.type === 'money' || field.type === 'number')
        values[field.key] = raw === '' ? null : toNumber(raw as string);
      else values[field.key] = String(raw ?? '').trim() || null;

      // A field left blank means two different things, and sending null for
      // both breaks the first. On a NEW record it means "not specified", so the
      // key is dropped and the column's own default applies — sending an
      // explicit null instead overrides that default, and against a NOT NULL
      // column (invoices.status, orders.status, customers.customer_type and 45
      // others) the insert is rejected outright. On an EXISTING record a blank
      // is a deliberate clearing, so null is exactly right and is kept.
      if (isNew && values[field.key] === null) delete values[field.key];

      // Columns the control writes alongside its own key.
      for (const extra of field.extraKeys ?? []) {
        const value = form[extra];
        if (value !== undefined && value !== '') values[extra] = value;
      }
    }

    if (spec.lineItems) {
      if (items.length === 0) {
        toast.warn('Add at least one line', 'A document with nothing on it says nothing.');
        return;
      }
      values.items = items;
      values.total_amount = itemTotals.total;
      values.vat_amount = itemTotals.vat;
      values.subtotal_amount = itemTotals.subtotal;
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

  const editable = spec.fields.filter(
    (field) =>
      (!spec.readOnly || field.type === 'readonly' || field.type === 'record') && !field.computed,
  );

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
              {!isNew && spec.pdf && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    void (async () => {
                      try {
                        const pdf = await import('@/lib/documentPdf');
                        if (spec.pdf === 'quote') {
                          await pdf.downloadQuotePdf(record as never);
                        } else {
                          await pdf.downloadInvoiceRecordPdf(record as never);
                        }
                      } catch (error) {
                        toast.error(
                          'Could not build the PDF',
                          error instanceof Error ? error.message : undefined,
                        );
                      }
                    })();
                  }}
                >
                  PDF
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
              onPatch={(patch) => setForm((current) => ({ ...current, ...patch }))}
              recordId={isNew ? null : ((record as AnyRow).id as number)}
              disabled={spec.readOnly}
              autoFocus={index === 0 && !spec.readOnly}
            />
          ))}
        </div>

        {spec.lineItems && !spec.readOnly && (
          <div className="mt-4">
            <LineItemsEditor items={items} onChange={setItems} totals={itemTotals} />
          </div>
        )}

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
  onPatch,
  recordId,
  disabled,
  autoFocus,
}: {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Writes several columns at once — a picked customer fills name, email and id. */
  onPatch?: (patch: Record<string, unknown>) => void;
  /** The saved row's id, or null while the record is still being created. */
  recordId?: number | null;
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
          {field.hint && (value === null || value === undefined || value === '') && (
            <p className="mt-0.5 text-xs text-ink-subtle">{field.hint}</p>
          )}
        </div>
      );

    case 'record': {
      // An imported record kept verbatim — every field the old system held,
      // under its own field names. Read-only by nature: these are history, not
      // the shop's live values, and editing one would only make the copy lie.
      const entries =
        value && typeof value === 'object' && !Array.isArray(value)
          ? Object.entries(value as Record<string, unknown>)
          : [];
      return (
        <div className="sm:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
            {field.label}
            {entries.length > 0 && (
              <span className="ml-2 font-normal normal-case tracking-normal text-ink-subtle">
                {entries.length} fields
              </span>
            )}
          </p>
          {field.hint && <p className="mt-0.5 text-xs text-ink-subtle">{field.hint}</p>}
          {entries.length === 0 ? (
            <p className="mt-1 text-sm text-ink-muted">—</p>
          ) : (
            <dl className="mt-2 max-h-72 overflow-y-auto rounded-lg border border-line bg-surface-sunken p-3 text-xs">
              {entries.map(([key, val]) => (
                <div key={key} className="flex gap-3 border-b border-line/50 py-1 last:border-0">
                  <dt className="w-2/5 shrink-0 font-medium text-ink-muted">{key}</dt>
                  <dd className="min-w-0 flex-1 break-words text-ink">{String(val)}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      );
    }

    case 'payments':
      return <LaybyPayments laybyId={recordId ?? null} payments={value} disabled={disabled} />;

    case 'customer':
      return (
        <CustomerPicker
          field={field}
          value={String(value ?? '')}
          disabled={disabled}
          containerClassName={wide}
          onPick={(picked) => onPatch?.(picked)}
        />
      );

    case 'lookup':
      return (
        <LookupSelect
          field={field}
          value={String(value ?? '')}
          onChange={onChange}
          disabled={disabled}
          containerClassName={wide}
        />
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

/**
 * A layby's instalments, and a way to take the next one.
 *
 * Payments go through `take_layby_payment` rather than being edited into the
 * row: it recalculates the balance, closes the layby once it is settled,
 * refuses an overpayment, and stamps the shift so the money reaches that day's
 * cash-up. Editing the array by hand would do none of that, and the drawer
 * would be over by whatever was taken.
 */
function LaybyPayments({
  laybyId,
  payments,
  disabled,
}: {
  laybyId: number | null;
  payments: unknown;
  disabled?: boolean;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>('Cash');
  const [busy, setBusy] = useState(false);

  const history = Array.isArray(payments) ? (payments as Array<Record<string, unknown>>) : [];
  const taken = history.reduce((n, p) => n + (Number(p.amount) || 0), 0);

  async function record() {
    const value = toNumber(amount);
    if (!laybyId) {
      toast.warn('Save the layby first', 'A payment needs a layby to belong to.');
      return;
    }
    if (value <= 0) {
      toast.warn('Enter an amount');
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('take_layby_payment', {
        p_layby_id: laybyId,
        p_amount: value,
        p_method: method,
      });
      if (error) throw new Error(error.message);
      const result = data as { ok?: boolean; message?: string; balance_amount?: number };
      if (!result?.ok) throw new Error(result?.message ?? 'The payment was not accepted.');
      toast.success('Payment recorded', `Balance now ${money(Number(result.balance_amount ?? 0))}.`);
      setAmount('');
      void qc.invalidateQueries({ queryKey: keys.table('laybys') });
    } catch (error) {
      toast.error('Could not record the payment', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        Instalments
        {history.length > 0 && (
          <span className="ml-2 font-normal normal-case tracking-normal text-ink-subtle">
            {history.length} taken · {money(taken)}
          </span>
        )}
      </p>

      {history.length > 0 && (
        <ul className="mt-2 divide-y divide-hairline rounded-lg border border-hairline text-sm">
          {history.map((payment, index) => (
            <li key={index} className="flex items-center gap-3 px-3 py-1.5">
              <span className="tabular w-24 font-medium text-ink">
                {money(Number(payment.amount) || 0)}
              </span>
              <span className="text-xs text-ink-muted">{String(payment.method ?? '—')}</span>
              <span className="ml-auto text-xs text-ink-subtle">
                {payment.date ? formatDateTime(String(payment.date)) : '—'}
                {payment.by ? ` · ${String(payment.by)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <Input
            label="Amount"
            type="number"
            inputMode="decimal"
            className="w-28"
            containerClassName="w-32"
            value={amount}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}
          />
          <Select
            label="Method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            options={[...PAYMENT_METHODS]}
            containerClassName="w-40"
          />
          <Button size="sm" variant="secondary" loading={busy} onClick={() => void record()}>
            Record payment
          </Button>
          {!laybyId && <span className="pb-2 text-xs text-ink-subtle">Save the layby first.</span>}
        </div>
      )}
    </div>
  );
}

/**
 * Line items on a document: search the catalogue, set quantities and prices,
 * and watch the totals follow. Custom lines cover what the catalogue does
 * not — delivery, labour, a discount stated as its own line.
 */
function LineItemsEditor({
  items,
  onChange,
  totals,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  totals: { total: number; vat: number; subtotal: number };
}) {
  const [term, setTerm] = useState('');
  const lookup = products.useList(
    {
      search: { term, columns: ['name', 'sku', 'barcode'] },
      eq: { active: true },
      limit: 12,
      orderBy: { column: 'name', ascending: true },
    },
    { enabled: term.trim().length > 1 },
  );

  // Shared with the till, so the two cannot drift apart again.
  const { units, loading: unitsLoading } = useAvailableUnits(items);
  function patch(index: number, values: Partial<LineItem>) {
    onChange(
      items.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...values };
        next.line_total = Math.round(next.quantity * next.price * 100) / 100;
        return next;
      }),
    );
  }

  function addProduct(p: {
    id: number;
    name: string;
    sku: string | null;
    color: string | null;
    price: number;
    cost_price: number;
  }) {
    setTerm('');
    if (items.some((l) => l.product_id === p.id)) return;
    onChange([
      ...items,
      {
        product_id: p.id,
        name: p.name,
        sku: p.sku,
        color: p.color,
        price: Number(p.price) || 0,
        cost_price: Number(p.cost_price) || 0,
        quantity: 1,
        line_total: Number(p.price) || 0,
      },
    ]);
  }

  return (
    <div className="rounded-xl border border-hairline p-3">
      <p className="text-sm font-semibold text-ink">Lines</p>

      <div className="mt-2">
        <Input
          placeholder="Search the catalogue by name, SKU or barcode…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          leading={<Search className="h-4 w-4" />}
        />
        {(lookup.data ?? []).length > 0 && (
          <ul className="mt-2 max-h-40 divide-y divide-hairline/70 overflow-y-auto rounded-xl border border-hairline">
            {(lookup.data ?? []).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => addProduct(p)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-raised"
                >
                  <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name}</span>
                  <span className="tabular shrink-0 text-xs text-ink-subtle">
                    {money(Number(p.price) || 0)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-hairline p-4 text-center text-sm text-ink-muted">
          Nothing on this document yet.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((line, index) => (
            <li
              key={`${line.product_id ?? 'custom'}-${index}`}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-hairline px-3 py-2"
            >
              {line.product_id ? (
                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-sm font-medium text-ink">{line.name}</p>
                  <p className="text-xs text-ink-subtle">{line.sku ?? '—'}</p>
                </div>
              ) : (
                <Input
                  placeholder="Describe the line…"
                  value={line.name}
                  onChange={(e) =>
                    onChange(items.map((l, i) => (i === index ? { ...l, name: e.target.value } : l)))
                  }
                  containerClassName="min-w-[9rem] flex-1"
                />
              )}
              <Input
                label="Qty"
                type="number"
                inputMode="numeric"
                min={0}
                className="w-18"
                containerClassName="w-20"
                value={line.quantity || ''}
                onChange={(e) =>
                  patch(index, { quantity: Math.max(0, Math.floor(toNumber(e.target.value))) })
                }
              />
              <Input
                label="Price (incl)"
                type="number"
                inputMode="decimal"
                className="w-24"
                containerClassName="w-28"
                value={line.price || ''}
                onChange={(e) => patch(index, { price: toNumber(e.target.value) })}
              />
              <span className="tabular pb-2 text-sm font-semibold text-ink">
                {money(line.line_total ?? 0)}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => onChange(items.filter((_, i) => i !== index))}
              />
              {line.product_id ? (
                <ImeiChooser
                  line={line}
                  units={units[line.product_id] ?? []}
                  loading={unitsLoading}
                  onChange={(imeis) =>
                    // `imei` mirrors the first so screens reading a single
                    // serial (dispatch notes) keep working unchanged.
                    patch(index, { imeis, imei: imeis[0] ?? null })
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
        <Button
          size="sm"
          variant="secondary"
          icon={<Plus className="h-4 w-4" />}
          onClick={() =>
            onChange([...items, { name: '', price: 0, quantity: 1, line_total: 0 }])
          }
        >
          Custom line
        </Button>
        <dl className="ml-auto space-y-0.5 text-right text-sm">
          <div className="flex justify-end gap-6">
            <dt className="text-ink-muted">Subtotal (excl VAT)</dt>
            <dd className="tabular w-24 text-ink">{money(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-end gap-6">
            <dt className="text-ink-muted">VAT 15%</dt>
            <dd className="tabular w-24 text-ink">{money(totals.vat)}</dd>
          </div>
          <div className="flex justify-end gap-6 font-semibold">
            <dt className="text-ink">Total (incl)</dt>
            <dd className="tabular w-24 text-ink">{money(totals.total)}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

/**
 * A dropdown fed by another table's names, stored as plain text.
 *
 * Typing supplier names freehand produced "MTC", "M.T.C." and "mtc" as three
 * different suppliers, which quietly splits the purchase history three ways.
 * The record keeps a text column so nothing existing breaks — but the value
 * saved on a record that predates the list, or whose supplier was deleted,
 * still has to be shown and re-savable, so it is folded into the options.
 */
/**
 * Pick a customer by searching for them.
 *
 * A plain dropdown cannot carry 2,492 debtors, and the old one stored only the
 * name — so two customers called J Titus were indistinguishable and the invoice
 * had no way back to the account it belonged to.
 *
 * Searches name, IQ account code, phone and email, because the counter is told
 * whichever of those the customer happens to quote. Writes the customer's id
 * alongside the name so the document can reach their address and account.
 */
function CustomerPicker({
  field,
  value,
  disabled,
  containerClassName,
  onPick,
}: {
  field: FieldSpec;
  value: string;
  disabled?: boolean;
  containerClassName?: string;
  onPick: (patch: Record<string, unknown>) => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = term.trim();
    if (q.length < 2) { setResults([]); return; }
    let cancelled = false;
    // Debounced: a search per keystroke against 2,492 rows is wasted work and
    // the results only matter once the typing pauses.
    const timer = window.setTimeout(() => {
      setBusy(true);
      const like = `%${q.replace(/[%,]/g, '')}%`;
      void supabase
        .from('customers')
        .select('id, name, email, phone, account_code, address')
        .or(
          `name.ilike.${like},account_code.ilike.${like},phone.ilike.${like},email.ilike.${like}`,
        )
        .order('name')
        .limit(20)
        .then(({ data }) => {
          if (cancelled) return;
          setResults((data ?? []) as Array<Record<string, unknown>>);
          setBusy(false);
        });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [term]);

  return (
    <div className={containerClassName}>
      <Input
        label={field.label}
        hint={field.hint}
        required={field.required}
        disabled={disabled}
        value={term || value}
        placeholder="Search name, account, phone or email"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && term.trim().length >= 2 && (
        <div className="relative">
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-line bg-surface shadow-lg">
            {busy && <li className="px-3 py-2 text-sm text-ink-muted">Searching…</li>}
            {!busy && results.length === 0 && (
              <li className="px-3 py-2 text-sm text-ink-muted">No customer matches that.</li>
            )}
            {results.map((c) => (
              <li key={String(c.id)}>
                <button
                  type="button"
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-sunken"
                  onClick={() => {
                    onPick({
                      customer_id: c.id,
                      customer_name: c.name ?? '',
                      customer_email: c.email ?? '',
                    });
                    setTerm(String(c.name ?? ''));
                    setOpen(false);
                  }}
                >
                  <span className="text-sm font-medium text-ink">{String(c.name ?? '—')}</span>
                  <span className="text-xs text-ink-muted">
                    {[c.account_code, c.phone, c.email].filter(Boolean).join('  ·  ') || 'no contact details'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LookupSelect({
  field,
  value,
  onChange,
  disabled,
  containerClassName,
}: {
  field: FieldSpec;
  value: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  containerClassName?: string;
}) {
  const source = field.lookup === 'customers' ? customers : suppliers;
  const list = source.useList({ orderBy: { column: 'name', ascending: true } });

  const names = useMemo(() => {
    const fromTable = (list.data ?? [])
      .map((row) => String((row as { name?: unknown }).name ?? '').trim())
      .filter(Boolean);
    const unique = [...new Set(fromTable)];
    if (value && !unique.includes(value)) unique.unshift(value);
    return unique;
  }, [list.data, value]);

  return (
    <Select
      label={field.label}
      hint={field.hint}
      required={field.required}
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={names}
      placeholder={list.isLoading ? 'Loading…' : '—'}
      containerClassName={containerClassName}
    />
  );
}
