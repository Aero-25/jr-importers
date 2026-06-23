import React, { useState, useMemo } from 'react';
import { Icon, Modal, Badge, Empty } from '../components/ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { setOrderStatus } from '../lib/db.js';
import { money, formatDateTime, orderRef, statusTone } from '../lib/format.js';

const FLOW = ['Pending', 'Paid', 'Packing', 'Shipped', 'Delivered'];
const FILTERS = ['All', 'Pending', 'Paid', 'Completed', 'Shipped', 'Cancelled'];

export default function Sales() {
  const data = useData();
  const push = useToast();
  const [filter, setFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(null);

  const orders = data.orders || [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== 'All' && String(o.status) !== filter) return false;
      if (q) { const hay = `${o.customer_name} ${o.customer_email} ${o.customer_phone} ${orderRef(o.id)}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }, [orders, filter, query]);

  const todayRevenue = orders.filter((o) => o.paid_at && new Date(o.paid_at).toDateString() === new Date().toDateString())
    .reduce((n, o) => n + Number(o.total_amount || 0), 0);

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Orders" value={orders.length} icon={Icon.receipt} />
        <Kpi label="Pending" value={orders.filter((o) => o.status === 'Pending').length} icon={Icon.clock} accent="cash" />
        <Kpi label="Paid today" value={money(todayRevenue, 0)} icon={Icon.cash} accent="accent" />
        <Kpi label="Online vs POS" value={`${orders.filter((o) => o.payment_method !== 'Cash').length}/${orders.filter((o) => o.payment_method === 'Cash').length}`} icon={Icon.pos} />
      </div>

      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="seg">{FILTERS.map((f) => <button key={f} className={filter === f ? 'is-on' : ''} onClick={() => setFilter(f)}>{f}</button>)}</div>
        <div className="search" style={{ maxWidth: 280 }}><Icon.search /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search orders…" /></div>
      </div>

      {filtered.length === 0 ? <Empty icon={Icon.receipt} title="No orders" /> : (
        <div className="rows">
          {filtered.map((o) => (
            <button className="row" key={o.id} style={{ textAlign: 'left', width: '100%' }} onClick={() => setOpen(o)}>
              <div className="row__thumb"><Icon.receipt width={20} height={20} /></div>
              <div className="row__main">
                <div className="row__title">{orderRef(o.id)} · {o.customer_name || 'Walk-in'}</div>
                <div className="row__meta"><span>{formatDateTime(o.created_at)}</span><span>{o.payment_method || '—'}</span><span>{(o.items || []).length} items</span></div>
              </div>
              <div className="row__end">
                <div className="row__price">{money(o.total_amount, 0)}</div>
                <Badge tone={statusTone(o.status)}>{o.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && <OrderModal order={open} onClose={() => setOpen(null)} onAdvance={async (status) => {
        try { await setOrderStatus(data.db, open.id, status); push(`Marked ${status}`); data.refresh(); setOpen({ ...open, status }); }
        catch (e) { push(e?.message || 'Failed', 'err'); }
      }} />}
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div></div>;
}

function OrderModal({ order, onClose, onAdvance }) {
  const items = order.items || [];
  const idx = FLOW.indexOf(order.status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;
  return (
    <Modal title={orderRef(order.id)} onClose={onClose}
      foot={<>
        {order.status !== 'Cancelled' && <button className="btn btn--danger" onClick={() => onAdvance('Cancelled')}>Cancel order</button>}
        {next && <button className="btn btn--primary" style={{ flex: 1 }} onClick={() => onAdvance(next)}><Icon.arrow /> Mark {next}</button>}
      </>}>
      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <Badge tone={statusTone(order.status)}>{order.status}</Badge>
        <span className="mono muted" style={{ fontSize: 12 }}>{formatDateTime(order.created_at)}</span>
      </div>
      <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 700 }}>{order.customer_name || 'Walk-in customer'}</div>
        <div className="muted mono" style={{ fontSize: 12, marginTop: 4 }}>
          {order.customer_phone || '—'} · {order.customer_email || '—'}
        </div>
        {order.delivery_address && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{order.delivery_address}, {order.customer_city} ({order.delivery_method})</div>}
      </div>
      <div className="receipt" style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14 }}>
        {items.map((it, i) => <div className="r-line" key={i}><span>{it.quantity}× {it.name}</span><span>{money(Number(it.price) * Number(it.quantity), 0)}</span></div>)}
        <div className="r-rule" />
        {order.vat_amount ? <div className="r-line"><span>VAT</span><span>{money(order.vat_amount)}</span></div> : null}
        <div className="r-line" style={{ fontWeight: 700, fontSize: 14 }}><span>Total</span><span>{money(order.total_amount)}</span></div>
      </div>
    </Modal>
  );
}
