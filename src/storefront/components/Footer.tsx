import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { config } from '@/lib/env';

export function Footer() {
  const whatsapp = config.STORE_WHATSAPP_NUMBER.replace(/\D/g, '');
  const year = new Date().getFullYear();

  return (
    <footer className="coast-footer">
      <div className="coast-shell-width">
        <div className="coast-footer-intro">
          <div>
            <p className="coast-footer-eyebrow"><span className="coast-live-dot" />Rooted in Walvis Bay</p>
            <h2>Good tech.<br /><span>Closer to home.</span></h2>
          </div>
          <div className="coast-footer-intro-aside">
            <p>Your next phone. A little advice. A repair that keeps you going. It starts with a conversation.</p>
            <Link to="/support">Let’s talk<ArrowUpRight aria-hidden size={20} /></Link>
          </div>
        </div>

        <div className="coast-footer-grid">
          <div className="coast-footer-brand">
            <Link to="/" className="coast-brand coast-brand--footer" aria-label={`${STORE.name} home`}>
              <img src="/logo-mark.png" alt="" width={31} height={56} loading="lazy" />
              <span className="coast-brand-wordmark">JR<span>IMPORTERS</span></span>
            </Link>
            <p>Cellphone specialists in {STORE.city}. Imported Samsung and Ulefone handsets, checked against their IMEI, with repairs done in-house.</p>
            <span className="coast-footer-country">Walvis Bay, Namibia<ArrowUpRight aria-hidden size={13} /></span>
          </div>
          <nav aria-labelledby="footer-shop">
            <h3 id="footer-shop">Find your next</h3>
            <ul>
              {CATEGORY_GROUPS.map((group) => <li key={group.id}><Link to={`/shop/${group.id}`}>{group.label}</Link></li>)}
              <li><Link to="/account">Track my order</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="footer-company">
            <h3 id="footer-company">Here to help</h3>
            <ul>
              <li><Link to="/about">About us</Link></li>
              <li><Link to="/support">Support &amp; special orders</Link></li>
              <li><a href="/terms.html">Terms &amp; conditions</a></li>
              <li><a href="/privacy.html">Privacy policy</a></li>
            </ul>
          </nav>
          <div className="coast-footer-contact">
            <h3>Come say hello</h3>
            <ul>
              <li><MapPin aria-hidden size={16} /><span>{STORE.address}<br />{STORE.country}</span></li>
              <li><Clock aria-hidden size={16} /><span>{STORE.hours}<br /><small>{STORE.holidays}</small></span></li>
              <li><a href={`tel:${STORE.phone.replace(/\s/g, '')}`}><Phone aria-hidden size={16} />{STORE.phone}</a></li>
              {whatsapp && <li><a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer noopener"><MessageCircle aria-hidden size={16} />WhatsApp us<ArrowUpRight aria-hidden size={12} /></a></li>}
              <li><a href={`mailto:${STORE.email}`}><Mail aria-hidden size={16} /><span>{STORE.email}</span></a></li>
            </ul>
          </div>
        </div>
        <div className="coast-footer-bottom">
          <p>© {year} {STORE.name}. All rights reserved.</p>
          <p>All prices in Namibian Dollar (N$), VAT inclusive.</p>
        </div>
      </div>
    </footer>
  );
}
