import React, { useState } from 'react';
import { Icon, Spinner, Badge } from '../components/ui.jsx';
import { useData, useAuth, useToast } from '../lib/store.jsx';
import { cashierName } from '../lib/db.js';

const EDITABLE = [
  ['store_name', 'Store name', 'text'],
  ['store_phone', 'Phone', 'text'],
  ['store_email', 'Email', 'text'],
  ['store_address', 'Address', 'text'],
  ['vat_rate', 'VAT rate (%)', 'number'],
  ['delivery_fee', 'Delivery fee (N$)', 'number'],
  ['free_delivery_threshold', 'Free delivery over (N$)', 'number'],
  ['bank_name', 'Bank name', 'text'],
  ['bank_account_number', 'Account number', 'text'],
  ['bank_branch_code', 'Branch code', 'text'],
];

export default function Settings() {
  const data = useData();
  const { user, isAdmin, signOut } = useAuth();
  const push = useToast();
  const [form, setForm] = useState(() => Object.fromEntries(EDITABLE.map(([k]) => [k, data.settings[k]])));
  const [busy, setBusy] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setBusy(true);
    try {
      const rows = EDITABLE.map(([k, , type]) => ({ key: k, value: type === 'number' ? Number(form[k]) || 0 : form[k] }));
      const { error } = await data.db.from('settings').upsert(rows, { onConflict: 'key' });
      if (error) throw error;
      push('Settings saved'); data.refresh();
    } catch (e) { push(e?.message || 'Save failed', 'err'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 720 }}>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head"><h2>Account</h2></div>
        <div className="wrap-gap" style={{ justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 700 }}>{cashierName(user)}</div>
            <div className="muted mono" style={{ fontSize: 12 }}>{user?.email}</div>
          </div>
          <Badge tone={isAdmin ? 'success' : 'warning'}>{isAdmin ? 'Admin' : 'Limited'}</Badge>
        </div>
        <button className="btn btn--ghost btn--block" style={{ marginTop: 14 }} onClick={signOut}><Icon.logout /> Sign out</button>
      </div>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="panel__head"><h2>Store settings</h2></div>
        {!isAdmin && <div className="badge warning" style={{ marginBottom: 12 }}>Only admins can change these.</div>}
        <div className="field-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {EDITABLE.map(([k, label, type]) => (
            <div className="field" key={k}><label>{label}</label>
              <input className="input" type={type} inputMode={type === 'number' ? 'decimal' : undefined} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} disabled={!isAdmin} />
            </div>
          ))}
        </div>
        {isAdmin && <button className="btn btn--primary" style={{ marginTop: 6 }} onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Save settings'}</button>}
      </div>

      <div className="panel">
        <div className="panel__head"><h2>About</h2></div>
        <div className="receipt" style={{ fontSize: 13 }}>
          <div className="r-line"><span>App</span><span>JR Importers POS</span></div>
          <div className="r-line"><span>Products loaded</span><span>{(data.products || []).length}</span></div>
          <div className="r-line"><span>Backend</span><span>Supabase</span></div>
          <div className="r-line"><span>Barcode</span><span>{'BarcodeDetector' in window ? 'Native + camera' : 'Camera (ZXing)'}</span></div>
        </div>
      </div>
    </div>
  );
}
