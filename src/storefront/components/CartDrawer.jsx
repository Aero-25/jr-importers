import React, { useEffect } from 'react';
import { Icon } from './ui.jsx';
import { useCart, useSettings, navigate } from '../lib/store.jsx';
import { money, money2 } from '../lib/format.js';

export default function CartDrawer() {
  const cart = useCart();
  const s = useSettings();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') cart.setOpen(false); };
    if (cart.open) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', onKey);
    }
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', onKey); };
  }, [cart.open]);

  if (!cart.open) return null;

  const threshold = Number(s.free_delivery_threshold || 0);
  const remaining = Math.max(0, threshold - cart.subtotal);
  const pct = threshold ? Math.min(100, (cart.subtotal / threshold) * 100) : 100;
  const delivery = cart.subtotal >= threshold ? 0 : Number(s.delivery_fee || 0);

  const goCheckout = () => { cart.setOpen(false); navigate('/checkout'); };

  return (
    <>
      <div className="scrim" onClick={() => cart.setOpen(false)} />
      <aside className="drawer" role="dialog" aria-label="Shopping cart" aria-modal="true">
        <div className="drawer__head">
          <h2>Your cart {cart.count > 0 && <span className="mono" style={{ fontSize: 13, color: 'var(--muted)' }}>· {cart.count}</span>}</h2>
          <button className="icon-btn" onClick={() => cart.setOpen(false)} aria-label="Close cart"><Icon.close /></button>
        </div>

        {cart.items.length === 0 ? (
          <div className="empty" style={{ margin: 'auto' }}>
            <Icon.bag />
            <h3>Your cart is empty</h3>
            <p>Genuine phones, laptops and audio — all sealed and warrantied.</p>
            <button className="btn btn--primary" style={{ marginTop: 18 }} onClick={() => { cart.setOpen(false); navigate('/shop'); }}>
              Browse the catalogue <Icon.arrow width={17} height={17} />
            </button>
          </div>
        ) : (
          <>
            <div className="drawer__body">
              {cart.items.map((l) => (
                <div className="line" key={l.id}>
                  <a className="line__img" href={`#/product/${l.id}`} onClick={() => cart.setOpen(false)}>
                    {l.image ? <img src={l.image} alt="" /> : null}
                  </a>
                  <div>
                    <div className="line__name">{l.name}</div>
                    {l.sku && <div className="line__sku">{l.sku}</div>}
                    <div className="line__qty">
                      <button onClick={() => cart.setQty(l.id, l.qty - 1)} aria-label="Decrease quantity"><Icon.minus width={14} height={14} /></button>
                      <span>{l.qty}</span>
                      <button onClick={() => cart.setQty(l.id, l.qty + 1)} aria-label="Increase quantity" disabled={l.qty >= l.stock}><Icon.plus width={14} height={14} /></button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div className="line__price">N${money(l.qty * l.price)}</div>
                    <button className="line__rm" onClick={() => cart.remove(l.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="drawer__foot">
              {threshold > 0 && (
                <div className="freeship">
                  {remaining > 0
                    ? <>Add <b>N${money(remaining)}</b> more for free delivery</>
                    : <>You&apos;ve unlocked free delivery 🎉</>}
                  <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                </div>
              )}
              <div className="totals">
                <div className="totals__row"><span>Subtotal</span><span>N${money2(cart.subtotal)}</span></div>
                <div className="totals__row"><span>Delivery (est.)</span><span>{delivery === 0 ? 'Free' : `N$${money2(delivery)}`}</span></div>
                <div className="totals__row totals__row--big"><span>Total</span><span>N${money(cart.subtotal + delivery)}</span></div>
              </div>
              <button className="btn btn--primary btn--block btn--lg" onClick={goCheckout}>
                Checkout <Icon.arrow width={18} height={18} />
              </button>
              <p className="mono" style={{ fontSize: 11, color: 'var(--muted-2)', textAlign: 'center', marginTop: 12 }}>
                VAT {s.vat_rate}% included · Secure EFT &amp; card
              </p>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
