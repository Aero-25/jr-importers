import React, { useState } from 'react';
import { Icon, Stamp } from '../components/ui.jsx';
import { useSettings, useToast } from '../lib/store.jsx';
import { getSupabaseClient } from '../lib/supabase.js';

export default function Contact() {
  const s = useSettings();
  const push = useToast();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const sb = getSupabaseClient();
      const { error } = await sb.from('messages').insert({
        name: form.name.trim(), email: form.email.trim(), message: form.message.trim(),
      });
      if (error) throw error;
      setSent(true);
      push('Message sent — we&apos;ll be in touch');
    } catch (e2) {
      push(e2?.message || 'Could not send your message', 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section wrap">
      <div className="crumb"><a href="#/">Home</a><span>/</span><span style={{ color: 'var(--text)' }}>Contact</span></div>

      <div className="checkout" style={{ alignItems: 'start' }}>
        <div>
          <div className="eyebrow">Talk to us</div>
          <h1 className="section-title" style={{ marginTop: 8 }}>Genuine help, from real people in Walvis Bay.</h1>
          <p className="section-sub" style={{ maxWidth: '54ch' }}>
            Questions about a device, warranty claims, trade pricing or a serial you want verified — we answer fast.
          </p>

          <div style={{ display: 'grid', gap: 12, marginTop: 28, maxWidth: 460 }}>
            <a className="panel" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 0, padding: 18 }} href={`https://wa.me/${s.store_whatsapp}`} target="_blank" rel="noreferrer">
              <span style={{ width: 42, height: 42, borderRadius: 12, background: '#25D366', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon.whatsapp width={22} height={22} /></span>
              <div><b>WhatsApp us</b><div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>Fastest reply · +{s.store_whatsapp}</div></div>
            </a>
            <a className="panel" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 0, padding: 18 }} href={`tel:${s.store_phone}`}>
              <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--cobalt-tint)', color: 'var(--cobalt)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon.phone width={20} height={20} /></span>
              <div><b>Call the store</b><div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.store_phone}</div></div>
            </a>
            <a className="panel" style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 0, padding: 18 }} href={`https://maps.google.com/?q=${encodeURIComponent(s.store_address)}`} target="_blank" rel="noreferrer">
              <span style={{ width: 42, height: 42, borderRadius: 12, background: 'var(--sun-tint)', color: 'var(--sun-deep)', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon.pin width={20} height={20} /></span>
              <div><b>Visit us</b><div className="mono" style={{ fontSize: 12.5, color: 'var(--muted)' }}>{s.store_address}</div></div>
            </a>
          </div>
        </div>

        <aside className="summary">
          <div className="panel">
            {sent ? (
              <div style={{ textAlign: 'center', padding: '20px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'center' }}><Stamp small /></div>
                <h3 className="display" style={{ fontSize: 22, fontWeight: 800, marginTop: 16 }}>Message sent</h3>
                <p style={{ color: 'var(--muted)', marginTop: 6 }}>Thanks {form.name.split(' ')[0] || 'there'} — we&apos;ll reply to {form.email} soon.</p>
                <button className="btn btn--ghost" style={{ marginTop: 18 }} onClick={() => { setSent(false); setForm({ name: '', email: '', message: '' }); }}>Send another</button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <div className="panel__h" style={{ marginBottom: 16 }}><h2 style={{ fontSize: 18 }}>Send a message</h2></div>
                <div className="field"><label htmlFor="ct-name">Your name</label><input id="ct-name" value={form.name} onChange={set('name')} required autoComplete="name" /></div>
                <div className="field"><label htmlFor="ct-email">Email</label><input id="ct-email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></div>
                <div className="field"><label htmlFor="ct-msg">How can we help?</label><textarea id="ct-msg" rows={5} value={form.message} onChange={set('message')} required placeholder="Tell us what you're after…" /></div>
                <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send message'}</button>
              </form>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
