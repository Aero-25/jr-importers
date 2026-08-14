import { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Database, Upload } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { keys as keys2 } from '@/data/keys';
import { guessColumn, parseAmount, parseCsv, type Csv } from '@/lib/csv';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, Button, Notice, Select, StatTile, useToast } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

/* ── What each kind of file needs ────────────────────────────────────────── */

interface FieldSpec {
  key: string;
  label: string;
  /** Most specific first — guessColumn weights earlier entries higher. */
  candidates: string[];
  required?: boolean;
  kind?: 'text' | 'number' | 'boolean';
}

interface Target {
  id: string;
  label: string;
  table: 'products' | 'customers' | 'suppliers' | 'product_imeis';
  /** Rows carry a stock code that has to become a product id before writing. */
  resolveProduct?: boolean;
  hint: string;
  /** The column both sides are matched on, so re-importing updates. */
  matchOn: string;
  /** Turns an IQ code into something a customer would recognise. */
  translate?: (row: Record<string, unknown>) => void;
  fields: FieldSpec[];
}

const TARGETS: Target[] = [
  {
    id: 'stock',
    label: 'Stock master',
    table: 'products',
    hint: 'Stock → Stock Maintenance → Export. Tick the fields listed in docs/IQ-MIGRATION.md first.',
    matchOn: 'sku',
    /*
      IQ's DEPARTMENT is a code, not a name — 001, 002, NS. Imported as-is the
      whole catalogue lands under "002", which is no use to a customer or to the
      reports. NS is IQ's non-stock department: commission, courier, job card,
      insurance excess. Those are ledger lines, not things on a shelf, and they
      are excluded rather than renamed.
    */
    translate: (row) => {
      const map: Record<string, string> = {
        '001': 'Smartphones',
        '002': 'Accessories',
      };
      const code = String(row.category ?? '').trim();
      if (code === 'NS') {
        row.__skip = 'non-stock department (NS)';
        return;
      }
      if (map[code]) row.category = map[code];

      // A negative quantity is a sale IQ let through against no stock. It is
      // real information, but importing it would start the new system already
      // wrong; it comes in at zero and is reported.
      if (Number(row.stock ?? 0) < 0) {
        row.__negative = row.stock;
        row.stock = 0;
      }
    },
    // Candidates lead with IQ SaaS 2023 column names, taken from the Select
    // Visible Fields dialog, then fall back to the wordier names older versions
    // and other systems use.
    fields: [
      { key: 'sku', label: 'Stock code', candidates: ['code', 'stockcode', 'itemcode', 'sku'], required: true },
      { key: 'name', label: 'Description', candidates: ['descript', 'description', 'itemdescription', 'name'], required: true },
      { key: 'barcode', label: 'Barcode', candidates: ['barcode', 'gencode', 'ean', 'upc'] },
      { key: 'category', label: 'Department', candidates: ['department', 'subdepartm', 'itemcategory', 'category', 'range'] },
      { key: 'brand', label: 'Brand', candidates: ['brand', 'manufacturer', 'make', 'styledesc'] },
      { key: 'color', label: 'Colour', candidates: ['colordetailed', 'colourdesc', 'colordesc', 'colour', 'color'] },
      { key: 'description', label: 'Long description / specs', candidates: ['technicalspec', 'memo', 'notes', 'alt_descript', 'longdescription'] },
      // Average cost, not last cost: it is what IQ values the shelf at, so it
      // is the figure the stock valuation report has to agree with.
      { key: 'cost_price', label: 'Cost price', candidates: ['avrgcost', 'averagecost', 'basecost', 'lstcost', 'cost'], kind: 'number' },
      // SELLPINC1 is VAT inclusive. Prices are shown and stored inclusive
      // throughout — mapping the exclusive column instead understates every
      // price by 15% and quietly wrecks the margin reports.
      { key: 'price', label: 'Selling price (incl VAT)', candidates: ['sellpinc1', 'sellpriceincl', 'recommendretail', 'sellprice1', 'sellingprice'], kind: 'number' },
      { key: 'stock', label: 'Quantity on hand', candidates: ['onhand', 'lbonhand', 'qtyonhand', 'quantity', 'soh'], kind: 'number' },
      { key: 'reorder_level', label: 'Reorder level', candidates: ['ord_lvl', 'ordlvl', 'minimumlevel', 'reorderlevel'], kind: 'number' },
      // IQ keeps discontinued lines in the master forever. Without this the
      // shop inherits every product it has ever stocked.
      { key: 'active', label: 'Active in IQ', candidates: ['isactive', 'active'], kind: 'boolean' },
    ],
  },
  {
    id: 'serials',
    label: 'Serial numbers (IMEIs)',
    table: 'product_imeis',
    resolveProduct: true,
    hint: 'Stock → Serial Number Tracking. One row per handset, with its stock code.',
    matchOn: 'imei',
    fields: [
      { key: 'imei', label: 'Serial / IMEI', candidates: ['serialno', 'serialnumber', 'serial', 'imei'], required: true },
      { key: 'sku', label: 'Stock code', candidates: ['code', 'stockcode', 'itemcode'], required: true },
      { key: 'color', label: 'Colour', candidates: ['colordetailed', 'colourdesc', 'colour', 'color'] },
    ],
  },
  {
    id: 'debtors',
    label: 'Debtors',
    table: 'customers',
    hint: 'Debtors → Debtors Maintenance.',
    matchOn: 'email',
    fields: [
      { key: 'name', label: 'Customer name', candidates: ['name', 'accountname', 'customername'], required: true },
      { key: 'email', label: 'Email', candidates: ['email', 'emailaddress'] },
      { key: 'phone', label: 'Telephone', candidates: ['telephone', 'cellphone', 'phone', 'contactnumber'] },
      { key: 'address', label: 'Address', candidates: ['postaladdress', 'deliveryaddress', 'address', 'addressline1'] },
      { key: 'credit_limit', label: 'Credit limit', candidates: ['creditlimit', 'limit'], kind: 'number' },
    ],
  },
  {
    id: 'creditors',
    label: 'Creditors',
    table: 'suppliers',
    hint: 'Creditors → Creditors Maintenance.',
    matchOn: 'name',
    fields: [
      { key: 'name', label: 'Supplier name', candidates: ['name', 'accountname', 'suppliername'], required: true },
      { key: 'email', label: 'Email', candidates: ['email', 'emailaddress'] },
      { key: 'phone', label: 'Telephone', candidates: ['telephone', 'phone', 'contactnumber'] },
      { key: 'contact_person', label: 'Contact person', candidates: ['contact', 'contactperson'] },
    ],
  },
];

interface Preview {
  create: number;
  update: number;
  skipped: Array<{ row: number; why: string }>;
  sample: Array<Record<string, unknown>>;
  value: number;
  /** Lines IQ shows as oversold, brought in at zero. */
  negatives: number;
  /** Lines IQ has discontinued. Imported, but not shown in the shop. */
  inactive: number;
}

/**
 * Importing an IQ Retail export.
 *
 * The columns are mapped by hand rather than guessed at build time. IQ names
 * the same field differently between versions and between exports, so an
 * importer written against one file would break on the next — and a mapping
 * that is wrong in a way nobody can see is worse than one that has to be
 * confirmed.
 *
 * Nothing is written until the dry run has been read. That is the whole point
 * of the screen: a migration that goes wrong quietly is discovered weeks later,
 * in a stock take.
 */
export default function ImportIQ() {
  const toast = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [target, setTarget] = useState<Target>(TARGETS[0]!);
  const [csv, setCsv] = useState<Csv | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);

  function load(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result ?? ''));
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        toast.error('Nothing to read', 'That file has no rows this side could recognise.');
        return;
      }
      setCsv(parsed);
      setFileName(file.name);
      setPreview(null);
      // A starting point only — every guess is shown and can be changed.
      setMapping(
        Object.fromEntries(
          target.fields.map((f) => [f.key, guessColumn(parsed.headers, f.candidates)]),
        ),
      );
      toast.success(`${parsed.rows.length} rows read`, 'Check the column mapping below.');
    };
    reader.readAsText(file);
  }

  const missing = useMemo(
    () => target.fields.filter((f) => f.required && !mapping[f.key]),
    [target, mapping],
  );

  /** Turns a CSV row into the shape the table expects. */
  function shape(row: Record<string, string>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const field of target.fields) {
      const column = mapping[field.key];
      if (!column) continue;
      const raw = row[column] ?? '';
      if (!raw) continue;
      if (field.kind === 'number') out[field.key] = parseAmount(raw);
      else if (field.kind === 'boolean') out[field.key] = /^(true|yes|y|1)$/i.test(raw.trim());
      // IQ writes 'Not Defined' rather than leaving a field empty, and importing
      // that literally would put it on the shop as a colour.
      else if (!/^(not defined|n\/a|none|null)$/i.test(raw.trim())) out[field.key] = raw;
    }
    target.translate?.(out);
    return out;
  }

  async function dryRun() {
    if (!csv) return;
    setBusy(true);
    try {
      const shaped = csv.rows.map(shape);
      const skipped: Preview['skipped'] = [];
      const keyed = new Map<string, Record<string, unknown>>();

      let negatives = 0;
      let inactive = 0;

      shaped.forEach((row, index) => {
        if (row.__skip) {
          skipped.push({ row: index + 2, why: String(row.__skip) });
          return;
        }
        if (row.__negative !== undefined) negatives += 1;
        if (row.active === false) inactive += 1;

        const key = String(row[target.matchOn] ?? '').trim().toLowerCase();
        for (const field of target.fields) {
          if (field.required && !row[field.key]) {
            skipped.push({ row: index + 2, why: `${field.label} is empty` });
            return;
          }
        }
        if (!key) {
          skipped.push({ row: index + 2, why: `no ${target.matchOn} to match on` });
          return;
        }
        // A later row wins: IQ exports sometimes repeat a code across branches.
        keyed.set(key, row);
      });

      if (target.resolveProduct) {
        const skus = [...new Set([...keyed.values()].map((r) => String(r.sku ?? '')))];
        const known = new Set<string>();
        for (let i = 0; i < skus.length; i += 200) {
          const { data } = await supabase
            .from('products')
            .select('sku')
            .in('sku', skus.slice(i, i + 200));
          for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            known.add(String(row.sku ?? '').toLowerCase());
          }
        }
        for (const [key, row] of [...keyed]) {
          if (!known.has(String(row.sku ?? '').toLowerCase())) {
            keyed.delete(key);
            skipped.push({ row: 0, why: `stock code ${row.sku} is not in the system yet` });
          }
        }
      }

      const existingKeys = new Set<string>();
      const all = [...keyed.keys()];
      // Chunked: a few thousand codes in one `in` filter exceeds the URL limit.
      for (let i = 0; i < all.length; i += 200) {
        const chunk = all.slice(i, i + 200);
        const { data } = await supabase
          .from(target.table)
          .select(target.matchOn)
          .in(target.matchOn, chunk);
        for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
          existingKeys.add(String(row[target.matchOn] ?? '').toLowerCase());
        }
      }

      const rows = [...keyed.values()];
      setPreview({
        create: rows.filter((r) => !existingKeys.has(String(r[target.matchOn]).toLowerCase())).length,
        update: rows.filter((r) => existingKeys.has(String(r[target.matchOn]).toLowerCase())).length,
        skipped,
        sample: rows.slice(0, 5),
        value: rows.reduce(
          (n, r) => n + Number(r.stock ?? 0) * Number(r.cost_price ?? 0),
          0,
        ),
        negatives,
        inactive,
      });
    } catch (error) {
      toast.error('Could not check the file', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (!csv || !preview) return;
    setBusy(true);
    try {
      const keyed = new Map<string, Record<string, unknown>>();
      for (const row of csv.rows.map(shape)) {
        const key = String(row[target.matchOn] ?? '').trim().toLowerCase();
        if (!key) continue;
        if (row.__skip) continue;
        if (target.fields.some((f) => f.required && !row[f.key])) continue;

        delete row.__skip;
        delete row.__negative;
        // Anything IQ has discontinued comes across but stays off the shop, so
        // history and reporting keep working without the catalogue inheriting
        // every product the business has ever stocked.
        if (target.table === 'products' && row.active === undefined) row.active = true;
        keyed.set(key, row);
      }

      // Matched explicitly rather than by upsert. PostgREST infers the conflict
      // target from a plain column, and the unique indexes here are on
      // lower(code) so that "AB-1" and "ab-1" are the same product — an
      // inference Postgres will not make. Reading the ids first is slower and
      // certain, which is the correct trade for a one-way migration.
      const keys = [...keyed.keys()];
      const existing = new Map<string, string | number>();
      for (let i = 0; i < keys.length; i += 200) {
        const { data, error } = await supabase
          .from(target.table)
          .select(`id, ${target.matchOn}`)
          .in(target.matchOn, keys.slice(i, i + 200));
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
          existing.set(String(row[target.matchOn] ?? '').toLowerCase(), row.id as string | number);
        }
      }

      if (target.resolveProduct) {
        // product_imeis holds a product id, not a stock code. Resolving here
        // rather than in the database keeps the unmatched codes visible: a
        // serial attached to a product that was never imported would otherwise
        // fail the whole batch with nothing to say which row caused it.
        const skus = [...new Set([...keyed.values()].map((r) => String(r.sku ?? '')))];
        const bySku = new Map<string, number>();
        for (let i = 0; i < skus.length; i += 200) {
          const { data, error } = await supabase
            .from('products')
            .select('id, sku')
            .in('sku', skus.slice(i, i + 200));
          if (error) throw new Error(error.message);
          for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
            bySku.set(String(row.sku ?? '').toLowerCase(), row.id as number);
          }
        }

        let orphans = 0;
        for (const [key, row] of [...keyed]) {
          const id = bySku.get(String(row.sku ?? '').toLowerCase());
          if (id === undefined) {
            keyed.delete(key);
            orphans += 1;
            continue;
          }
          delete row.sku;
          row.product_id = id;
          // Status only on units this import creates. An update must leave it
          // alone — re-running an old export against a live system would
          // otherwise put already-sold handsets back on the shelf, and the
          // stock trigger would count them.
          if (!existing.has(key)) row.status = 'available';
        }
        if (orphans > 0) {
          toast.warn(
            `${orphans} serial(s) skipped`,
            'Their stock code is not in the system. Import the stock master first.',
          );
        }
      }

      const inserts: Array<Record<string, unknown>> = [];
      const updates: Array<{ id: string | number; values: Record<string, unknown> }> = [];
      for (const [key, values] of keyed) {
        const id = existing.get(key);
        if (id === undefined) inserts.push(values);
        else updates.push({ id, values });
      }

      for (let i = 0; i < inserts.length; i += 100) {
        const { error } = await supabase
          .from(target.table)
          .insert(inserts.slice(i, i + 100) as never);
        if (error) throw new Error(error.message);
      }

      // One at a time: a batch update cannot give each row different values,
      // and correctness matters more than speed on a job run once.
      for (const { id, values } of updates) {
        const { error } = await supabase
          .from(target.table)
          .update(values as never)
          .eq('id', id);
        if (error) throw new Error(error.message);
      }

      void qc.invalidateQueries({ queryKey: keys2.table(target.table) });
      toast.success(
        `${inserts.length} added, ${updates.length} updated`,
        'Check the totals against IQ before trusting them.',
      );
      setPreview(null);
      setCsv(null);
      setFileName('');
    } catch (error) {
      toast.error('Import failed', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <ModuleHeader
        title="Import from IQ Retail"
        description="Read an IQ export, map the columns, check what would land, then write it."
      />

      <div className="space-y-5 p-6">
        <Notice tone="warn" title="Nothing is written until you have read the dry run">
          A migration that goes wrong quietly is discovered weeks later, in a stock take. Import
          the stock master first, then debtors, then creditors.
        </Notice>

        {/* ── 1. What kind of file ──────────────────────────────────── */}
        <section className="rounded-2xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            1 · What are you importing
          </h2>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTarget(t);
                  setCsv(null);
                  setPreview(null);
                }}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                  target.id === t.id
                    ? 'bg-brand-600 text-white'
                    : 'border border-hairline text-ink-muted hover:bg-raised',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-subtle">{target.hint}</p>
        </section>

        {/* ── 2. The file ───────────────────────────────────────────── */}
        <section className="rounded-2xl border border-hairline bg-surface p-5">
          <h2 className="mb-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            2 · The export
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>
              Choose a CSV
            </Button>
            {fileName && (
              <span className="text-sm text-ink">
                {fileName} · <strong>{csv?.rows.length ?? 0}</strong> rows,{' '}
                {csv?.headers.length ?? 0} columns
              </span>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) load(file);
                e.target.value = '';
              }}
            />
          </div>
          <p className="mt-2 text-xs text-ink-subtle">
            Export from IQ with all columns selected. Do not tidy the file first — commas,
            semicolons and quoted fields are all handled.
          </p>
        </section>

        {/* ── 3. Mapping ────────────────────────────────────────────── */}
        {csv && (
          <section className="rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="mb-1 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
              3 · Which column is which
            </h2>
            <p className="mb-4 text-xs text-ink-subtle">
              Guessed from the headers. Check every one — a wrong mapping writes bad data into
              every row without complaining.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {target.fields.map((field) => (
                <div key={field.key}>
                  <Select
                    label={
                      field.required ? `${field.label} *` : field.label
                    }
                    value={mapping[field.key] ?? ''}
                    onChange={(e) =>
                      setMapping((m) => ({ ...m, [field.key]: e.target.value }))
                    }
                  >
                    <option value="">— not imported —</option>
                    {csv.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                  {mapping[field.key] && csv.rows[0]?.[mapping[field.key]!] && (
                    <p className="mt-1 truncate px-1 text-xs text-ink-subtle">
                      e.g. {csv.rows[0][mapping[field.key]!]}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {missing.length > 0 && (
              <Notice tone="danger" className="mt-4" title="Required columns are not mapped">
                {missing.map((f) => f.label).join(', ')}
              </Notice>
            )}

            <Button
              className="mt-4"
              variant="secondary"
              icon={<Database className="h-4 w-4" />}
              disabled={missing.length > 0}
              loading={busy}
              onClick={dryRun}
            >
              Check what would happen
            </Button>
          </section>
        )}

        {/* ── 4. Dry run ────────────────────────────────────────────── */}
        {preview && (
          <section className="rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="mb-3 text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
              4 · What this would do
            </h2>

            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile label="New records" value={preview.create} tone="success" />
              <StatTile label="Updated" value={preview.update} tone="brand" />
              <StatTile
                label="Skipped"
                value={preview.skipped.length}
                tone={preview.skipped.length > 0 ? 'warn' : 'neutral'}
              />
              {target.table === 'products' && (
                <StatTile label="Stock at cost" value={money(preview.value)} />
              )}
            </div>

            {target.table === 'products' && (
              <>
                <Notice tone="info" className="mt-4" title="Compare this against IQ before you write">
                  IQ&rsquo;s own stock valuation should show{' '}
                  <strong>{money(preview.value)}</strong>. If it does not, the cost or quantity
                  column is mapped to the wrong field — fix it now rather than after.
                </Notice>

                {preview.negatives > 0 && (
                  <Notice tone="warn" className="mt-3" title={`${preview.negatives} lines are oversold in IQ`}>
                    IQ shows a negative quantity on these — it let a sale through against stock it
                    did not have. They come in at zero rather than carrying the error over. Worth a
                    look: a negative is usually a receipt that was never booked in.
                  </Notice>
                )}

                {preview.inactive > 0 && (
                  <Notice tone="info" className="mt-3" title={`${preview.inactive} lines are discontinued`}>
                    Imported but hidden from the shop, so history and reporting still work without
                    the catalogue inheriting every product the business has ever stocked.
                  </Notice>
                )}
              </>
            )}

            {preview.skipped.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-warn">
                  <AlertTriangle className="h-4 w-4" />
                  These rows will not be imported
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-hairline p-3 text-xs">
                  {preview.skipped.slice(0, 50).map((s, i) => (
                    <li key={i} className="text-ink-muted">
                      Row {s.row}: {s.why}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full min-w-[32rem] text-xs">
                <thead>
                  <tr className="border-b border-hairline bg-raised/60 text-2xs uppercase tracking-wider text-ink-muted">
                    {Object.keys(preview.sample[0] ?? {}).map((k) => (
                      <th key={k} className="px-3 py-2 text-left font-bold">
                        {k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline/70">
                  {preview.sample.map((row, i) => (
                    <tr key={i}>
                      {Object.values(row).map((v, j) => (
                        <td key={j} className="max-w-[12rem] truncate px-3 py-1.5 text-ink">
                          {String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              className="mt-4"
              variant="danger"
              icon={<Check className="h-4 w-4" />}
              loading={busy}
              onClick={runImport}
            >
              Import {preview.create + preview.update} records
            </Button>
            <p className="mt-2 text-xs text-ink-subtle">
              Matched on <Badge size="sm">{target.matchOn}</Badge> — running this twice updates
              rather than duplicates.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
