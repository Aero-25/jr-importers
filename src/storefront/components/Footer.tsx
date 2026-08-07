import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, MessageCircle, Phone } from 'lucide-react';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { config } from '@/lib/env';

export function Footer() {
  const whatsapp = config.STORE_WHATSAPP_NUMBER.replace(/\D/g, '');
  const year = new Date().getFullYear();

  return (
    /*
      The same sweep the header wears, inset and rounded to match, so the page
      opens and closes on the same band of colour.

      Every stop in .sweep is deep enough for white to clear 4.5:1, which is
      what makes the light-on-dark treatment below safe. Lime stays an accent
      on icons and never becomes body text — on this ground it would read at
      about 2.7:1.
    */
    <footer className="relative z-10 mt-6 px-3 pb-3 sm:px-4 sm:pb-4">
      <div className="sweep sweep-ring relative mx-auto max-w-7xl rounded-3xl px-6 py-12 sm:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/icon.svg" alt="" width={30} height={30} className="h-7 w-7" />
              <span className="font-display text-base font-bold text-white">
                JR <span className="text-lime-400">Importers</span>
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/75">
              Cellphone specialists in {STORE.city}. Imported Samsung and Ulefone handsets, checked
              against their IMEI, with repairs done in-house.
            </p>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className="text-xs font-semibold uppercase tracking-wider text-lime-400">
              Shop
            </h2>
            <ul className="mt-4 space-y-2.5">
              {CATEGORY_GROUPS.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/shop/${group.id}`}
                    className="text-sm text-white/75 transition-colors hover:text-white"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link
                  to="/account"
                  className="text-sm text-white/75 transition-colors hover:text-white"
                >
                  Track my order
                </Link>
              </li>
            </ul>
          </nav>

          <nav aria-labelledby="footer-company">
            <h2
              id="footer-company"
              className="text-xs font-semibold uppercase tracking-wider text-lime-400"
            >
              Company
            </h2>
            <ul className="mt-4 space-y-2.5">
              <li>
                <Link
                  to="/about"
                  className="text-sm text-white/75 transition-colors hover:text-white"
                >
                  About us
                </Link>
              </li>
              <li>
                <Link
                  to="/support"
                  className="text-sm text-white/75 transition-colors hover:text-white"
                >
                  Support &amp; special orders
                </Link>
              </li>
              {/* Static pages, served outside the app bundle. */}
              <li>
                <a
                  href="/terms.html"
                  className="text-sm text-white/75 transition-colors hover:text-white"
                >
                  Terms &amp; conditions
                </a>
              </li>
              <li>
                <a
                  href="/privacy.html"
                  className="text-sm text-white/75 transition-colors hover:text-white"
                >
                  Privacy policy
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-lime-400">Visit us</h2>
            <ul className="mt-4 space-y-3 text-sm text-white/75">
              <li className="flex gap-2.5">
                <MapPin aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                <span>
                  {STORE.address}
                  <br />
                  {STORE.country}
                </span>
              </li>
              <li className="flex gap-2.5">
                <Clock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                <span>
                  {STORE.hours}
                  <br />
                  <span className="text-white/55">{STORE.holidays}</span>
                </span>
              </li>
              <li>
                <a
                  href={`tel:${STORE.phone.replace(/\s/g, '')}`}
                  className="flex gap-2.5 transition-colors hover:text-white"
                >
                  <Phone aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                  {STORE.phone}
                </a>
              </li>
              {whatsapp && (
                <li>
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex gap-2.5 transition-colors hover:text-white"
                  >
                    <MessageCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                    WhatsApp us
                  </a>
                </li>
              )}
              <li>
                <a
                  href={`mailto:${STORE.email}`}
                  className="flex gap-2.5 transition-colors hover:text-white"
                >
                  <Mail aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-lime-400" />
                  <span className="break-all">{STORE.email}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/15 pt-6 text-xs text-white/55 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {STORE.name}. All prices in Namibian Dollar (N$), VAT inclusive.
          </p>
          <p>{STORE.address}</p>
        </div>
      </div>
    </footer>
  );
}
