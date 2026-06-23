import React, { useState, useMemo } from 'react';
import { Icon, Modal, Spinner, Badge, Empty } from '../components/ui.jsx';
import { useData, useToast } from '../lib/store.jsx';
import { saveInvoice, setInvoiceStatus } from '../lib/db.js';
import { money, shortDate, statusTone } from '../lib/format.js';

export default function Invoices() {
  const data = useData();
  const push = useToast();
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState(null);

  const invoices = data.invoices || [];
  const outstanding = invoices.filter((i) => i.status !== 'paid').reduce((n, i) => n + Number(i.total_amount || 0), 0);
  const paid = invoices.filter((i) => i.status === 'paid').reduce((n, i) => n + Number(i.total_amount || 0), 0);

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Invoices" value={invoices.length} icon={Icon.invoice} />
        <Kpi label="Outstanding" value={money(outstanding, 0)} icon={Icon.clock} accent="cash" />
        <Kpi label="Paid" value={money(paid, 0)} icon={Icon.check} accent="accent" />
      </div>

      <div className="wrap-gap" style={{ justifyContent: 'flex-end', marginBottom: 14 }}>
        <button className="btn btn--primary" onClick={() => setCreating(true)}><Icon.plus /> New invoice</button>
      </div>

      {invoices.length === 0 ? <Empty icon={Icon.invoice} title="No invoices yet">Create your first invoice for a customer.</Empty> : (
        <div className="rows">
          {invoices.map((inv) => (
            <button className="row" key={inv.id} style={{ textAlign: 'left', width: '100%' }} onClick={() => setView(inv)}>
              <div className="row__thumb"><Icon.invoice width={20} height={20} /></div>
              <div className="row__main">
                <div className="row__title">INV-{String(inv.id).padStart(4, '0')} · {inv.customer_name}</div>
                <div className="row__meta"><span>{shortDate(inv.created_at)}</span>{inv.due_date && <span>Due {shortDate(inv.due_date)}</span>}</div>
              </div>
              <div className="row__end">
                <div className="row__price">{money(inv.total_amount, 0)}</div>
                <Badge tone={statusTone(inv.status)}>{inv.status}</Badge>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && <InvoiceForm customers={data.customers || []} products={data.products || []} vatRate={Number(data.settings.vat_rate || 15)}
        onClose={() => setCreating(false)}
        onSave={async (payload) => { try { await saveInvoice(data.db, payload); push('Invoice created'); data.refresh(); setCreating(false); } catch (e) { push(e?.message || 'Failed', 'err'); } }}
      />}

      {view && <InvoiceView invoice={view} settings={data.settings} onClose={() => setView(null)} onPaid={async () => { try { await setInvoiceStatus(data.db, view.id, 'paid'); push('Marked paid'); data.refresh(); setView({ ...view, status: 'paid' }); } catch (e) { push(e?.message || 'Failed', 'err'); } }} />}
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div></div>;
}

function InvoiceForm({ customers, products, vatRate, onClose, onSave }) {
  const [customer, setCustomer] = useState('');
  const [custName, setCustName] = useState('');
  const [due, setDue] = useState('');
  const [lines, setLines] = useState([{ name: '', quantity: 1, price: 0 }]);
  const [busy, setBusy] = useState(false);

  const setLine = (i, patch) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const gross = lines.reduce((n, l) => n + Number(l.quantity || 0) * Number(l.price || 0), 0);

  return (
    <Modal title="New invoice" onClose={onClose} wide
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || gross <= 0} onClick={async () => {
          setBusy(true);
          const c = customers.find((x) => String(x.id) === customer);
          await onSave({ customer: c || (custName ? { name: custName } : null), items: lines.filter((l) => l.name), vatRate, dueDate: due || null, status: 'sent' });
          setBusy(false);
        }}>{busy ? <Spinner /> : `Create · ${money(gross, 0)}`}</button>
      </>}>
      <div className="field-row">
        <div className="field"><label>Existing customer</label>
          <select className="input" value={customer} onChange={(e) => { setCustomer(e.target.value); const c = customers.find((x) => String(x.id) === e.target.value); if (c) setCustName(c.name); }}>
            <option value="">New / walk-in</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Due date</label><input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
      </div>
      {!customer && <div className="field"><label>Customer name</label><input className="input" value={custName} onChange={(e) => setCustName(e.target.value)} /></div>}

      <div className="lbl">Line items</div>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 100px 38px', gap: 8, marginBottom: 8 }}>
          <input className="input" list="prod-list" value={l.name} onChange={(e) => { const p = products.find((x) => x.name === e.target.value); setLine(i, p ? { name: p.name, price: Number(p.price) } : { name: e.target.value }); }} placeholder="Item / service" />
          <input className="input" inputMode="numeric" value={l.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
          <input className="input" inputMode="decimal" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
          <button className="icon-btn" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Icon.trash width={16} height={16} /></button>
        </div>
      ))}
      <datalist id="prod-list">{products.map((p) => <option key={p.id} value={p.name} />)}</datalist>
      <button className="btn btn--ghost btn--sm" onClick={() => setLines((ls) => [...ls, { name: '', quantity: 1, price: 0 }])}><Icon.plus /> Add line</button>
      <div className="tline tline--total" style={{ marginTop: 14 }}><span>Total (incl. VAT)</span><span>{money(gross, 0)}</span></div>
    </Modal>
  );
}

function InvoiceView({ invoice, settings, onClose, onPaid }) {
  const items = invoice.items || [];
  return (
    <Modal title={`INV-${String(invoice.id).padStart(4, '0')}`} onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={() => window.print()}><Icon.print /> Print</button>
        {invoice.status !== 'paid' && <button className="btn btn--ok" style={{ flex: 1 }} onClick={onPaid}><Icon.check /> Mark paid</button>}
      </>}>
      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div><b style={{ fontFamily: 'var(--display)' }}>{invoice.customer_name}</b><div className="muted mono" style={{ fontSize: 12 }}>{invoice.customer_email || ''}</div></div>
        <Badge tone={statusTone(invoice.status)}>{invoice.status}</Badge>
      </div>
      <div className="receipt" style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 14 }}>
        {items.map((it, i) => <div className="r-line" key={i}><span>{it.quantity}× {it.name}</span><span>{money(Number(it.price) * Number(it.quantity), 0)}</span></div>)}
        <div className="r-rule" />
        <div className="r-line"><span>Subtotal</span><span>{money(invoice.subtotal_amount)}</span></div>
        <div className="r-line"><span>VAT</span><span>{money(invoice.vat_amount)}</span></div>
        <div className="r-line" style={{ fontWeight: 700, fontSize: 14 }}><span>Total</span><span>{money(invoice.total_amount)}</span></div>
      </div>
    </Modal>
  );
}
