import React from 'react';
import { Icon, Stamp } from './ui.jsx';
import { useSettings } from '../lib/store.jsx';

export default function Footer() {
  const s = useSettings();
  const year = new Date().getFullYear();
  return (
    <footer className="ftr">
      <div className="wrap">
        <div className="ftr__grid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="brand__mark" style={{ width: 44, height: 44 }}>J<i style={{ color: 'var(--sun)' }}>R</i></span>
              <Stamp small />
            </div>
            <p className="ftr__lede">{s.store_tagline}. Every device sealed, verified and warrantied — checked against its serial before it leaves the counter.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {s.facebook_url && <a href={s.facebook_url} aria-label="Facebook" style={{ opacity: .85 }}>Facebook</a>}
              {s.instagram_url && <a href={s.instagram_url} aria-label="Instagram" style={{ opacity: .85 }}>Instagram</a>}
            </div>
          </div>

          <div>
            <h4>Shop</h4>
            <a href="#/shop">All products</a>
            <a href="#/shop?category=Smartphones">Smartphones</a>
            <a href="#/shop?category=Laptops">Laptops</a>
            <a href="#/shop?category=Audio">Audio</a>
            <a href="#/shop?category=Tablets">Tablets</a>
          </div>

          <div>
            <h4>Help</h4>
            <a href="#/contact">Contact us</a>
            <a href="#/account">Track an order</a>
            <a href="#/shop">Warranty &amp; returns</a>
            <a href="#/contact">Trade enquiries</a>
          </div>

          <div>
            <h4>Visit the store</h4>
            <a href={`https://maps.google.com/?q=${encodeURIComponent(s.store_address)}`} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <Icon.pin width={15} height={15} style={{ marginTop: 3, flex: 'none' }} />{s.store_address}
            </a>
            <a href={`tel:${s.store_phone}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon.phone width={15} height={15} />{s.store_phone}</a>
            <a href={`mailto:${s.store_email}`} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Icon.mail width={15} height={15} />{s.store_email}</a>
            <a style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'default', opacity: .7 }}><Icon.clock width={15} height={15} />{s.store_hours}</a>
          </div>
        </div>

        <div className="ftr__bottom">
          <span>© {year} {s.bank_account_name || 'JR Importers'} · All rights reserved</span>
          <span>VAT {s.vat_rate}% included · Prices in NAD · Made in Windhoek</span>
        </div>
      </div>
    </footer>
  );
}
