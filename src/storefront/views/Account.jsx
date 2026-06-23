import React, { useState, useEffect } from 'react';
import { Icon } from '../components/ui.jsx';
import { useAuth, useToast, navigate } from '../lib/store.jsx';
import { getSupabaseClient } from '../lib/supabase.js';
import { money, shortDate, orderRef } from '../lib/format.js';

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('paid')) return 'badge--paid';
  if (s.includes('complete') || s.includes('collected') || s.includes('delivered')) return 'badge--completed';
  if (s.includes('cancel')) return 'badge--cancelled';
  return 'badge--pending';
}

export default function Account() {
  const auth = useAuth();
  const push = useToast();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (auth.ready && !auth.user) auth.setModalOpen(true);
  }, [auth.ready, auth.user]);

  useEffect(() => {
    if (!auth.user) { setLoading(false); return; }
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const sb = getSupabaseClient();
        const { data, error } = await sb
          .from('orders')
          .select('id, created_at, status, total_amount, items, delivery_method, payment_method')
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (alive) setOrders(data || []);
      } catch (e) {
        push(e?.message || 'Could not load your orders', 'err');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [auth.user]);

  if (!auth.user) {
    return (
      <section className="section wrap">
        <div className="empty">
          <Icon.user />
          <h3>Sign in to view your account</h3>
          <p>Track orders, save favourites and check out faster.</p>
          <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => auth.setModalOpen(true)}>Sign in or register</button>
        </div>
      </section>
    );
  }

  const meta = auth.user.user_metadata || {};

  return (
    <section className="section wrap">
      <div className="section-head" style={{ marginBottom: 24 }}>
        <div><div className="eyebrow">Your account</div><h1 className="section-title">Hello{meta.name ? `, ${meta.name.split(' ')[0]}` : ''}</h1></div>
      </div>

      <div className="acct">
        <aside className="acct__side">
          <div className="mono" style={{ fontSize: 11, color: 'var(--muted-2)', letterSpacing: '.1em' }}>SIGNED IN AS</div>
          <div style={{ fontWeight: 700, marginTop: 4, wordBreak: 'break-word' }}>{auth.user.email}</div>
          {meta.phone && <div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 4 }}>{meta.phone}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            <button className="btn btn--ghost btn--block" onClick={() => navigate('/shop')}>Continue shopping</button>
            <button className="btn btn--ghost btn--block" onClick={auth.signOut}>Sign out</button>
          </div>
        </aside>

        <div>
          <h2 className="display" style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Your orders</h2>
          {loading ? (
            <>
              {[0, 1].map((i) => <div className="skeleton" key={i} style={{ height: 110, marginBottom: 14 }} />)}
            </>
          ) : orders.length === 0 ? (
            <div className="empty" style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)' }}>
              <Icon.box />
              <h3>No orders yet</h3>
              <p>When you place an order it&apos;ll appear here with live status.</p>
              <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/shop')}>Start shopping</button>
            </div>
          ) : (
            orders.map((o) => {
              const items = Array.isArray(o.items) ? o.items : [];
              const count = items.reduce((n, it) => n + Number(it.quantity || 1), 0);
              return (
                <div className="order" key={o.id}>
                  <div className="order__head">
                    <div>
                      <div className="order__id">{orderRef(o.id)}</div>
                      <div className="mono" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{shortDate(o.created_at)} · {o.delivery_method || 'Order'}</div>
                    </div>
                    <span className={`badge ${statusBadge(o.status)}`}>{o.status}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                      {count} {count === 1 ? 'item' : 'items'}{items[0]?.name ? ` · ${items[0].name}${items.length > 1 ? ` +${items.length - 1} more` : ''}` : ''}
                    </div>
                    <div className="price" style={{ fontSize: 19 }}>N${money(o.total_amount)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
