import { Link } from 'react-router-dom';
import { Clock, Mail, MapPin, MessageCircle, Phone, ShieldCheck, Truck, Wrench } from 'lucide-react';
import { STORE } from '@/lib/constants';
import { config } from '@/lib/env';
import { useReveal } from '@/ui/effects';
import { useSeo } from '../seo';

const PROMISES = [
  {
    icon: ShieldCheck,
    title: 'Every handset is checked',
    body: 'Each phone is powered up, tested and recorded against its IMEI before it goes on the shelf. If it does not pass, it does not get sold.',
  },
  {
    icon: Truck,
    title: 'Delivered countrywide',
    body: 'Courier to all fourteen regions, or collect from the counter the same day if the handset is in stock.',
  },
  {
    icon: Wrench,
    title: 'We fix them too',
    body: 'Screens, batteries and data recovery are done in-house. You get a job card by WhatsApp to sign and track.',
  },
];

export default function About() {
  useSeo({
    title: `About ${STORE.name} — ${STORE.city}`,
    description: `JR Importers is a cellphone specialist at ${STORE.address}. Imported Samsung and Ulefone handsets, checked against their IMEI, with in-house repairs.`,
    path: '/about',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'MobilePhoneStore',
      name: STORE.name,
      telephone: STORE.phone,
      email: STORE.email,
      url: `${config.SITE_URL}/about`,
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Pelican Mall',
        addressLocality: STORE.city,
        addressCountry: 'NA',
      },
      openingHours: ['Mo-Fr 09:00-17:00', 'Sa 09:00-12:00'],
      areaServed: { '@type': 'Country', name: STORE.country },
    },
  });

  const root = useReveal<HTMLDivElement>();
  const whatsapp = config.STORE_WHATSAPP_NUMBER.replace(/\D/g, '');

  return (
    <div ref={root} className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <header className="reveal max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-lime-700">
          About {STORE.name}
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold leading-tight tracking-tight text-brand-700 sm:text-5xl">
          The cellphone shop in {STORE.city}.
        </h1>
        <p className="mt-5 text-base leading-relaxed text-ink-muted sm:text-lg">
          We import Samsung and Ulefone handsets directly and sell them at import prices. Every
          phone that reaches the shelf has been powered up, checked and logged against its IMEI, so
          what you buy is traceable — no grey stock, no guesswork.
        </p>
      </header>

      {/* ── Find us ─────────────────────────────────────────────────────── */}
      <section className="reveal mt-10" data-reveal-index="1">
        <div className="glass grid gap-6 rounded-3xl p-7 sm:grid-cols-2 sm:p-9">
          <div>
            <h2 className="font-display text-xl font-bold text-brand-700">Find us</h2>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex gap-3">
                <MapPin aria-hidden className="mt-0.5 h-4.5 w-4.5 shrink-0 text-lime-700" />
                <div>
                  <dt className="font-semibold text-ink">Address</dt>
                  <dd className="text-ink-muted">
                    {STORE.address}
                    <br />
                    {STORE.country}
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <Clock aria-hidden className="mt-0.5 h-4.5 w-4.5 shrink-0 text-lime-700" />
                <div>
                  <dt className="font-semibold text-ink">Opening hours</dt>
                  <dd className="text-ink-muted">
                    {STORE.hours}
                    <br />
                    <span className="text-ink-subtle">{STORE.holidays}</span>
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <div>
            <h2 className="font-display text-xl font-bold text-brand-700">Talk to us</h2>
            <ul className="mt-4 space-y-3 text-sm">
              <li>
                <a
                  href={`tel:${STORE.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-3 rounded-xl border border-hairline px-4 py-3 transition-colors hover:border-brand-400 hover:bg-raised"
                >
                  <Phone aria-hidden className="h-4 w-4 text-lime-700" />
                  <span className="font-medium text-ink">{STORE.phone}</span>
                </a>
              </li>
              {whatsapp && (
                <li>
                  <a
                    href={`https://wa.me/${whatsapp}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="flex items-center gap-3 rounded-xl border border-hairline px-4 py-3 transition-colors hover:border-brand-400 hover:bg-raised"
                  >
                    <MessageCircle aria-hidden className="h-4 w-4 text-lime-700" />
                    <span className="font-medium text-ink">WhatsApp us</span>
                  </a>
                </li>
              )}
              <li>
                <a
                  href={`mailto:${STORE.email}`}
                  className="flex items-center gap-3 rounded-xl border border-hairline px-4 py-3 transition-colors hover:border-brand-400 hover:bg-raised"
                >
                  <Mail aria-hidden className="h-4 w-4 text-lime-700" />
                  <span className="break-all font-medium text-ink">{STORE.email}</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── What you get ────────────────────────────────────────────────── */}
      <section className="mt-12">
        <h2 className="reveal font-display text-2xl font-bold tracking-tight text-brand-700">
          What you get from us
        </h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, body }, index) => (
            <li key={title} className="reveal" data-reveal-index={index}>
              <div className="glass h-full rounded-2xl p-6">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-500 text-brand-800"
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <h3 className="mt-4 font-display text-base font-bold text-ink">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="reveal mt-12">
        <div className="rounded-2xl border border-hairline p-6 text-sm text-ink-muted">
          <p>
            Prices are in Namibian Dollar and include VAT. Our{' '}
            <a href="/terms.html" className="font-medium text-brand-600 underline">
              terms &amp; conditions
            </a>{' '}
            and{' '}
            <a href="/privacy.html" className="font-medium text-brand-600 underline">
              privacy policy
            </a>{' '}
            set out how we handle sales, repairs and your details.
          </p>
          <Link
            to="/shop/phones"
            className="mt-4 inline-flex h-11 items-center rounded-full bg-brand-600 px-6 text-sm font-semibold text-white transition-colors hover:bg-brand-500"
          >
            Browse the phones
          </Link>
        </div>
      </section>
    </div>
  );
}
