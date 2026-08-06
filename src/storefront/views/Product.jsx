import React, { useState, useMemo, useEffect } from 'react';
import { Icon, Stamp, GenuineChip } from '../components/ui.jsx';
import ProductCard from '../components/ProductCard.jsx';
import { useCatalog, useCart, useWishlist, useSettings, navigate } from '../lib/store.jsx';
import { money, productImages, specRows, stockState } from '../lib/format.js';

export default function Product({ id }) {
  const { products, loading } = useCatalog();
  const cart = useCart();
  const wish = useWishlist();
  const s = useSettings();
  const [qty, setQty] = useState(1);
  const [active, setActive] = useState(0);

  const product = useMemo(() => products.find((p) => String(p.id) === String(id)), [products, id]);

  useEffect(() => { setQty(1); setActive(0); }, [id]);

  if (loading) {
    return (
      <section className="section wrap">
        <div className="pd">
          <div className="skeleton" style={{ aspectRatio: '1/1' }} />
          <div>
            <div className="skeleton" style={{ height: 14, width: '30%', borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 38, width: '85%', borderRadius: 8, marginTop: 14 }} />
            <div className="skeleton" style={{ height: 80, width: '100%', borderRadius: 8, marginTop: 18 }} />
            <div className="skeleton" style={{ height: 52, width: '60%', borderRadius: 999, marginTop: 26 }} />
          </div>
        </div>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="section wrap">
        <div className="empty">
          <Icon.box />
          <h3>We couldn&apos;t find that product</h3>
          <p>It may have sold out or been moved.</p>
          <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={() => navigate('/shop')}>Back to the catalogue</button>
        </div>
      </section>
    );
  }

  const images = productImages(product);
  const rows = specRows(product);
  const stock = stockState(product.stock);
  const out = Number(product.stock || 0) <= 0;
  const related = products
    .filter((p) => p.id !== product.id && p.category === product.category)
    .slice(0, 4);

  const waText = encodeURIComponent(`Hi JR Importers, I'm interested in the ${product.name} (${product.sku || ''}). Is it available?`);

  return (
    <section className="section wrap">
      <div className="crumb">
        <a href="#/">Home</a><span>/</span>
        <a href="#/shop">Shop</a><span>/</span>
        {product.category && <><a href={`#/shop?category=${encodeURIComponent(product.category)}`}>{product.category}</a><span>/</span></>}
        <span style={{ color: 'var(--text)' }}>{product.name}</span>
      </div>

      <div className="pd">
        {/* ----------------------------------------------- gallery */}
        <div className="pd__gallery">
          <div className="pd__stage">
            {images[active]
              ? <img src={images[active]} alt={product.name} />
              : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-2)' }}><Icon.box width={56} height={56} /></div>}
            <Stamp />
          </div>
          {images.length > 1 && (
            <div className="pd__thumbs">
              {images.map((src, i) => (
                <button key={i} className={`pd__thumb ${i === active ? 'is-active' : ''}`} onClick={() => setActive(i)} aria-label={`View image ${i + 1}`}>
                  <img src={src} alt="" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ----------------------------------------------- detail */}
        <div>
          <div className="pd__brand">
            {product.brand && <span className="card__brand" style={{ fontSize: 12 }}>{product.brand}</span>}
            <GenuineChip />
          </div>
          <h1>{product.name}</h1>
          {product.description && <p className="pd__desc">{product.description}</p>}

          <div className="pd__price">
            <span className="price">N${money(product.price)}</span>
            <span className={`stock-line ${stock.cls}`}>{stock.label}</span>
          </div>

          <div className="mono" style={{ fontSize: 12, color: 'var(--muted)', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {product.sku && <span>SKU · {product.sku}</span>}
            {product.color && <span>Colour · {product.color}</span>}
            {product.category && <span>Category · {product.category}</span>}
          </div>

          <div className="pd__buy">
            <div className="qty">
              <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity"><Icon.minus width={18} height={18} /></button>
              <span>{qty}</span>
              <button onClick={() => setQty((q) => Math.min(Number(product.stock) || q + 1, q + 1))} aria-label="Increase quantity" disabled={qty >= Number(product.stock)}><Icon.plus width={18} height={18} /></button>
            </div>
            <button className="btn btn--primary btn--lg" style={{ flex: 1, minWidth: 200 }} disabled={out} onClick={() => cart.add(product, qty)}>
              <Icon.cart width={18} height={18} /> {out ? 'Out of stock' : `Add to cart · N$${money(product.price * qty)}`}
            </button>
            <button className={`btn btn--ghost btn--lg`} onClick={() => wish.toggle(product.id)} aria-pressed={wish.has(product.id)} aria-label="Save for later" style={{ padding: '0 18px' }}>
              <Icon.heart width={20} height={20} fill={wish.has(product.id) ? 'var(--danger)' : 'none'} stroke={wish.has(product.id) ? 'var(--danger)' : 'currentColor'} />
            </button>
          </div>

          <a className="btn btn--ghost btn--block" href={`https://wa.me/${s.store_whatsapp}?text=${waText}`} target="_blank" rel="noreferrer" style={{ justifyContent: 'center' }}>
            <Icon.whatsapp width={18} height={18} /> Ask about this on WhatsApp
          </a>

          {/* assurance */}
          <div className="assure">
            <div><Icon.shield /><b>Genuine &amp; sealed</b><small>Serial-checked, warrantied</small></div>
            <div><Icon.truck /><b>Fast delivery</b><small>Free over N${money(s.free_delivery_threshold)}</small></div>
            <div><Icon.box /><b>Walvis Bay pickup</b><small>{s.store_hours}</small></div>
          </div>

          {/* specs */}
          {rows.length > 0 && (
            <div className="specs">
              <div className="specs__head"><h3>Specifications</h3><span className="mono" style={{ fontSize: 11, color: 'var(--muted-2)' }}>{product.sku}</span></div>
              <dl style={{ margin: 0 }}>
                {rows.map(([label, value]) => (
                  <div className="spec" key={label}><dt>{label}</dt><dd>{value}</dd></div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------------------------- related */}
      {related.length > 0 && (
        <div style={{ marginTop: 64 }}>
          <div className="section-head">
            <div>
              <div className="eyebrow">More in {product.category}</div>
              <h2 className="section-title">You might also like</h2>
            </div>
          </div>
          <div className="grid grid--cards">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      )}
    </section>
  );
}
