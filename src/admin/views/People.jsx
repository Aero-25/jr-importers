import React, { useState, useMemo } from 'react';
import { Icon, Modal, Spinner, Empty } from '../components/ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { upsertRow } from '../lib/db.js';
import { initials, money, shortDate } from '../lib/format.js';

export default function People() {
  const [tab, setTab] = useState('customers');
  return (
    <div>
      <div className="seg" style={{ marginBottom: 16 }}>
        <button className={tab === 'customers' ? 'is-on' : ''} onClick={() => setTab('customers')}>Customers</button>
        <button className={tab === 'suppliers' ? 'is-on' : ''} onClick={() => setTab('suppliers')}>Suppliers</button>
      </div>
      {tab === 'customers' ? <Customers /> : <Suppliers />}
    </div>
  );
}

function useList(table) {
  const data = useData();
  const push = useToast();
  const save = async (row) => { try { await upsertRow(data.db, table, row); push('Saved'); data.refresh(); return true; } catch (e) { push(e?.message || 'Failed', 'err'); return false; } };
  return { rows: data[table] || [], save };
}

function Customers() {
  const { rows, save } = useList('customers');
  const data = useData();
  const [query, setQuery] = useState('');
  const [edit, setEdit] = useState(null);

  const spend = useMemo(() => {
    const m = new Map();
    for (const o of (data.orders || [])) { const k = (o.customer_email || '').toLowerCase(); if (!k) continue; m.set(k, (m.get(k) || 0) + Number(o.total_amount || 0)); }
    return m;
  }, [data.orders]);

  const filtered = rows.filter((c) => `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <>
      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="search" style={{ flex: 1, maxWidth: 320 }}><Icon.search /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" /></div>
        <button className="btn btn--primary" onClick={() => setEdit({})}><Icon.plus /> New customer</button>
      </div>
      {filtered.length === 0 ? <Empty icon={Icon.users} title="No customers" /> : (
        <div className="rows">
          {filtered.map((c) => (
            <button className="row" key={c.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => setEdit(c)}>
              <div className="row__thumb" style={{ fontFamily: 'var(--display)', fontWeight: 800, fontSize: 14 }}>{initials(c.name)}</div>
              <div className="row__main"><div className="row__title">{c.name}</div><div className="row__meta"><span>{c.phone || '—'}</span><span>{c.city || c.region || ''}</span></div></div>
              <div className="row__end"><div className="row__price" style={{ fontSize: 14 }}>{money(spend.get((c.email || '').toLowerCase()) || 0, 0)}</div><span className="mono muted" style={{ fontSize: 10 }}>{c.customer_type || 'retail'}</span></div>
            </button>
          ))}
        </div>
      )}
      {edit && <PersonModal title="customer" person={edit} fields={[['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City'], ['region', 'Region'], ['address', 'Address']]} onClose={() => setEdit(null)} onSave={async (r) => { if (await save(r)) setEdit(null); }} />}
    </>
  );
}

function Suppliers() {
  const { rows, save } = useList('suppliers');
  const [edit, setEdit] = useState(null);
  return (
    <>
      <div className="wrap-gap" style={{ justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn--primary" onClick={() => setEdit({ active: true })}><Icon.plus /> New supplier</button>
      </div>
      {rows.length === 0 ? <Empty icon={Icon.truck} title="No suppliers" /> : (
        <div className="rows">
          {rows.map((s) => (
            <button className="row" key={s.id} style={{ width: '100%', textAlign: 'left' }} onClick={() => setEdit(s)}>
              <div className="row__thumb"><Icon.truck width={20} height={20} /></div>
              <div className="row__main"><div className="row__title">{s.name}</div><div className="row__meta"><span>{s.contact_person || s.company || '—'}</span><span>{s.phone || ''}</span></div></div>
              <Icon.edit width={16} height={16} />
            </button>
          ))}
        </div>
      )}
      {edit && <PersonModal title="supplier" person={edit} fields={[['name', 'Name'], ['company', 'Company'], ['contact_person', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['payment_terms', 'Payment terms']]} onClose={() => setEdit(null)} onSave={async (r) => { if (await save(r)) setEdit(null); }} />}
    </>
  );
}

function PersonModal({ title, person, fields, onClose, onSave }) {
  const [form, setForm] = useState(person);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={person.id ? `Edit ${title}` : `New ${title}`} onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !form.name} onClick={async () => { setBusy(true); await onSave(form); setBusy(false); }}>{busy ? <Spinner /> : 'Save'}</button>
      </>}>
      {fields.map(([k, label]) => (
        <div className="field" key={k}><label>{label}</label><input className="input" value={form[k] ?? ''} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} /></div>
      ))}
    </Modal>
  );
}
