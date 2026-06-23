import React, { useState, useMemo, useCallback } from 'react';
import { Icon, Modal, Spinner } from '../components/ui.jsx';
import Scanner from '../components/Scanner.jsx';
import { useData, useAuth, useTill, useToast, navigate } from '../lib/store.jsx';
import { recordSale, cashierName, splitVat } from '../lib/db.js';
import { money, num, productImage, orderRef } from '../lib/format.js';

const PAY = [
  { id: 'Cash', icon: Icon.cash },
  { id: 'Card', icon: Icon.card },
  { id: 'EFT', icon: Icon.bank },
];

export default function POS() {
  const data = useData();
  const { user } = useAuth();
  const { openShift } = useTill();
  const push = useToast();

  const settings = data.settings;
  const vatRate = Number(settings.vat_rate || 15);

  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('All');
  const [cartOpen, setCartOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const products = data.products || [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))], [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (cat !== 'All' && p.category !== cat) return false;
      if (q) { const hay = `${p.name} ${p.brand} ${p.sku} ${p.barcode}`.toLowerCase(); if (!hay.includes(q)) return false; }
      return true;
    });
  }, [products, query, cat]);

  const addToCart = useCallback((p, qty = 1) => {
    if (Number(p.stock || 0) <= 0) { push(`${p.name} is out of stock`, 'err'); return; }
    setCart((prev) => {
      const ex = prev.find((l) => l.id === p.id);
      if (ex) {
        if (ex.qty >= Number(p.stock)) { push('Reached available stock', 'info'); return prev; }
        return prev.map((l) => (l.id === p.id ? { ...l, qty: l.qty + qty } : l));
      }
      return [...prev, { id: p.id, name: p.name, sku: p.sku, price: Number(p.price || 0), stock: Number(p.stock || 0), qty }];
    });
  }, [push]);

  const onScan = useCallback((code) => {
    const c = String(code).trim();
    const found = products.find((p) => String(p.barcode) === c || String(p.sku) === c || String(p.id) === c);
    if (found) { addToCart(found); push(`Added ${found.name}`); }
    else push(`No product for ${c}`, 'err');
  }, [products, addToCart, push]);

  const setQty = (id, qty) => setCart((prev) => prev.map((l) => (l.id === id ? { ...l, qty: Math.max(1, Math.min(qty, l.stock)) } : l)).filter((l) => l.qty > 0));
  const removeLine = (id) => setCart((prev) => prev.filter((l) => l.id !== id));

  const count = cart.reduce((n, l) => n + l.qty, 0);
  const gross = cart.reduce((n, l) => n + l.qty * l.price, 0);
  const { vat, net } = splitVat(gross, vatRate);

  return (
    <div className={`pos ${cartOpen ? 'pos--cart-open' : ''}`}>
      {/* ---------------------------------------------- catalog */}
      <div className="pos__catalog">
        <div className="pos__bar">
          <div className="search">
            <Icon.search />
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, SKU…" />
          </div>
          <button className="btn btn--primary" onClick={() => setScanning(true)}><Icon.scan /> Scan</button>
        </div>
        <div className="pos__cats">
          {categories.map((c) => (
            <button key={c} className={`pcat ${cat === c ? 'is-on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="pos__grid">
          {filtered.map((p) => {
            const s = Number(p.stock || 0);
            const img = productImage(p);
            return (
              <button key={p.id} className="pcard" onClick={() => addToCart(p)} disabled={s <= 0}>
                {img ? <img className="pcard__img" src={img} alt="" loading="lazy" />
                  : <div className="pcard__img pcard__img--ph"><Icon.box width={26} height={26} /></div>}
                <div className="pcard__b">
                  <div className="pcard__name">{p.name}</div>
                  <div className="pcard__foot">
                    <span className="pcard__price">{money(p.price, 0)}</span>
                    <span className={`pcard__stock ${s <= 0 ? 'out' : s <= Number(p.reorder_level || 10) ? 'low' : ''}`}>{s <= 0 ? 'OUT' : `${s} in`}</span>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="empty" style={{ gridColumn: '1/-1' }}><Icon.search /><h3>No products</h3></div>}
        </div>
      </div>

      {/* ---------------------------------------------- cart */}
      <aside className="cart">
        <div className="cart__head" onClick={() => setCartOpen((v) => !v)}>
          <h2>Current sale {count > 0 && <span className="mono" style={{ color: 'var(--muted)', fontSize: 14 }}>· {count}</span>}</h2>
          {cart.length > 0 && <button className="btn btn--bare btn--sm" onClick={(e) => { e.stopPropagation(); setCart([]); }}>Clear</button>}
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <Icon.pos />
            <div><b>No items yet</b><div className="mono" style={{ fontSize: 12, marginTop: 4 }}>Tap a product or scan a barcode</div></div>
          </div>
        ) : (
          <div className="cart__items">
            {cart.map((l) => (
              <div className="citem" key={l.id}>
                <div>
                  <div className="citem__name">{l.name}</div>
                  <div className="citem__sku">{l.sku || '—'} · {money(l.price, 0)}</div>
                  <div className="citem__ctl" style={{ marginTop: 8 }}>
                    <button onClick={() => setQty(l.id, l.qty - 1)} aria-label="Less"><Icon.minus width={14} height={14} /></button>
                    <span>{l.qty}</span>
                    <button onClick={() => setQty(l.id, l.qty + 1)} aria-label="More" disabled={l.qty >= l.stock}><Icon.plus width={14} height={14} /></button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                  <div className="citem__price">{money(l.qty * l.price, 0)}</div>
                  <button className="citem__rm" onClick={() => removeLine(l.id)} aria-label="Remove"><Icon.trash width={16} height={16} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="cart__foot">
          {!openShift && <div className="badge warning" style={{ marginBottom: 10 }}><Icon.alert width={13} height={13} /> Till is closed — open it in Cash up to track cash</div>}
          <div className="tline"><span>Subtotal (excl. VAT)</span><span>{money(net)}</span></div>
          <div className="tline"><span>VAT {vatRate}%</span><span>{money(vat)}</span></div>
          <div className="tline tline--total"><span>Total</span><span>{money(gross, 0)}</span></div>
          <button className="btn btn--ok btn--block btn--lg" style={{ marginTop: 12 }} disabled={cart.length === 0} onClick={() => setPaying(true)}>
            <Icon.cash /> Charge {money(gross, 0)}
          </button>
        </div>
      </aside>

      {scanning && <Scanner onResult={(c) => onScan(c)} onClose={() => setScanning(false)} title="Scan to add" />}

      {paying && (
        <PaymentModal
          gross={gross} cart={cart} settings={settings}
          onClose={() => setPaying(false)}
          onComplete={async ({ payment, customer }) => {
            try {
              const order = await recordSale(data.db, { items: cart, payment, customer, tillShift: openShift, cashier: cashierName(user), settings });
              setReceipt({ order, items: cart, payment, gross, vat, net });
              setCart([]); setPaying(false);
              data.refresh();
            } catch (e) { push(e?.message || 'Sale failed', 'err'); }
          }}
        />
      )}

      {receipt && <ReceiptModal receipt={receipt} settings={settings} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function PaymentModal({ gross, settings, onClose, onComplete }) {
  const [payment, setPayment] = useState('Cash');
  const [tendered, setTendered] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const change = payment === 'Cash' && tendered ? Number(tendered) - gross : null;

  const submit = async () => {
    setBusy(true);
    await onComplete({ payment, customer: name.trim() ? { name: name.trim() } : null });
    setBusy(false);
  };

  const quickCash = [gross, Math.ceil(gross / 50) * 50, Math.ceil(gross / 100) * 100, Math.ceil(gross / 500) * 500]
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Modal title={`Charge ${money(gross, 0)}`} onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn btn--ok" style={{ flex: 1 }} onClick={submit} disabled={busy}>{busy ? <Spinner /> : <><Icon.check /> Complete sale</>}</button>
      </>}>
      <div className="paytype">
        {PAY.map((p) => (
          <button key={p.id} className={payment === p.id ? 'is-on' : ''} onClick={() => setPayment(p.id)}><p.icon /> {p.id}</button>
        ))}
      </div>

      {payment === 'Cash' && (
        <>
          <div className="field"><label>Cash tendered</label>
            <input className="input" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={num(gross)} />
          </div>
          <div className="wrap-gap" style={{ marginBottom: 14 }}>
            {quickCash.map((v) => <button key={v} className="btn btn--ghost btn--sm" onClick={() => setTendered(String(v))}>{money(v, 0)}</button>)}
          </div>
          {change !== null && (
            <div className="kpi kpi--cash" style={{ marginBottom: 14 }}>
              <div className="kpi__label"><Icon.cash /> Change due</div>
              <div className="kpi__value" style={{ color: change < 0 ? 'var(--danger)' : 'var(--sun)' }}>{money(Math.max(0, change), 0)}</div>
              {change < 0 && <div className="kpi__delta down">Short by {money(-change, 0)}</div>}
            </div>
          )}
        </>
      )}
      {payment === 'EFT' && (
        <div className="receipt" style={{ background: 'var(--bg-2)', border: '1px dashed var(--line-2)', borderRadius: 12, padding: 14, marginBottom: 14 }}>
          <div className="r-line"><span>Bank</span><span>{settings.bank_name}</span></div>
          <div className="r-line"><span>Account</span><span>{settings.bank_account_number}</span></div>
          <div className="r-line"><span>Branch</span><span>{settings.bank_branch_code}</span></div>
        </div>
      )}

      <div className="field"><label>Customer (optional)</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Walk-in customer" />
      </div>
    </Modal>
  );
}

function ReceiptModal({ receipt, settings, onClose }) {
  const { order, items, payment, gross, vat, net } = receipt;
  return (
    <Modal title="Sale complete" onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={() => window.print()}><Icon.print /> Print</button>
        <button className="btn btn--primary" style={{ flex: 1 }} onClick={onClose}>New sale</button>
      </>}>
      <div style={{ textAlign: 'center', marginBottom: 14 }}>
        <div className="kpi__value" style={{ color: 'var(--ok)' }}>{money(gross, 0)}</div>
        <div className="badge success" style={{ marginTop: 6 }}><Icon.check width={12} height={12} /> Paid · {payment}</div>
      </div>
      <div className="receipt" style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 16 }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <b style={{ fontFamily: 'var(--display)', fontSize: 15 }}>{settings.store_name}</b>
          <div style={{ color: 'var(--muted-2)', fontSize: 11 }}>{settings.store_address}</div>
          <div style={{ color: 'var(--muted-2)', fontSize: 11 }}>Receipt {orderRef(order.id)}</div>
        </div>
        <div className="r-rule" />
        {items.map((l) => (
          <div className="r-line" key={l.id}><span>{l.qty}× {l.name}</span><span>{money(l.qty * l.price, 0)}</span></div>
        ))}
        <div className="r-rule" />
        <div className="r-line"><span>Subtotal</span><span>{money(net)}</span></div>
        <div className="r-line"><span>VAT {settings.vat_rate}%</span><span>{money(vat)}</span></div>
        <div className="r-line" style={{ fontWeight: 700, fontSize: 14 }}><span>TOTAL</span><span>{money(gross)}</span></div>
        <div className="r-rule" />
        <div style={{ textAlign: 'center', color: 'var(--muted-2)', fontSize: 11 }}>Genuine stock · Thank you!</div>
      </div>
    </Modal>
  );
}
