import { useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseClient } from '../../shared/supabaseClient';

const EMPTY_DATA = {
  products: [],
  orders: [],
  purchase_orders: [],
  suppliers: [],
  product_imeis: []
};

async function safeFetch(db, table, columns = '*', order = null) {
  let query = db.from(table).select(columns);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? false });
  const { data, error } = await query;
  if (error) {
    console.warn(`[JR Admin] Could not load ${table}`, error);
    return [];
  }
  return data || [];
}

export function useAdminData() {
  const db = useMemo(() => getSupabaseClient(), []);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [data, setData] = useState(EMPTY_DATA);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [products, orders, purchaseOrders, suppliers, productImeis] = await Promise.all([
        safeFetch(db, 'products', '*', { column: 'name', ascending: true }),
        safeFetch(db, 'orders', '*', { column: 'created_at', ascending: false }),
        safeFetch(db, 'purchase_orders', '*', { column: 'created_at', ascending: false }),
        safeFetch(db, 'suppliers', '*', { column: 'name', ascending: true }),
        safeFetch(db, 'product_imeis', '*', { column: 'created_at', ascending: false })
      ]);

      setData({
        products,
        orders,
        purchase_orders: purchaseOrders,
        suppliers,
        product_imeis: productImeis
      });
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    let active = true;

    db.auth.getSession().then(({ data: authData }) => {
      if (!active) return;
      setSession(authData.session || null);
      setAuthLoading(false);
    });

    const { data: sub } = db.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [db]);

  useEffect(() => {
    if (session) refresh();
  }, [session, refresh]);

  const signIn = useCallback(async (email, password) => {
    const result = await db.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    setSession(result.data.session);
  }, [db]);

  const signOut = useCallback(async () => {
    await db.auth.signOut();
    setSession(null);
    setData(EMPTY_DATA);
  }, [db]);

  return { db, session, authLoading, data, loading, refresh, signIn, signOut };
}
