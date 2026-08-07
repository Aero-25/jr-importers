import type { LineItem } from './database.types';

/**
 * The sale queue that lets the till keep trading without a network.
 *
 * Load-shedding and ISP drops are ordinary events here, and either one used to
 * close the counter mid-Saturday. A sale rung up offline is written to
 * IndexedDB first and posted when the line returns.
 *
 * IndexedDB rather than localStorage on purpose: localStorage is synchronous
 * (it blocks the till's render on every write), capped at about 5 MB, and — the
 * part that matters — a quota error there is silent, so the sale you thought
 * was saved is simply gone.
 */

const DB_NAME = 'jr-till';
const DB_VERSION = 1;
const STORE = 'pending_sales';

export interface QueuedSale {
  /** Generated on the device. Also the idempotency key when it finally posts. */
  id: string;
  items: LineItem[];
  discount: number;
  paymentMethod: string;
  amountTendered?: number;
  customer?: { id?: string | null; name?: string | null; phone?: string | null };
  cashierName: string;
  shiftId: number | null;
  notes?: string | null;
  /** When it was rung up, not when it synced. The cash-up depends on this. */
  takenAt: string;
  attempts: number;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the till store.'));
  });

  return dbPromise;
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Till store write failed.'));
  });
}

export async function queueSale(sale: Omit<QueuedSale, 'id' | 'takenAt' | 'attempts'>): Promise<QueuedSale> {
  const queued: QueuedSale = {
    ...sale,
    id: crypto.randomUUID(),
    takenAt: new Date().toISOString(),
    attempts: 0,
  };
  await tx('readwrite', (store) => store.put(queued));
  return queued;
}

export async function pendingSales(): Promise<QueuedSale[]> {
  const rows = await tx<QueuedSale[]>('readonly', (store) => store.getAll() as IDBRequest<QueuedSale[]>);
  // Oldest first: the drawer was filled in that order and the cash-up reads
  // better when the sequence survives.
  return rows.sort((a, b) => a.takenAt.localeCompare(b.takenAt));
}

export async function pendingCount(): Promise<number> {
  return tx<number>('readonly', (store) => store.count());
}

export async function removeSale(id: string): Promise<void> {
  await tx('readwrite', (store) => store.delete(id));
}

export async function recordFailure(sale: QueuedSale, message: string): Promise<void> {
  await tx('readwrite', (store) =>
    store.put({ ...sale, attempts: sale.attempts + 1, lastError: message }),
  );
}

/**
 * A sale that has failed repeatedly is not going to succeed by being retried
 * again on the next tick; it needs a person. Six attempts is roughly a minute
 * of reconnection attempts, which is long enough to rule out a flapping line.
 */
export const MAX_ATTEMPTS = 6;

export function isStuck(sale: QueuedSale): boolean {
  return sale.attempts >= MAX_ATTEMPTS;
}
