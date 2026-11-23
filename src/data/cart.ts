import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LineItem, PublicProductRow } from '@/lib/database.types';
import { isServiceCategory } from '@/lib/constants';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { ON_ORDER_LIMIT, effectivePrice, isOnOrder, useActivePromotion } from './promotions';

const STORAGE_KEY = 'jr-cart-v2';

export interface CartLine extends LineItem {
  product_id: number;
  /** Kept so the cart can warn when a line now exceeds what is on hand. */
  available_stock: number;
  image?: string | null;
  /** Sourced after the sale: none on the shelf when it was added. */
  on_order?: boolean;
  /** The normal price, when `price` is a sale price. Display only. */
  was_price?: number | null;
}

export interface CartTotals {
  itemCount: number;
  subtotal: number;
  discount: number;
  /** VAT contained in the payable total — Namibian prices are VAT-inclusive. */
  vat: number;
  net: number;
  total: number;
}

function read(): CartLine[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (line): line is CartLine =>
        typeof line === 'object' && line !== null && 'product_id' in line && 'quantity' in line,
    );
  } catch {
    // Corrupted storage must never block the shop from rendering.
    return [];
  }
}

function write(lines: CartLine[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
  } catch {
    /* Quota or private mode — the in-memory cart still works for this session. */
  }
}

/** Notifies every `useCart()` in the page, including other components. */
const listeners = new Set<(lines: CartLine[]) => void>();
let current: CartLine[] = typeof window === 'undefined' ? [] : read();

function commit(next: CartLine[]) {
  current = next;
  write(next);
  listeners.forEach((listener) => listener(next));
}

/**
 * Cart state.
 *
 * Deliberately client-side. Server-side carts need a writable `users.cart`
 * column for anonymous shoppers, and the reservation model (see the
 * `reserve_order_stock` RPC) already handles the only thing that truly needs
 * to be authoritative: stock, at the moment of checkout.
 */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(current);

  useEffect(() => {
    listeners.add(setLines);
    // Another tab may have changed the cart while this one was hidden.
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) commit(read());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(setLines);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  /**
   * `unitPrice` is what the product costs right now (the sale price during a
   * promotion). The database re-checks it when the order is placed.
   */
  const add = useCallback((
    product: PublicProductRow,
    quantity = 1,
    color?: string | null,
    unitPrice?: number,
  ) => {
    // Repairs are quoted at the counter, not bought online. Refused here as
    // well as hidden in the UI, so the rule holds however the call is reached.
    if (isServiceCategory(product.category)) {
      return { added: 0, reason: 'in-store-only' as const };
    }

    const existing = current.find((l) => l.product_id === product.id && l.color === (color ?? null));
    const alreadyInCart = existing?.quantity ?? 0;
    const onOrder = isOnOrder(product);
    // Never let the cart exceed what the shop can actually ship — or, for a
    // line the shop sources after the sale, a sensible handful.
    const ceiling = onOrder ? ON_ORDER_LIMIT : product.stock;
    const capped = Math.max(0, Math.min(quantity, ceiling - alreadyInCart));
    const normal = Number(product.price) || 0;
    const price = unitPrice !== undefined && unitPrice > 0 ? unitPrice : normal;
    if (capped === 0) return { added: 0, reason: 'insufficient-stock' as const };

    const next = existing
      ? current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + capped } : line,
        )
      : [
          ...current,
          {
            product_id: product.id,
            name: product.name,
            sku: product.sku,
            price,
            was_price: price < normal ? normal : null,
            quantity: capped,
            // Only a colour the shopper actually chose. The catalogue's
            // `color` field is descriptive metadata and may match no unit in
            // the pool — attaching it here would make the colour-exact
            // reservation hold the order to a colour nobody picked.
            color: color ?? null,
            image: product.image,
            available_stock: ceiling,
            on_order: onOrder,
          } satisfies CartLine,
        ];

    commit(next);
    return { added: capped, reason: capped < quantity ? ('partial' as const) : ('ok' as const) };
  }, []);

  const setQuantity = useCallback((productId: number, color: string | null, quantity: number) => {
    const next =
      quantity <= 0
        ? current.filter((l) => !(l.product_id === productId && l.color === color))
        : current.map((line) =>
            line.product_id === productId && line.color === color
              ? { ...line, quantity: Math.min(quantity, line.available_stock || quantity) }
              : line,
          );
    commit(next);
  }, []);

  const remove = useCallback((productId: number, color: string | null) => {
    commit(current.filter((l) => !(l.product_id === productId && l.color === color)));
  }, []);

  const clear = useCallback(() => commit([]), []);

  /**
   * Re-prices lines from the live catalogue: a cart filled before a sale gets
   * the sale price, one kept after it goes back to normal. Lines whose product
   * has gone are dropped. Returns how many lines changed.
   */
  const reprice = useCallback(
    (prices: Map<number, { price: number; was: number | null; stockCeiling: number; onOrder: boolean } | null>) => {
      let changed = 0;
      const next: CartLine[] = [];
      for (const line of current) {
        if (!prices.has(line.product_id)) {
          next.push(line);
          continue;
        }
        const live = prices.get(line.product_id);
        if (!live) {
          changed += 1;
          continue;
        }
        if (
          Math.abs(live.price - line.price) > 0.004 ||
          live.stockCeiling !== line.available_stock ||
          live.onOrder !== Boolean(line.on_order)
        ) {
          changed += 1;
          next.push({
            ...line,
            price: live.price,
            was_price: live.was,
            available_stock: live.stockCeiling,
            on_order: live.onOrder,
            quantity: Math.min(line.quantity, Math.max(live.stockCeiling, 1)),
          });
        } else {
          next.push(line);
        }
      }
      if (changed) commit(next);
      return changed;
    },
    [],
  );

  return {
    lines,
    add,
    setQuantity,
    remove,
    clear,
    reprice,
    count: lines.reduce((n, l) => n + l.quantity, 0),
  };
}

/** Pure totals calculation — also used by the POS and by order confirmation. */
export function cartTotals(
  lines: Array<Pick<LineItem, 'price' | 'quantity'>>,
  discount = 0,
  vatRate = DEFAULT_VAT_RATE,
): CartTotals {
  const subtotal = round2(lines.reduce((sum, line) => sum + line.price * line.quantity, 0));
  const appliedDiscount = round2(Math.min(Math.max(discount, 0), subtotal));
  const total = round2(subtotal - appliedDiscount);
  const { net, vat } = vatFromInclusive(total, vatRate);

  return {
    itemCount: lines.reduce((n, line) => n + line.quantity, 0),
    subtotal,
    discount: appliedDiscount,
    vat,
    net,
    total,
  };
}

/**
 * Keeps the cart's prices honest against the live catalogue while the cart or
 * checkout is open. The database refuses an order priced below the current
 * price, so this is what stops a shopper meeting that refusal: the cart shows
 * the right figure before they press Place order.
 */
export function useLiveCartPrices() {
  const { lines, reprice } = useCart();
  const promotion = useActivePromotion();
  const ids = useMemo(
    () => [...new Set(lines.map((l) => l.product_id))].sort((a, b) => a - b),
    [lines],
  );
  const idKey = ids.join(',');
  const [checking, setChecking] = useState(false);
  const [changed, setChanged] = useState(0);
  const [nonce, setNonce] = useState(0);
  const recheck = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!ids.length) return;
    let cancelled = false;
    setChecking(true);
    void (async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, price, sale_price, stock, allow_backorder, active, show_online')
        .in('id', ids);
      if (cancelled) return;
      setChecking(false);
      // On a network fault keep the cart as it is; the database still checks.
      if (error || !data) return;
      const byId = new Map<number, { price: number; was: number | null; stockCeiling: number; onOrder: boolean } | null>();
      for (const id of ids) byId.set(id, null);
      for (const row of data as Array<Record<string, unknown>>) {
        const product = row as unknown as PublicProductRow;
        if (product.active === false || product.show_online === false) continue;
        const price = effectivePrice(product, promotion?.preview ? null : promotion);
        const normal = Number(product.price) || 0;
        const onOrder = isOnOrder(product);
        byId.set(product.id, {
          price,
          was: price < normal ? normal : null,
          stockCeiling: onOrder ? ON_ORDER_LIMIT : product.stock,
          onOrder,
        });
      }
      const n = reprice(byId);
      if (n) setChanged((c) => c + n);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id set and the promotion
  }, [idKey, promotion?.theme, promotion?.preview, nonce]);

  return { checking, changed, recheck };
}

/** Memoised totals for a live cart. */
export function useCartTotals(lines: CartLine[], discount = 0): CartTotals {
  return useMemo(() => cartTotals(lines, discount), [lines, discount]);
}
