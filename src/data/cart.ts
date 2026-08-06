import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LineItem, ProductRow } from '@/lib/database.types';
import { DEFAULT_VAT_RATE, round2, vatFromInclusive } from '@/lib/format';

const STORAGE_KEY = 'jr-cart-v2';

export interface CartLine extends LineItem {
  product_id: number;
  /** Kept so the cart can warn when a line now exceeds what is on hand. */
  available_stock: number;
  image?: string | null;
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

  const add = useCallback((product: ProductRow, quantity = 1, color?: string | null) => {
    const existing = current.find((l) => l.product_id === product.id && l.color === (color ?? null));
    const alreadyInCart = existing?.quantity ?? 0;
    // Never let the cart exceed what the shop can actually ship.
    const capped = Math.max(0, Math.min(quantity, product.stock - alreadyInCart));
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
            price: Number(product.price) || 0,
            quantity: capped,
            color: color ?? product.color ?? null,
            image: product.image,
            available_stock: product.stock,
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

  return { lines, add, setQuantity, remove, clear, count: lines.reduce((n, l) => n + l.quantity, 0) };
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

/** Memoised totals for a live cart. */
export function useCartTotals(lines: CartLine[], discount = 0): CartTotals {
  return useMemo(() => cartTotals(lines, discount), [lines, discount]);
}
