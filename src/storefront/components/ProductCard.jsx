import React from 'react';
import { Icon } from './ui.jsx';
import { useCart, useWishlist } from '../lib/store.jsx';
import { money, primaryImage, quickSpecs, stockState } from '../lib/format.js';

export default function ProductCard({ product }) {
  const cart = useCart();
  const wish = useWishlist();
  const img = primaryImage(product);
  const specs = quickSpecs(product);
  const stock = stockState(product.stock);
  const out = Number(product.stock || 0) <= 0;
  const href = `#/product/${product.id}`;

  return (
    <article className="card">
      <a className="card__media" href={href} aria-label={product.name}>
        {product.featured && <span className="card__tags" style={{ pointerEvents: 'none' }}><span className="tag tag--sun">Featured</span></span>}
        {img
          ? <img src={img} alt={product.name} loading="lazy" />
          : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted-2)' }}><Icon.box width={40} height={40} /></div>}
      </a>

      <button
        className={`card__fav ${wish.has(product.id) ? 'is-on' : ''}`}
        onClick={() => wish.toggle(product.id)}
        aria-pressed={wish.has(product.id)}
        aria-label={wish.has(product.id) ? 'Remove from saved' : 'Save for later'}
      >
        <Icon.heart width={18} height={18} fill={wish.has(product.id) ? 'currentColor' : 'none'} />
      </button>

      <div className="card__body">
        {product.brand && <div className="card__brand">{product.brand}</div>}
        <h3 className="card__name"><a href={href}>{product.name}</a></h3>

        {specs.length > 0 && (
          <div className="card__specs">
            {specs.map((s) => <span key={s}>{s}</span>)}
          </div>
        )}

        <div className="card__foot">
          <div>
            <div className="price"><small>N$</small>{money(product.price)}</div>
            <div className={`stock-line ${stock.cls}`} style={{ marginTop: 6 }}>{stock.label}</div>
          </div>
          <button
            className="card__add"
            onClick={() => cart.add(product)}
            disabled={out}
            aria-label={`Add ${product.name} to cart`}
            title={out ? 'Out of stock' : 'Add to cart'}
          >
            <Icon.plus />
          </button>
        </div>
      </div>
    </article>
  );
}

export function CardSkeleton() {
  return (
    <div className="card" aria-hidden="true">
      <div className="skeleton sk-card" style={{ borderRadius: 0 }} />
      <div className="card__body">
        <div className="skeleton" style={{ height: 12, width: '40%', borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 16, width: '80%', borderRadius: 6, marginTop: 8 }} />
        <div className="skeleton" style={{ height: 24, width: '50%', borderRadius: 6, marginTop: 20 }} />
      </div>
    </div>
  );
}
