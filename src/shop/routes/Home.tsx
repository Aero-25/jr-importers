import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Smartphone, Truck, Wrench } from 'lucide-react';
import { useCatalog, useFacets } from '@/data/products';
import { STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { ErrorState } from '@/ui';
import { useParallax, useReveal, useSpecular } from '@/ui/effects';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { ChipRail } from '../components/ChipRail';
import { AndroidBot } from '../components/AndroidBot';
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

  const revealRoot = useReveal<HTMLDivElement>([phones.data, brands.data]);
  const heroRef = useParallax<HTMLDivElement>(0.14);
  const { specularProps } = useSpecular<HTMLDivElement>();

  const cheapest = phones.data?.[0]?.price;

  return (
    <div ref={revealRoot}>
      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div
          ref={heroRef}
          className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]"
          style={{ transform: 'translateY(calc(var(--parallax, 0px) * -1))' }}
        >
          <div className="max-w-2xl">
            <span className="reveal glass inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink">
              <Smartphone aria-hidden className="h-3.5 w-3.5 text-lime-700" />
              Cellphone specialists · {STORE.city}
            </span>

            <h1
              className="reveal mt-6 font-display text-[2.75rem] font-bold leading-[1.02] tracking-[-0.035em] text-brand-700 sm:text-7xl"
              data-reveal-index="1"
            >
              The right phone,
              <br />
              <span className="relative inline-block">
                {/* Sits low enough to clear the descender on the 'p'. */}
                <span
                  aria-hidden
                  className="absolute inset-x-0 bottom-0.5 h-2.5 bg-lime-400 sm:bottom-1 sm:h-5"
                />
                <span className="relative">at import prices.</span>
              </span>
            </h1>

            <p
              className="reveal mt-7 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg"
              data-reveal-index="2"
            >
              Samsung and Ulefone handsets, imported and bench-tested before they reach you.
              {cheapest ? ` From ${money(cheapest)}.` : ''} Delivered anywhere in {STORE.country},
              or collect from {STORE.address}.
            </p>

            <div className="reveal mt-9 flex flex-wrap gap-3" data-reveal-index="3">
              <Link
                to="/shop/phones"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-500 px-7 text-base font-semibold text-brand-800 shadow-[inset_0_1px_0_rgb(255_255_255/0.5),0_10px_30px_-10px_rgb(163_230_53/0.7)] transition-all duration-200 hover:bg-lime-400 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_14px_36px_-10px_rgb(163_230_53/0.85)]"
              >
                Browse all phones
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                to="/support"
                className="glass sheen inline-flex h-12 items-center rounded-full px-7 text-base font-medium text-ink transition-all duration-200 hover:brightness-105"
              >
                Book a repair
              </Link>
            </div>
          </div>

          {/*
            Decorative, and treated as such: aria-hidden, mounted only when
            scrolled into view, and skipped entirely on reduced motion or a
            low-memory device. Nothing on the page depends on it rendering.
          */}
          <div className="reveal flex justify-center lg:justify-end" data-reveal-index="2">
            <AndroidBot />
          </div>
        </div>
      </section>

      {/* ── The rail from direction 01, in glass ─────────────────────────── */}
      <div className="reveal mx-auto max-w-7xl">
        <ChipRail />
      </div>

      {/* ── Handsets ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="reveal mb-6 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-brand-700 sm:text-3xl">
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
                    <div key={product.id} className="reveal" data-reveal-index={index}>
                      <ProductCard product={product} priority={index < 4} />
                    </div>
                  ))}
          </div>
        )}
      </section>

      {/* ── Brands ──────────────────────────────────────────────────────── */}
      {brands.data && brands.data.brands.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 py-8">
          <h2 className="reveal font-display text-2xl font-bold tracking-tight text-brand-700">
            Shop by brand
          </h2>
          <ul className="mt-5 flex flex-wrap gap-3">
            {brands.data.brands.map((brand, index) => (
              <li key={brand.value} className="reveal" data-reveal-index={index}>
                <Link
                  to={`/shop/phones?brand=${encodeURIComponent(brand.value)}`}
                  className="glass sheen flex items-center gap-3 rounded-2xl px-6 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105"
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
        </section>
      )}

      {/* ── Repairs — the panel that feeds the job-card flow ─────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div
          {...specularProps}
          className="glass sheen flex flex-col gap-6 rounded-3xl p-8 md:flex-row md:items-center md:justify-between sm:p-10"
        >
          <div className="reveal max-w-xl">
            <h2 className="font-display text-2xl font-bold tracking-tight text-brand-700 sm:text-3xl">
              Cracked screen? Battery flat by lunchtime?
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
              We repair in-house at {STORE.address}. Book it in and your job card arrives by
              WhatsApp — sign on your phone, track it, collect when it is ready.
            </p>
          </div>

          <div className="reveal flex shrink-0 flex-wrap gap-3" data-reveal-index="1">
            <Link
              to="/shop/repairs"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-lime-500 px-6 text-base font-semibold text-brand-800 shadow-[inset_0_1px_0_rgb(255_255_255/0.5)] transition-colors hover:bg-lime-400"
            >
              See repair prices
            </Link>
            <a
              href={`tel:${STORE.phone.replace(/\s/g, '')}`}
              className="inline-flex h-12 items-center rounded-full border border-hairline px-6 text-base font-medium text-ink transition-colors hover:border-brand-400"
            >
              {STORE.phone}
            </a>
          </div>
        </div>
      </section>

      {/* ── Promises ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pb-14">
        <ul className="grid gap-3 sm:grid-cols-3">
          {PROMISES.map(({ icon: Icon, title, detail }, index) => (
            <li key={title} className="reveal" data-reveal-index={index}>
              <div className="glass flex items-center gap-3 rounded-2xl px-5 py-4">
                <span
                  aria-hidden
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-500 text-brand-800"
                >
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{title}</p>
                  <p className="text-xs text-ink-muted">{detail}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
