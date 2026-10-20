import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Gauge,
  Mail,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  Upload as UploadIcon,
  Users,
  Warehouse,
} from 'lucide-react';
import {
  type CustomerMatch,
  type PriceListItem,
  type StockStatus,
  useApproveList,
  useBulkDashboard,
  useBulkSetMarkups,
  useBulkSettings,
  useClearMarkup,
  useCurrentList,
  useCustomerSearch,
  useDeleteRecipient,
  useGenerateCatalogueList,
  useDeliveries,
  useDistributions,
  useImportRecipients,
  usePriceListItems,
  usePriceLists,
  useRecipients,
  useRetryFailed,
  useSaveBulkSetting,
  useSaveRecipient,
  useSaveUpload,
  useSendPriceList,
  useSetMarkup,
} from '@/data/bulkPricing';
import {
  describeHandset,
  parseSupplierList,
  type ParsedSupplierList,
} from '@/lib/supplierPriceList';
import { buildCustomerPdf, priceListFileName } from '@/lib/bulkPriceListPdf';
import { buildCostingWorkbook, costingFileName } from '@/lib/bulkCostingXlsx';
import { formatDate, money } from '@/lib/format';
import { cn } from '@/lib/cn';
import {
  Badge,
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  Notice,
  Select,
  Skeleton,
  StatTile,
  Textarea,
  type Tone,
  useToast,
} from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

type Tab = 'dashboard' | 'upload' | 'pricing' | 'stock' | 'lists' | 'email' | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: typeof Gauge }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Gauge },
  { id: 'upload', label: 'Upload supplier prices', icon: UploadIcon },
  { id: 'pricing', label: 'Pricing & markups', icon: BadgePercent },
  { id: 'stock', label: 'Stock availability', icon: Warehouse },
  { id: 'lists', label: 'Generated lists', icon: FileSpreadsheet },
  { id: 'email', label: 'Email distribution', icon: Mail },
  { id: 'settings', label: 'Settings', icon: CalendarClock },
];

/**
 * What the shop can say about a handset: it is here, or it is coming.
 *
 * Everything on this list is on a supplier price list the shop orders from, so
 * there is no third answer — "out of stock" would tell a dealer the phone
 * cannot be had when it arrives with the next order. 'out_of_stock' survives in
 * the type for rows written before that was settled, and reads the same way.
 */
const STATUS: Record<StockStatus, { label: string; tone: Tone }> = {
  in_stock: { label: 'In stock', tone: 'lime' },
  on_order: { label: 'On order', tone: 'warn' },
  out_of_stock: { label: 'On order', tone: 'warn' },
};

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Bulk pricing.
 *
 * A supplier list arrives on a Monday; this turns it into a dealer price list
 * and posts it. Two things about it are deliberate and worth stating up front,
 * because both are easy to assume the other way round:
 *
 *   * None of this touches the catalogue. These are special weekly prices for
 *     a dealer list — `products.price` and `products.cost_price` are never
 *     written to. The shop's own pricing is a separate decision.
 *
 *   * The markup is remembered against the handset, not the file. Next Monday's
 *     upload arrives with new costs and keeps every markup that was set by
 *     hand; a handset nobody has priced yet takes the default.
 */
/**
 * The brands the shop sends a dealer list for.
 *
 * Samsung is priced forward from a supplier's weekly sheet. Ulefone is bought
 * direct, carries no import VAT, and is quoted at the shop’s own online price
 * — so it has no supplier file and no markup to set. Each brand keeps its own
 * live list for the week, and approving one never supersedes the other.
 */
const BRANDS = ['Samsung', 'Ulefone'] as const;
type Brand = (typeof BRANDS)[number];

export default function BulkPricing() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [brand, setBrand] = useState<Brand>('Samsung');

  return (
    <>
      <ModuleHeader
        title="Bulk pricing"
        description="A supplier list in, a branded dealer price list out — and sent to each customer individually."
      />

      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Brand">
          <span className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            Price list for
          </span>
          {BRANDS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setBrand(name)}
              aria-pressed={brand === name}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                brand === name
                  ? 'bg-ink text-white'
                  : 'border border-hairline text-ink-muted hover:bg-raised',
              )}
            >
              {name}
            </button>
          ))}
        </div>

        <nav className="flex flex-wrap gap-1.5" aria-label="Bulk pricing">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              aria-current={tab === id ? 'page' : undefined}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
                tab === id
                  ? 'bg-brand-600 text-white'
                  : 'border border-hairline text-ink-muted hover:bg-raised',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        {tab === 'dashboard' && <DashboardPanel brand={brand} onGo={setTab} />}
        {tab === 'upload' &&
          (brand === 'Samsung' ? (
            <UploadPanel brand={brand} onDone={() => setTab('pricing')} />
          ) : (
            <CataloguePanel brand={brand} onDone={() => setTab('pricing')} />
          ))}
        {tab === 'pricing' && <PricingPanel brand={brand} />}
        {tab === 'stock' && <StockPanel brand={brand} />}
        {tab === 'lists' && <ListsPanel />}
        {tab === 'email' && <EmailPanel brand={brand} />}
        {tab === 'settings' && <SettingsPanel />}
      </div>
    </>
  );
}

/* ── Dashboard ───────────────────────────────────────────────────────────── */

function DashboardPanel({ brand, onGo }: { brand: Brand; onGo: (tab: Tab) => void }) {
  const { data, isLoading } = useBulkDashboard();
  // The dashboard RPC reports the newest list of any brand; the tiles below
  // are about the brand on screen, so they read that directly.
  const { current } = useCurrentList(brand);

  if (isLoading || !data) return <Skeleton className="h-64" />;

  const list = current;
  const stale = list ? list.week_start !== data.this_week : false;

  return (
    <section className="space-y-4">
      {!list && (
        <Notice tone="info">
          Nothing has been priced yet. Upload this week&rsquo;s supplier list to begin.
        </Notice>
      )}

      {list && stale && (
        <Notice tone="warn">
          The newest price list is for the week of {formatDate(list.week_start)}, not this week. A
          scheduled send will be skipped rather than post last week&rsquo;s prices.
        </Notice>
      )}

      {list && list.status === 'draft' && (
        <Notice tone="info">
          This week&rsquo;s list is still a draft. Review the markups, then approve it before sending.
        </Notice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Handsets priced"
          value={list ? String(list.product_count) : '—'}
          sub={list ? `Week of ${formatDate(list.week_start)}` : 'No list yet'}
        />
        <StatTile
          label="In stock"
          value={list ? String(list.in_stock_count) : '—'}
          sub="Shaded green on the customer list"
        />
        <StatTile
          label="On order"
          value={list ? String(list.on_order_count) : '—'}
          sub="Not shaded — we bring it in"
        />
        <StatTile
          label="Recipients"
          value={`${data.recipients.active}`}
          sub={`${data.recipients.total} on the list`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Latest supplier file</h3>
          {data.latest_upload ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="File">{data.latest_upload.file_name}</Row>
              <Row label="Uploaded">{formatDate(data.latest_upload.at)}</Row>
              <Row label="Samsung phones">{data.latest_upload.phones}</Row>
              <Row label="Lines skipped">{data.latest_upload.skipped}</Row>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-subtle">Nothing uploaded yet.</p>
          )}
          <Button className="mt-4" onClick={() => onGo('upload')}>
            <UploadIcon className="h-4 w-4" aria-hidden /> Upload supplier prices
          </Button>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Last distribution</h3>
          {data.latest_distribution ? (
            <dl className="mt-3 space-y-1.5 text-sm">
              <Row label="Sent">{formatDate(data.latest_distribution.at)}</Row>
              <Row label="Recipients">{data.latest_distribution.recipients}</Row>
              <Row label="Delivered">{data.latest_distribution.sent}</Row>
              <Row label="Failed">{data.latest_distribution.failed}</Row>
              {data.latest_distribution.pending > 0 && (
                <Row label="Still sending">{data.latest_distribution.pending}</Row>
              )}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-ink-subtle">No price list has been sent yet.</p>
          )}
          <Button className="mt-4" variant="secondary" onClick={() => onGo('email')}>
            <Send className="h-4 w-4" aria-hidden /> Email distribution
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Rates in use</h3>
        <div className="mt-3 flex flex-wrap gap-6 text-sm">
          <Figure label="Import VAT">{(data.rates.import_vat * 100).toFixed(1)}%</Figure>
          <Figure label="Sales VAT">{(data.rates.sales_vat * 100).toFixed(1)}%</Figure>
          <Figure label="Default markup">{Number(data.rates.default_markup).toFixed(1)}%</Figure>
          <Figure label="Markups set by hand">{data.markups_overridden}</Figure>
          <Figure label="Weekly auto-send">{data.rates.auto_send ? 'On' : 'Off'}</Figure>
          <Figure label="Approval required">{data.rates.require_approval ? 'Yes' : 'No'}</Figure>
        </div>
        <p className="mt-4 text-xs text-ink-subtle">
          These are special prices for the dealer list. Nothing here changes the shop&rsquo;s own
          selling prices or cost prices.
        </p>
      </div>
    </section>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between gap-4">
    <dt className="text-ink-subtle">{label}</dt>
    <dd className="tabular font-medium text-ink">{children}</dd>
  </div>
);

const Figure = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <p className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{label}</p>
    <p className="tabular mt-0.5 text-lg font-semibold text-ink">{children}</p>
  </div>
);

/* ── Upload ──────────────────────────────────────────────────────────────── */

/**
 * Ulefone has no supplier sheet to upload: the shop buys direct and quotes its
 * own online price, so the list is built from the catalogue instead.
 */
function CataloguePanel({ brand, onDone }: { brand: Brand; onDone: () => void }) {
  const build = useGenerateCatalogueList();
  const { current } = useCurrentList(brand);
  const toast = useToast();

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Build this week&rsquo;s {brand} list</h3>
        <p className="mt-1 text-sm text-ink-subtle">
          {brand} is bought direct and carries no import VAT, so there is no supplier file and
          no markup to set. The dealer price is the shop&rsquo;s own online price, taken exactly
          as it stands &mdash; phones and tablets listed on the shop.
        </p>

        {current && (
          <p className="mt-3 text-xs text-ink-subtle">
            The current list is from {formatDate(current.created_at)} with {current.product_count}{' '}
            lines. Building again replaces it while it is still a draft.
          </p>
        )}

        <Button
          className="mt-4"
          disabled={build.isPending}
          onClick={() =>
            build.mutate(
              { brand },
              {
                onSuccess: () => {
                  toast.success(`${brand} price list built from the catalogue.`);
                  onDone();
                },
                onError: (e) => toast.error(e.message),
              },
            )
          }
        >
          {build.isPending ? 'Building…' : `Build the ${brand} list`}
        </Button>
      </div>
    </section>
  );
}

function UploadPanel({ brand, onDone }: { brand: Brand; onDone: () => void }) {
  const [parsed, setParsed] = useState<ParsedSupplierList | null>(null);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ model: '', storage: '', cost: '', fiveG: false });
  const [addError, setAddError] = useState<string | null>(null);

  /**
   * The preview is editable before it is saved.
   *
   * A supplier list is not the same thing as the list the shop wants to put
   * out: a handset may be discontinued, quoted separately, or written in a way
   * the parser could not read. Curating here rather than after pricing keeps
   * the generated list and the file it came from describing the same set.
   */
  const removeRow = (model: string, storage: number) =>
    setParsed((current) =>
      current === null
        ? current
        : {
            ...current,
            rows: current.rows.filter(
              (row) => !(row.model === model && row.storage_gb === storage),
            ),
          },
    );

  const addRow = () => {
    setAddError(null);
    const model = draft.model.trim().toUpperCase();
    const storage = Number(draft.storage);
    const cost = Number(draft.cost);

    if (!model) return setAddError('Which model? For example A17, S26 Ultra or Z Fold 7.');
    if (!Number.isFinite(storage) || storage <= 0) return setAddError('Enter the storage size in GB.');
    if (!Number.isFinite(cost) || cost <= 0) return setAddError('Enter the supplier cost.');

    // Storage identifies a handset, so the same model and size twice would
    // price one of them twice over.
    const clash = (parsed?.rows ?? []).some(
      (row) => row.model.toUpperCase() === model && row.storage_gb === storage,
    );
    if (clash) return setAddError(`${model} ${storage}GB is already on this list.`);

    setParsed((current) =>
      current === null
        ? current
        : {
            ...current,
            rows: [
              ...current.rows,
              {
                display_name: describeHandset(model, storage, draft.fiveG),
                model,
                storage_gb: storage,
                five_g: draft.fiveG,
                description: 'Added by hand',
                supplier_cost: cost,
              },
            ].sort((a, b) => a.display_name.localeCompare(b.display_name)),
          },
    );
    setDraft({ model: '', storage: '', cost: '', fiveG: false });
  };

  const save = useSaveUpload();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);

  const read = async (file: File) => {
    setError(null);
    setParsed(null);
    setBusy(true);
    try {
      if (file.size > 8 * 1024 * 1024) {
        throw new Error('That file is larger than 8MB — it is unlikely to be a price list.');
      }
      const result = await parseSupplierList(file);
      setParsed(result);
      setFileName(file.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Upload this week&rsquo;s {brand} supplier file</h3>
        <p className="mt-1 text-sm text-ink-subtle">
          Excel (.xlsx) or CSV. The {brand} phones are picked out automatically — tablets and other
          brands are left behind.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,.xlsm,.xls,.csv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void read(file);
            }}
          />
          <Button onClick={() => input.current?.click()} disabled={busy}>
            <UploadIcon className="h-4 w-4" aria-hidden />
            {busy ? 'Reading…' : 'Choose file'}
          </Button>
          {fileName && <span className="text-sm text-ink-muted">{fileName}</span>}
        </div>

        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
      </div>

      {parsed && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Samsung phones found" value={String(parsed.rows.length)} />
            <StatTile label="Lines skipped" value={String(parsed.skipped.length)} />
            <StatTile label="Duplicate handsets" value={String(parsed.duplicates.length)} />
          </div>

          {parsed.rows.length === 0 && (
            <Notice tone="danger">
              No Samsung phones were recognised. Check that the descriptions and prices are in the
              first two columns.
            </Notice>
          )}

          {parsed.duplicates.length > 0 && (
            <Notice tone="warn">
              {parsed.duplicates.length} handset
              {parsed.duplicates.length === 1 ? '' : 's'} appeared more than once — the same model
              and storage in two RAM builds. The cheaper cost is used.
            </Notice>
          )}

          <div className="overflow-x-auto rounded-2xl border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-raised text-left text-2xs uppercase tracking-[0.12em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Handset</th>
                  <th className="px-4 py-2.5">Storage</th>
                  <th className="px-4 py-2.5">5G</th>
                  <th className="px-4 py-2.5 text-right">Supplier cost</th>
                  <th className="px-4 py-2.5">From the supplier&rsquo;s file</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline/70">
                {parsed.rows.map((row) => (
                  <tr key={`${row.model}-${row.storage_gb}`}>
                    <td className="px-4 py-2.5 font-medium text-ink">{row.display_name}</td>
                    <td className="tabular px-4 py-2.5">{row.storage_gb}GB</td>
                    <td className="px-4 py-2.5">{row.five_g ? 'Yes' : '—'}</td>
                    <td className="tabular px-4 py-2.5 text-right">{money(row.supplier_cost)}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-subtle">{row.description}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => removeRow(row.model, row.storage_gb)}
                        title={`Leave ${row.display_name} off this list`}
                        className="rounded-lg p-1.5 text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        <span className="sr-only">Remove {row.display_name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Add a handset the supplier did not list, or one the file could
              not be read for. It is priced exactly like the rest. */}
          <div className="rounded-2xl border border-hairline bg-surface p-5">
            <h3 className="text-sm font-semibold text-ink">Add a handset by hand</h3>
            <p className="mt-1 text-xs text-ink-subtle">
              For something the supplier quoted separately, or a line the file could not be read
              for. It is added to this week&rsquo;s list only — next week&rsquo;s upload starts from
              the supplier&rsquo;s file again, though any markup you set is remembered.
            </p>
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <Field label="Model" hint="A17, S26 Ultra, Z Fold 7" htmlFor="bulk-add-model">
                <Input
                  id="bulk-add-model"
                  value={draft.model}
                  onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                  placeholder="A17"
                  className="w-32"
                />
              </Field>
              <Field label="Storage (GB)" htmlFor="bulk-add-storage">
                <Input
                  id="bulk-add-storage"
                  type="number"
                  min={1}
                  value={draft.storage}
                  onChange={(e) => setDraft({ ...draft, storage: e.target.value })}
                  placeholder="128"
                  className="w-28"
                />
              </Field>
              <Field label="Supplier cost" htmlFor="bulk-add-cost">
                <Input
                  id="bulk-add-cost"
                  type="number"
                  min={0}
                  step={0.01}
                  value={draft.cost}
                  onChange={(e) => setDraft({ ...draft, cost: e.target.value })}
                  placeholder="2795"
                  className="w-32"
                />
              </Field>
              <div className="pb-1">
                <Checkbox
                  label="5G"
                  checked={draft.fiveG}
                  onChange={(e) => setDraft({ ...draft, fiveG: e.target.checked })}
                />
              </div>
              <Button variant="secondary" onClick={addRow}>
                <Plus className="h-4 w-4" aria-hidden /> Add
              </Button>
            </div>
            {addError && (
              <Notice tone="danger" className="mt-3">
                {addError}
              </Notice>
            )}
          </div>

          {parsed.skipped.length > 0 && (
            <details className="rounded-2xl border border-hairline bg-surface p-5">
              <summary className="cursor-pointer text-sm font-semibold text-ink">
                {parsed.skipped.length} lines were not imported
              </summary>
              <ul className="mt-3 space-y-1 text-xs text-ink-subtle">
                {parsed.skipped.map((row, i) => (
                  <li key={i} className="flex gap-2">
                    <Badge tone="neutral">{row.reason}</Badge>
                    <span>{row.description}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex flex-wrap gap-3">
            <Button
              disabled={parsed.rows.length === 0 || save.isPending}
              onClick={() => {
                save.mutate(
                  { fileName, parsed },
                  {
                    onSuccess: () => {
                      toast.success(`${parsed.rows.length} handsets priced.`);
                      onDone();
                    },
                    onError: (e) => toast.error(e.message),
                  },
                );
              }}
            >
              {save.isPending ? 'Pricing…' : 'Save and price this list'}
            </Button>
            <Button variant="ghost" onClick={() => setParsed(null)}>
              Discard
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/* ── Pricing & markups ───────────────────────────────────────────────────── */

function PricingPanel({ brand }: { brand: Brand }) {
  const { current, isLoading } = useCurrentList(brand);
  const items = usePriceListItems(current?.id);
  const setMarkup = useSetMarkup();
  const clearMarkup = useClearMarkup();
  const bulkSet = useBulkSetMarkups();
  const approve = useApproveList();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkValue, setBulkValue] = useState('');

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (items.data ?? []).filter(
      (row) => !needle || row.display_name.toLowerCase().includes(needle),
    );
  }, [items.data, search]);

  if (isLoading) return <Skeleton className="h-64" />;
  if (!current) {
    return <Notice tone="info">Upload a supplier file first — there is nothing to price yet.</Notice>;
  }

  const defaultMarkup = Number(current.default_markup);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Search" htmlFor="bulk-search">
            <Input
                  id="bulk-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="A17, S26, Z Fold…"
            />
          </Field>
          {selected.size > 0 && (
            <div className="flex items-end gap-2 rounded-xl border border-hairline bg-surface px-3 py-2">
              <Field label={`Markup for ${selected.size} selected`}>
                <Input
                  type="number"
                  min={0}
                  max={500}
                  step={0.5}
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  className="w-24"
                />
              </Field>
              <Button
                disabled={bulkValue === '' || bulkSet.isPending}
                onClick={() =>
                  bulkSet.mutate(
                    {
                      variantKeys: [...selected],
                      markup: Number(bulkValue),
                      listId: current.id,
                    },
                    {
                      onSuccess: () => {
                        toast.success(`${selected.size} markups updated.`);
                        setSelected(new Set());
                        setBulkValue('');
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                Apply
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone={current.status === 'draft' ? 'warn' : 'lime'}>
            {current.status === 'draft' ? 'Draft' : current.status === 'sent' ? 'Sent' : 'Approved'}
          </Badge>
          {current.status === 'draft' && (
            <Button
              onClick={async () => {
                try {
                  // Built here and stored on approval, because a Monday
                  // morning send happens with no browser open.
                  const pdf = await buildCustomerPdf({
                    lines: (items.data ?? []).map((r) => ({
                      display_name: r.display_name,
                      storage_gb: r.storage_gb,
                      five_g: r.five_g,
                      final_price: Number(r.final_price),
                      stock_status: r.stock_status,
                      stock_qty: r.stock_qty,
                    })),
                    weekStart: current.week_start,
                    brand,
                  });
                  approve.mutate(
                    { listId: current.id, weekStart: current.week_start, pdf },
                    {
                      onSuccess: () => toast.success('Price list approved — ready to send.'),
                      onError: (e) => toast.error(e.message),
                    },
                  );
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              disabled={approve.isPending}
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden /> Approve list
            </Button>
          )}
        </div>
      </div>

      {current.pricing_mode === 'shop_price' ? (
        <Notice tone="info">
          These are quoted at the shop&rsquo;s own online price, so there is no markup to set — the
          price came first and the margin shown is worked back from it. Change a price on the
          product itself and rebuild the list.
        </Notice>
      ) : null}

      <p className="text-xs text-ink-subtle">
        Supplier cost + {(Number(current.import_vat_rate) * 100).toFixed(1)}% import VAT, then the
        handset&rsquo;s markup, then {(Number(current.sales_vat_rate) * 100).toFixed(1)}% sales VAT.
        A markup you set here is remembered for next week&rsquo;s upload.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-2xs uppercase tracking-[0.12em] text-ink-subtle">
            <tr>
              <th className="w-8 px-3 py-2.5" />
              <th className="px-4 py-2.5">Handset</th>
              <th className="px-3 py-2.5 text-right">Cost</th>
              <th className="px-3 py-2.5 text-right">Import VAT</th>
              <th className="px-3 py-2.5 text-right">Landed</th>
              <th className="px-3 py-2.5 text-center">Markup %</th>
              <th className="px-3 py-2.5 text-right">Excl. VAT</th>
              <th className="px-3 py-2.5 text-right">VAT</th>
              <th className="px-3 py-2.5 text-right">Retail</th>
              <th className="px-3 py-2.5">Stock</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline/70">
            {rows.map((row) => (
              <MarkupRow
                key={row.variant_key}
                row={row}
                listId={current.id}
                defaultMarkup={defaultMarkup}
                readOnly={current.pricing_mode === 'shop_price'}
                selected={selected.has(row.variant_key)}
                onSelect={(on) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (on) next.add(row.variant_key);
                    else next.delete(row.variant_key);
                    return next;
                  })
                }
                onSave={(markup) =>
                  setMarkup.mutate(
                    { variantKey: row.variant_key, markup, label: row.display_name, listId: current.id },
                    { onError: (e) => toast.error(e.message) },
                  )
                }
                onReset={() =>
                  clearMarkup.mutate(
                    { variantKey: row.variant_key, listId: current.id },
                    { onError: (e) => toast.error(e.message) },
                  )
                }
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MarkupRow({
  row,
  listId: _listId,
  defaultMarkup,
  readOnly,
  selected,
  onSelect,
  onSave,
  onReset,
}: {
  row: PriceListItem;
  listId: number;
  defaultMarkup: number;
  readOnly: boolean;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onSave: (markup: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(String(Number(row.markup_pct)));

  // The server owns the number. When a recalculation comes back, the field
  // follows it rather than holding a stale edit.
  useEffect(() => setDraft(String(Number(row.markup_pct))), [row.markup_pct]);

  const overridden = !readOnly && Math.abs(Number(row.markup_pct) - defaultMarkup) > 0.0005;
  const commit = () => {
    const value = Number(draft);
    if (!Number.isFinite(value) || value < 0 || value > 500) {
      setDraft(String(Number(row.markup_pct)));
      return;
    }
    if (Math.abs(value - Number(row.markup_pct)) > 0.0005) onSave(value);
  };

  return (
    <tr className={cn(row.stock_status === 'in_stock' && 'bg-lime-500/5')}>
      <td className="px-3 py-2">
        <Checkbox
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
          label={<span className="sr-only">{`Select ${row.display_name}`}</span>}
        />
      </td>
      <td className="px-4 py-2 font-medium text-ink">{row.display_name}</td>
      <td className="tabular px-3 py-2 text-right text-ink-muted">{money(row.supplier_cost)}</td>
      <td className="tabular px-3 py-2 text-right text-ink-subtle">{money(row.import_vat)}</td>
      <td className="tabular px-3 py-2 text-right text-ink-muted">{money(row.landed_cost)}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-center gap-1">
          <Input
            type="number"
            min={0}
            max={500}
            step={0.5}
            disabled={readOnly}
            value={readOnly ? Number(row.markup_pct).toFixed(1) : draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            aria-label={`Markup for ${row.display_name}`}
            className={cn('w-20 text-center', overridden && 'border-brand-400 font-semibold')}
          />
          {overridden && (
            <button
              type="button"
              onClick={onReset}
              title={`Back to the default ${defaultMarkup}%`}
              className="rounded-lg p-1 text-ink-subtle hover:bg-raised hover:text-ink"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              <span className="sr-only">Reset {row.display_name} to the default markup</span>
            </button>
          )}
        </div>
      </td>
      <td className="tabular px-3 py-2 text-right text-ink-muted">{money(row.price_excl_vat)}</td>
      <td className="tabular px-3 py-2 text-right text-ink-subtle">{money(row.sales_vat)}</td>
      <td className="tabular px-3 py-2 text-right font-semibold text-ink">{money(row.final_price)}</td>
      <td className="px-3 py-2">
        <Badge tone={STATUS[row.stock_status].tone}>
          {STATUS[row.stock_status].label}
          {row.stock_status === 'in_stock' ? ` · ${row.stock_qty}` : ''}
        </Badge>
      </td>
    </tr>
  );
}

/* ── Stock availability ──────────────────────────────────────────────────── */

function StockPanel({ brand }: { brand: Brand }) {
  const { current } = useCurrentList(brand);
  const items = usePriceListItems(current?.id);

  if (!current) return <Notice tone="info">Nothing priced yet.</Notice>;

  const groups: Array<[StockStatus, PriceListItem[]]> = [
    ['in_stock', (items.data ?? []).filter((r) => r.stock_status === 'in_stock')],
    ['on_order', (items.data ?? []).filter((r) => r.stock_status !== 'in_stock')],
  ];

  return (
    <section className="space-y-4">
      <Notice tone="info">
        Read from the shop&rsquo;s own stock, not the supplier&rsquo;s. A handset counts as in stock
        only when there is a matching product with units on hand — a supplier listing a phone is not
        proof that JR Importers has one.
      </Notice>

      {groups.map(([status, rows]) => (
        <div key={status} className="rounded-2xl border border-hairline bg-surface p-5">
          <div className="flex items-center gap-2">
            <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
            <span className="text-sm text-ink-subtle">{rows.length} handsets</span>
          </div>
          {rows.length > 0 && (
            <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((row) => (
                <li key={row.variant_key} className="flex justify-between gap-3">
                  <span className="text-ink">{row.display_name}</span>
                  <span className="tabular text-ink-subtle">
                    {status === 'in_stock' ? `${row.stock_qty} on hand` : money(row.final_price)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}

/* ── Generated lists ─────────────────────────────────────────────────────── */

function ListsPanel() {
  const lists = usePriceLists();
  const [openId, setOpenId] = useState<number | null>(null);
  const items = usePriceListItems(openId);
  const toast = useToast();

  const download = async (kind: 'pdf' | 'xlsx', listId: number) => {
    const list = (lists.data ?? []).find((l) => l.id === listId);
    if (!list) return;
    // The lines are fetched for the open row; make sure it is this one.
    if (openId !== listId) {
      setOpenId(listId);
      toast.info('Fetching that list — press the button again in a moment.');
      return;
    }
    const rows = items.data ?? [];
    if (rows.length === 0) {
      toast.error('That list has no lines.');
      return;
    }
    if (kind === 'pdf') {
      const blob = await buildCustomerPdf({
        lines: rows.map((r) => ({
          display_name: r.display_name,
          storage_gb: r.storage_gb,
          five_g: r.five_g,
          final_price: Number(r.final_price),
          stock_status: r.stock_status,
      stock_qty: r.stock_qty,
        })),
        weekStart: list.week_start,
      });
      downloadBlob(blob, priceListFileName(list.week_start));
    } else {
      const blob = buildCostingWorkbook({
        rows: rows.map((r) => ({ ...r, markup_pct: Number(r.markup_pct) })),
        weekStart: list.week_start,
        importVatRate: Number(list.import_vat_rate),
        salesVatRate: Number(list.sales_vat_rate),
        defaultMarkup: Number(list.default_markup),
        generatedBy: list.generated_by,
      });
      downloadBlob(blob, costingFileName(list.week_start));
    }
  };

  if (lists.isLoading) return <Skeleton className="h-48" />;

  return (
    <section className="space-y-4">
      <Notice tone="info">
        The customer PDF carries retail prices only. The costing workbook carries supplier costs and
        margins and is for administrators — it is never attached to a customer email.
      </Notice>

      <div className="overflow-x-auto rounded-2xl border border-hairline">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-2xs uppercase tracking-[0.12em] text-ink-subtle">
            <tr>
              <th className="px-4 py-2.5">Week</th>
              <th className="px-4 py-2.5">Generated</th>
              <th className="px-4 py-2.5">By</th>
              <th className="px-4 py-2.5 text-right">Handsets</th>
              <th className="px-4 py-2.5 text-right">In stock</th>
              <th className="px-4 py-2.5">Rates</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Download</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline/70">
            {(lists.data ?? []).map((list) => (
              <tr key={list.id} className={cn(openId === list.id && 'bg-brand-500/5')}>
                <td className="px-4 py-2.5 font-medium text-ink">{formatDate(list.week_start)}</td>
                <td className="px-4 py-2.5 text-ink-muted">{formatDate(list.created_at)}</td>
                <td className="px-4 py-2.5 text-ink-subtle">{list.generated_by ?? '—'}</td>
                <td className="tabular px-4 py-2.5 text-right">{list.product_count}</td>
                <td className="tabular px-4 py-2.5 text-right">{list.in_stock_count}</td>
                <td className="px-4 py-2.5 text-xs text-ink-subtle">
                  {(Number(list.import_vat_rate) * 100).toFixed(1)}% imp ·{' '}
                  {Number(list.default_markup).toFixed(0)}% mk ·{' '}
                  {(Number(list.sales_vat_rate) * 100).toFixed(1)}% VAT
                </td>
                <td className="px-4 py-2.5">
                  <Badge
                    tone={
                      list.status === 'sent'
                        ? 'lime'
                        : list.status === 'approved'
                          ? 'brand'
                          : list.status === 'draft'
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {list.status}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <div className="inline-flex gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => void download('pdf', list.id)}>
                      <Download className="h-3.5 w-3.5" aria-hidden /> PDF
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void download('xlsx', list.id)}>
                      <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> Costing
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ── Email distribution ──────────────────────────────────────────────────── */

function EmailPanel({ brand }: { brand: Brand }) {
  const { current } = useCurrentList(brand);
  const items = usePriceListItems(current?.id);
  const recipients = useRecipients();
  const settings = useBulkSettings();
  const distributions = useDistributions();
  const send = useSendPriceList();
  const retry = useRetryFailed();
  const saveRecipient = useSaveRecipient();
  const removeRecipient = useDeleteRecipient();
  const importRecipients = useImportRecipients();
  const toast = useToast();

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [chosen, setChosen] = useState<Set<number> | null>(null);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState('');
  const [openDistribution, setOpenDistribution] = useState<number | null>(null);
  const deliveries = useDeliveries(openDistribution);

  useEffect(() => {
    if (settings.data && !subject && !body) {
      setSubject(settings.data.bulk_email_subject ?? '');
      setBody(settings.data.bulk_email_body ?? '');
    }
  }, [settings.data, subject, body]);

  const eligible = (recipients.data ?? []).filter((r) => r.active && !r.opted_out_at);
  const selectedIds = chosen ?? new Set(eligible.map((r) => r.id));

  const buildPdf = async () => {
    if (!current) throw new Error('There is no price list to send.');
    const rows = items.data ?? [];
    if (rows.length === 0) throw new Error('That price list has no lines.');
    return buildCustomerPdf({
      lines: rows.map((r) => ({
        display_name: r.display_name,
        storage_gb: r.storage_gb,
        five_g: r.five_g,
        final_price: Number(r.final_price),
        stock_status: r.stock_status,
      stock_qty: r.stock_qty,
      })),
      weekStart: current.week_start,
                    brand,
    });
  };

  return (
    <section className="space-y-5">
      {!current && <Notice tone="info">Nothing priced yet — upload a supplier file first.</Notice>}
      {current && current.status === 'draft' && (
        <Notice tone="warn">
          This list is a draft. Approve it on the Pricing tab before sending.
        </Notice>
      )}

      {/* ── The message ──────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">The message</h3>
        <p className="mt-1 text-xs text-ink-subtle">
          <code>{'{name}'}</code> becomes the customer&rsquo;s name, <code>{'{date}'}</code> the
          week. Each recipient gets their own email — nobody sees anybody else&rsquo;s address.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Subject" htmlFor="bulk-subject">
            <Input
                  id="bulk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>
          <Field label="Message" htmlFor="bulk-body">
            <Textarea
                  id="bulk-body" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={!current || send.isPending || selectedIds.size === 0}
            onClick={async () => {
              try {
                const pdf = await buildPdf();
                send.mutate(
                  {
                    listId: current!.id,
                    recipientIds: chosen ? [...chosen] : null,
                    subject,
                    body,
                    pdf,
                    fileName: priceListFileName(current!.week_start, brand),
                  },
                  {
                    onSuccess: (r) =>
                      toast.success(
                        `${r.sent} of ${r.recipients} sent${r.failed ? `, ${r.failed} failed` : ''}.`,
                      ),
                    onError: (e) => toast.error(e.message),
                  },
                );
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Send className="h-4 w-4" aria-hidden />
            {send.isPending ? 'Sending…' : `Send to ${selectedIds.size} recipient${selectedIds.size === 1 ? '' : 's'}`}
          </Button>
          <Button
            variant="secondary"
            disabled={!current}
            onClick={async () => {
              try {
                downloadBlob(await buildPdf(), priceListFileName(current!.week_start, brand));
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <Download className="h-4 w-4" aria-hidden /> Preview the attachment
          </Button>
        </div>
      </div>

      {/* ── Recipients ───────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">
            <Users className="mr-1.5 inline h-4 w-4" aria-hidden />
            Recipients ({eligible.length} active)
          </h3>
          <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
            Import a list
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2">
          <CustomerPicker
            label="Name"
            id="bulk-recipient-name"
            placeholder="Dealer name"
            value={newName}
            onChange={setNewName}
            onPick={(match) => {
              setNewName(match.name ?? "");
              setNewEmail(match.email);
            }}
          />
          <CustomerPicker
            label="Email"
            id="bulk-recipient-email"
            placeholder="buyer@example.com"
            type="email"
            value={newEmail}
            onChange={setNewEmail}
            onPick={(match) => {
              setNewName(match.name ?? "");
              setNewEmail(match.email);
            }}
          />
          <Button
            disabled={!newEmail.trim() || saveRecipient.isPending}
            onClick={() =>
              saveRecipient.mutate(
                { name: newName, email: newEmail },
                {
                  onSuccess: () => {
                    setNewName('');
                    setNewEmail('');
                    toast.success('Recipient added.');
                  },
                  onError: (e) => toast.error(e.message),
                },
              )
            }
          >
            Add
          </Button>
        </div>

        <ul className="mt-4 divide-y divide-hairline/70">
          {(recipients.data ?? []).map((r) => {
            const on = selectedIds.has(r.id);
            return (
              <li key={r.id} className="flex items-center gap-3 py-2">
                <Checkbox
                  checked={on}
                  disabled={!r.active || Boolean(r.opted_out_at)}
                  label={<span className="sr-only">{`Send to ${r.email}`}</span>}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(r.id);
                    else next.delete(r.id);
                    setChosen(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{r.name ?? r.email}</p>
                  {r.name && <p className="truncate text-xs text-ink-subtle">{r.email}</p>}
                </div>
                {r.opted_out_at && <Badge tone="neutral">opted out</Badge>}
                {!r.active && <Badge tone="neutral">inactive</Badge>}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    saveRecipient.mutate(
                      { id: r.id, name: r.name ?? '', email: r.email, active: !r.active },
                      { onError: (e) => toast.error(e.message) },
                    )
                  }
                >
                  {r.active ? 'Deactivate' : 'Activate'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    removeRecipient.mutate(r.id, {
                      onSuccess: () => toast.success('Removed.'),
                      onError: (e) => toast.error(e.message),
                    })
                  }
                >
                  Remove
                </Button>
              </li>
            );
          })}
          {(recipients.data ?? []).length === 0 && (
            <li className="py-4 text-sm text-ink-subtle">Nobody on the list yet.</li>
          )}
        </ul>
      </div>

      {/* ── History ──────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">Distribution history</h3>
        <ul className="mt-3 divide-y divide-hairline/70">
          {(distributions.data ?? []).map((d) => (
            <li key={d.id} className="py-2.5">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() => setOpenDistribution(openDistribution === d.id ? null : d.id)}
              >
                <span className="text-sm text-ink">
                  {formatDate(d.created_at)} · {d.recipient_count} recipient
                  {d.recipient_count === 1 ? '' : 's'}
                  <span className="ml-2 text-xs text-ink-subtle">{d.trigger}</span>
                </span>
                <span className="flex items-center gap-2">
                  {d.finished_at === null && <Badge tone="warn">sending</Badge>}
                  <Badge tone="neutral">#{d.id}</Badge>
                </span>
              </button>

              {openDistribution === d.id && (
                <div className="mt-3 space-y-2">
                  <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
                    {(deliveries.data ?? []).map((delivery) => (
                      <li key={delivery.id} className="flex items-center justify-between gap-3">
                        <span className="truncate text-ink-muted">{delivery.email}</span>
                        <span className="flex items-center gap-2">
                          {delivery.error && (
                            <span className="max-w-[18rem] truncate text-ink-subtle" title={delivery.error}>
                              {delivery.error}
                            </span>
                          )}
                          <Badge
                            tone={
                              delivery.status === 'sent'
                                ? 'lime'
                                : delivery.status === 'failed'
                                  ? 'danger'
                                  : 'warn'
                            }
                          >
                            {delivery.status}
                          </Badge>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {(deliveries.data ?? []).some((x) => x.status === 'failed') && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={retry.isPending || !current}
                      onClick={async () => {
                        try {
                          const pdf = await buildPdf();
                          retry.mutate(
                            {
                              distributionId: d.id,
                              pdf,
                              fileName: priceListFileName(current!.week_start, brand),
                            },
                            {
                              onSuccess: (n) =>
                                toast.success(
                                  n === 0 ? 'Nothing to retry.' : `${n} queued again.`,
                                ),
                              onError: (e) => toast.error(e.message),
                            },
                          );
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Retry the failures
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
          {(distributions.data ?? []).length === 0 && (
            <li className="py-4 text-sm text-ink-subtle">Nothing sent yet.</li>
          )}
        </ul>
      </div>

      <Modal open={importing} onClose={() => setImporting(false)} title="Import recipients">
        <p className="text-sm text-ink-subtle">
          One per line, as <code>Name, email</code> or just an address. Paste from a spreadsheet or
          a CSV — duplicates are ignored.
        </p>
        <Textarea
          rows={10}
          className="mt-3"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder={'Coastal Cellular, buyer@coastal.na\nwalvis@dealer.com'}
        />
        <div className="mt-4 flex gap-2">
          <Button
            disabled={!importText.trim() || importRecipients.isPending}
            onClick={() =>
              importRecipients.mutate(importText, {
                onSuccess: (r) => {
                  toast.success(`${r.added} added.`);
                  setImportText('');
                  setImporting(false);
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            Import
          </Button>
          <Button variant="ghost" onClick={() => setImporting(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </section>
  );
}

/**
 * A field that suggests people the shop already deals with.
 *
 * The mailing list is mostly existing customers, and an address typed one
 * character wrong means that dealer quietly never receives anything. Picking
 * from the customer book fills both fields at once and removes the typo.
 *
 * It suggests rather than restricts: a new dealer who is not a customer yet is
 * a perfectly ordinary thing to type in full.
 */
function CustomerPicker({
  label,
  id,
  value,
  placeholder,
  type,
  onChange,
  onPick,
}: {
  label: string;
  id: string;
  value: string;
  placeholder?: string;
  type?: string;
  onChange: (value: string) => void;
  onPick: (match: CustomerMatch) => void;
}) {
  const [open, setOpen] = useState(false);
  const matches = useCustomerSearch(open ? value : '');
  const found = matches.data ?? [];

  return (
    <Field label={label} htmlFor={id} className="relative">
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && found.length > 0}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a suggestion blurs the field first, so closing is
        // deferred past the click that would otherwise never land.
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setOpen(false);
        }}
      />

      {open && found.length > 0 && (
        <ul
          role="listbox"
          aria-label={`Customers matching ${value}`}
          className="absolute z-20 mt-1 max-h-60 w-72 overflow-y-auto rounded-xl border border-hairline bg-surface shadow-lg"
        >
          {found.map((match) => (
            <li key={match.id}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(match);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-raised"
              >
                <span className="text-sm font-medium text-ink">{match.name ?? match.email}</span>
                {match.name && <span className="text-xs text-ink-subtle">{match.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Field>
  );
}

/* ── Settings ────────────────────────────────────────────────────────────── */

function SettingsPanel() {
  const settings = useBulkSettings();
  const save = useSaveBulkSetting();
  const toast = useToast();

  if (settings.isLoading || !settings.data) return <Skeleton className="h-64" />;
  const s = settings.data;

  const saveNumber = (key: Parameters<typeof save.mutate>[0]['key'], raw: string, scale = 1) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    save.mutate(
      { key, value: value / scale },
      {
        onSuccess: () => toast.success('Saved.'),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <section className="space-y-4">
      <Notice tone="info">
        Changing a rate affects the <strong>next</strong> list you generate. Lists already produced
        keep the rates they were priced with — a price list is a record of a particular week.
      </Notice>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Rates</h3>
          <div className="mt-4 space-y-3">
            <Field label="Import VAT %" hint="Applied to the supplier cost first." htmlFor="bulk-import-vat">
              <Input
                  id="bulk-import-vat"
                type="number"
                step={0.1}
                defaultValue={(Number(s.bulk_import_vat_rate ?? 0.17) * 100).toFixed(1)}
                onBlur={(e) => saveNumber('bulk_import_vat_rate', e.target.value, 100)}
              />
            </Field>
            <Field label="Default markup %" hint="Used for any handset with no markup of its own." htmlFor="bulk-default-markup">
              <Input
                  id="bulk-default-markup"
                type="number"
                step={0.5}
                defaultValue={Number(s.bulk_default_markup ?? 22).toFixed(1)}
                onBlur={(e) => saveNumber('bulk_default_markup', e.target.value)}
              />
            </Field>
            <Field label="Sales VAT %" hint="Added last, to reach the retail price." htmlFor="bulk-sales-vat">
              <Input
                  id="bulk-sales-vat"
                type="number"
                step={0.1}
                defaultValue={(Number(s.bulk_sales_vat_rate ?? 0.15) * 100).toFixed(1)}
                onBlur={(e) => saveNumber('bulk_sales_vat_rate', e.target.value, 100)}
              />
            </Field>
          </div>
        </div>

        <div className="rounded-2xl border border-hairline bg-surface p-5">
          <h3 className="text-sm font-semibold text-ink">Weekly send</h3>
          <div className="mt-4 space-y-3">
            <Field label="Day" hint="Namibian time (Africa/Windhoek)." htmlFor="bulk-day">
              <Select
                  id="bulk-day"
                defaultValue={String(s.bulk_schedule_day ?? '1')}
                onChange={(e) =>
                  save.mutate(
                    { key: 'bulk_schedule_day', value: Number(e.target.value) },
                    { onSuccess: () => toast.success('Saved.') },
                  )
                }
              >
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(
                  (day, i) => (
                    <option key={day} value={i + 1}>
                      {day}
                    </option>
                  ),
                )}
              </Select>
            </Field>
            <Field label="Time" htmlFor="bulk-time">
              <Input
                  id="bulk-time"
                type="time"
                defaultValue={String(s.bulk_schedule_time ?? '08:00')}
                onBlur={(e) =>
                  save.mutate(
                    { key: 'bulk_schedule_time', value: e.target.value },
                    { onSuccess: () => toast.success('Saved.') },
                  )
                }
              />
            </Field>
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <Checkbox
                label={<span className="sr-only">Toggle</span>}
                defaultChecked={String(s.bulk_auto_send) === 'true'}
                onChange={(e) =>
                  save.mutate(
                    { key: 'bulk_auto_send', value: e.target.checked },
                    { onSuccess: () => toast.success('Saved.') },
                  )
                }
              />
              Send automatically each week
            </label>
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <Checkbox
                label={<span className="sr-only">Toggle</span>}
                defaultChecked={String(s.bulk_require_approval) !== 'false'}
                onChange={(e) =>
                  save.mutate(
                    { key: 'bulk_require_approval', value: e.target.checked },
                    { onSuccess: () => toast.success('Saved.') },
                  )
                }
              />
              Require approval before anything is sent
            </label>
            <p className="text-xs text-ink-subtle">
              An automatic send only ever posts the current week&rsquo;s approved list. If there
              isn&rsquo;t one, it is skipped and recorded rather than sending old prices.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
