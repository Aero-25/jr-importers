import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import { getSupabaseClient } from './supabase.js';

/* ============================================================ toasts */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setItems((t) => [...t, { id, message, kind }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      {items.length > 0 && (
        <div className="toasts" role="status" aria-live="polite">
          {items.map((t) => (
            <div key={t.id} className={`toast ${t.kind}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                {t.kind === 'err' ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>
                  : t.kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 16v-5M12 8h.01" /></>
                  : <path d="M20 6L9 17l-5-5" />}
              </svg>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

/* ============================================================ auth */
const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const db = useMemo(() => getSupabaseClient(), []);
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAdmin = useCallback(async () => {
    try { const { data } = await db.rpc('is_admin'); setIsAdmin(!!data); } catch { setIsAdmin(false); }
  }, [db]);

  useEffect(() => {
    db.auth.getSession().then(async ({ data }) => {
      setUser(data?.session?.user || null);
      if (data?.session?.user) await checkAdmin();
      setReady(true);
    });
    const { data: sub } = db.auth.onAuthStateChange(async (_e, session) => {
      setUser(session?.user || null);
      if (session?.user) await checkAdmin(); else setIsAdmin(false);
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [db, checkAdmin]);

  const signIn = useCallback(async (email, password) => {
    const { error } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
  }, [db]);

  const signOut = useCallback(async () => { await db.auth.signOut(); }, [db]);

  const value = useMemo(() => ({ db, user, ready, isAdmin, signIn, signOut }), [db, user, ready, isAdmin, signIn, signOut]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ============================================================ data */
const DEFAULT_SETTINGS = {
  store_name: 'JR Importers', store_tagline: "Namibia's home of genuine phones & electronics",
  store_email: 'sales@jrimporters.com', store_phone: '+264 81 562 9203', store_whatsapp: '264815629203',
  store_address: 'Pelican Mall, Walvis Bay, Namibia', store_hours: 'Mon–Fri 08:00–18:00 · Sat 09:00–14:00',
  currency: 'N$', vat_rate: 15, delivery_fee: 150, free_delivery_threshold: 5000,
  bank_name: 'Bank Windhoek', bank_account_name: 'JR Importers CC', bank_account_number: '8004257139', bank_branch_code: '481972',
};

const TABLES = {
  products: { order: { column: 'name', ascending: true } },
  orders: { order: { column: 'created_at', ascending: false } },
  customers: { order: { column: 'created_at', ascending: false } },
  suppliers: { order: { column: 'name', ascending: true } },
  expenses: { order: { column: 'expense_date', ascending: false } },
  invoices: { order: { column: 'created_at', ascending: false } },
  till_shifts: { order: { column: 'created_at', ascending: false } },
  stock_movements: { order: { column: 'created_at', ascending: false } },
  coupons: { order: { column: 'created_at', ascending: false } },
  product_imeis: { order: { column: 'created_at', ascending: false } },
  purchase_orders: { order: { column: 'created_at', ascending: false } },
  grvs: { order: { column: 'created_at', ascending: false } },
  service_charges: { order: { column: 'name', ascending: true } },
};

const EMPTY = Object.fromEntries(Object.keys(TABLES).map((t) => [t, []]));

const DataCtx = createContext(null);
export const useData = () => useContext(DataCtx);
export const useSettings = () => useContext(DataCtx).settings;

function DataProvider({ children }) {
  const { db, user } = useAuth();
  const [data, setData] = useState(EMPTY);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const names = Object.keys(TABLES);
      const results = await Promise.all(names.map(async (t) => {
        let q = db.from(t).select('*');
        const o = TABLES[t].order;
        if (o) q = q.order(o.column, { ascending: o.ascending }).limit(1000);
        const { data: rows, error } = await q;
        if (error) { console.warn(`[admin] ${t}`, error.message); return []; }
        return rows || [];
      }));
      const next = {};
      names.forEach((t, i) => { next[t] = results[i]; });
      setData(next);

      const { data: srows } = await db.from('settings').select('key, value');
      if (srows) {
        const merged = { ...DEFAULT_SETTINGS };
        for (const r of srows) if (r.value !== null && r.value !== undefined) merged[r.key] = r.value;
        setSettings(merged);
      }
    } finally {
      setLoading(false);
      setLoadedOnce(true);
    }
  }, [db]);

  useEffect(() => { if (user) refresh(); else { setData(EMPTY); setLoadedOnce(false); } }, [user, refresh]);

  const value = useMemo(() => ({ ...data, settings, loading, loadedOnce, refresh, db }), [data, settings, loading, loadedOnce, refresh, db]);
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

/* ============================================================ till (current shift) */
const TillCtx = createContext(null);
export const useTill = () => useContext(TillCtx);

function TillProvider({ children }) {
  const data = useData();
  const openShift = useMemo(
    () => (data.till_shifts || []).find((s) => String(s.status).toLowerCase() === 'open') || null,
    [data.till_shifts],
  );
  return <TillCtx.Provider value={{ openShift }}>{children}</TillCtx.Provider>;
}

/* ============================================================ hash router */
const RouterCtx = createContext(null);
export const useRoute = () => useContext(RouterCtx);
export function navigate(to) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
  const main = document.querySelector('.content');
  if (main) main.scrollTo?.({ top: 0 });
}
function RouterProvider({ children }) {
  const get = () => (window.location.hash.replace(/^#\/?/, '') || 'pos').split('/');
  const [parts, setParts] = useState(get);
  useEffect(() => {
    const on = () => setParts(get());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return <RouterCtx.Provider value={{ view: parts[0], param: parts[1], parts }}>{children}</RouterCtx.Provider>;
}

/* ============================================================ composition */
export function AdminProviders({ children }) {
  return (
    <ToastProvider>
      <AuthProvider>
        <DataProvider>
          <TillProvider>
            <RouterProvider>{children}</RouterProvider>
          </TillProvider>
        </DataProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
