import React, { useState, useMemo } from 'react';
import { Icon, Modal, Spinner, Empty, Badge } from '../components/ui.jsx';
import { useData, useAuth, useToast } from '../lib/store.jsx';
import { addExpense, cashierName } from '../lib/db.js';
import { money, shortDate } from '../lib/format.js';

const CATEGORIES = ['Stock purchase', 'Rent', 'Salaries', 'Utilities', 'Transport', 'Marketing', 'Equipment', 'Other'];

export default function Expenses() {
  const data = useData();
  const { user } = useAuth();
  const push = useToast();
  const [adding, setAdding] = useState(false);

  const expenses = data.expenses || [];
  const thisMonth = expenses.filter((e) => new Date(e.expense_date).getMonth() === new Date().getMonth());
  const monthTotal = thisMonth.reduce((n, e) => n + Number(e.amount || 0), 0);
  const total = expenses.reduce((n, e) => n + Number(e.amount || 0), 0);

  const byCat = useMemo(() => {
    const m = new Map();
    for (const e of thisMonth) m.set(e.category || 'Other', (m.get(e.category || 'Other') || 0) + Number(e.amount || 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [thisMonth]);

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="This month" value={money(monthTotal, 0)} icon={Icon.wallet} accent="cash" />
        <Kpi label="All-time" value={money(total, 0)} icon={Icon.chart} />
        <Kpi label="Entries" value={expenses.length} icon={Icon.invoice} />
      </div>

      <div className="grid-2-1">
        <div>
          <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 className="display" style={{ fontSize: 18, fontWeight: 800 }}>Recent expenses</h2>
            <button className="btn btn--primary" onClick={() => setAdding(true)}><Icon.plus /> Add expense</button>
          </div>
          {expenses.length === 0 ? <Empty icon={Icon.wallet} title="No expenses logged" /> : (
            <div className="rows">
              {expenses.slice(0, 40).map((e) => (
                <div className="row" key={e.id}>
                  <div className="row__thumb"><Icon.wallet width={18} height={18} /></div>
                  <div className="row__main"><div className="row__title">{e.description}</div><div className="row__meta"><span>{shortDate(e.expense_date)}</span><Badge tone="muted">{e.category || 'Other'}</Badge></div></div>
                  <div className="row__price" style={{ fontSize: 15 }}>{money(e.amount, 0)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="panel">
          <div className="panel__head"><h2>This month by category</h2></div>
          {byCat.length === 0 ? <Empty icon={Icon.chart} title="No data" /> : byCat.map(([cat, amt]) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div className="wrap-gap" style={{ justifyContent: 'space-between', fontSize: 13 }}><span>{cat}</span><span className="mono">{money(amt, 0)}</span></div>
              <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 6, marginTop: 5, overflow: 'hidden' }}><div style={{ width: `${(amt / monthTotal) * 100}%`, height: '100%', background: 'var(--cobalt)' }} /></div>
            </div>
          ))}
        </div>
      </div>

      {adding && <ExpenseModal onClose={() => setAdding(false)} onSave={async (row) => {
        try { await addExpense(data.db, { ...row, created_by: cashierName(user) }); push('Expense added'); data.refresh(); setAdding(false); }
        catch (e) { push(e?.message || 'Failed', 'err'); }
      }} />}
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div></div>;
}

function ExpenseModal({ onClose, onSave }) {
  const [form, setForm] = useState({ description: '', amount: '', category: 'Other', payment_method: 'Cash', expense_date: new Date().toISOString().slice(0, 10) });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal title="Add expense" onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !form.description || !form.amount} onClick={async () => { setBusy(true); await onSave({ ...form, amount: Number(form.amount) || 0 }); setBusy(false); }}>{busy ? <Spinner /> : 'Save expense'}</button>
      </>}>
      <div className="field"><label>Description</label><input className="input" value={form.description} onChange={(e) => set('description', e.target.value)} autoFocus /></div>
      <div className="field-row">
        <div className="field"><label>Amount (N$)</label><input className="input" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></div>
        <div className="field"><label>Date</label><input className="input" type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} /></div>
      </div>
      <div className="field-row">
        <div className="field"><label>Category</label><select className="input" value={form.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Paid via</label><select className="input" value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}><option>Cash</option><option>Card</option><option>EFT</option></select></div>
      </div>
    </Modal>
  );
}
