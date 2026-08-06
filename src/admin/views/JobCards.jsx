import React, { useCallback, useEffect, useState } from 'react';
import { Icon, Modal, Spinner, Empty, Badge } from '../components/ui.jsx';
import { useAuth, useToast } from '../lib/store.jsx';
import { money, shortDate } from '../lib/format.js';
import {
  CHECKS,
  HANDLING_FEE,
  JOB_CARD_STATUSES,
  QUOTE_THRESHOLD,
  STATUS_TONE,
  STORE,
  deleteJobCard,
  jobCardUrl,
  jobCardWhatsAppLink,
  listJobCards,
  quoteWhatsAppLink,
  saveJobCard,
  sendQuote,
} from '../../shared/jobCards.js';
import { downloadJobCardPdf } from '../../shared/jobCardPdf.js';

const BLANK = {
  customer_name: '', customer_phone: '', customer_email: '',
  handset_type: '', imei: '', fault: '', physical_condition: '', pattern_pin: '',
  deposit: '', cost: '', technician: '', status: 'Awaiting acceptance', notes: '',
};

export default function JobCards() {
  const push = useToast();
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCards(await listJobCards({ search, status }));
    } catch (e) {
      push(e?.message || 'Could not load job cards', 'bad');
    } finally {
      setLoading(false);
    }
  }, [search, status, push]);

  // Debounced so typing a card number does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const awaiting = cards.filter((c) => !c.accepted_at).length;
  const inRepair = cards.filter((c) => String(c.status).includes('repair')).length;

  return (
    <div>
      <div className="cards" style={{ marginBottom: 18 }}>
        <Kpi label="Open job cards" value={cards.length} icon={Icon.box} />
        <Kpi label="Awaiting signature" value={awaiting} icon={Icon.users} accent={awaiting ? 'cash' : undefined} />
        <Kpi label="In repair" value={inRepair} icon={Icon.cog} />
      </div>

      <div className="wrap-gap" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 className="display" style={{ fontSize: 18, fontWeight: 800 }}>Repairs booked in</h2>
        <button className="btn btn--primary" onClick={() => setEditing('new')}><Icon.plus /> New job card</button>
      </div>

      <div className="field-row" style={{ marginBottom: 14 }}>
        <div className="field" style={{ flex: 2 }}>
          <label>Search</label>
          <input className="input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Card number, name, phone, IMEI…" />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>Status</label>
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {JOB_CARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}><Spinner size={26} /></div>
      ) : cards.length === 0 ? (
        <Empty icon={Icon.box} title="No job cards yet" action={<button className="btn btn--primary" onClick={() => setEditing('new')}>Book one in</button>}>
          Repairs booked at the counter appear here.
        </Empty>
      ) : (
        <div className="rows">
          {cards.map((c) => (
            <div className="row" key={c.id} onClick={() => setEditing(c)} style={{ cursor: 'pointer' }}>
              <div className="row__thumb mono" style={{ fontWeight: 800 }}>{c.job_number}</div>
              <div className="row__main">
                <div className="row__title">{c.customer_name} — {c.handset_type || 'Handset'}</div>
                <div className="row__meta">
                  <span>{c.customer_phone}</span>
                  <Badge tone={STATUS_TONE[c.status] || 'muted'}>{c.status}</Badge>
                  {!c.accepted_at && <Badge tone="warn">Unsigned</Badge>}
                  <span>{shortDate(c.created_at)}</span>
                </div>
              </div>
              <div className="row__price" style={{ fontSize: 15 }}>{money(c.cost, 0)}</div>
            </div>
          ))}
        </div>
      )}

      {editing && <JobCardModal card={editing} onClose={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function Kpi({ label, value, icon: I, accent }) {
  return (
    <div className={`kpi${accent ? ` kpi--${accent}` : ''}`}>
      <div className="kpi__label">{label} {I && <I width={15} height={15} />}</div>
      <div className="kpi__value">{value}</div>
    </div>
  );
}

function JobCardModal({ card, onClose }) {
  const push = useToast();
  const { user } = useAuth();
  const isNew = card === 'new';

  const [saved, setSaved] = useState(isNew ? null : card);
  const [busy, setBusy] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [checks, setChecks] = useState(isNew ? {} : (card.checks || {}));
  const [f, setF] = useState(() => (isNew ? BLANK : {
    customer_name: card.customer_name || '', customer_phone: card.customer_phone || '',
    customer_email: card.customer_email || '', handset_type: card.handset_type || '',
    imei: card.imei || '', fault: card.fault || '', physical_condition: card.physical_condition || '',
    pattern_pin: card.pattern_pin || '', deposit: String(card.deposit ?? ''), cost: String(card.cost ?? ''),
    technician: card.technician || '', status: card.status, notes: card.notes || '',
  }));

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const needsQuote = Number(f.cost || 0) > QUOTE_THRESHOLD;

  const save = async () => {
    if (!f.customer_name.trim() || !f.customer_phone.trim()) {
      push('Name and contact number are required', 'bad');
      return null;
    }
    setBusy(true);
    try {
      const row = await saveJobCard(saved?.id, {
        ...f,
        deposit: Number(f.deposit || 0),
        cost: Number(f.cost || 0),
        handling_fee: HANDLING_FEE,
        checks,
        customer_email: f.customer_email.trim() || null,
        created_by: user?.email || null,
      });
      setSaved(row);
      push(isNew && !saved ? `Job card ${row.job_number} created` : 'Job card saved', 'good');
      return row;
    } catch (e) {
      push(e?.message || 'Could not save', 'bad');
      return null;
    } finally {
      setBusy(false);
    }
  };

  // The WhatsApp link needs a persisted token, so save first if needed.
  const ensure = async () => saved || (await save());

  const act = async (fn) => {
    const row = await ensure();
    if (row) fn(row);
  };

  return (
    <Modal
      wide
      title={saved ? `Job Card ${saved.job_number}` : 'New job card'}
      onClose={onClose}
      foot={
        <>
          {saved && (
            <button className="btn btn--danger btn--sm" onClick={async () => {
              if (!window.confirm('Delete this job card? The signed acceptance goes with it.')) return;
              try { await deleteJobCard(saved.id); push('Deleted', 'good'); onClose(); }
              catch (e) { push(e?.message || 'Could not delete', 'bad'); }
            }}>Delete</button>
          )}
          <button className="btn btn--ghost" onClick={onClose}>Close</button>
          <button className="btn btn--primary" onClick={save} disabled={busy}>{busy ? <Spinner /> : saved ? 'Save changes' : 'Create job card'}</button>
        </>
      }
    >
      {saved && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <div className="wrap-gap gap8">
            <button className="btn btn--ok btn--sm" onClick={() => act((r) => window.open(jobCardWhatsAppLink(r), '_blank', 'noopener'))}>Send via WhatsApp</button>
            <button className="btn btn--ghost btn--sm" onClick={() => act(async (r) => {
              try { await navigator.clipboard.writeText(jobCardUrl(r.accept_token)); push('Link copied', 'good'); }
              catch { push(jobCardUrl(r.accept_token), 'good'); }
            })}>Copy link</button>
            <button className="btn btn--ghost btn--sm" onClick={() => act((r) => downloadJobCardPdf(r).catch((e) => push(e?.message || 'PDF failed', 'bad')))}>Download PDF</button>
            {needsQuote && <button className="btn btn--sun btn--sm" onClick={() => setQuoting(true)}>Send quote for approval</button>}
          </div>

          <div style={{ marginTop: 10, fontSize: 13 }}>
            {saved.accepted_at ? (
              <span style={{ color: 'var(--ok, #16a34a)' }}>
                Signed by {saved.accepted_name} · {shortDate(saved.accepted_at)}
              </span>
            ) : (
              <span style={{ color: 'var(--sun, #b06a08)' }}>
                Not yet accepted — the customer must open the link and sign before work starts.
              </span>
            )}
            {saved.quote_sent_at && (
              <div style={{ marginTop: 4 }}>
                Quote {money(saved.quote_amount, 2)} sent {shortDate(saved.quote_sent_at)} —{' '}
                {saved.quote_responded_at ? (saved.quote_approved ? 'approved' : 'declined') : 'awaiting response'}
              </div>
            )}
          </div>
        </div>
      )}

      <h3 className="eyebrow">Customer</h3>
      <div className="field-row">
        <div className="field"><label>Name &amp; surname *</label><input className="input" value={f.customer_name} onChange={(e) => set('customer_name', e.target.value)} /></div>
        <div className="field"><label>Contact no. *</label><input className="input" value={f.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="+264 81 …" /></div>
      </div>
      <div className="field"><label>Email (optional)</label><input className="input" type="email" value={f.customer_email} onChange={(e) => set('customer_email', e.target.value)} /></div>

      <h3 className="eyebrow" style={{ marginTop: 16 }}>Handset</h3>
      <div className="field-row">
        <div className="field"><label>Type of handset</label><input className="input" value={f.handset_type} onChange={(e) => set('handset_type', e.target.value)} placeholder="Samsung A16 128GB" /></div>
        <div className="field">
          <label>IMEI (15 digits)</label>
          <input className="input mono" value={f.imei} onChange={(e) => set('imei', e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" />
          {f.imei && f.imei.length !== 15 && <div className="form-error">{f.imei.length} of 15 digits</div>}
        </div>
      </div>
      <div className="field"><label>Fault</label><textarea className="input" rows={2} value={f.fault} onChange={(e) => set('fault', e.target.value)} /></div>
      <div className="field">
        <label>Physical condition</label>
        <textarea className="input" rows={2} value={f.physical_condition} onChange={(e) => set('physical_condition', e.target.value)} placeholder="Record existing damage now — it protects you later." />
      </div>

      <div className="field-row">
        <div className="field"><label>Deposit (N$)</label><input className="input" type="number" min="0" step="0.01" value={f.deposit} onChange={(e) => set('deposit', e.target.value)} /></div>
        <div className="field">
          <label>Cost (N$)</label>
          <input className="input" type="number" min="0" step="0.01" value={f.cost} onChange={(e) => set('cost', e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            {needsQuote ? `Above N$${QUOTE_THRESHOLD} — needs the customer's approval first.` : `Under N$${QUOTE_THRESHOLD}; no approval needed.`}
          </div>
        </div>
      </div>

      <h3 className="eyebrow" style={{ marginTop: 16 }}>Pattern / PIN</h3>
      <PatternPad value={f.pattern_pin} onChange={(v) => set('pattern_pin', v)} />
      <div className="field"><label>Or a PIN / password</label><input className="input" value={/^[1-9](-[1-9])*$/.test(f.pattern_pin) ? '' : f.pattern_pin} onChange={(e) => set('pattern_pin', e.target.value)} /></div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -6 }}>Never shown on the customer's link.</div>

      <h3 className="eyebrow" style={{ marginTop: 16 }}>Checked by technician</h3>
      <div className="wrap-gap gap8">
        {CHECKS.map((c) => (
          <label key={c.key} className="flex gap8" style={{ minWidth: 110, fontSize: 13 }}>
            <input type="checkbox" checked={!!checks[c.key]} onChange={(e) => setChecks((p) => ({ ...p, [c.key]: e.target.checked }))} />
            {c.label}
          </label>
        ))}
      </div>

      <div className="field-row" style={{ marginTop: 12 }}>
        <div className="field"><label>Technician</label><input className="input" value={f.technician} onChange={(e) => set('technician', e.target.value)} /></div>
        <div className="field">
          <label>Status</label>
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value)}>
            {JOB_CARD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="field"><label>Internal notes (staff only)</label><textarea className="input" rows={2} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>

      {quoting && saved && (
        <QuoteModal card={saved} defaultAmount={Number(f.cost || 0)} onClose={() => setQuoting(false)} onSent={(row) => { setSaved(row); setQuoting(false); }} />
      )}
    </Modal>
  );
}

// Android unlock pattern, stored as dot indices ('1-2-5-8-9'). Compact,
// readable on a printed card, and re-drawable — which a screenshot is not.
function PatternPad({ value, onChange }) {
  const dots = /^[1-9](-[1-9])*$/.test(value) ? value.split('-').map(Number) : [];
  const add = (d) => { if (!dots.includes(d)) onChange([...dots, d].join('-')); };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 10, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => {
          const i = dots.indexOf(d);
          return (
            <button key={d} type="button" onClick={() => add(d)} aria-label={`Dot ${d}`} aria-pressed={i !== -1}
              style={{
                width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                border: `2px solid ${i !== -1 ? 'var(--cobalt, #1d4ed8)' : 'var(--surface-3, #cbd5e1)'}`,
                background: i !== -1 ? 'var(--cobalt, #1d4ed8)' : 'transparent',
                color: i !== -1 ? '#fff' : 'transparent',
              }}>{i !== -1 ? i + 1 : ''}</button>
          );
        })}
      </div>
      <div className="wrap-gap gap8" style={{ fontSize: 12 }}>
        <code className="mono">{value || 'no pattern'}</code>
        {dots.length > 0 && <button type="button" className="btn btn--bare btn--sm" onClick={() => onChange('')}>Clear</button>}
      </div>
    </div>
  );
}

function QuoteModal({ card, defaultAmount, onClose, onSent }) {
  const push = useToast();
  const [amount, setAmount] = useState(String(defaultAmount || ''));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (Number(amount) <= 0) { push('Enter the quoted amount', 'bad'); return; }
    setBusy(true);
    try {
      const row = await sendQuote(card.id, amount, note.trim() || null);
      window.open(quoteWhatsAppLink(row), '_blank', 'noopener');
      push('Quote sent for approval', 'good');
      onSent(row);
    } catch (e) {
      push(e?.message || 'Could not send the quote', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Send quote for approval" onClose={onClose}
      foot={<><button className="btn btn--ghost" onClick={onClose}>Cancel</button><button className="btn btn--primary" onClick={submit} disabled={busy}>{busy ? <Spinner /> : 'Send on WhatsApp'}</button></>}>
      <p style={{ fontSize: 13, color: 'var(--muted)' }}>
        Your terms require confirmation before starting any repair over N${QUOTE_THRESHOLD}. The customer approves or declines on the same link.
      </p>
      <div className="field"><label>Quoted amount (N$)</label><input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
      <div className="field"><label>What the repair involves</label><textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Screen replacement, including fitting and 30-day parts warranty." /></div>
      <p style={{ fontSize: 12, color: 'var(--muted)' }}>Sending from {STORE.address}.</p>
    </Modal>
  );
}
