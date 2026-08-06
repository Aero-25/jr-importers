import { useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useCatalog, useFacets, type CatalogSort } from '@/data/products';
import { CATEGORY_GROUPS } from '@/lib/constants';
import { money } from '@/lib/format';
import { cn } from '@/lib/cn';
import { Button, EmptyState, ErrorState, Select } from '@/ui';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { useSeo, breadcrumbJsonLd } from '../seo';

const SORTS: Array<{ value: CatalogSort; label: string }> = [
  { value: 'popular', label: 'Most popular' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name', label: 'Name A–Z' },
];

export default function Catalog() {
  const { group: groupId } = useParams<{ group?: string }>();
  const [params, setParams] = useSearchParams();

  const group = CATEGORY_GROUPS.find((g) => g.id === groupId);
  const search = params.get('q') ?? '';
  const brand = params.get('brand');
  const category = params.get('category');
  const sort = (params.get('sort') as CatalogSort | null) ?? 'popular';
  const inStockOnly = params.get('stock') === 'in';

  const title = group ? group.label : search ? `Search: ${search}` : 'Shop all';

  useSeo({
    title: `${title} — JR Importers`,
    description: group
      ? `Browse ${group.label.toLowerCase()} at JR Importers. Imported stock, Namibian delivery, VAT-inclusive pricing.`
      : 'Browse the full JR Importers catalogue — phones, laptops, tablets, audio and accessories.',
    path: groupId ? `/shop/${groupId}` : '/shop',
    jsonLd: breadcrumbJsonLd([
      { name: 'Home', path: '/' },
      { name: 'Shop', path: '/shop' },
      ...(group ? [{ name: group.label, path: `/shop/${group.id}` }] : []),
    ]),
  });

  const filters = useMemo(
    () => ({
      categories: group ? [...group.categories] : null,
      category,
      brand,
      search,
      sort,
      inStockOnly,
    }),
    [group, category, brand, search, sort, inStockOnly],
  );

  const catalog = useCatalog(filters);
  const facets = useFacets();

  function update(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const activeFilters = [
    brand && { key: 'brand', label: brand },
    category && { key: 'category', label: category },
    inStockOnly && { key: 'stock', label: 'In stock only' },
    search && { key: 'q', label: `“${search}”` },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {catalog.isLoading
            ? 'Loading products…'
            : `${catalog.data?.length ?? 0} product${catalog.data?.length === 1 ? '' : 's'}`}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-center gap-2 lg:hidden">
            <SlidersHorizontal aria-hidden className="h-4 w-4 text-ink-muted" />
            <span className="text-sm font-medium text-ink">Filters</span>
          </div>

          <Select
            label="Sort by"
            value={sort}
            onChange={(e) => update('sort', e.target.value)}
            options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
          />

          {facets.data && facets.data.brands.length > 0 && (
            <FacetList
              title="Brand"
              options={facets.data.brands}
              selected={brand}
              onSelect={(value) => update('brand', value)}
            />
          )}

          {!group && facets.data && facets.data.categories.length > 0 && (
            <FacetList
              title="Category"
              options={facets.data.categories}
              selected={category}
              onSelect={(value) => update('category', value)}
            />
          )}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => update('stock', e.target.checked ? 'in' : null)}
              className="h-4 w-4 rounded border-hairline bg-surface accent-brand-500"
            />
            In stock only
          </label>

          {facets.data && facets.data.priceRange.max > 0 && (
            <p className="text-xs text-ink-subtle">
              Prices from {money(facets.data.priceRange.min)} to{' '}
              {money(facets.data.priceRange.max)}
            </p>
          )}
        </aside>

        <div>
          {activeFilters.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => update(filter.key, null)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-raised px-3 py-1 text-xs text-ink transition-colors hover:border-danger hover:text-danger"
                >
                  {filter.label}
                  <X aria-hidden className="h-3 w-3" />
                  <span className="sr-only">Remove filter</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => setParams(new URLSearchParams(), { replace: true })}
                className="text-xs text-ink-subtle underline hover:text-ink"
              >
                Clear all
              </button>
            </div>
          )}

          {catalog.isError ? (
            <ErrorState error={catalog.error} onRetry={() => void catalog.refetch()} />
          ) : catalog.isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : catalog.data && catalog.data.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {catalog.data.map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 8} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="No products match"
              message="Try removing a filter, or ask us to source the exact model you want."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setParams(new URLSearchParams(), { replace: true })}
                >
                  Clear filters
                </Button>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

function FacetList({
  title,
  options,
  selected,
  onSelect,
}: {
  title: string;
  options: Array<{ value: string; count: number }>;
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  return (
    <div>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      <ul className="space-y-0.5">
        {options.slice(0, 12).map((option) => {
          const isActive = selected === option.value;
          return (
            <li key={option.value}>
              <button
                type="button"
                onClick={() => onSelect(isActive ? null : option.value)}
                aria-pressed={isActive}
                className={cn(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-brand-500/12 font-medium text-brand-300'
                    : 'text-ink-muted hover:bg-raised hover:text-ink',
                )}
              >
                <span className="truncate">{option.value}</span>
                <span className="tabular ml-2 shrink-0 text-xs text-ink-subtle">{option.count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
