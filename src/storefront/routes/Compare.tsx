import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Plus, Scale, Search, Trash2, X } from 'lucide-react';
import type { ProductRow } from '@/lib/database.types';
import { SPEC_FIELDS, colourSwatch, useCatalog, useVariants } from '@/data/products';
import { isServiceCategory } from '@/lib/constants';
import { COMPARE_LIMIT, useCompare } from '@/data/compare';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Badge, useToast } from '@/ui';
import { ProductCard, productPath } from '../components/ProductCard';
import { useSeo } from '../seo';

/**
 * Side-by-side comparison.
 *
 * A page rather than a modal so it can be linked, revisited and filled at
 * leisure: the shelf survives a reload (see `useCompare`), and the picker
 * below draws straight from the live catalogue so only buyable stock can be
 * lined up. Rows where the candidates actually differ get a tint — that is
 * the row a buyer is here to find.
 */

// Identity rows first, then the shared spec table (see products.ts), so the
// compare page always carries exactly the specs the product page shows.
const COMPARE_ROWS: Array<{ label: string; get: (p: ProductRow) => string | null | undefined }> = [
  { label: 'Brand', get: (p) => p.brand },
  { label: 'Category', get: (p) => p.category },
  ...SPEC_FIELDS,
];

export default function Compare() {
  useSeo({
    title: 'Compare phones side by side — JR Importers',
    description:
      'Line up any phones or gadgets from live JR Importers stock and compare specs, prices and colours side by side.',
    path: '/compare',
  });

  const { items, count, toggle, remove, clear } = useCompare();
  const toast = useToast();
  const [term, setTerm] = useState('');

  // The picker searches the same live catalogue the shop sells from.
  const searching = term.trim().length > 1;
  const catalog = useCatalog(searching ? { search: term, limit: 60 } : { limit: 24 });
  // Repairs are booked, not bought — a service has no specs, price band or
  // colour pool to line up, so it has no business in a comparison.
  const pickable = useMemo(
    () =>
      (catalog.data ?? [])
        .filter((p) => !isServiceCategory(p.category))
        .filter((p) => !items.some((chosen) => chosen.id === p.id))
        .slice(0, 8),
    [catalog.data, items],
  );

  // Availability and colours are read live per column — the stored snapshot
  // may be hours old, and stock is the one thing that must not be.
  const variantSlots = [useVariants(items[0]), useVariants(items[1]), useVariants(items[2])];

  const bestPrice = useMemo(() => {
    if (items.length < 2) return null;
    const prices = items.map((p) => Number(p.price) || 0).filter((n) => n > 0);
    return prices.length ? Math.min(...prices) : null;
  }, [items]);

  const columns = { gridTemplateColumns: `8.5rem repeat(${Math.max(count, 1)}, minmax(10rem, 1fr))` };

  function pick(product: ProductRow) {
    const result = toggle(product);
    if (result === 'full') {
      toast.warn('Three at a time', 'Remove a product before adding another.');
      return;
    }
    setTerm('');
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink">
            <Scale aria-hidden className="h-3.5 w-3.5 text-lime-700" />
            Side by side
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-brand-700 sm:text-4xl">
            Compare products
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
            Line up to {COMPARE_LIMIT} products from live stock. Rows where they differ are
            tinted — that is usually the row that decides it.
          </p>
        </div>
        {count > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-danger"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
            Clear all
          </button>
        )}
      </div>

      {/* ── Picker ──────────────────────────────────────────────────────── */}
      {count < COMPARE_LIMIT && (
        <section className="glass mt-8 rounded-3xl p-4 sm:p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Plus aria-hidden className="h-4 w-4 text-lime-700" />
            Add a product ({count}/{COMPARE_LIMIT})
          </p>
          <div className="relative mt-3">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search live stock by name, brand or category…"
              className="h-11 w-full rounded-full border border-hairline bg-canvas/70 pl-9 pr-4 text-sm text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-lime-500/60"
            />
          </div>
          {pickable.length > 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {pickable.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => pick(product)}
                    className="glass sheen flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105"
                  >
                    {product.image ? (
                      <img
                        src={product.image}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-xl border border-hairline object-cover"
                      />
                    ) : (
                      <span className="h-11 w-11 shrink-0 rounded-xl bg-white/40" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">
                        {product.name}
                      </span>
                      <span className="tabular block text-xs font-semibold text-brand-600">
                        {money(product.price)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-subtle">
              {catalog.isLoading ? 'Loading live stock…' : 'Nothing in live stock matches that.'}
            </p>
          )}
        </section>
      )}

      {/* ── The line-up ─────────────────────────────────────────────────── */}
      {count === 0 ? (
        <div className="glass mt-8 rounded-3xl px-6 py-16 text-center">
          <Scale aria-hidden className="mx-auto h-12 w-12 text-ink-subtle" />
          <h2 className="mt-4 font-display text-xl font-bold text-brand-700">
            Nothing to compare yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
            Pick products above, or use the compare toggle on any product card in the shop.
          </p>
          <Link
            to="/shop"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-full bg-lime-500 px-6 text-sm font-semibold text-brand-800 transition-colors hover:bg-lime-400"
          >
            Browse the shop
            <ArrowRight aria-hidden className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="glass mt-8 overflow-x-auto rounded-3xl">
          {/* Product header row */}
          <div className="grid border-b border-hairline" style={columns}>
            <div className="p-3 sm:p-4" />
            {items.map((product) => (
              <div
                key={product.id}
                className="relative border-l border-hairline/70 p-3 text-center sm:p-4"
              >
                {bestPrice !== null && (Number(product.price) || 0) === bestPrice && (
                  <span className="absolute left-2 top-2">
                    <Badge tone="lime" size="sm">
                      Best price
                    </Badge>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(product.id)}
                  aria-label={`Remove ${product.name}`}
                  className="absolute right-2 top-2 rounded-full p-1 text-ink-subtle transition-colors hover:text-danger"
                >
                  <X aria-hidden className="h-4 w-4" />
                </button>
                <Link to={productPath(product)} className="block">
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="mx-auto h-24 w-24 rounded-2xl border border-hairline object-cover sm:h-28 sm:w-28"
                    />
                  ) : (
                    <span className="mx-auto block h-24 w-24 rounded-2xl bg-white/40 sm:h-28 sm:w-28" />
                  )}
                  <span className="mt-2 line-clamp-2 block text-xs font-semibold text-ink sm:text-sm">
                    {product.name}
                  </span>
                  <span className="tabular mt-1 block font-display text-base font-bold text-brand-700 sm:text-lg">
                    {money(product.price)}
                  </span>
                </Link>
              </div>
            ))}
          </div>

          {/* Availability & colours, read live */}
          <CompareRow
            label="Availability"
            columns={columns}
            values={items.map((_, slot) => {
              const info = variantSlots[slot]?.data;
              if (!info) return '…';
              return info.available > 0 ? `${info.available} in stock` : 'Out of stock';
            })}
          />
          <div className="grid border-b border-hairline/70" style={columns}>
            <div className="bg-white/35 p-3 text-xs font-medium text-ink-muted sm:p-4 sm:text-sm">
              Colours
            </div>
            {items.map((product, slot) => {
              const info = variantSlots[slot]?.data;
              const variants = info?.serialised ? info.variants : [];
              return (
                <div
                  key={product.id}
                  className="flex flex-wrap items-center justify-center gap-1.5 border-l border-hairline/70 p-3 text-center text-xs text-ink sm:p-4 sm:text-sm"
                >
                  {variants.length === 0
                    ? '—'
                    : variants.map((variant) => (
                        <span
                          key={variant.color ?? 'none'}
                          className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-canvas/70 px-2 py-0.5 text-xs"
                        >
                          <span
                            aria-hidden
                            className="h-2.5 w-2.5 rounded-full border border-black/10"
                            style={{ background: colourSwatch(variant.color) }}
                          />
                          {variant.color ?? 'As pictured'}
                        </span>
                      ))}
                </div>
              );
            })}
          </div>

          {/* Specs, skipping rows nothing fills */}
          {COMPARE_ROWS.map(({ label, get }) => {
            const values = items.map((product) => get(product)?.trim() || '—');
            if (values.every((value) => value === '—')) return null;
            return <CompareRow key={label} label={label} columns={columns} values={values} />;
          })}

          {/* Actions */}
          <div className="grid" style={columns}>
            <div className="bg-white/35 p-3 sm:p-4" />
            {items.map((product) => (
              <div key={product.id} className="border-l border-hairline/70 p-3 sm:p-4">
                <Link
                  to={productPath(product)}
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full bg-lime-500 px-4 text-xs font-semibold text-brand-800 transition-colors hover:bg-lime-400 sm:text-sm"
                >
                  View &amp; buy
                  <ArrowRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* More to add, without leaving the page */}
      {count > 0 && count < COMPARE_LIMIT && pickable.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-bold tracking-tight text-brand-700">
            Add one more
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {pickable.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CompareRow({
  label,
  values,
  columns,
}: {
  label: string;
  values: string[];
  columns: { gridTemplateColumns: string };
}) {
  // The tint marks a decision point: these candidates are not the same here.
  const differs = values.length > 1 && new Set(values).size > 1;
  return (
    <div
      className={cn('grid border-b border-hairline/70', differs && 'bg-lime-500/10')}
      style={columns}
    >
      <div className="flex items-center gap-1.5 bg-white/35 p-3 text-xs font-medium text-ink-muted sm:p-4 sm:text-sm">
        {label}
        {differs && (
          <span aria-hidden title="These differ" className="h-1.5 w-1.5 rounded-full bg-lime-600" />
        )}
      </div>
      {values.map((value, index) => (
        <div
          key={index}
          className="border-l border-hairline/70 p-3 text-center text-xs text-ink sm:p-4 sm:text-sm"
        >
          {value}
        </div>
      ))}
    </div>
  );
}
