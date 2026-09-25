import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Monitor, Smartphone, Tablet } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { config } from '@/lib/env';
import { keys } from '@/data/keys';
import { formatDate, integer } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Notice, Skeleton, StatTile } from '@/ui';
import { ModuleHeader } from '../components/AdminShell';

interface Point {
  date: string;
  visitors: number;
  sessions: number;
  page_views: number;
}

interface SiteAnalytics {
  ok: boolean;
  message?: string;
  days: number;
  bucket: 'day' | 'week';
  from: string;
  to: string;
  visitors: number;
  new_visitors: number;
  sessions: number;
  page_views: number;
  bounced: number;
  prev_visitors: number;
  prev_sessions: number;
  prev_page_views: number;
  today_visitors: number;
  live_visitors: number;
  first_visit_at: string | null;
  series: Point[];
  channels: Array<{ channel: string; visitors: number; sessions: number }>;
  sources: Array<{ source: string; channel: string; visitors: number; sessions: number }>;
  campaigns: Array<{
    campaign: string;
    source: string | null;
    medium: string | null;
    visitors: number;
    sessions: number;
  }>;
  pages: Array<{ path: string; views: number; visitors: number }>;
  countries: Array<{ country: string; visitors: number; sessions: number }>;
  cities: Array<{ city: string; country: string | null; visitors: number; sessions: number }>;
  devices: Array<{ device: string; visitors: number; sessions: number }>;
}

const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last year', days: 365 },
] as const;

function useSiteAnalytics(days: number) {
  return useQuery<SiteAnalytics, Error>({
    queryKey: keys.siteAnalytics(days),
    staleTime: 60_000,
    // "On the site now" is only worth showing if it keeps itself current.
    refetchInterval: 60_000,
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('site_analytics', { p_days: days });
      if (error) throw new Error(error.message);

      const result = data as unknown as SiteAnalytics;
      if (!result?.ok) throw new Error(result?.message ?? 'Could not load the visitor numbers.');
      return result;
    },
  });
}

/**
 * Website analytics.
 *
 * Reports says what sold. This says who came to look, and from where — which
 * is the only way to tell whether a Facebook post, a WhatsApp broadcast or a
 * flyer on the counter actually brought anyone to the website.
 *
 * Counted by the storefront itself (see `lib/visitTracker.ts`); nothing leaves
 * the shop's own database, and staff devices are left out.
 */
export default function Analytics() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(RANGES[1]);
  const report = useSiteAnalytics(range.days);
  const d = report.data;

  return (
    <>
      <ModuleHeader
        title="Analytics"
        description="Who visits the website, and where they came from."
      />

      <div className="space-y-5 p-6">
        <nav className="flex flex-wrap gap-1.5" aria-label="Reporting period">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r)}
              aria-current={range.id === r.id ? 'page' : undefined}
              className={cn(
                'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                range.id === r.id
                  ? 'bg-brand-600 text-white'
                  : 'border border-hairline text-ink-muted hover:bg-raised',
              )}
            >
              {r.label}
            </button>
          ))}
        </nav>

        {report.isLoading ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-card" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-2xl" />
          </div>
        ) : report.error ? (
          <Notice tone="danger" title="Could not load the visitor numbers">
            {report.error.message}
            {/function|schema cache/i.test(report.error.message) && (
              <>
                {' '}
                The database has not had the analytics update yet — apply{' '}
                <code>20260925000000_site_analytics.sql</code> from{' '}
                <code>supabase/migrations</code>.
              </>
            )}
          </Notice>
        ) : d ? (
          // Switching period keeps the last numbers on screen until the new
          // ones land; dimmed, so nobody reads them as the period just chosen.
          <div
            aria-busy={report.isPlaceholderData}
            className={cn('space-y-5 transition-opacity', report.isPlaceholderData && 'opacity-50')}
          >
            <Report data={d} />
          </div>
        ) : null}
      </div>
    </>
  );
}

function Report({ data: d }: { data: SiteAnalytics }) {
  const returning = Math.max(0, d.visitors - d.new_visitors);
  const pagesPerVisit = d.sessions > 0 ? d.page_views / d.sessions : 0;
  const bounceRate = d.sessions > 0 ? d.bounced / d.sessions : 0;

  // A comparison with a period the counter was not yet running for would
  // show every number shooting up. Only compare when both periods were counted.
  const prevFrom = new Date(
    new Date(d.from).getTime() - (new Date(d.to).getTime() - new Date(d.from).getTime()),
  );
  const comparable = Boolean(d.first_visit_at) && new Date(d.first_visit_at!) <= prevFrom;
  const countingSince =
    d.first_visit_at && new Date(d.first_visit_at) > new Date(d.from) ? d.first_visit_at : null;

  if (!d.first_visit_at) {
    return (
      <Notice tone="info" title="No visits counted yet">
        The website starts counting visitors as soon as this update is live on{' '}
        {config.SITE_URL.replace(/^https?:\/\//, '')}. Visits from staff devices and search-engine
        robots are left out, so the first numbers appear when a customer opens the site.
      </Notice>
    );
  }

  return (
    <>
      <div className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Visitors"
            value={integer(d.visitors)}
            delta={comparable ? change(d.visitors, d.prev_visitors) : undefined}
            sub={`${integer(d.new_visitors)} new · ${integer(returning)} repeat`}
            tone="brand"
          />
          <StatTile
            label="Visits"
            value={integer(d.sessions)}
            delta={comparable ? change(d.sessions, d.prev_sessions) : undefined}
            sub={`${pagesPerVisit.toFixed(1)} pages per visit`}
          />
          <StatTile
            label="Pages viewed"
            value={integer(d.page_views)}
            delta={comparable ? change(d.page_views, d.prev_page_views) : undefined}
            sub={`${Math.round(bounceRate * 100)}% left after one page`}
          />
          <StatTile
            label="Today"
            value={integer(d.today_visitors)}
            sub={
              <span className="inline-flex items-center gap-1.5">
                {d.live_visitors > 0 && (
                  <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
                )}
                {integer(d.live_visitors)} on the site now
              </span>
            }
            tone={d.live_visitors > 0 ? 'success' : 'neutral'}
          />
        </div>
        <p className="text-xs text-ink-subtle">
          {countingSince
            ? `Counting since ${formatDate(countingSince)}, so this period is not complete yet.`
            : comparable
              ? `▲▼ compare with the ${d.days} days before.`
              : null}
        </p>
      </div>

      <Panel
        title={d.bucket === 'week' ? 'Visitors per week' : 'Visitors per day'}
        hint="Point at a bar for the numbers."
      >
        <VisitorsChart series={d.series} bucket={d.bucket} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          title="How they found you"
          hint="Direct means the address was typed in, bookmarked, or opened from an app that does not say where the link came from."
        >
          <BarList
            rows={d.channels.map((c) => ({
              key: c.channel,
              label: c.channel,
              detail: CHANNEL_HINTS[c.channel],
              value: c.sessions,
            }))}
            total={d.sessions}
            unit="visits"
          />
        </Panel>

        <Panel title="Top sources" hint="The site, app or tagged link each visit arrived from.">
          <BarList
            rows={d.sources.map((s) => ({
              key: `${s.source}|${s.channel}`,
              label: s.source,
              detail: s.channel,
              value: s.sessions,
            }))}
            total={d.sessions}
            unit="visits"
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Most viewed pages">
          <BarList
            rows={d.pages.map((p) => ({
              key: p.path,
              label: pageLabel(p.path),
              detail: p.path,
              value: p.views,
            }))}
            total={d.page_views}
            unit="views"
          />
        </Panel>

        <Panel title="Countries">
          <BarList
            rows={d.countries.map((c) => ({
              key: c.country,
              label: `${flag(c.country)} ${countryName(c.country)}`,
              value: c.visitors,
            }))}
            total={d.visitors}
            unit="visitors"
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Towns & cities">
          <BarList
            rows={d.cities.map((c) => ({
              key: `${c.city}|${c.country ?? ''}`,
              label: c.city,
              detail: c.country ? countryName(c.country) : undefined,
              value: c.visitors,
            }))}
            total={d.visitors}
            unit="visitors"
          />
        </Panel>

        <Panel title="Devices">
          <BarList
            rows={d.devices.map((dv) => ({
              key: dv.device,
              label: (
                <span className="inline-flex items-center gap-2">
                  <DeviceIcon device={dv.device} />
                  {DEVICE_LABELS[dv.device] ?? 'Unknown'}
                </span>
              ),
              value: dv.visitors,
            }))}
            total={d.visitors}
            unit="visitors"
          />
        </Panel>
      </div>

      <Panel title="Campaigns" hint="Links you tagged before sharing them.">
        {d.campaigns.length > 0 ? (
          <CampaignTable rows={d.campaigns} />
        ) : (
          <div className="rounded-xl border border-dashed border-hairline p-4 text-sm text-ink-muted">
            <p>
              Add a tag to the links you share and each post, broadcast or flyer gets its own line
              here. For a Facebook post about a sale, link to:
            </p>
            <p className="mt-2 break-all font-mono text-xs text-ink">
              {config.SITE_URL.replace(/\/$/, '')}/?utm_source=facebook&amp;utm_campaign=spring-sale
            </p>
            <p className="mt-2 text-xs text-ink-subtle">
              Use <code>utm_source</code> for where it is posted (facebook, whatsapp, flyer) and{' '}
              <code>utm_campaign</code> for what it is about.
            </p>
          </div>
        )}
      </Panel>

      <p className="text-xs text-ink-subtle">
        Staff devices and search-engine robots are not counted. No IP addresses are stored, and
        visits are kept for 13 months.
      </p>
    </>
  );
}

/* ── Chart ────────────────────────────────────────────────────────────────── */

const shortDate = new Intl.DateTimeFormat('en-NA', { day: 'numeric', month: 'short' });
// A year's axis spans two Junes; the month alone would not say which.
const monthYear = new Intl.DateTimeFormat('en-NA', { month: 'short', year: 'numeric' });
const weekStart = new Intl.DateTimeFormat('en-NA', { day: 'numeric', month: 'short', year: 'numeric' });
const longDate = new Intl.DateTimeFormat('en-NA', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** `YYYY-MM-DD` as a local date, so it cannot slip a day across time zones. */
function localDate(iso: string): Date {
  const [y = 1970, m = 1, day = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, day);
}

function bucketLabel(point: Point, bucket: 'day' | 'week'): string {
  const date = localDate(point.date);
  return bucket === 'week' ? `Week of ${weekStart.format(date)}` : longDate.format(date);
}

/** Rounds an axis maximum up to 1, 2 or 5 times a power of ten. */
function niceMax(value: number): number {
  if (value <= 4) return Math.max(1, Math.ceil(value));
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * power >= value) ?? 10;
  return step * power;
}

function VisitorsChart({ series, bucket }: { series: Point[]; bucket: 'day' | 'week' }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...series.map((p) => p.visitors)));
  const peak = series.reduce<Point | null>((best, p) => (!best || p.visitors > best.visitors ? p : best), null);
  const active = hover === null ? null : series[hover];
  const ticks = [max, max / 2, 0];
  // First, middle and last: enough to place any bar without crowding the axis.
  const axisDates = [...new Set([0, Math.floor(series.length / 2), series.length - 1])]
    .map((i) => series[i])
    .filter((point): point is Point => Boolean(point));

  const summary =
    peak && peak.visitors > 0
      ? `Visitors per ${bucket}. Busiest: ${bucketLabel(peak, bucket)}, ${peak.visitors} visitors.`
      : `Visitors per ${bucket}. No visitors in this period.`;

  return (
    <div>
      <div className="flex gap-2">
        {/* Axis labels share the plot's height, so each sits on its gridline. */}
        <div aria-hidden className="relative h-48 w-8 shrink-0">
          {ticks.map((tick, i) => (
            <span
              key={i}
              className="tabular absolute right-0 -translate-y-1/2 text-2xs text-ink-subtle"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {Number.isInteger(tick) ? integer(tick) : ''}
            </span>
          ))}
        </div>

        <div
          role="img"
          aria-label={summary}
          className="relative h-48 flex-1"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="absolute inset-x-0 border-t border-hairline"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}

          {/* 2px of surface between bars keeps a long run of them readable. */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {series.map((point, i) => {
              const height = (point.visitors / max) * 100;
              return (
                <div
                  key={point.date}
                  className="flex h-full min-w-0 flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                >
                  {point.visitors > 0 && (
                    <div
                      className={cn(
                        'w-full rounded-t-[4px] transition-colors',
                        hover === i ? 'bg-brand-600' : 'bg-brand-400 dark:bg-brand-500',
                      )}
                      style={{ height: `${Math.max(height, 1.5)}%` }}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {active && hover !== null && (
            <div
              className="pointer-events-none absolute -top-2 z-10 w-max rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-lift"
              style={{
                left: `${((hover + 0.5) / series.length) * 100}%`,
                transform: `translate(${hover < series.length / 2 ? '-20%' : '-80%'}, -100%)`,
              }}
            >
              <p className="font-semibold text-ink">{bucketLabel(active, bucket)}</p>
              <p className="tabular mt-0.5 text-ink-muted">
                <span className="font-semibold text-ink">{integer(active.visitors)}</span> visitors ·{' '}
                {integer(active.sessions)} visits · {integer(active.page_views)} pages
              </p>
            </div>
          )}
        </div>
      </div>

      {axisDates.length > 0 && (
        <div aria-hidden className="mt-2 flex justify-between pl-10 text-2xs text-ink-subtle">
          {axisDates.map((point) => (
            <span key={point.date}>
              {(bucket === 'week' ? monthYear : shortDate).format(localDate(point.date))}
            </span>
          ))}
        </div>
      )}

      {/* No "in all" total here: a visitor who came on three days is one
          visitor for the period but one on each of those days, so adding
          the bars up would disagree with the tile above. */}
      {peak && peak.visitors > 0 && (
        <p className="mt-3 text-xs text-ink-subtle">
          Busiest: {bucketLabel(peak, bucket)}, with {integer(peak.visitors)} visitors.
        </p>
      )}

      {/* The same numbers for a screen reader, which cannot point at a bar. */}
      <table className="sr-only">
        <caption>Visitors per {bucket}</caption>
        <thead>
          <tr>
            <th scope="col">{bucket === 'week' ? 'Week of' : 'Date'}</th>
            <th scope="col">Visitors</th>
            <th scope="col">Visits</th>
            <th scope="col">Pages viewed</th>
          </tr>
        </thead>
        <tbody>
          {series.map((point) => (
            <tr key={point.date}>
              <td>{bucketLabel(point, bucket)}</td>
              <td>{point.visitors}</td>
              <td>{point.sessions}</td>
              <td>{point.page_views}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Ranked lists ─────────────────────────────────────────────────────────── */

interface BarRow {
  key: string;
  label: ReactNode;
  detail?: string;
  value: number;
}

/**
 * A ranked list with the bar drawn behind each row.
 *
 * One colour for every row: these are rankings of a single measure, and a
 * different hue per row would only suggest a difference that is not there.
 */
function BarList({ rows, total, unit }: { rows: BarRow[]; total: number; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-ink-muted">No visits in this period.</p>;
  }

  return (
    <ul className="space-y-1">
      {rows.map((row) => (
        <li key={row.key} className="relative flex items-center gap-3 rounded-md px-2.5 py-1.5">
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 rounded-md bg-brand-400/15 dark:bg-brand-500/25"
            style={{ width: `${(row.value / max) * 100}%` }}
          />
          <span className="relative min-w-0 flex-1 truncate text-sm text-ink">
            {row.label}
            {row.detail && <span className="ml-2 text-xs text-ink-subtle">{row.detail}</span>}
          </span>
          <span className="tabular relative shrink-0 text-sm font-semibold text-ink">
            {integer(row.value)}
            <span className="sr-only"> {unit}</span>
          </span>
          <span className="tabular relative w-10 shrink-0 text-right text-xs text-ink-subtle">
            {total > 0 ? `${Math.round((row.value / total) * 100)}%` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function CampaignTable({ rows }: { rows: SiteAnalytics['campaigns'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hairline text-2xs uppercase tracking-wider text-ink-muted">
            <th className="py-2 text-left font-bold">Campaign</th>
            <th className="py-2 text-left font-bold">Source / medium</th>
            <th className="py-2 text-right font-bold">Visitors</th>
            <th className="py-2 text-right font-bold">Visits</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/70">
          {rows.map((row) => (
            <tr key={`${row.campaign}|${row.source}|${row.medium}`}>
              <td className="max-w-[14rem] truncate py-2 text-ink">{row.campaign}</td>
              <td className="py-2 text-ink-muted">
                {[row.source, row.medium].filter(Boolean).join(' / ') || '—'}
              </td>
              <td className="tabular py-2 text-right">{integer(row.visitors)}</td>
              <td className="tabular py-2 text-right font-semibold text-ink">
                {integer(row.sessions)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    // min-w-0: a grid item otherwise refuses to shrink below its longest
    // row, and one long product name pushes the numbers off a phone screen.
    <section className="min-w-0 rounded-2xl border border-hairline bg-surface p-5">
      <h3 className="text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-subtle">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/* ── Labels ───────────────────────────────────────────────────────────────── */

function change(current: number, previous: number): { value: string; direction: 'up' | 'down' | 'flat' } {
  if (previous <= 0) {
    return current > 0 ? { value: 'new', direction: 'up' } : { value: '0%', direction: 'flat' };
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  return {
    value: `${Math.abs(pct)}%`,
    direction: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat',
  };
}

const CHANNEL_HINTS: Record<string, string> = {
  Search: 'Google and other search engines',
  Social: 'Facebook, Instagram, TikTok…',
  Messaging: 'WhatsApp, Telegram, Messenger',
  Email: 'Links in an email',
  Ads: 'Paid adverts',
  Campaign: 'Your tagged links',
  Referral: 'Links on other websites',
  Direct: 'Typed in or bookmarked',
};

const DEVICE_LABELS: Record<string, string> = {
  mobile: 'Phone',
  tablet: 'Tablet',
  desktop: 'Computer',
};

function DeviceIcon({ device }: { device: string }) {
  const Icon = device === 'desktop' ? Monitor : device === 'tablet' ? Tablet : Smartphone;
  return <Icon aria-hidden className="h-3.5 w-3.5 text-ink-subtle" />;
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home',
  '/shop': 'Shop',
  '/cart': 'Cart',
  '/checkout': 'Checkout',
  '/compare': 'Compare',
  '/support': 'Support',
  '/about': 'About',
  '/account': 'Account',
  '/order/:id': 'Order confirmation',
  '/laybuy/:id': 'Lay-buy',
  '/laybuy/pay/:id': 'Lay-buy payment',
};

function words(slug: string): string {
  let text = slug;
  try {
    text = decodeURIComponent(slug);
  } catch {
    /* a malformed escape is still readable as it is */
  }
  text = text.replace(/[-_]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A page's path as the shop would name it: "/product/12-galaxy-a16" → "Galaxy a16". */
function pageLabel(path: string): string {
  if (PAGE_NAMES[path]) return PAGE_NAMES[path];
  const product = path.match(/^\/product\/(?:\d+-)?(.+)$/);
  if (product?.[1]) return words(product[1]);
  const group = path.match(/^\/shop\/(.+)$/);
  if (group?.[1]) return `Shop · ${words(group[1])}`;
  const account = path.match(/^\/account\/(.+)$/);
  if (account?.[1]) return `Account · ${words(account[1])}`;
  return path;
}

const regionNames = (() => {
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' });
  } catch {
    return null;
  }
})();

function countryName(code: string): string {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Two regional-indicator letters, which phones render as the country's flag. */
function flag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
