import React, { useState, useEffect } from 'react';
import { Icon, Spin } from './ui.jsx';
import { useAuth } from '../lib/store.jsx';

export default function AuthModal() {
  const auth = useAuth();
  const [tab, setTab] = useState('in');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (auth.modalOpen) { setErr(''); setBusy(false); }
  }, [auth.modalOpen, tab]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') auth.setModalOpen(false); };
    if (auth.modalOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [auth.modalOpen]);

  if (!auth.modalOpen) return null;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (tab === 'in') {
        await auth.signIn(form.email.trim(), form.password);
      } else {
        await auth.signUp(form.email.trim(), form.password, { name: form.name.trim(), phone: form.phone.trim() });
      }
    } catch (e2) {
      setErr(e2?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-scrim" onClick={(e) => { if (e.target === e.currentTarget) auth.setModalOpen(false); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Sign in">
        <div className="modal__head">
          <button className="modal__close" onClick={() => auth.setModalOpen(false)} aria-label="Close"><Icon.close width={18} height={18} /></button>
          <div className="eyebrow">Your account</div>
          <h2 className="display" style={{ fontSize: 26, fontWeight: 800, marginTop: 8 }}>
            {tab === 'in' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 6 }}>
            {tab === 'in' ? 'Sign in to check out faster and track your orders.' : 'Save your details, track orders and check out in seconds.'}
          </p>
        </div>

        <div className="modal__tabs">
          <button className={`modal__tab ${tab === 'in' ? 'is-on' : ''}`} onClick={() => setTab('in')}>Sign in</button>
          <button className={`modal__tab ${tab === 'up' ? 'is-on' : ''}`} onClick={() => setTab('up')}>Register</button>
        </div>

        <form className="modal__body" onSubmit={submit}>
          {tab === 'up' && (
            <>
              <div className="field">
                <label htmlFor="au-name">Full name</label>
                <input id="au-name" value={form.name} onChange={set('name')} required autoComplete="name" placeholder="e.g. Tangeni Shikongo" />
              </div>
              <div className="field">
                <label htmlFor="au-phone">Phone</label>
                <input id="au-phone" value={form.phone} onChange={set('phone')} inputMode="tel" autoComplete="tel" placeholder="+264 …" />
              </div>
            </>
          )}
          <div className="field">
            <label htmlFor="au-email">Email</label>
            <input id="au-email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" placeholder="you@email.com" />
          </div>
          <div className="field">
            <label htmlFor="au-pass">Password</label>
            <input id="au-pass" type="password" value={form.password} onChange={set('password')} required minLength={6} autoComplete={tab === 'in' ? 'current-password' : 'new-password'} placeholder="At least 6 characters" />
          </div>

          {err && (
            <div className="mono" style={{ fontSize: 12.5, color: 'var(--danger)', background: '#FBE9E9', padding: '10px 12px', borderRadius: 10, marginBottom: 12 }}>
              {err}
            </div>
          )}

          <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>
            {busy ? <Spin /> : (tab === 'in' ? 'Sign in' : 'Create account')}
          </button>
          <p style={{ fontSize: 12.5, color: 'var(--muted-2)', textAlign: 'center', marginTop: 14 }}>
            By continuing you agree to JR Importers&apos; terms &amp; privacy policy.
          </p>
        </form>
      </div>
    </div>
  );
}
