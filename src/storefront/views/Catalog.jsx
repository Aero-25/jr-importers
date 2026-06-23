import React, { useState, useMemo, useEffect } from 'react';
import { Icon } from '../components/ui.jsx';
import ProductCard, { CardSkeleton } from '../components/ProductCard.jsx';
import { useCatalog, useRouter, navigate } from '../lib/store.jsx';

const SORTS = {
  featured: { label: 'Featured', fn: (a, b) => (b.featured - a.featured) || (new Date(b.created_at) - new Date(a.created_at)) },
  priceAsc: { label: 'Price: low to high', fn: (a, b) => a.price - b.price },
  priceDesc: { label: 'Price: high to low', fn: (a, b) => b.price - a.price },
  nameAsc: { label: 'Name: A–Z', fn: (a, b) => String(a.name).localeCompare(b.name) },
  newest: { label: 'Newest first', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
};

export default function Catalog() {
  const { products, loading, categories, brands } = useCatalog();
  const route = useRouter();

  const initialCategory = route.query.get('category') || '';
  const initialQ = route.query.get('q') || '';

  const [q, setQ] = useState(initialQ);
  const [cats, setCats] = useState(initialCategory ? [initialCategory] : []);
  const [brandSel, setBrandSel] = useState([]);
  const [sort, setSort] = useState('featured');
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');
  const [inStockOnly, setInStockOnly] = useState(false);
  const [mobileFilters, setMobileFilters] = useState(false);

  // Sync when the URL query changes (e.g. clicking a category in the header).
  useEffect(() => {
    setQ(route.query.get('q') || '');
    const c = route.query.get('category');
    setCats(c ? [c] : []);
  }, [route.query.toString()]);

  const toggle = (setter, list, value) =>
    setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    const lo = min === '' ? -Infinity : Number(min);
    const hi = max === '' ? Infinity : Number(max);
    return products.filter((p) => {
      if (cats.length && !cats.includes(p.category)) return false;
      if (brandSel.length && !brandSel.includes(p.brand)) return false;
      if (p.price < lo || p.price > hi) return false;
      if (inStockOnly && Number(p.stock) <= 0) return false;
      if (term) {
        const hay = `${p.name} ${p.brand} ${p.category} ${p.description || ''} ${p.spec_storage || ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    }).sort(SORTS[sort].fn);
  }, [products, q, cats, brandSel, min, max, inStockOnly, sort]);

  const hasFilters = cats.length || brandSel.length || min || max || inStockOnly || q;
  const clearAll = () => { setCats([]); setBrandSel([]); setMin(''); setMax(''); setInStockOnly(false); setQ(''); navigate('/shop'); };

  const heading = cats.length === 1 ? cats[0] : (initialQ ? `Results for “${initialQ}”` : 'All products');

  return (
    <section className="section wrap">
      <div className="crumb">
        <a href="#/">Home</a><span>/</span>
        <a href="#/shop">Shop</a>
        {cats.length === 1 && <><span>/</span><span style={{ color: 'var(--text)' }}>{cats[0]}</span></>}
      </div>

      <div className="section-head" style={{ marginBottom: 24 }}>
        <div>
          <div className="eyebrow">The catalogue</div>
          <h1 className="section-title">{heading}</h1>
        </div>
      </div>

      <div className="catalog">
        {/* ----------------------------------------------------- filters */}
        <aside className={`filters ${mobileFilters ? 'is-open' : ''}`} aria-label="Filters">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 18 }}>Filters</strong>
            {hasFilters ? <button className="mono" style={{ fontSize: 11, color: 'var(--cobalt)' }} onClick={clearAll}>Clear all</button> : null}
          </div>

          <div className="filters__group">
            <div className="filters__h">Availability</div>
            <label className="facet">
              <input type="checkbox" checked={inStockOnly} onChange={() => setInStockOnly((v) => !v)} />
              In stock only
            </label>
          </div>

          <div className="filters__group">
            <div className="filters__h">Category</div>
            {categories.map((c) => (
              <label className="facet" key={c.name}>
                <input type="checkbox" checked={cats.includes(c.name)} onChange={() => toggle(setCats, cats, c.name)} />
                {c.name}<span className="facet__n">{c.count}</span>
              </label>
            ))}
          </div>

          <div className="filters__group">
            <div className="filters__h">Brand</div>
            {brands.slice(0, 10).map((b) => (
              <label className="facet" key={b.name}>
                <input type="checkbox" checked={brandSel.includes(b.name)} onChange={() => toggle(setBrandSel, brandSel, b.name)} />
                {b.name}<span className="facet__n">{b.count}</span>
              </label>
            ))}
          </div>

          <div className="filters__group">
            <div className="filters__h">Price (N$)</div>
            <div className="range-row">
              <input type="number" inputMode="numeric" placeholder="Min" value={min} onChange={(e) => setMin(e.target.value)} aria-label="Minimum price" />
              <span style={{ color: 'var(--muted-2)' }}>–</span>
              <input type="number" inputMode="numeric" placeholder="Max" value={max} onChange={(e) => setMax(e.target.value)} aria-label="Maximum price" />
            </div>
          </div>

          <button className="btn btn--ink btn--block filters-toggle" style={{ marginTop: 18 }} onClick={() => setMobileFilters(false)}>
            Show {filtered.length} results
          </button>
        </aside>

        {/* ----------------------------------------------------- results */}
        <div>
          <div className="catalog__bar">
            <div className="catalog__count"><b>{filtered.length}</b> {filtered.length === 1 ? 'product' : 'products'}</div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn--ghost btn--sm filters-toggle" onClick={() => setMobileFilters(true)}>
                <Icon.tag width={15} height={15} /> Filters
              </button>
              <label className="sr-only" htmlFor="sort">Sort by</label>
              <select id="sort" className="select" value={sort} onChange={(e) => setSort(e.target.value)}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          {hasFilters && (
            <div className="active-filters">
              {q && <span className="fchip">“{q}” <button onClick={() => setQ('')} aria-label="Clear search"><Icon.close width={12} height={12} /></button></span>}
              {cats.map((c) => <span className="fchip" key={c}>{c} <button onClick={() => toggle(setCats, cats, c)} aria-label={`Remove ${c}`}><Icon.close width={12} height={12} /></button></span>)}
              {brandSel.map((b) => <span className="fchip" key={b}>{b} <button onClick={() => toggle(setBrandSel, brandSel, b)} aria-label={`Remove ${b}`}><Icon.close width={12} height={12} /></button></span>)}
              {inStockOnly && <span className="fchip">In stock <button onClick={() => setInStockOnly(false)} aria-label="Remove in stock filter"><Icon.close width={12} height={12} /></button></span>}
              {(min || max) && <span className="fchip">N${min || 0}–{max || '∞'} <button onClick={() => { setMin(''); setMax(''); }} aria-label="Clear price"><Icon.close width={12} height={12} /></button></span>}
            </div>
          )}

          {loading ? (
            <div className="grid grid--cards">{Array.from({ length: 9 }).map((_, i) => <CardSkeleton key={i} />)}</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <Icon.search />
              <h3>Nothing matches yet</h3>
              <p>Try removing a filter or searching a different brand.</p>
              <button className="btn btn--primary" style={{ marginTop: 16 }} onClick={clearAll}>Clear filters</button>
            </div>
          ) : (
            <div className="grid grid--cards">
              {filtered.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>

      {mobileFilters && <div className="scrim" style={{ zIndex: 94 }} onClick={() => setMobileFilters(false)} />}
    </section>
  );
}
