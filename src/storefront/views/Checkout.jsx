import React, { useState, useMemo, useEffect } from 'react';
import { Icon, Stamp, Spin } from '../components/ui.jsx';
import { useCart, useAuth, useSettings, useToast, navigate } from '../lib/store.jsx';
import { getSupabaseClient } from '../lib/supabase.js';
import { money, money2, orderRef } from '../lib/format.js';

const REGIONS = ['Khomas', 'Erongo', 'Oshana', 'Otjozondjupa', 'Hardap', 'Karas', 'Kavango East', 'Kunene', 'Omaheke', 'Omusati', 'Oshikoto', 'Ohangwena', 'Zambezi'];

export default function Checkout() {
  const cart = useCart();
  const auth = useAuth();
  const s = useSettings();
  const push = useToast();

  const [delivery, setDelivery] = useState('Delivery'); // Delivery | Collection
  const [payment, setPayment] = useState('EFT');         // EFT | Collection | OnDelivery
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', city: '', region: 'Khomas', notes: '' });
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState(null);
  const [couponErr, setCouponErr] = useState('');
  const [couponBusy, setCouponBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [done, setDone] = useState(null);

  // Prefill from the signed-in user.
  useEffect(() => {
    if (auth.user) {
      const m = auth.user.user_metadata || {};
      setForm((f) => ({
        ...f,
        name: f.name || m.name || '',
        email: f.email || auth.user.email || '',
        phone: f.phone || m.phone || '',
      }));
    }
  }, [auth.user]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const deliveryFee = useMemo(() => {
    if (delivery === 'Collection') return 0;
    return cart.subtotal >= Number(s.free_delivery_threshold || 0) ? 0 : Number(s.delivery_fee || 0);
  }, [delivery, cart.subtotal, s]);

  const discount = applied ? Number(applied.discount_amount || 0) : 0;
  const gross = Math.max(0, cart.subtotal + deliveryFee - discount);
  const vatRate = Number(s.vat_rate || 15);
  const vat = +(gross * (vatRate / (100 + vatRate))).toFixed(2);
  const net = +(gross - vat).toFixed(2);

  const applyCoupon = async () => {
    const code = coupon.trim();
    if (!code) return;
    setCouponBusy(true); setCouponErr('');
    try {
      const sb = getSupabaseClient();
      const { data, error } = await sb.rpc('validate_coupon', { p_code: code, p_cart_total: cart.subtotal });
      if (error) throw error;
      if (data?.valid) { setApplied(data); push(`Coupon ${data.code} applied`); }
      else { setApplied(null); setCouponErr(data?.message || 'Coupon is invalid'); }
    } catch (e) {
      setCouponErr(e?.message || 'Could not validate coupon');
    } finally {
      setCouponBusy(false);
    }
  };

  const placeOrder = async (e) => {
    e.preventDefault();
    if (!auth.user) { auth.setModalOpen(true); push('Please sign in to place your order', 'err'); return; }
    setPlacing(true);
    try {
      const sb = getSupabaseClient();
      const payload = {
        user_id: auth.user.id,
        customer_name: form.name.trim(),
        customer_email: form.email.trim(),
        customer_phone: form.phone.trim(),
        customer_city: form.city.trim(),
        customer_region: form.region,
        delivery_address: delivery === 'Delivery' ? form.address.trim() : null,
        delivery_method: delivery,
        items: cart.items.map((l) => ({ product_id: l.id, name: l.name, sku: l.sku, price: l.price, quantity: l.qty })),
        subtotal: cart.subtotal,
        subtotal_amount: net,
        vat_amount: vat,
        total_amount: gross,
        payment_method: payment,
        status: 'Pending',
        coupon_code: applied?.code || null,
        coupon_discount: discount || null,
        notes: form.notes.trim() || null,
      };
      const { data, error } = await sb.from('orders').insert(payload).select('id').single();
      if (error) throw error;
      setDone({ id: data.id, total: gross, payment });
      cart.clear();
      window.scrollTo({ top: 0 });
    } catch (e2) {
      push(e2?.message || 'We could not place your order. Please try again.', 'err');
    } finally {
      setPlacing(false);
    }
  };

  /* ----------------------------------------------------- confirmation */
  if (done) {
    return (
      <section className="section wrap" style={{ maxWidth: 720 }}>
        <div className="panel" style={{ textAlign: 'center', padding: 'clamp(32px,5vw,52px)' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}><Stamp /></div>
          <div className="eyebrow" style={{ marginTop: 18 }}>Order received</div>
          <h1 className="display" style={{ fontSize: 'clamp(26px,4vw,38px)', fontWeight: 800, margin: '10px 0' }}>Thank you — we&apos;re on it.</h1>
          <p style={{ color: 'var(--muted)', maxWidth: '46ch', margin: '0 auto' }}>
            Your order <strong className="mono">{orderRef(done.id)}</strong> is logged. We&apos;ll verify stock and confirm by phone or email shortly.
          </p>

          {done.payment === 'EFT' && (
            <div className="bank" style={{ textAlign: 'left', marginTop: 24 }}>
              <div style={{ justifyContent: 'flex-start', gap: 8 }}><Icon.tag width={15} height={15} /> <strong>Pay by EFT — use {orderRef(done.id)} as reference</strong></div>
              <div><span>Bank</span><span>{s.bank_name}</span></div>
              <div><span>Account name</span><span>{s.bank_account_name}</span></div>
              <div><span>Account number</span><span>{s.bank_account_number}</span></div>
              <div><span>Branch code</span><span>{s.bank_branch_code}</span></div>
              <div><span>Amount</span><span>N${money2(done.total)}</span></div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" onClick={() => navigate('/account')}>Track my order <Icon.arrow width={17} height={17} /></button>
            <button className="btn btn--ghost" onClick={() => navigate('/shop')}>Keep shopping</button>
          </div>
        </div>
      </section>
    );
  }

  if (cart.items.length === 0) {
    return (
      <section className="section wrap">
        <div className="empty">
          <Icon.bag />
          <h3>Your cart is empty</h3>
          <p>Add a device to start your order.</p>
          <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/shop')}>Browse the catalogue</button>
        </div>
      </section>
    );
  }

  return (
    <section className="section wrap">
      <div className="crumb"><a href="#/">Home</a><span>/</span><a href="#/shop">Shop</a><span>/</span><span style={{ color: 'var(--text)' }}>Checkout</span></div>
      <div className="section-head" style={{ marginBottom: 24 }}>
        <div><div className="eyebrow">Almost there</div><h1 className="section-title">Checkout</h1></div>
      </div>

      <form className="checkout" onSubmit={placeOrder}>
        {/* --------------------------------------------------- left: details */}
        <div>
          {!auth.user && (
            <div className="panel" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', background: 'var(--cobalt-tint)', borderColor: '#C9D8FF' }}>
              <div><strong>Have an account?</strong><p style={{ color: 'var(--muted)', fontSize: 14 }}>Sign in to check out faster and track this order.</p></div>
              <button type="button" className="btn btn--primary" onClick={() => auth.setModalOpen(true)}>Sign in</button>
            </div>
          )}

          <div className="panel">
            <div className="panel__h"><span className="panel__no">1</span><h2>Delivery method</h2></div>
            <div className="pay-opt" data-on={delivery === 'Delivery'} onClick={() => setDelivery('Delivery')} style={delivery === 'Delivery' ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-tint)' } : null}>
              <input type="radio" name="del" checked={delivery === 'Delivery'} onChange={() => setDelivery('Delivery')} />
              <div><b>Deliver to me</b><p>Door-to-door across Namibia. Free over N${money(s.free_delivery_threshold)}, otherwise N${money(s.delivery_fee)}.</p></div>
            </div>
            <div className="pay-opt" onClick={() => setDelivery('Collection')} style={delivery === 'Collection' ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-tint)' } : null}>
              <input type="radio" name="del" checked={delivery === 'Collection'} onChange={() => setDelivery('Collection')} />
              <div><b>Collect in Windhoek</b><p>Pick up free from {s.store_address}. {s.store_hours}.</p></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel__h"><span className="panel__no">2</span><h2>Your details</h2></div>
            <div className="field-row">
              <div className="field"><label htmlFor="co-name">Full name</label><input id="co-name" value={form.name} onChange={set('name')} required autoComplete="name" /></div>
              <div className="field"><label htmlFor="co-phone">Phone</label><input id="co-phone" value={form.phone} onChange={set('phone')} required inputMode="tel" autoComplete="tel" placeholder="+264 …" /></div>
            </div>
            <div className="field"><label htmlFor="co-email">Email</label><input id="co-email" type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></div>
            {delivery === 'Delivery' && (
              <>
                <div className="field"><label htmlFor="co-addr">Delivery address</label><input id="co-addr" value={form.address} onChange={set('address')} required autoComplete="street-address" placeholder="Street, suburb, unit…" /></div>
                <div className="field-row">
                  <div className="field"><label htmlFor="co-city">Town / city</label><input id="co-city" value={form.city} onChange={set('city')} required autoComplete="address-level2" /></div>
                  <div className="field"><label htmlFor="co-region">Region</label>
                    <select id="co-region" value={form.region} onChange={set('region')}>{REGIONS.map((r) => <option key={r}>{r}</option>)}</select>
                  </div>
                </div>
              </>
            )}
            <div className="field"><label htmlFor="co-notes">Order notes (optional)</label><textarea id="co-notes" rows={2} value={form.notes} onChange={set('notes')} placeholder="Delivery instructions, preferred colour, etc." /></div>
          </div>

          <div className="panel">
            <div className="panel__h"><span className="panel__no">3</span><h2>Payment</h2></div>
            <div className="pay-opt" onClick={() => setPayment('EFT')} style={payment === 'EFT' ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-tint)' } : null}>
              <input type="radio" name="pay" checked={payment === 'EFT'} onChange={() => setPayment('EFT')} />
              <div><b>EFT / bank transfer</b><p>We&apos;ll show our {s.bank_name} details and your reference after you order.</p></div>
            </div>
            {delivery === 'Collection' && (
              <div className="pay-opt" onClick={() => setPayment('Collection')} style={payment === 'Collection' ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-tint)' } : null}>
                <input type="radio" name="pay" checked={payment === 'Collection'} onChange={() => setPayment('Collection')} />
                <div><b>Pay on collection</b><p>Pay by card or cash when you pick up in-store.</p></div>
              </div>
            )}
            {delivery === 'Delivery' && (
              <div className="pay-opt" onClick={() => setPayment('OnDelivery')} style={payment === 'OnDelivery' ? { borderColor: 'var(--cobalt)', background: 'var(--cobalt-tint)' } : null}>
                <input type="radio" name="pay" checked={payment === 'OnDelivery'} onChange={() => setPayment('OnDelivery')} />
                <div><b>Pay on delivery</b><p>Pay the courier by card or cash when your order arrives.</p></div>
              </div>
            )}
            {payment === 'EFT' && (
              <div className="bank">
                <div><span>Bank</span><span>{s.bank_name}</span></div>
                <div><span>Account name</span><span>{s.bank_account_name}</span></div>
                <div><span>Account number</span><span>{s.bank_account_number}</span></div>
                <div><span>Branch code</span><span>{s.bank_branch_code}</span></div>
              </div>
            )}
          </div>
        </div>

        {/* --------------------------------------------------- right: summary */}
        <aside className="summary">
          <div className="panel">
            <div className="panel__h" style={{ marginBottom: 16 }}><h2 style={{ fontSize: 18 }}>Order summary</h2></div>
            <div className="summary__items">
              {cart.items.map((l) => (
                <div className="line" key={l.id} style={{ gridTemplateColumns: '56px 1fr auto' }}>
                  <div className="line__img" style={{ width: 56, height: 56 }}>{l.image && <img src={l.image} alt="" />}</div>
                  <div><div className="line__name" style={{ fontSize: 13.5 }}>{l.name}</div><div className="line__sku">Qty {l.qty}</div></div>
                  <div className="line__price" style={{ fontSize: 14 }}>N${money(l.qty * l.price)}</div>
                </div>
              ))}
            </div>

            <div className="coupon-row">
              <input value={coupon} onChange={(e) => setCoupon(e.target.value)} placeholder="Coupon code" aria-label="Coupon code" />
              <button type="button" className="btn btn--ink btn--sm" onClick={applyCoupon} disabled={couponBusy || !coupon.trim()}>
                {couponBusy ? <Spin size={15} /> : 'Apply'}
              </button>
            </div>
            {couponErr && <p className="mono" style={{ fontSize: 11.5, color: 'var(--danger)', marginTop: -8, marginBottom: 12 }}>{couponErr}</p>}
            {applied && <p className="mono" style={{ fontSize: 11.5, color: 'var(--ok)', marginTop: -8, marginBottom: 12 }}>✓ {applied.code} — you save N${money(discount)}</p>}

            <div className="totals">
              <div className="totals__row"><span>Subtotal</span><span>N${money2(cart.subtotal)}</span></div>
              {discount > 0 && <div className="totals__row"><span>Discount</span><span>− N${money2(discount)}</span></div>}
              <div className="totals__row"><span>{delivery === 'Collection' ? 'Collection' : 'Delivery'}</span><span>{deliveryFee === 0 ? 'Free' : `N$${money2(deliveryFee)}`}</span></div>
              <div className="totals__row"><span>of which VAT ({vatRate}%)</span><span>N${money2(vat)}</span></div>
              <div className="totals__row totals__row--big"><span>Total</span><span>N${money(gross)}</span></div>
            </div>

            <button className="btn btn--primary btn--block btn--lg" type="submit" disabled={placing}>
              {placing ? <Spin /> : <>Place order · N${money(gross)}</>}
            </button>
            <p className="mono" style={{ fontSize: 11, color: 'var(--muted-2)', textAlign: 'center', marginTop: 12, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
              <Icon.shield width={13} height={13} /> Genuine stock · VAT included · Secure
            </p>
          </div>
        </aside>
      </form>
    </section>
  );
}
