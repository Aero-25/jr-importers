import React, {
  createContext, useContext, useState, useEffect, useCallback, useMemo, useRef,
} from 'react';
import { getSupabaseClient, getRuntimeConfig } from './supabase.js';
import { primaryImage } from './format.js';

/* ============================================================ store settings
   Public store config lives in the `settings` table as jsonb key/value rows.
   We fold sensible Namibian defaults so the UI renders before/without a fetch. */

const DEFAULT_SETTINGS = {
  store_name: 'JR Importers',
  store_tagline: "Namibia's home of genuine phones & electronics",
  store_email: 'sales@jrimporters.com',
  store_phone: '+264 81 562 9203',
  store_whatsapp: '264815629203',
  store_address: 'Pelican Mall, Walvis Bay, Namibia',
  store_hours: 'Mon–Fri 08:00–18:00 · Sat 09:00–14:00',
  currency: 'N$',
  vat_rate: 15,
  delivery_fee: 150,
  free_delivery_threshold: 5000,
  bank_name: 'Bank Windhoek',
  bank_account_name: 'JR Importers CC',
  bank_account_number: '8004257139',
  bank_branch_code: '481972',
  facebook_url: 'https://facebook.com/jrimporters',
  instagram_url: 'https://instagram.com/jrimporters',
};

const SettingsCtx = createContext(DEFAULT_SETTINGS);
export const useSettings = () => useContext(SettingsCtx);

function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data } = await sb.from('settings').select('key, value');
        if (!alive || !data) return;
        const merged = { ...DEFAULT_SETTINGS };
        for (const row of data) {
          // jsonb scalars arrive already unwrapped by supabase-js
          if (row.value !== null && row.value !== undefined) merged[row.key] = row.value;
        }
        setSettings(merged);
      } catch {
        /* keep defaults — store still works offline of settings */
      }
    })();
    return () => { alive = false; };
  }, []);
  return <SettingsCtx.Provider value={settings}>{children}</SettingsCtx.Provider>;
}

/* ==================================================================== toasts */

const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, kind = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastCtx.Provider>
  );
}

function ToastViewport({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind === 'err' ? 'err' : 'ok'}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            {t.kind === 'err'
              ? <><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>
              : <path d="M20 6L9 17l-5-5" />}
          </svg>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

/* ====================================================================== cart
   Persisted to localStorage; lines reference product id + a snapshot so the
   cart survives even if a product later changes. */

const CART_KEY = 'jr_cart_v1';
const CartCtx = createContext(null);
export const useCart = () => useContext(CartCtx);

function loadCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}

function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);
  const [open, setOpen] = useState(false);
  const push = useToast();

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* ignore */ }
  }, [items]);

  const add = useCallback((product, qty = 1) => {
    setItems((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      const max = Number(product.stock || 0);
      if (existing) {
        const next = Math.min(existing.qty + qty, Math.max(max, existing.qty));
        return prev.map((l) => (l.id === product.id ? { ...l, qty: next } : l));
      }
      return [...prev, {
        id: product.id,
        name: product.name,
        brand: product.brand,
        sku: product.sku,
        price: Number(product.price || 0),
        image: primaryImage(product),
        stock: max,
        qty: Math.min(qty, Math.max(max, 1)),
      }];
    });
    push(`${product.name} added to cart`);
    setOpen(true);
  }, [push]);

  const setQty = useCallback((id, qty) => {
    setItems((prev) => prev
      .map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(qty, l.stock || qty)) } : l))
      .filter((l) => l.qty > 0));
  }, []);

  const remove = useCallback((id) => setItems((prev) => prev.filter((l) => l.id !== id)), []);
  const clear = useCallback(() => setItems([]), []);

  const count = useMemo(() => items.reduce((n, l) => n + l.qty, 0), [items]);
  const subtotal = useMemo(() => items.reduce((n, l) => n + l.qty * l.price, 0), [items]);

  const value = useMemo(
    () => ({ items, add, setQty, remove, clear, count, subtotal, open, setOpen }),
    [items, add, setQty, remove, clear, count, subtotal, open],
  );
  return <CartCtx.Provider value={value}>{children}</CartCtx.Provider>;
}

/* ====================================================================== auth */

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const push = useToast();

  useEffect(() => {
    let sub;
    try {
      const sb = getSupabaseClient();
      sb.auth.getSession().then(({ data }) => {
        setUser(data?.session?.user || null);
        setReady(true);
      });
      sub = sb.auth.onAuthStateChange((_e, session) => setUser(session?.user || null));
    } catch {
      setReady(true);
    }
    return () => sub?.data?.subscription?.unsubscribe?.();
  }, []);

  const signIn = useCallback(async (email, password) => {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    push('Welcome back');
    setModalOpen(false);
  }, [push]);

  const signUp = useCallback(async (email, password, meta) => {
    const sb = getSupabaseClient();
    const { error } = await sb.auth.signUp({ email, password, options: { data: meta } });
    if (error) throw error;
    push('Account created — you are signed in');
    setModalOpen(false);
  }, [push]);

  const signOut = useCallback(async () => {
    try { await getSupabaseClient().auth.signOut(); } catch { /* ignore */ }
    push('Signed out');
  }, [push]);

  const value = useMemo(
    () => ({ user, ready, signIn, signUp, signOut, modalOpen, setModalOpen }),
    [user, ready, signIn, signUp, signOut, modalOpen],
  );
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/* ============================================================== hash router */

function currentRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path, query] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path, parts, query: new URLSearchParams(query || '') };
}

const RouterCtx = createContext(null);
export const useRouter = () => useContext(RouterCtx);

export function navigate(to) {
  window.location.hash = to.startsWith('#') ? to : `#${to}`;
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function RouterProvider({ children }) {
  const [route, setRoute] = useState(currentRoute);
  useEffect(() => {
    const onHash = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return <RouterCtx.Provider value={route}>{children}</RouterCtx.Provider>;
}

/* ============================================================ product data
   Single fetch of the active catalog, cached for the session; views filter
   client-side which keeps interactions instant for a catalog this size. */

const CatalogCtx = createContext(null);
export const useCatalog = () => useContext(CatalogCtx);

function CatalogProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const sb = getSupabaseClient();
        const { data, error: err } = await sb
          .from('products')
          .select('*')
          .eq('active', true)
          .order('featured', { ascending: false })
          .order('created_at', { ascending: false });
        if (err) throw err;
        setProducts(data || []);
      } catch (e) {
        setError(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const categories = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const c = (p.category || 'Other').trim();
      map.set(c, (map.get(c) || 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count }));
  }, [products]);

  const brands = useMemo(() => {
    const map = new Map();
    for (const p of products) {
      const b = (p.brand || '').trim();
      if (b) map.set(b, (map.get(b) || 0) + 1);
    }
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  }, [products]);

  const value = useMemo(
    () => ({ products, loading, error, categories, brands }),
    [products, loading, error, categories, brands],
  );
  return <CatalogCtx.Provider value={value}>{children}</CatalogCtx.Provider>;
}

/* =================================================================== wishlist */

const WISH_KEY = 'jr_wishlist_v1';
const WishCtx = createContext(null);
export const useWishlist = () => useContext(WishCtx);

function WishProvider({ children }) {
  const [ids, setIds] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(WISH_KEY)) || []); } catch { return new Set(); }
  });
  const toggle = useCallback((id) => {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(WISH_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const value = useMemo(() => ({ ids, toggle, has: (id) => ids.has(id) }), [ids, toggle]);
  return <WishCtx.Provider value={value}>{children}</WishCtx.Provider>;
}

/* ================================================================ composition */

export function AppProviders({ children }) {
  return (
    <ToastProvider>
      <SettingsProvider>
        <AuthProvider>
          <CatalogProvider>
            <WishProvider>
              <CartProvider>
                <RouterProvider>{children}</RouterProvider>
              </CartProvider>
            </WishProvider>
          </CatalogProvider>
        </AuthProvider>
      </SettingsProvider>
    </ToastProvider>
  );
}

export { getRuntimeConfig };
