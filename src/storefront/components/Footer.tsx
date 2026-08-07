import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { config } from '@/lib/env';

export function Footer() {
  const whatsapp = config.STORE_WHATSAPP_NUMBER.replace(/\D/g, '');
  const year = new Date().getFullYear();

  return (
    <footer className="relative z-10 mt-4 border-t border-hairline bg-surface/70">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" width={30} height={30} className="h-7 w-7" />
              <span className="font-display text-base font-bold text-brand-700">JR Importers</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Cellphone specialists in {STORE.city}. Imported Samsung and Ulefone handsets, checked
              against their IMEI, with repairs done in-house.
            </p>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className="text-xs font-semibold uppercase tracking-wider text-ink">
              Shop
            </h2>
            <ul className="mt-4 space-y-2.5">
              {CATEGORY_GROUPS.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/shop/${group.id}`}
                    className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/account"
                  className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                >
                  Track my order
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2
              id="footer-company"
              className="text-xs font-semibold uppercase tracking-wider text-ink"
            >
              Company
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                >
                  About us
                </Link>
              </li>
              <li>
                <Link
                  to="/support"
                  className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                >
                  Support &amp; special orders
                </Link>
              </li>
              {/* Static pages, served outside the app bundle. */}
              <li>
                <a
                  href="/terms.html"
                  className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                >
                  Terms &amp; conditions
                </a>
              </li>
              <li>
                <a
                  href="/privacy.html"
                  className="text-sm text-ink-muted transition-colors hover:text-brand-600"
                >
                  Privacy policy
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink">Visit us</h2>
            <ul className="mt-4 space-y-3 text-sm text-ink-muted">
              <li className="flex gap-2.5">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-700" />
                <span>
                  {STORE.address}
                  <br />
                  {STORE.country}
                </span>
              </li>
              <li className="flex gap-2.5">
                <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-700" />
                <span>
                  {STORE.hours}
                  <br />
                  <span className="text-ink-subtle">{STORE.holidays}</span>
                </span>
              </li>
              <li>
                <a
                  href={`tel:${STORE.phone.replace(/\s/g, '')}`}
                  className="flex gap-2.5 transition-colors hover:text-brand-600"
                >
                  <Phone aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-700" />
                  {STORE.phone}
                </a>
              </li>
              {whatsapp && (
                <li>
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex gap-2.5 transition-colors hover:text-brand-600"
                  >
                    <MessageCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-700" />
                    WhatsApp us
                  </a>
                </li>
              )}
              <li>
                <a
                  href={`mailto:${STORE.email}`}
                  className="flex gap-2.5 transition-colors hover:text-brand-600"
                >
                  <Mail aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-700" />
                  <span className="break-all">{STORE.email}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {STORE.name}. All prices in Namibian Dollar (N$), VAT inclusive.
          </p>
          <p>{STORE.address}</p>
        </div>
      </div>
    </footer>
  );
}
