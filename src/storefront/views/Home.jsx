import React, { useMemo } from 'react';
import { Icon, Stamp } from '../components/ui.jsx';
import ProductCard, { CardSkeleton } from '../components/ProductCard.jsx';
import { useCatalog, useSettings, navigate } from '../lib/store.jsx';
import { money, primaryImage } from '../lib/format.js';

const CATEGORY_ART = {
  Smartphones: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=600&q=80',
  Laptops: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=600&q=80',
  Tablets: 'https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0?w=600&q=80',
  Audio: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=600&q=80',
  Gaming: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?w=600&q=80',
  Cameras: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=600&q=80',
  'Smart Home': 'https://images.unsplash.com/photo-1558002038-1055907df827?w=600&q=80',
  'Car Tech': 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=600&q=80',
};

export default function Home() {
  const { products, loading, categories } = useCatalog();
  const s = useSettings();

  const featured = useMemo(() => {
    const f = products.filter((p) => p.featured && Number(p.stock) > 0);
    return (f.length ? f : products).slice(0, 8);
  }, [products]);

  const heroProduct = featured[0] || products[0];
  const newArrivals = useMemo(() => products.slice(0, 4), [products]);

  const stats = useMemo(() => ({
    units: products.reduce((n, p) => n + Math.max(0, Number(p.stock || 0)), 0),
    brands: new Set(products.map((p) => p.brand).filter(Boolean)).size,
    lines: products.length,
  }), [products]);

  const topCategories = categories
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return (
    <>
      {/* ===================================================== hero / thesis */}
      <section className="hero">
        <div className="hero__grid-bg" aria-hidden="true" />
        <div className="wrap hero__inner">
          <div>
            <div className="hero__manifest">
              <span>MANIFEST · WDH-{new Date().getFullYear()}</span>
              <span><b>{stats.lines}</b> lines</span>
              <span><b>{stats.brands}</b> brands</span>
              <span><b>{stats.units}</b> units in stock</span>
            </div>
            <h1>Genuine tech,<br />landed in <em>Walvis Bay</em>.</h1>
            <p className="hero__lede">
              {s.store_tagline}. Every phone, laptop and earbud is imported sealed,
              checked against its serial and warrantied — no grey imports, no surprises.
            </p>
            <div className="hero__cta">
              <button className="btn btn--primary btn--lg" onClick={() => navigate('/shop')}>
                Shop the catalogue <Icon.arrow width={18} height={18} />
              </button>
              <button className="btn btn--ghost-ink btn--lg" onClick={() => navigate('/shop?category=Smartphones')}>
                Browse smartphones
              </button>
            </div>
            <dl className="hero__trust">
              <div><dt>{s.vat_rate}%</dt><dd>VAT included</dd></div>
              <div><dt>N${money(s.free_delivery_threshold)}+</dt><dd>Free delivery</dd></div>
              <div><dt>100%</dt><dd>Sealed &amp; verified</dd></div>
            </dl>
          </div>

          {heroProduct && (
            <div className="hero__card">
              <Stamp />
              <a className="hero__card-media" href={`#/product/${heroProduct.id}`}>
                {primaryImage(heroProduct)
                  ? <img src={primaryImage(heroProduct)} alt={heroProduct.name} />
                  : null}
              </a>
              <div className="hero__card-row">
                <div>
                  <div className="hero__card-sku">{heroProduct.sku || 'JR-FEATURED'}</div>
                  <h3>{heroProduct.name}</h3>
                </div>
                <div className="price"><small>N$</small>{money(heroProduct.price)}</div>
              </div>
              <button className="btn btn--ink btn--block" style={{ marginTop: 16 }} onClick={() => navigate(`/product/${heroProduct.id}`)}>
                View this device <Icon.arrow width={17} height={17} />
              </button>
            </div>
          )}
        </div>
      </section>

      {/* ===================================================== value strip */}
      <section className="wrap" style={{ marginTop: -34, position: 'relative', zIndex: 5 }}>
        <div className="values">
          {[
            [Icon.shield, 'Genuine or your money back', 'Sealed, serial-checked stock with manufacturer warranty on every device.'],
            [Icon.truck, 'Nationwide delivery', `Door-to-door across Namibia. Free over N$${money(s.free_delivery_threshold)}.`],
            [Icon.tag, 'Real Walvis Bay prices', 'Imported direct, priced in Namibian Dollar — VAT already in.'],
            [Icon.phone, 'Talk to a human', `Call ${s.store_phone} or message us on WhatsApp any time.`],
          ].map(([I, h, p], i) => (
            <div className="value" key={i}>
              <I className="value__ico" />
              <h4>{h}</h4>
              <p>{p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===================================================== categories */}
      <section className="section wrap">
        <div className="section-head">
          <div>
            <div className="eyebrow">The aisles</div>
            <h2 className="section-title">Shop by category</h2>
          </div>
          <a className="btn btn--ghost" href="#/shop">All products <Icon.arrow width={16} height={16} /></a>
        </div>
        <div className="cats">
          {topCategories.map((c, i) => (
            <a className="cat" key={c.name} href={`#/shop?category=${encodeURIComponent(c.name)}`}>
              {CATEGORY_ART[c.name] && <img className="cat__bg" src={CATEGORY_ART[c.name]} alt="" loading="lazy" />}
              <span className="cat__no">{String(i + 1).padStart(2, '0')}</span>
              <span className="cat__name">{c.name}</span>
              <span className="cat__count">{c.count} {c.count === 1 ? 'product' : 'products'}</span>
            </a>
          ))}
        </div>
      </section>

      {/* ===================================================== featured */}
      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <div>
            <div className="eyebrow">Stamped &amp; verified</div>
            <h2 className="section-title">Featured this week</h2>
            <p className="section-sub">Hand-picked flagships and best-sellers — all in stock and ready to ship today.</p>
          </div>
          <a className="btn btn--ghost" href="#/shop">See everything <Icon.arrow width={16} height={16} /></a>
        </div>
        <div className="grid grid--cards">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)
            : featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* ===================================================== promise band */}
      <section className="section wrap" style={{ paddingTop: 0 }}>
        <div style={{
          background: 'var(--ink)', color: 'var(--on-ink)', borderRadius: 'var(--r-lg)',
          padding: 'clamp(32px, 5vw, 56px)', display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          gap: 32, alignItems: 'center',
        }} className="promise-band">
          <Stamp />
          <div>
            <div className="eyebrow" style={{ color: 'var(--sun)' }}>The JR promise</div>
            <h3 className="display" style={{ fontSize: 'clamp(22px,3vw,32px)', fontWeight: 800, marginTop: 8 }}>
              We check the serial so you don&apos;t have to.
            </h3>
            <p style={{ color: 'var(--on-ink-mut)', marginTop: 10, maxWidth: '54ch' }}>
              Counterfeit and grey-import phones are everywhere. Every JR device is logged by IMEI
              and serial number, sealed in box, and backed by a real warranty you can claim in Walvis Bay.
            </p>
          </div>
          <a className="btn btn--primary btn--lg" href="#/contact" style={{ flex: 'none' }}>
            Verify with us <Icon.arrow width={18} height={18} />
          </a>
        </div>
      </section>

      {/* ===================================================== latest */}
      {newArrivals.length > 0 && (
        <section className="section wrap" style={{ paddingTop: 0 }}>
          <div className="section-head">
            <div>
              <div className="eyebrow">Fresh off the manifest</div>
              <h2 className="section-title">Just landed</h2>
            </div>
          </div>
          <div className="grid grid--cards">
            {newArrivals.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </>
  );
}
