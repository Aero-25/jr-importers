import React, { useMemo } from 'react';
import { Icon, Badge, Empty } from '../components/ui.jsx';
import { useData, useTill, navigate } from '../lib/store.jsx';
import { money, formatDateTime, orderRef, statusTone, productImage } from '../lib/format.js';

const isPaid = (o) => o.paid_at || ['Paid', 'Completed', 'Delivered'].includes(o.status);

export default function Dashboard() {
  const data = useData();
  const { openShift } = useTill();
  const orders = data.orders || [];
  const products = data.products || [];

  const today = new Date().toDateString();
  const paidToday = orders.filter((o) => isPaid(o) && new Date(o.paid_at || o.created_at).toDateString() === today);
  const revenueToday = paidToday.reduce((n, o) => n + Number(o.total_amount || 0), 0);

  const last7 = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
      const key = d.toDateString();
      const total = orders.filter((o) => isPaid(o) && new Date(o.paid_at || o.created_at).toDateString() === key).reduce((n, o) => n + Number(o.total_amount || 0), 0);
      days.push({ label: d.toLocaleDateString('en-GB', { weekday: 'short' }), total });
    }
    return days;
  }, [orders]);
  const maxDay = Math.max(1, ...last7.map((d) => d.total));

  const topProducts = useMemo(() => {
    const tally = new Map();
    for (const o of orders) for (const it of (o.items || [])) {
      const k = it.name; const cur = tally.get(k) || { name: k, qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity || 0); cur.revenue += Number(it.quantity || 0) * Number(it.price || 0); tally.set(k, cur);
    }
    return [...tally.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [orders]);

  const lowStock = products.filter((p) => Number(p.stock || 0) <= Number(p.reorder_level || 10)).sort((a, b) => a.stock - b.stock).slice(0, 5);
  const pending = orders.filter((o) => o.status === 'Pending');

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Revenue today" value={money(revenueToday, 0)} icon={Icon.cash} accent="cash" />
        <Kpi label="Sales today" value={paidToday.length} icon={Icon.receipt} accent="accent" />
        <Kpi label="Pending orders" value={pending.length} icon={Icon.clock} />
        <Kpi label="Low stock" value={lowStock.length} icon={Icon.alert} />
      </div>

      <div className="grid-2-1">
        <div className="panel">
          <div className="panel__head"><h2>Last 7 days</h2><span className="mono muted" style={{ fontSize: 12 }}>Paid revenue</span></div>
          <div className="bars">
            {last7.map((d, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div className="bar" style={{ height: `${Math.max(3, (d.total / maxDay) * 100)}%`, width: '100%' }} title={money(d.total, 0)} />
                <span className="mono" style={{ fontSize: 10, color: 'var(--muted-2)' }}>{d.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ background: openShift ? 'linear-gradient(150deg, rgba(46,211,155,.10), var(--surface) 60%)' : undefined }}>
          <div className="panel__head"><h2>Till</h2></div>
          {openShift ? (
            <>
              <Badge tone="success"><Icon.dot /> Open · {openShift.cashier_name}</Badge>
              <div className="kpi__value" style={{ fontSize: 26, marginTop: 12 }}>{money(openShift.total_sales, 0)}</div>
              <div className="muted" style={{ fontSize: 13 }}>{openShift.transaction_count || 0} sales this shift</div>
              <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} onClick={() => navigate('/cashup')}>Manage till</button>
            </>
          ) : (
            <>
              <Badge tone="muted">Closed</Badge>
              <p className="muted" style={{ fontSize: 13, margin: '10px 0 14px' }}>Open the till to start trading.</p>
              <button className="btn btn--primary btn--block" onClick={() => navigate('/cashup')}><Icon.bolt /> Open till</button>
            </>
          )}
        </div>
      </div>

      <div className="grid-2 section-gap">
        <div className="panel">
          <div className="panel__head"><h2>Top sellers</h2></div>
          {topProducts.length === 0 ? <Empty icon={Icon.trend} title="No sales yet" /> : (
            <div className="rows">
              {topProducts.map((p, i) => (
                <div className="row" key={p.name} style={{ padding: '10px 12px' }}>
                  <div className="row__thumb" style={{ width: 30, height: 30, fontFamily: 'var(--display)', fontWeight: 800 }}>{i + 1}</div>
                  <div className="row__main"><div className="row__title">{p.name}</div><div className="row__meta"><span>{p.qty} sold</span></div></div>
                  <div className="row__price" style={{ fontSize: 14 }}>{money(p.revenue, 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel__head"><h2>Reorder soon</h2><button className="btn btn--bare btn--sm" onClick={() => navigate('/stock')}>View all</button></div>
          {lowStock.length === 0 ? <Empty icon={Icon.check} title="Stock looks healthy" /> : (
            <div className="rows">
              {lowStock.map((p) => (
                <div className="row" key={p.id} style={{ padding: '10px 12px' }}>
                  <div className="row__thumb">{productImage(p) ? <img src={productImage(p)} alt="" /> : <Icon.box width={18} height={18} />}</div>
                  <div className="row__main"><div className="row__title">{p.name}</div><div className="row__meta"><span>Reorder at {p.reorder_level}</span></div></div>
                  <Badge tone={Number(p.stock) <= 0 ? 'danger' : 'warning'}>{p.stock} left</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="panel section-gap">
        <div className="panel__head"><h2>Recent orders</h2><button className="btn btn--bare btn--sm" onClick={() => navigate('/sales')}>All orders</button></div>
        {orders.length === 0 ? <Empty icon={Icon.receipt} title="No orders yet" /> : (
          <div className="rows">
            {orders.slice(0, 6).map((o) => (
              <button className="row" key={o.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/sales')}>
                <div className="row__main"><div className="row__title">{orderRef(o.id)} · {o.customer_name || 'Walk-in'}</div><div className="row__meta"><span>{formatDateTime(o.created_at)}</span></div></div>
                <div className="row__end"><div className="row__price" style={{ fontSize: 14 }}>{money(o.total_amount, 0)}</div><Badge tone={statusTone(o.status)}>{o.status}</Badge></div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div></div>;
}
