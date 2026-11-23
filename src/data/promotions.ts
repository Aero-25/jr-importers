import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PromotionRow, PublicProductRow } from '@/lib/database.types';
import { createResource } from './crud';
import { keys } from './keys';

/**
 * Sale windows.
 *
 * A promotion is a date range in the shop's own day (Africa/Windhoek). While
 * one is running, products with a `sale_price` are shown and charged at it and
 * the storefront wears the promotion's theme. The database prices orders from
 * the same rows (`effective_price()`), so what is shown here is what is billed.
 */
export const promotions = createResource('promotions', {
  orderBy: { column: 'starts_on', ascending: false },
});

/** Today as YYYY-MM-DD in Walvis Bay, whatever the visitor's clock zone. */
export function shopToday(now = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Windhoek',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

const PREVIEW_KEY = 'jr-promo-preview';

/**
 * `?preview=black-friday` lets the owner see the sale look before it starts.
 * Kept for the browser session only; `?preview=off` clears it. The preview
 * changes the look and shows the sale prices, but the database still charges
 * normal prices outside the window, so it can never sell anything cheap early.
 */
function previewTheme(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('preview');
    if (param === 'off') sessionStorage.removeItem(PREVIEW_KEY);
    else if (param) sessionStorage.setItem(PREVIEW_KEY, param);
    return sessionStorage.getItem(PREVIEW_KEY);
  } catch {
    return null;
  }
}

export interface ActivePromotion {
  name: string;
  theme: string;
  startsOn: string;
  endsOn: string;
  /** Shown because of `?preview=`, not because the window is open. */
  preview: boolean;
}

/** The promotion running today, if any. */
export function useActivePromotion(): ActivePromotion | null {
  const { data } = useQuery<PromotionRow[], Error>({
    queryKey: keys.list('promotions', { active: true }),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promotions')
        .select('id, name, theme, starts_on, ends_on, active, created_at, updated_at')
        .eq('active', true);
      // A missing table or a network fault must not take the shop down; it
      // just means no sale is shown.
      if (error) return [];
      return (data ?? []) as PromotionRow[];
    },
  });

  const today = shopToday();
  const running = (data ?? []).find((p) => p.active && p.starts_on <= today && today <= p.ends_on);
  if (running) {
    return {
      name: running.name,
      theme: running.theme,
      startsOn: running.starts_on,
      endsOn: running.ends_on,
      preview: false,
    };
  }

  const preview = previewTheme();
  if (preview) {
    const planned = (data ?? []).find((p) => p.theme === preview);
    return {
      name: planned?.name ?? 'Black Friday',
      theme: preview,
      startsOn: planned?.starts_on ?? today,
      endsOn: planned?.ends_on ?? today,
      preview: true,
    };
  }
  return null;
}

type Priced = Pick<PublicProductRow, 'price'> & { sale_price?: number | string | null };

/** The sale price, when one applies right now and actually lowers the price. */
export function salePriceOf(product: Priced, promotion: ActivePromotion | null): number | null {
  if (!promotion) return null;
  const sale = Number(product.sale_price);
  const price = Number(product.price);
  return Number.isFinite(sale) && sale > 0 && sale < price ? sale : null;
}

type Promoted = Priced & { in_promotion?: boolean | null; deal_note?: string | null };

/**
 * Part of the running promotion: it has a lower price, or the shop has put it
 * in the sale at its normal price (usually as a package, see deal_note).
 */
export function isPromoItem(product: Promoted, promotion: ActivePromotion | null): boolean {
  if (!promotion) return false;
  return salePriceOf(product, promotion) !== null || Boolean(product.in_promotion);
}

/** The package or deal line to show while a promotion runs. */
export function dealNoteOf(product: Promoted, promotion: ActivePromotion | null): string | null {
  if (!promotion) return null;
  const note = product.deal_note?.trim();
  return note ? note : null;
}

/** What the product costs right now. */
export function effectivePrice(product: Priced, promotion: ActivePromotion | null): number {
  return salePriceOf(product, promotion) ?? (Number(product.price) || 0);
}

/** Sold out on the shelf, but the shop will source one: still buyable. */
export function isOnOrder(product: Pick<PublicProductRow, 'stock'> & { allow_backorder?: boolean | null }): boolean {
  return Boolean(product.allow_backorder) && product.stock <= 0;
}

/** How many of an on-order line one checkout may ask for. */
export const ON_ORDER_LIMIT = 5;
