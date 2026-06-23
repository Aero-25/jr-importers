import React, { useState, useMemo } from 'react';
import { Icon, Modal, Spinner, Badge, Empty } from '../components/ui.jsx';
import { useData, useAuth, useToast } from '../lib/store.jsx';
import { adjustStock, receiveStock, upsertProduct, archiveProduct, cashierName } from '../lib/db.js';
import { money, num, productImage, stockTone, formatDateTime } from '../lib/format.js';
import { getLowStockSuggestions } from '../modules/stock/lowStock.js';

const TABS = [['levels', 'Levels'], ['reorder', 'Reorder'], ['receive', 'Receive (GRV)'], ['movements', 'Movements']];

export default function Stock() {
  const data = useData();
  const { user } = useAuth();
  const push = useToast();
  const [tab, setTab] = useState('levels');
  const [query, setQuery] = useState('');
  const [adjust, setAdjust] = useState(null);
  const [edit, setEdit] = useState(null);
  const [receiving, setReceiving] = useState(false);

  const products = data.products || [];
  const cashier = cashierName(user);
  const low = useMemo(() => getLowStockSuggestions(products), [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => `${p.name} ${p.brand} ${p.sku} ${p.barcode}`.toLowerCase().includes(q));
  }, [products, query]);

  const stockValue = products.reduce((n, p) => n + Number(p.stock || 0) * Number(p.cost_price || 0), 0);

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Products" value={products.length} icon={Icon.box} />
        <Kpi label="Low / reorder" value={low.length} icon={Icon.alert} accent={low.length ? 'cash' : ''} />
        <Kpi label="Out of stock" value={products.filter((p) => Number(p.stock || 0) <= 0).length} icon={Icon.alert} />
        <Kpi label="Stock value (cost)" value={money(stockValue, 0)} icon={Icon.wallet} accent="accent" />
      </div>

      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="seg">{TABS.map(([id, l]) => <button key={id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>{l}</button>)}</div>
        <div className="wrap-gap">
          <button className="btn btn--ghost" onClick={() => setReceiving(true)}><Icon.truck /> Receive stock</button>
          <button className="btn btn--primary" onClick={() => setEdit({})}><Icon.plus /> New product</button>
        </div>
      </div>

      {tab === 'levels' && (
        <>
          <div className="search" style={{ marginBottom: 14 }}><Icon.search /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, SKU, barcode…" /></div>
          <div className="rows">
            {filtered.map((p) => {
              const tone = stockTone(p);
              return (
                <div className="row" key={p.id}>
                  <div className="row__thumb">{productImage(p) ? <img src={productImage(p)} alt="" /> : <Icon.box width={20} height={20} />}</div>
                  <div className="row__main">
                    <div className="row__title">{p.name}</div>
                    <div className="row__meta"><span>{p.sku || '—'}</span><span>{p.brand}</span><span>{money(p.price, 0)}</span></div>
                  </div>
                  <div className="row__end" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Badge tone={tone === 'out' ? 'danger' : tone === 'low' ? 'warning' : 'success'}>{Number(p.stock || 0)} in stock</Badge>
                    <button className="icon-btn icon-btn--bd" onClick={() => setAdjust(p)} aria-label="Adjust stock"><Icon.bolt /></button>
                    <button className="icon-btn icon-btn--bd" onClick={() => setEdit(p)} aria-label="Edit"><Icon.edit /></button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && <Empty icon={Icon.box} title="No products found" />}
          </div>
        </>
      )}

      {tab === 'reorder' && (
        low.length === 0 ? <Empty icon={Icon.check} title="Everything is well stocked">No products are at or below their reorder level.</Empty> : (
          <div className="rows">
            {low.map((p) => (
              <div className="row" key={p.id}>
                <div className="row__thumb">{productImage(p) ? <img src={productImage(p)} alt="" /> : <Icon.box width={20} height={20} />}</div>
                <div className="row__main">
                  <div className="row__title">{p.name}</div>
                  <div className="row__meta"><span>Stock {p.stock}</span><span>Reorder at {p.reorderLevel}</span><span>Suggest +{p.suggestedOrderQty}</span></div>
                </div>
                <div className="row__end">
                  <div className="row__price">{money(p.estimatedCost, 0)}</div>
                  <button className="btn btn--ghost btn--sm" onClick={() => setAdjust(p)}>Adjust</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'movements' && <Movements rows={data.stock_movements || []} />}

      {adjust && <AdjustModal product={adjust} onClose={() => setAdjust(null)} onSave={async (delta, reason) => {
        try { await adjustStock(data.db, { product: adjust, delta, reason, cashier }); push('Stock updated'); data.refresh(); setAdjust(null); }
        catch (e) { push(e?.message || 'Update failed', 'err'); }
      }} />}

      {edit && <ProductModal product={edit} categories={Array.from(new Set(products.map((p) => p.category).filter(Boolean)))}
        onClose={() => setEdit(null)}
        onSave={async (row) => { try { await upsertProduct(data.db, row); push('Product saved'); data.refresh(); setEdit(null); } catch (e) { push(e?.message || 'Save failed', 'err'); } }}
        onArchive={async () => { try { await archiveProduct(data.db, edit.id); push('Product archived'); data.refresh(); setEdit(null); } catch (e) { push(e?.message || 'Failed', 'err'); } }}
      />}

      {(receiving || tab === 'receive') && <ReceiveModal products={products} suppliers={data.suppliers || []}
        onClose={() => { setReceiving(false); if (tab === 'receive') setTab('levels'); }}
        onSave={async (payload) => { try { await receiveStock(data.db, { ...payload, cashier }); push('Stock received'); data.refresh(); setReceiving(false); if (tab === 'receive') setTab('levels'); } catch (e) { push(e?.message || 'Failed', 'err'); } }}
      />}
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}><div className="kpi__label"><I /> {label}</div><div className="kpi__value">{value}</div></div>;
}

function Movements({ rows }) {
  if (!rows.length) return <Empty icon={Icon.refresh} title="No stock movements yet" />;
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>When</th><th>Product</th><th>Type</th><th className="num">Qty</th><th>By</th></tr></thead>
        <tbody>
          {rows.slice(0, 200).map((m) => (
            <tr key={m.id}>
              <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>{formatDateTime(m.created_at)}</td>
              <td>{m.product_name || '—'}</td>
              <td><Badge tone={Number(m.quantity) >= 0 ? 'success' : 'warning'}>{m.movement_type}</Badge></td>
              <td className="num strong" style={{ color: Number(m.quantity) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{Number(m.quantity) > 0 ? '+' : ''}{m.quantity}</td>
              <td className="muted">{m.user_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdjustModal({ product, onClose, onSave }) {
  const [mode, setMode] = useState('in');
  const [qty, setQty] = useState('1');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const delta = (mode === 'in' ? 1 : -1) * (Number(qty) || 0);
  const next = Math.max(0, Number(product.stock || 0) + delta);
  return (
    <Modal title={`Adjust · ${product.name}`} onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !qty} onClick={async () => { setBusy(true); await onSave(delta, reason); setBusy(false); }}>{busy ? <Spinner /> : `Set to ${next}`}</button>
      </>}>
      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={mode === 'in' ? 'is-on' : ''} onClick={() => setMode('in')}>Add stock</button>
        <button className={mode === 'out' ? 'is-on' : ''} onClick={() => setMode('out')}>Remove stock</button>
      </div>
      <div className="field-row">
        <div className="field"><label>Quantity</label><input className="input" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus /></div>
        <div className="field"><label>Current → New</label><input className="input" value={`${product.stock || 0} → ${next}`} readOnly /></div>
      </div>
      <div className="field"><label>Reason (optional)</label><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Recount, damage, return…" /></div>
    </Modal>
  );
}

const FIELDS = [
  ['name', 'Name', 'text'], ['brand', 'Brand', 'text'], ['category', 'Category', 'text'],
  ['price', 'Sell price', 'number'], ['cost_price', 'Cost price', 'number'], ['stock', 'Stock', 'number'],
  ['reorder_level', 'Reorder level', 'number'], ['sku', 'SKU', 'text'], ['barcode', 'Barcode', 'text'],
  ['color', 'Colour', 'text'], ['spec_storage', 'Storage', 'text'], ['spec_ram', 'RAM', 'text'],
];

function ProductModal({ product, onClose, onSave, onArchive }) {
  const [form, setForm] = useState(() => ({
    featured: false, active: true, reorder_level: 10, ...product,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !product?.id;
  return (
    <Modal title={isNew ? 'New product' : 'Edit product'} onClose={onClose} wide
      foot={<>
        {!isNew && <button className="btn btn--danger" onClick={onArchive}><Icon.trash /> Archive</button>}
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy || !form.name} onClick={async () => {
          setBusy(true);
          await onSave({ ...form, price: Number(form.price || 0), cost_price: Number(form.cost_price || 0), stock: Number(form.stock || 0), reorder_level: Number(form.reorder_level || 10) });
          setBusy(false);
        }}>{busy ? <Spinner /> : 'Save product'}</button>
      </>}>
      <div className="field-row" style={{ gridTemplateColumns: '1fr 1fr', display: 'grid', gap: 12 }}>
        {FIELDS.map(([k, label, type]) => (
          <div className="field" key={k} style={k === 'name' ? { gridColumn: '1 / -1' } : null}>
            <label>{label}</label>
            <input className="input" type={type} inputMode={type === 'number' ? 'decimal' : undefined} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} />
          </div>
        ))}
      </div>
      <div className="field"><label>Image URL</label><input className="input" value={form.image ?? ''} onChange={(e) => set('image', e.target.value)} placeholder="https://…" /></div>
      <div className="field"><label>Description</label><textarea rows={2} value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="wrap-gap">
        <label className="wrap-gap" style={{ cursor: 'pointer' }}><input type="checkbox" checked={!!form.featured} onChange={(e) => set('featured', e.target.checked)} /> Featured</label>
        <label className="wrap-gap" style={{ cursor: 'pointer' }}><input type="checkbox" checked={form.active !== false} onChange={(e) => set('active', e.target.checked)} /> Active (visible online)</label>
      </div>
    </Modal>
  );
}

function ReceiveModal({ products, suppliers, onClose, onSave }) {
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState([]); // { product, qty, cost }
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => `${p.name} ${p.sku} ${p.barcode}`.toLowerCase().includes(q)).slice(0, 6);
  }, [products, query]);

  const addLine = (p) => { if (!lines.find((l) => l.product.id === p.id)) setLines((ls) => [...ls, { product: p, qty: 1, cost: Number(p.cost_price || 0) }]); setQuery(''); };
  const upd = (id, patch) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + Number(l.qty) * Number(l.cost), 0);

  return (
    <Modal title="Receive stock (GRV)" onClose={onClose} wide
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--ok" style={{ flex: 1 }} disabled={busy || !lines.length} onClick={async () => {
          setBusy(true);
          await onSave({ supplier: suppliers.find((s) => String(s.id) === supplierId) || null, invoiceNo, items: lines });
          setBusy(false);
        }}>{busy ? <Spinner /> : `Receive · ${money(total, 0)}`}</button>
      </>}>
      <div className="field-row">
        <div className="field"><label>Supplier</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Walk-in supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Supplier invoice #</label><input className="input" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} /></div>
      </div>
      <div className="field"><label>Add product</label>
        <div className="search"><Icon.search /><input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search to add a line…" /></div>
        {matches.length > 0 && (
          <div className="rows" style={{ marginTop: 8 }}>
            {matches.map((p) => <button key={p.id} className="row" style={{ textAlign: 'left', width: '100%' }} onClick={() => addLine(p)}>
              <div className="row__main"><div className="row__title">{p.name}</div><div className="row__meta"><span>{p.sku}</span><span>Stock {p.stock}</span></div></div>
              <Icon.plus />
            </button>)}
          </div>
        )}
      </div>
      {lines.length > 0 && (
        <div className="tbl-wrap" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Cost</th><th></th></tr></thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.product.id}>
                  <td>{l.product.name}</td>
                  <td className="num"><input className="input" style={{ width: 70, padding: 6, textAlign: 'right' }} inputMode="numeric" value={l.qty} onChange={(e) => upd(l.product.id, { qty: Number(e.target.value) || 0 })} /></td>
                  <td className="num"><input className="input" style={{ width: 90, padding: 6, textAlign: 'right' }} inputMode="decimal" value={l.cost} onChange={(e) => upd(l.product.id, { cost: Number(e.target.value) || 0 })} /></td>
                  <td><button className="icon-btn" onClick={() => setLines((ls) => ls.filter((x) => x.product.id !== l.product.id))}><Icon.trash width={16} height={16} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
