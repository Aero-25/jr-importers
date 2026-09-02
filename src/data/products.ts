import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ProductRow } from '@/lib/database.types';
import { SERVICE_CATEGORIES } from '@/lib/constants';
import { createResource } from './crud';
import { keys } from './keys';

/**
 * Service entries (repairs) are out of the catalogue entirely: the workshop
 * is advertised by the repairs band and booked at the counter, not listed
 * between the phones. Applied with `stock.gt.0` by every catalogue query, so
 * a service can never surface in the grid, the facets, the compare picker or
 * "related products". Anything else with `stock <= 0` is unbuyable and would
 * only frustrate someone who clicked in.
 */
const NO_SERVICES = `(${SERVICE_CATEGORIES.map((c) => `"${c}"`).join(',')})`;

/**
 * `category NOT IN (…)` is NULL — not true — for a NULL category, so a bare
 * `.not('category', 'in', …)` silently drops uncategorised products from the
 * whole storefront. This or-filter keeps them: no category is not a service.
 */
const NOT_A_SERVICE = `category.is.null,category.not.in.${NO_SERVICES}`;

export const products = createResource('products', {
  orderBy: { column: 'created_at', ascending: false },
});

export interface CatalogFilters {
  category?: string | null;
  /** Several categories at once — how the storefront's group tabs work. */
  categories?: string[] | null;
  brand?: string | null;
  search?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  featuredOnly?: boolean;
  sort?: CatalogSort;
  limit?: number;
}

export type CatalogSort = 'newest' | 'price-asc' | 'price-desc' | 'name' | 'popular';

/**
 * The storefront catalogue query.
 *
 * Only `active` products that are `show_online` are requested. Both are
 * also enforced by RLS, but asking for them here keeps the payload small
 * rather than relying on the policy to filter after transfer.
 *
 * `active` and `show_online` are not the same thing: counter-only stock
 * (screen protectors, say) stays active so the till can sell it, and is kept
 * off the shop with `show_online`.
 */
export function useCatalog(filters: CatalogFilters = {}) {
  return useQuery<ProductRow[], Error>({
    queryKey: keys.list('products', { catalog: filters }),
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .eq('show_online', true)
        .gt('stock', 0)
        .or(NOT_A_SERVICE);

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.categories?.length) query = query.in('category', filters.categories);
      if (filters.brand) query = query.eq('brand', filters.brand);
      if (filters.featuredOnly) query = query.eq('featured', true);
      if (typeof filters.minPrice === 'number') query = query.gte('price', filters.minPrice);
      if (typeof filters.maxPrice === 'number') query = query.lte('price', filters.maxPrice);

      const term = filters.search?.trim().replace(/[,()]/g, ' ').trim();
      if (term) {
        query = query.or(
          ['name', 'brand', 'description', 'sku', 'category']
            .map((column) => `${column}.ilike.%${term}%`)
            .join(','),
        );
      }

      switch (filters.sort) {
        case 'price-asc':
          query = query.order('price', { ascending: true });
          break;
        case 'price-desc':
          query = query.order('price', { ascending: false });
          break;
        case 'name':
          query = query.order('name', { ascending: true });
          break;
        case 'popular':
          // No order-count rollup yet, so "popular" means merchandised-then-new.
          query = query.order('featured', { ascending: false }).order('created_at', {
            ascending: false,
          });
          break;
        default:
          query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query.limit(filters.limit ?? 300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useProduct(id: number | string | null | undefined) {
  return useQuery<ProductRow | null, Error>({
    queryKey: keys.detail('products', id ?? ''),
    enabled: id !== null && id !== undefined && id !== '',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', Number(id))
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
}

export interface Facets {
  categories: Array<{ value: string; count: number }>;
  brands: Array<{ value: string; count: number }>;
  priceRange: { min: number; max: number };
}

/**
 * Sidebar filter options, counted from the live catalogue.
 *
 * Pulls only the three columns it needs so the whole catalogue can be
 * aggregated client-side without a second heavy round trip.
 */
export function useFacets(scope: { categories?: string[] | null } = {}) {
  const scoped = scope.categories?.length ? scope.categories : null;

  return useQuery<Facets, Error>({
    queryKey: [...keys.productFacets(), scoped],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Scoped to whatever the shopper is currently looking at. Offering
      // "Canon" as a brand filter on the Phones tab would only lead to an
      // empty page.
      let query = supabase
        .from('products')
        .select('category, brand, price')
        .eq('active', true)
        .eq('show_online', true)
        .gt('stock', 0)
        .or(NOT_A_SERVICE);
      if (scoped) query = query.in('category', scoped);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const categories = new Map<string, number>();
      const brands = new Map<string, number>();
      let min = Number.POSITIVE_INFINITY;
      let max = 0;

      for (const row of data ?? []) {
        if (row.category) categories.set(row.category, (categories.get(row.category) ?? 0) + 1);
        if (row.brand) brands.set(row.brand, (brands.get(row.brand) ?? 0) + 1);
        const price = Number(row.price) || 0;
        if (price > 0) {
          min = Math.min(min, price);
          max = Math.max(max, price);
        }
      }

      const toSorted = (map: Map<string, number>) =>
        [...map.entries()]
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

      return {
        categories: toSorted(categories),
        brands: toSorted(brands),
        priceRange: {
          min: Number.isFinite(min) ? Math.floor(min) : 0,
          max: max > 0 ? Math.ceil(max) : 0,
        },
      };
    },
  });
}

/** Same-category products, excluding the one being viewed. */
export function useRelatedProducts(product: ProductRow | null | undefined, limit = 8) {
  return useQuery<ProductRow[], Error>({
    queryKey: keys.list('products', { related: product?.id, category: product?.category }),
    enabled: Boolean(product?.category),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .eq('show_online', true)
        .gt('stock', 0)
        .not('category', 'in', NO_SERVICES)
        .eq('category', product!.category!)
        .neq('id', product!.id)
        .order('featured', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Every non-empty image on a product, in display order, deduplicated. */
export function productImages(product: ProductRow): string[] {
  return [
    product.image,
    product.image1,
    product.image2,
    product.image3,
    product.image4,
    product.image5,
  ].filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
}

/**
 * The spec sheet's label/field table — the single source for both the product
 * page's spec list and the compare page's rows, so a new spec column appears
 * in both places at once.
 */
export const SPEC_FIELDS: Array<{ label: string; get: (p: ProductRow) => string | null }> = [
  { label: 'Display', get: (p) => p.spec_display },
  { label: 'Processor', get: (p) => p.spec_processor },
  { label: 'RAM', get: (p) => p.spec_ram },
  { label: 'Storage', get: (p) => p.spec_storage },
  { label: 'Battery', get: (p) => p.spec_battery },
  { label: 'Rear camera', get: (p) => p.spec_back_camera },
  { label: 'Front camera', get: (p) => p.spec_front_camera },
  { label: 'Operating system', get: (p) => p.spec_os },
  { label: 'Weight', get: (p) => p.spec_weight },
  { label: 'Also includes', get: (p) => p.spec_extras },
];

/** Spec sheet rows, skipping blanks so the table has no empty cells. */
export function productSpecs(product: ProductRow): Array<{ label: string; value: string }> {
  return SPEC_FIELDS.map(({ label, get }) => ({ label, value: get(product)?.trim() ?? '' })).filter(
    (row) => row.value,
  );
}

/* ── Colour variants, from the IMEI pool ─────────────────────────────────── */

export interface ColourVariant {
  /** `null` where a unit was booked in without a colour recorded. */
  color: string | null;
  available: number;
}

export interface Variants {
  /** True once the handset is stocked by IMEI rather than a plain count. */
  serialised: boolean;
  variants: ColourVariant[];
  /** Units on hand: the IMEI count when serialised, else `products.stock`. */
  available: number;
}

/**
 * Colours and availability for a handset.
 *
 * Phones are stocked as individual units, each with its own IMEI and colour,
 * so the colours a customer can pick are whatever is physically on the shelf —
 * not a list typed on the product. RLS only exposes `available` IMEIs to the
 * public, which is exactly the set this needs.
 *
 * Falls back to `products.stock` for anything not yet booked in by IMEI, so
 * accessories and un-serialised stock keep working unchanged.
 */
export function useVariants(product: ProductRow | null | undefined) {
  return useQuery<Variants, Error>({
    queryKey: keys.list('product_imeis', { variants: product?.id }),
    enabled: Boolean(product?.id),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('product_imeis')
        .select('color')
        .eq('product_id', product!.id)
        .eq('status', 'available');
      if (error) throw new Error(error.message);

      const rows = data ?? [];
      if (rows.length === 0) {
        // Not serialised — the count lives on the product row. Read it live
        // rather than trusting the caller's copy: the compare page passes
        // products snapshotted into localStorage, and stock is the one field
        // that must never be served stale.
        const { data: live, error: stockError } = await supabase
          .from('products')
          .select('stock')
          .eq('id', product!.id)
          .maybeSingle();
        if (stockError) throw new Error(stockError.message);
        return { serialised: false, variants: [], available: live?.stock ?? product!.stock };
      }

      const counts = new Map<string | null, number>();
      for (const row of rows) {
        const key = row.color?.trim() || null;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }

      const variants = [...counts.entries()]
        .map(([color, available]) => ({ color, available }))
        .sort((a, b) => (a.color ?? '').localeCompare(b.color ?? ''));

      return { serialised: true, variants, available: rows.length };
    },
  });
}

/** A rough swatch for a colour name, for the picker. Unknown names get grey. */
export function colourSwatch(name: string | null): string {
  const key = (name ?? '').toLowerCase();
  const table: Array<[RegExp, string]> = [
    [/black|graphite|onyx|midnight/, '#1b1f24'],
    [/white|silver|frost|pearl/, '#e9ecf1'],
    [/grey|gray|titan/, '#7c8794'],
    [/blue|navy|ocean|sky/, '#2c57f2'],
    [/green|mint|lime|olive/, '#3f9142'],
    [/red|crimson|scarlet/, '#c62828'],
    [/gold|champagne|sand|beige/, '#d9b166'],
    [/purple|violet|lavender/, '#7a52c7'],
    [/pink|rose/, '#e2749a'],
    [/yellow|amber/, '#e0a92f'],
    [/orange|copper|bronze/, '#d1741f'],
  ];
  for (const [pattern, hex] of table) if (pattern.test(key)) return hex;
  return '#9aa4b2';
}
