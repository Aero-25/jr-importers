import React, { useMemo, useState } from 'react';
import { Icon, Empty } from '../components/ui.jsx';
import { useData } from '../lib/store.jsx';
import { money } from '../lib/format.js';

const isPaid = (o) => o.paid_at || ['Paid', 'Completed', 'Delivered'].includes(o.status);
const RANGES = [['7', '7 days'], ['30', '30 days'], ['90', '90 days']];

export default function Reports() {
  const data = useData();
  const [range, setRange] = useState('30');
  const orders = data.orders || [];
  const products = data.products || [];
  const expenses = data.expenses || [];

  const since = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - Number(range)); return d; }, [range]);
  const inRange = orders.filter((o) => isPaid(o) && new Date(o.paid_at || o.created_at) >= since);

  const revenue = inRange.reduce((n, o) => n + Number(o.total_amount || 0), 0);
  const costMap = useMemo(() => new Map(products.map((p) => [p.id, Number(p.cost_price || 0)])), [products]);
  const cogs = inRange.reduce((sum, o) => sum + (o.items || []).reduce((n, it) => n + Number(it.quantity || 0) * (costMap.get(it.product_id) || 0), 0), 0);
  const expTotal = expenses.filter((e) => new Date(e.expense_date) >= since).reduce((n, e) => n + Number(e.amount || 0), 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expTotal;

  const payMix = useMemo(() => {
    const m = new Map();
    for (const o of inRange) m.set(o.payment_method || 'Other', (m.get(o.payment_method || 'Other') || 0) + Number(o.total_amount || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [inRange]);

  const daily = useMemo(() => {
    const days = []; const span = Math.min(Number(range), 30);
    for (let i = span - 1; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0); const key = d.toDateString();
      days.push({ d, total: inRange.filter((o) => new Date(o.paid_at || o.created_at).toDateString() === key).reduce((n, o) => n + Number(o.total_amount || 0), 0) }); }
    return days;
  }, [inRange, range]);
  const maxDay = Math.max(1, ...daily.map((d) => d.total));

  const top = useMemo(() => {
    const m = new Map();
    for (const o of inRange) for (const it of (o.items || [])) { const c = m.get(it.name) || { name: it.name, qty: 0, rev: 0 }; c.qty += Number(it.quantity || 0); c.rev += Number(it.quantity || 0) * Number(it.price || 0); m.set(it.name, c); }
    return [...m.values()].sort((a, b) => b.rev - a.rev).slice(0, 8);
  }, [inRange]);

  const payColors = ['var(--cobalt)', 'var(--sun)', 'var(--ok)', 'var(--purple)'];

  return (
    <div>
      <div className="seg" style={{ marginBottom: 16 }}>{RANGES.map(([v, l]) => <button key={v} className={range === v ? 'is-on' : ''} onClick={() => setRange(v)}>{l}</button>)}</div>

      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Revenue" value={money(revenue, 0)} icon={Icon.cash} accent="accent" />
        <Kpi label="Gross profit" value={money(grossProfit, 0)} icon={Icon.trend} accent="cash" sub={`${revenue ? Math.round((grossProfit / revenue) * 100) : 0}% margin`} />
        <Kpi label="Expenses" value={money(expTotal, 0)} icon={Icon.wallet} />
        <Kpi label="Net profit" value={money(netProfit, 0)} icon={Icon.bolt} sub={netProfit >= 0 ? 'Profit' : 'Loss'} />
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head"><h2>Daily revenue</h2></div>
        {daily.every((d) => d.total === 0) ? <Empty icon={Icon.chart} title="No sales in this period" /> : (
          <div className="bars" style={{ height: 120 }}>
            {daily.map((d, i) => <div key={i} className="bar" style={{ height: `${Math.max(2, (d.total / maxDay) * 100)}%` }} title={`${d.d.toLocaleDateString('en-GB')} · ${money(d.total, 0)}`} />)}
          </div>
        )}
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel__head"><h2>Payment mix</h2></div>
          {payMix.length === 0 ? <Empty icon={Icon.card} title="No data" /> : payMix.map(([k, v], i) => (
            <div key={k} style={{ marginBottom: 12 }}>
              <div className="wrap-gap" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{k}</span><span className="mono">{money(v, 0)} · {Math.round((v / revenue) * 100)}%</span></div>
              <div style={{ height: 7, background: 'var(--surface-3)', borderRadius: 6, marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${(v / revenue) * 100}%`, height: '100%', background: payColors[i % payColors.length] }} /></div>
            </div>
          ))}
        </div>
        <div className="panel">
          <div className="panel__head"><h2>Top products</h2></div>
          {top.length === 0 ? <Empty icon={Icon.trend} title="No data" /> : (
            <div className="rows">
              {top.map((p, i) => (
                <div className="row" key={p.name} style={{ padding: '9px 12px' }}>
                  <div className="row__thumb" style={{ width: 28, height: 28, fontFamily: 'var(--display)', fontWeight: 800, fontSize: 12 }}>{i + 1}</div>
                  <div className="row__main"><div className="row__title">{p.name}</div><div className="row__meta"><span>{p.qty} sold</span></div></div>
                  <div className="row__price" style={{ fontSize: 13 }}>{money(p.rev, 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, icon: I, accent, sub }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div>{sub && <div className="kpi__delta">{sub}</div>}</div>;
}
