import React, { useCallback, useEffect, useRef, useState } from 'react';
import { money2, shortDate } from '../lib/format.js';
import {
  CONSENT,
  MEMORY_WARNING,
  STORE,
  TERMS,
  acceptJobCard,
  fetchJobCardByToken,
  respondToQuote,
} from '../../shared/jobCards.js';
import { downloadJobCardPdf } from '../../shared/jobCardPdf.js';

/**
 * The link a customer receives on WhatsApp.
 *
 * Deliberately plain and single-column: someone arriving here is finishing a
 * repair booking on a phone, often standing in a queue — not browsing.
 */
export default function JobCard({ token }) {
  const [card, setCard] = useState(null);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const found = await fetchJobCardByToken(token);
      setCard(found);
      setState(found ? 'ready' : 'missing');
    } catch (e) {
      setError(e?.message || 'Could not load this job card.');
      setState('error');
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  if (state === 'loading') return <div className="jc"><p className="jc__muted">Loading your job card…</p></div>;

  if (state === 'error') {
    return (
      <div className="jc">
        <h1>Something went wrong</h1>
        <p className="jc__muted">{error}</p>
        <button className="btn btn--primary" onClick={load}>Try again</button>
      </div>
    );
  }

  if (state === 'missing') {
    return (
      <div className="jc">
        <h1>Link not valid</h1>
        <p className="jc__muted">
          This job card link has expired or is incorrect. Please contact us and we will send a new one.
        </p>
        <a className="btn btn--primary" href={`tel:${STORE.phone.replace(/\s/g, '')}`}>Call {STORE.phone}</a>
      </div>
    );
  }

  return (
    <div className="jc">
      <header className="jc__head">
        <div>
          <div className="eyebrow">{STORE.name}</div>
          <div className="jc__muted">{STORE.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="eyebrow">Job card</div>
          <div className="jc__number mono">{card.job_number}</div>
          <div className="jc__muted">{shortDate(card.created_at)}</div>
        </div>
      </header>

      {/* A pending quote is the more urgent ask, so it leads. */}
      {card.quote_sent_at && !card.quote_responded_at && (
        <QuotePanel card={card} token={token} onDone={setCard} />
      )}

      <section className="jc__panel">
        <h2>Booking details</h2>
        <dl className="jc__dl">
          <Row label="Name" value={card.customer_name} />
          <Row label="Contact" value={card.customer_phone} />
          <Row label="Handset" value={card.handset_type} />
          <Row label="IMEI" value={card.imei} />
          <Row label="Reported fault" value={card.fault} />
          <Row label="Condition received" value={card.physical_condition} />
          <Row label="Deposit paid" value={`N$ ${money2(card.deposit)}`} />
          {Number(card.cost) > 0 && <Row label="Cost" value={`N$ ${money2(card.cost)}`} />}
        </dl>
      </section>

      {card.accepted_at
        ? <Accepted card={card} />
        : <AcceptForm card={card} token={token} onAccepted={setCard} />}

      <footer className="jc__foot">
        <div>{STORE.name}</div>
        <div>{STORE.address}</div>
        <div>{STORE.phone} · {STORE.email}</div>
      </footer>
    </div>
  );
}

function Row({ label, value }) {
  if (!value) return null;
  return (<><dt>{label}</dt><dd>{value}</dd></>);
}

function Terms() {
  return (
    <div className="jc__terms">
      <h3>Terms and conditions</h3>
      <ul>{TERMS.map((t) => <li key={t}>{t}</li>)}</ul>
      <p className="jc__warn">{MEMORY_WARNING}</p>
    </div>
  );
}

function AcceptForm({ card, token, onAccepted }) {
  const [name, setName] = useState(card.customer_name || '');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const padRef = useRef(null);

  const submit = async () => {
    setErr('');
    if (!agreed) { setErr('Please tick the box to confirm you have read the terms.'); return; }
    if (!name.trim()) { setErr('Please enter your full name.'); return; }

    const signature = padRef.current?.toDataUrl();
    if (!signature) { setErr('Please sign in the box above.'); return; }

    setBusy(true);
    try {
      const result = await acceptJobCard(token, name, signature);
      onAccepted(result.job_card);
      // The signature is never returned by the guest RPC, so the local copy is
      // passed straight into the PDF rather than re-fetching what we cannot see.
      await downloadJobCardPdf({ ...result.job_card, accepted_signature: signature });
    } catch (e) {
      setErr(e?.message || 'Could not record your acceptance.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="jc__panel">
      <h2>Accept your job card</h2>
      <p className="jc__muted">Please read the terms, sign below, and we will start work on your handset.</p>

      <Terms />

      <div className="field" style={{ marginTop: 14 }}>
        <label>Your full name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>

      <div className="field">
        <label>Signature</label>
        <SignaturePad ref={padRef} />
      </div>

      <label className="jc__consent">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>{CONSENT}</span>
      </label>

      {err && <div className="form-error">{err}</div>}

      <button className="btn btn--primary btn--block btn--lg" onClick={submit} disabled={busy}>
        {busy ? 'Saving…' : 'Accept and receive my PDF'}
      </button>
    </section>
  );
}

function Accepted({ card }) {
  const [busy, setBusy] = useState(false);
  return (
    <section className="jc__panel">
      <h2>Job card accepted</h2>
      <p className="jc__muted">Accepted by {card.accepted_name} on {shortDate(card.accepted_at)}.</p>
      <div className="jc__status">
        <div className="eyebrow">Current status</div>
        <strong>{card.status}</strong>
      </div>
      <button className="btn btn--ghost btn--block" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await downloadJobCardPdf(card); } finally { setBusy(false); }
      }}>Download my job card PDF</button>
      <details style={{ marginTop: 12 }}>
        <summary className="jc__muted">View the terms you accepted</summary>
        <Terms />
      </details>
    </section>
  );
}

// Clause 9: repairs over N$350 need the customer's go-ahead.
function QuotePanel({ card, token, onDone }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const answer = async (approved) => {
    setBusy(true); setErr('');
    try {
      onDone(await respondToQuote(token, approved));
    } catch (e) {
      setErr(e?.message || 'Could not send your response.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="jc__panel jc__panel--quote">
      <h2>Your approval is needed</h2>
      <p className="jc__muted">
        We have assessed your handset. Repairs over N$350 need your go-ahead before we start.
      </p>
      <div className="jc__quote">N$ {money2(card.quote_amount)}</div>
      {card.quote_note && <p>{card.quote_note}</p>}
      {err && <div className="form-error">{err}</div>}
      <div className="wrap-gap gap8">
        <button className="btn btn--primary" disabled={busy} onClick={() => answer(true)}>Approve repair</button>
        <button className="btn btn--ghost" disabled={busy} onClick={() => answer(false)}>Decline</button>
      </div>
    </section>
  );
}

/**
 * Finger/stylus signature capture. Pointer events cover touch, pen and mouse
 * in one path; the canvas is sized to devicePixelRatio so the exported PNG is
 * not soft on a phone screen.
 */
const SignaturePad = React.forwardRef(function SignaturePad(_props, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [inked, setInked] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const setup = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width) return;
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Ink is always dark: the exported PNG sits on white paper in the PDF.
      ctx.strokeStyle = '#0f172a';
    };
    setup();
    window.addEventListener('resize', setup);
    return () => window.removeEventListener('resize', setup);
  }, []);

  React.useImperativeHandle(ref, () => ({
    toDataUrl: () => (inked ? canvasRef.current?.toDataURL('image/png') : null),
    clear: () => {
      const canvas = canvasRef.current;
      canvas?.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      setInked(false);
    },
  }), [inked]);

  const at = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="jc__sign"
        style={{ touchAction: 'none' }}
        role="img"
        aria-label="Signature area — sign with your finger or mouse"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = canvasRef.current.getContext('2d');
          const p = at(e);
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          drawing.current = true;
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = canvasRef.current.getContext('2d');
          const p = at(e);
          ctx.lineTo(p.x, p.y); ctx.stroke();
          if (!inked) setInked(true);
        }}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
      />
      <div className="wrap-gap" style={{ justifyContent: 'space-between', fontSize: 12 }}>
        <span className="jc__muted">{inked ? 'Signature captured.' : 'Use your finger, stylus or mouse.'}</span>
        <button type="button" className="btn btn--bare btn--sm" onClick={() => {
          const canvas = canvasRef.current;
          canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
          setInked(false);
        }}>Clear</button>
      </div>
    </div>
  );
});
