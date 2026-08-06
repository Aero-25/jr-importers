import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { ProductRow } from '@/lib/database.types';
import { createResource } from './crud';
import { keys } from './keys';

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
  inStockOnly?: boolean;
  featuredOnly?: boolean;
  sort?: CatalogSort;
  limit?: number;
}

export type CatalogSort = 'newest' | 'price-asc' | 'price-desc' | 'name' | 'popular';

/**
 * The storefront catalogue query.
 *
 * Only `active` products are requested. That is also enforced by RLS, but
 * asking for it here keeps the payload small rather than relying on the
 * policy to filter after transfer.
 */
export function useCatalog(filters: CatalogFilters = {}) {
  return useQuery<ProductRow[], Error>({
    queryKey: keys.list('products', { catalog: filters }),
    queryFn: async () => {
      let query = supabase.from('products').select('*').eq('active', true);

      if (filters.category) query = query.eq('category', filters.category);
      if (filters.categories?.length) query = query.in('category', filters.categories);
      if (filters.brand) query = query.eq('brand', filters.brand);
      if (filters.featuredOnly) query = query.eq('featured', true);
      if (filters.inStockOnly) query = query.gt('stock', 0);
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
      let query = supabase.from('products').select('category, brand, price').eq('active', true);
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

/** Spec sheet rows, skipping blanks so the table has no empty cells. */
export function productSpecs(product: ProductRow): Array<{ label: string; value: string }> {
  const map: Array<[string, string | null]> = [
    ['Display', product.spec_display],
    ['Processor', product.spec_processor],
    ['RAM', product.spec_ram],
    ['Storage', product.spec_storage],
    ['Battery', product.spec_battery],
    ['Rear camera', product.spec_back_camera],
    ['Front camera', product.spec_front_camera],
    ['Operating system', product.spec_os],
    ['Weight', product.spec_weight],
    ['Also includes', product.spec_extras],
  ];
  return map
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([label, value]) => ({ label, value }));
}
