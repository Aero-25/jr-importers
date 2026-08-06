import { Link } from 'react-router-dom';
import { MessageCircle, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { config } from '@/lib/env';

const TRUST = [
  { icon: Truck, title: 'Nationwide delivery', detail: 'Courier to all 14 regions' },
  { icon: ShieldCheck, title: 'Genuine stock', detail: 'Imported, tested, warrantied' },
  { icon: Wallet, title: 'Flexible payment', detail: 'Card, EFT, cash or layby' },
];

export function Footer() {
  const whatsapp = config.STORE_WHATSAPP_NUMBER;

  return (
    <footer className="mt-16 border-t border-hairline bg-surface">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ul className="grid gap-4 border-b border-hairline pb-8 sm:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="flex items-start gap-3">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-brand-400" />
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="text-xs text-ink-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="grid gap-8 py-8 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
              <span className="font-display text-base font-bold text-ink">JR Importers</span>
            </div>
            <p className="mt-3 text-sm text-ink-muted">
              {STORE.tagline}. Imported electronics at import prices, shipped from{' '}
              {STORE.city} across {STORE.country}.
            </p>
          </div>

          <nav aria-labelledby="footer-shop">
            <h2 id="footer-shop" className="text-xs font-semibold uppercase tracking-wide text-ink">
              Shop
            </h2>
            <ul className="mt-3 space-y-2">
              {CATEGORY_GROUPS.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/shop/${group.id}`}
                    className="text-sm text-ink-muted transition-colors hover:text-ink"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-help">
            <h2 id="footer-help" className="text-xs font-semibold uppercase tracking-wide text-ink">
              Help
            </h2>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/support" className="text-sm text-ink-muted hover:text-ink">
                  Support &amp; requests
                </Link>
              </li>
              <li>
                <Link to="/account" className="text-sm text-ink-muted hover:text-ink">
                  Track my order
                </Link>
              </li>
              <li>
                <a href="/terms.html" className="text-sm text-ink-muted hover:text-ink">
                  Terms &amp; conditions
                </a>
              </li>
              <li>
                <a href="/privacy.html" className="text-sm text-ink-muted hover:text-ink">
                  Privacy policy
                </a>
              </li>
            </ul>
          </nav>

          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-ink">Talk to us</h2>
            {whatsapp ? (
              <a
                href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm text-ink transition-colors hover:bg-overlay"
              >
                <MessageCircle aria-hidden className="h-4 w-4 text-success" />
                WhatsApp us
              </a>
            ) : (
              <p className="mt-3 text-sm text-ink-muted">
                Send a message from the{' '}
                <Link to="/support" className="text-brand-400 hover:underline">
                  support page
                </Link>
                .
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-hairline pt-6 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {STORE.name}. All prices in Namibian Dollar (N$), VAT
            inclusive.
          </p>
          <p>Windhoek, Namibia</p>
        </div>
      </div>
    </footer>
  );
}
