import { useCallback, useEffect, useState } from 'react';
import type { ProductRow } from '@/lib/database.types';

const STORAGE_KEY = 'jr-compare-v1';

/** Three columns is what a phone screen can hold side by side. */
export const COMPARE_LIMIT = 3;

function read(): ProductRow[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ProductRow =>
        typeof item === 'object' && item !== null && 'id' in item && 'name' in item,
    );
  } catch {
    // Corrupted storage must never block the shop from rendering.
    return [];
  }
}

function write(items: ProductRow[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* Quota or private mode — the in-memory list still works for this session. */
  }
}

/** Notifies every `useCompare()` on the page, header badge included. */
const listeners = new Set<(items: ProductRow[]) => void>();
let current: ProductRow[] = typeof window === 'undefined' ? [] : read();

function commit(next: ProductRow[]) {
  current = next;
  write(next);
  listeners.forEach((listener) => listener(next));
}

export type CompareToggle = 'added' | 'removed' | 'full';

/**
 * The comparison shelf: up to three products a shopper wants side by side.
 *
 * Client-side and persistent for the same reasons the cart is — it belongs to
 * the person browsing, not to an account, and it should survive a reload.
 * Product snapshots are stored whole so the compare page renders instantly;
 * prices and stock are re-read live where the page needs them fresh.
 */
export function useCompare() {
  const [items, setItems] = useState<ProductRow[]>(current);

  useEffect(() => {
    listeners.add(setItems);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) commit(read());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(setItems);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const has = useCallback((id: number) => items.some((p) => p.id === id), [items]);

  const toggle = useCallback((product: ProductRow): CompareToggle => {
    if (current.some((p) => p.id === product.id)) {
      commit(current.filter((p) => p.id !== product.id));
      return 'removed';
    }
    if (current.length >= COMPARE_LIMIT) return 'full';
    commit([...current, product]);
    return 'added';
  }, []);

  const remove = useCallback((id: number) => {
    commit(current.filter((p) => p.id !== id));
  }, []);

  const clear = useCallback(() => commit([]), []);

  return { items, count: items.length, has, toggle, remove, clear };
}
