import React, { useState } from 'react';
import { Icon, Modal, Spinner, Badge, Empty } from '../components/ui.jsx';
import { useData, useAuth, useTill, useToast } from '../lib/store.jsx';
import { openShift, closeShift, cashierName } from '../lib/db.js';
import { money, formatDateTime, timeOnly, shortDate } from '../lib/format.js';

export default function CashUp() {
  const data = useData();
  const { user } = useAuth();
  const { openShift: shift } = useTill();
  const push = useToast();
  const [opening, setOpening] = useState(false);
  const [closing, setClosing] = useState(false);

  const history = (data.till_shifts || []).filter((s) => String(s.status).toLowerCase() !== 'open');

  return (
    <div>
      {shift ? (
        <ActiveShift shift={shift} onClose={() => setClosing(true)} />
      ) : (
        <div className="panel" style={{ textAlign: 'center', padding: 32 }}>
          <div className="login__logo" style={{ margin: '0 auto 16px' }}><Icon.cash width={24} height={24} /></div>
          <h2 className="display" style={{ fontSize: 22, fontWeight: 800 }}>Till is closed</h2>
          <p className="muted" style={{ margin: '6px 0 18px' }}>Open the till with a starting float to begin trading and tracking cash.</p>
          <button className="btn btn--primary btn--lg" onClick={() => setOpening(true)}><Icon.bolt /> Open till</button>
        </div>
      )}

      <div className="section-gap">
        <div className="panel__head"><h2>Shift history</h2></div>
        {history.length === 0 ? (
          <Empty icon={Icon.clock} title="No closed shifts yet">Your cash-up history will appear here.</Empty>
        ) : (
          <div className="rows">
            {history.map((s) => {
              const variance = Number(s.cash_variance || 0);
              return (
                <div className="row" key={s.id}>
                  <div className="row__thumb"><Icon.receipt width={20} height={20} /></div>
                  <div className="row__main">
                    <div className="row__title">{s.cashier_name || 'Cashier'} · {shortDate(s.closing_time || s.created_at)}</div>
                    <div className="row__meta">
                      <span>{timeOnly(s.opening_time)}–{timeOnly(s.closing_time)}</span>
                      <span>{s.transaction_count || 0} sales</span>
                      <span>Cash {money(s.cash_sales, 0)}</span>
                    </div>
                  </div>
                  <div className="row__end">
                    <div className="row__price">{money(s.total_sales, 0)}</div>
                    <Badge tone={Math.abs(variance) < 1 ? 'success' : variance < 0 ? 'danger' : 'warning'}>
                      {variance === 0 ? 'Balanced' : `${variance > 0 ? '+' : ''}${money(variance, 0)}`}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {opening && <OpenModal onClose={() => setOpening(false)} onConfirm={async (float) => {
        try { await openShift(data.db, { cashier: cashierName(user), openingFloat: float }); push('Till opened'); data.refresh(); setOpening(false); }
        catch (e) { push(e?.message || 'Could not open till', 'err'); }
      }} />}

      {closing && shift && <CloseModal shift={shift} onClose={() => setClosing(false)} onConfirm={async (actual) => {
        try { const closed = await closeShift(data.db, { shift, actualCash: actual }); push('Till closed · Z-report saved'); data.refresh(); setClosing(false); return closed; }
        catch (e) { push(e?.message || 'Could not close till', 'err'); return null; }
      }} />}
    </div>
  );
}

function ActiveShift({ shift, onClose }) {
  const expected = Number(shift.opening_float || 0) + Number(shift.cash_sales || 0);
  return (
    <div className="panel" style={{ background: 'linear-gradient(150deg, rgba(46,211,155,.10), var(--surface) 60%)' }}>
      <div className="panel__head">
        <div>
          <div className="eyebrow" style={{ color: 'var(--ok)' }}>Till open</div>
          <h2>Live shift · {shift.cashier_name}</h2>
        </div>
        <button className="btn btn--danger" onClick={onClose}><Icon.cash /> Close &amp; cash up</button>
      </div>
      <div className="cards">
        <Kpi label="Opening float" value={money(shift.opening_float, 0)} icon={Icon.wallet} />
        <Kpi label="Cash sales" value={money(shift.cash_sales, 0)} icon={Icon.cash} accent="cash" />
        <Kpi label="Card / EFT sales" value={money(shift.card_sales, 0)} icon={Icon.card} />
        <Kpi label="Transactions" value={shift.transaction_count || 0} icon={Icon.receipt} />
        <Kpi label="Total sales" value={money(shift.total_sales, 0)} icon={Icon.trend} accent="accent" />
        <Kpi label="Expected in drawer" value={money(expected, 0)} icon={Icon.bank} accent="cash" />
      </div>
      <div className="muted mono" style={{ fontSize: 11.5, marginTop: 14 }}>Opened {formatDateTime(shift.opening_time)}</div>
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return (
    <div className={`kpi ${accent ? `kpi--${accent}` : ''}`}>
      <div className="kpi__label"><I /> {label}</div>
      <div className="kpi__value">{value}</div>
    </div>
  );
}

function OpenModal({ onClose, onConfirm }) {
  const [float, setFloat] = useState('500');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Open till" onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--primary" style={{ flex: 1 }} disabled={busy} onClick={async () => { setBusy(true); await onConfirm(Number(float) || 0); setBusy(false); }}>{busy ? <Spinner /> : 'Open till'}</button>
      </>}>
      <div className="field"><label>Opening cash float (N$)</label>
        <input className="input" inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} autoFocus />
      </div>
      <p className="muted" style={{ fontSize: 13 }}>The cash already in the drawer at the start of the shift.</p>
    </Modal>
  );
}

function CloseModal({ shift, onClose, onConfirm }) {
  const expected = Number(shift.opening_float || 0) + Number(shift.cash_sales || 0);
  const [counted, setCounted] = useState('');
  const [busy, setBusy] = useState(false);
  const variance = counted === '' ? null : Number(counted) - expected;
  return (
    <Modal title="Cash up &amp; close till" onClose={onClose}
      foot={<>
        <button className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn--ok" style={{ flex: 1 }} disabled={busy || counted === ''} onClick={async () => { setBusy(true); await onConfirm(Number(counted) || 0); setBusy(false); }}>{busy ? <Spinner /> : 'Close till'}</button>
      </>}>
      <div className="receipt" style={{ background: 'var(--bg-2)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <div className="r-line"><span>Opening float</span><span>{money(shift.opening_float, 0)}</span></div>
        <div className="r-line"><span>Cash sales</span><span>{money(shift.cash_sales, 0)}</span></div>
        <div className="r-rule" />
        <div className="r-line" style={{ fontWeight: 700 }}><span>Expected in drawer</span><span>{money(expected)}</span></div>
      </div>
      <div className="field"><label>Counted cash (N$)</label>
        <input className="input" inputMode="decimal" value={counted} onChange={(e) => setCounted(e.target.value)} autoFocus placeholder="Count the drawer…" />
      </div>
      {variance !== null && (
        <div className={`kpi ${Math.abs(variance) < 1 ? '' : 'kpi--cash'}`}>
          <div className="kpi__label"><Icon.alert /> Variance</div>
          <div className="kpi__value" style={{ color: Math.abs(variance) < 1 ? 'var(--ok)' : variance < 0 ? 'var(--danger)' : 'var(--sun)' }}>
            {variance > 0 ? '+' : ''}{money(variance, 0)}
          </div>
          <div className="kpi__delta">{Math.abs(variance) < 1 ? 'Balanced 🎉' : variance < 0 ? 'Short' : 'Over'}</div>
        </div>
      )}
    </Modal>
  );
}
