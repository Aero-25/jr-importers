import { Link } from 'react-router-dom';
import { ArrowRight, BatteryCharging, ShieldCheck, Smartphone, Truck, Wrench } from 'lucide-react';
import { useCatalog, useFacets } from '@/data/products';
import { PRICE_BANDS, STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { ErrorState } from '@/ui';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { useSeo } from '../seo';

const PROMISES = [
  { icon: Truck, title: 'Nationwide delivery', detail: 'Courier to all 14 regions' },
  { icon: ShieldCheck, title: 'Genuine handsets', detail: 'Imported, tested, warrantied' },
  { icon: Wrench, title: 'We repair too', detail: 'Screens, batteries, data recovery' },
];

export default function Home() {
  useSeo({
    title: 'JR Importers — Cellphones in Namibia',
    description:
      'Imported Samsung and Ulefone smartphones at import prices, from Walvis Bay. Nationwide delivery, genuine stock, and in-house screen and battery repairs.',
    path: '/',
  });

  const phones = useCatalog({ categories: ['Smartphones'], inStockOnly: true, sort: 'price-asc' });
  const brands = useFacets({ categories: ['Smartphones'] });

  const cheapest = phones.data?.[0]?.price;

  return (
    <>
      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="border-b border-hairline">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-lime-500 px-3 py-1 text-xs font-semibold text-brand-800">
              <Smartphone aria-hidden className="h-3.5 w-3.5" />
              Cellphone specialists · {STORE.city}
            </span>

            <h1 className="mt-5 font-display text-4xl font-bold leading-[1.05] tracking-tight text-brand-700 sm:text-6xl">
              The right phone,
              <br />
              <span className="relative inline-block">
                {/* Sits low enough to clear the descender on the 'p'. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0.5 h-2.5 bg-lime-400 sm:bottom-1 sm:h-4"
                />
                <span className="relative">at import prices.</span>
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
              Samsung and Ulefone handsets, imported and tested before they reach you.
              {cheapest ? ` From ${money(cheapest)}.` : ''} Delivered anywhere in {STORE.country},
              or collect from {STORE.address}.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/shop/phones"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-600 px-6 text-base font-semibold text-white shadow-card transition-colors hover:bg-brand-500"
              >
                Browse all phones
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                to="/support"
                className="inline-flex h-12 items-center rounded-xl border border-hairline px-6 text-base font-medium text-ink transition-colors hover:border-brand-400 hover:bg-raised"
              >
                Book a repair
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Shop by budget ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <h2 className="font-display text-2xl font-bold tracking-tight text-brand-700">
          Shop by budget
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Most people arrive with a number in mind rather than a model.
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {PRICE_BANDS.map((band) => {
            const params = new URLSearchParams();
            if ('min' in band && band.min) params.set('min', String(band.min));
            if ('max' in band && band.max) params.set('max', String(band.max));

            return (
              <li key={band.id}>
                <Link
                  to={`/shop/phones?${params.toString()}`}
                  className="group flex h-full flex-col justify-between rounded-card border border-hairline bg-surface p-5 transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lift"
                >
                  <span className="font-display text-lg font-bold text-brand-700">
                    {band.label}
                  </span>
                  <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600">
                    See handsets
                    <ArrowRight
                      aria-hidden
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* ── Shop by brand ─────────────────────────────────────────────────── */}
      {brands.data && brands.data.brands.length > 0 && (
        <section className="border-y border-hairline bg-raised">
          <div className="mx-auto max-w-7xl px-4 py-12">
            <h2 className="font-display text-2xl font-bold tracking-tight text-brand-700">
              Shop by brand
            </h2>

            <ul className="mt-6 flex flex-wrap gap-3">
              {brands.data.brands.map((brand) => (
                <li key={brand.value}>
                  <Link
                    to={`/shop/phones?brand=${encodeURIComponent(brand.value)}`}
                    className="flex items-center gap-3 rounded-card border border-hairline bg-surface px-5 py-3 transition-colors hover:border-brand-400"
                  >
                    <span className="font-display text-base font-bold text-brand-700">
                      {brand.value}
                    </span>
                    <span className="tabular rounded-full bg-lime-500 px-2 py-0.5 text-2xs font-bold text-brand-800">
                      {brand.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* ── The handsets ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-brand-700">
              In stock now
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Every handset here is on the shelf and ready to ship.
            </p>
          </div>
          <Link
            to="/shop/phones"
            className="shrink-0 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-500"
          >
            View all →
          </Link>
        </div>

        {phones.isError ? (
          <ErrorState error={phones.error} onRetry={() => void phones.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {phones.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
              : phones.data
                  ?.slice(0, 8)
                  .map((product, index) => (
                    <ProductCard key={product.id} product={product} priority={index < 4} />
                  ))}
          </div>
        )}
      </section>

      {/* ── Repairs — the counter service the job-card flow feeds ─────────── */}
      <section className="border-t border-hairline bg-brand-700">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Cracked screen? Battery gone flat by lunchtime?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-brand-100">
              We repair in-house at {STORE.address}. Book it in and you will get your job card by
              WhatsApp — sign on your phone, track it, and collect when it is ready.
            </p>
          </div>

          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              to="/shop/repairs"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-lime-500 px-6 text-base font-semibold text-brand-800 transition-colors hover:bg-lime-400"
            >
              <BatteryCharging aria-hidden className="h-4 w-4" />
              See repair prices
            </Link>
            <a
              href={`tel:${STORE.phone.replace(/\s/g, '')}`}
              className="inline-flex h-12 items-center rounded-xl border border-brand-400 px-6 text-base font-medium text-white transition-colors hover:bg-brand-600"
            >
              {STORE.phone}
            </a>
          </div>
        </div>
      </section>

      <section className="border-t border-hairline">
        <ul className="mx-auto grid max-w-7xl gap-4 px-4 py-8 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, detail }) => (
            <li key={title} className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime-500 text-brand-800"
              >
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">{title}</p>
                <p className="text-xs text-ink-muted">{detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
