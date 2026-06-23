import React, { useState, useEffect } from 'react';
import { Icon } from './ui.jsx';
import { useCart, useAuth, useRouter, useSettings, navigate } from '../lib/store.jsx';

const NAV = [
  { label: 'Shop all', to: '/shop' },
  { label: 'Smartphones', to: '/shop?category=Smartphones' },
  { label: 'Laptops', to: '/shop?category=Laptops' },
  { label: 'Audio', to: '/shop?category=Audio' },
  { label: 'Contact', to: '/contact' },
];

export default function Header() {
  const cart = useCart();
  const auth = useAuth();
  const route = useRouter();
  const settings = useSettings();
  const [q, setQ] = useState('');
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => { setMobileNav(false); }, [route.path]);

  const submitSearch = (e) => {
    e.preventDefault();
    const term = q.trim();
    navigate(term ? `/shop?q=${encodeURIComponent(term)}` : '/shop');
  };

  const tickerItems = [
    ['Free delivery over', `N$${Number(settings.free_delivery_threshold).toLocaleString()}`],
    ['Genuine, sealed & warrantied', '✓'],
    ['Pay by EFT or card', settings.bank_name],
    ['Windhoek pickup', settings.store_hours],
  ];

  return (
    <header className="hdr">
      <div className="hdr__ticker" aria-hidden="true">
        <div className="hdr__ticker-track">
          {[...tickerItems, ...tickerItems].map(([a, b], i) => (
            <span key={i}>{a} <b>{b}</b> <span className="dot">·</span></span>
          ))}
        </div>
      </div>

      <div className="wrap">
        <div className="hdr__bar">
          <a className="brand" href="#/" aria-label="JR Importers home">
            <span className="brand__mark">J<i>R</i></span>
            <span className="brand__name">JR Importers<small>WINDHOEK · NAMIBIA</small></span>
          </a>

          <nav className="hdr__nav" aria-label="Primary">
            {NAV.map((n) => {
              const active = route.path === n.to.split('?')[0] && n.to !== '/shop'
                ? route.path === n.to
                : false;
              return (
                <a key={n.to} className={`hdr__link ${active ? 'is-active' : ''}`} href={`#${n.to}`}>{n.label}</a>
              );
            })}
          </nav>

          <form className="hdr__search" onSubmit={submitSearch} role="search">
            <Icon.search />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search phones, laptops, brands…"
              aria-label="Search products"
            />
          </form>

          <button className="icon-btn" onClick={() => (auth.user ? navigate('/account') : auth.setModalOpen(true))} aria-label={auth.user ? 'My account' : 'Sign in'}>
            <Icon.user />
          </button>

          <button className="icon-btn" onClick={() => cart.setOpen(true)} aria-label={`Cart, ${cart.count} items`}>
            <Icon.cart />
            {cart.count > 0 && <span className="icon-btn__badge">{cart.count}</span>}
          </button>

          <button className="icon-btn hdr__burger" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <Icon.menu />
          </button>
        </div>
      </div>

      {mobileNav && (
        <div className="mnav" role="dialog" aria-label="Menu">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="brand__name">Menu</span>
            <button className="icon-btn" onClick={() => setMobileNav(false)} aria-label="Close menu"><Icon.close /></button>
          </div>
          <form className="hdr__search" onSubmit={submitSearch} role="search" style={{ display: 'block', maxWidth: 'none', marginBottom: 18 }}>
            <Icon.search />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the catalogue…" />
          </form>
          {NAV.map((n) => <a key={n.to} href={`#${n.to}`}>{n.label}</a>)}
          <a href={auth.user ? '#/account' : '#/'} onClick={() => { if (!auth.user) auth.setModalOpen(true); }}>
            {auth.user ? 'My account' : 'Sign in'}
          </a>
        </div>
      )}
    </header>
  );
}
