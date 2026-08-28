import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { ProductRow } from '@/lib/database.types';
import { money } from '@/lib/format';
import { productPath } from './ProductCard';

/**
 * The hero's right-hand side: the shelf itself.
 *
 * Instead of an illustration, the most expensive handset actually in stock
 * fronts the page, priced and clickable, with the next two beneath it. The
 * hero's promise — what is on the page is on the shelf — is made by showing
 * the shelf, and every element here comes off the same live catalogue query
 * as the grid below, so it can never advertise a phone the shop cannot sell.
 */
export function HeroShelf({ products, loading }: { products: ProductRow[]; loading: boolean }) {
  const [feature, ...rest] = products;
  const minis = rest.slice(0, 2);

  if (loading) {
    return (
      <div aria-hidden>
        <div className="skeleton aspect-[4/3] rounded-3xl" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!feature) return null;

  return (
    <div>
      <Link
        to={productPath(feature)}
        className="glass sheen group block overflow-hidden rounded-3xl transition-[transform,filter] duration-300 hover:-translate-y-1 hover:brightness-[1.03]"
      >
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <span className="truncate text-2xs font-bold uppercase tracking-[0.14em] text-ink-subtle">
            {feature.category ?? 'Featured'}
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-2xs font-bold uppercase tracking-[0.14em] text-lime-700">
            <span aria-hidden className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-500 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-lime-600" />
            </span>
            In stock now
          </span>
        </div>
        {feature.image ? (
          <div className="mt-3 aspect-[4/3] overflow-hidden bg-white/40">
            <img
              src={feature.image}
              alt={feature.name}
              fetchPriority="high"
              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            />
          </div>
        ) : (
          <div aria-hidden className="mt-3 aspect-[4/3] bg-white/40" />
        )}
        <div className="flex items-end justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-ink sm:text-xl">
              {feature.name}
            </p>
            <p className="tabular mt-0.5 font-display text-base font-bold text-brand-700 sm:text-lg">
              {money(feature.price)}
            </p>
          </div>
          <span
            aria-hidden
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime-500 text-brand-800 shadow-card transition-transform duration-300 group-hover:translate-x-1"
          >
            <ArrowRight className="h-4.5 w-4.5" />
          </span>
        </div>
      </Link>

      {minis.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {minis.map((product) => (
            <Link
              key={product.id}
              to={productPath(product)}
              className="glass sheen flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105"
            >
              {product.image ? (
                <img
                  src={product.image}
                  alt=""
                  className="h-11 w-11 shrink-0 rounded-xl border border-hairline object-cover"
                />
              ) : (
                <span aria-hidden className="h-11 w-11 shrink-0 rounded-xl bg-white/40" />
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                <span className="tabular block text-xs font-semibold text-brand-600">
                  {money(product.price)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The live-stock ticker under the hero: every chip is a real, in-stock
 * product at its real price, and clicking one opens it. Doubled content and a
 * -50% translate make the loop seamless; hover pauses it, and reduced motion
 * turns it into a plain scrollable row (see `.ticker` in global.css).
 */
export function HeroTicker({ products }: { products: ProductRow[] }) {
  if (products.length === 0) return null;
  const loop = [...products, ...products];

  return (
    <div
      className="ticker-mask overflow-hidden py-1"
      role="list"
      aria-label="Live stock ticker"
    >
      <div className="ticker items-center gap-2.5 pr-2.5">
        {loop.map((product, index) => (
          <Link
            key={`${product.id}-${index}`}
            role="listitem"
            aria-hidden={index >= products.length || undefined}
            tabIndex={index >= products.length ? -1 : undefined}
            to={productPath(product)}
            className="glass flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs transition-[filter] hover:brightness-105"
          >
            {product.image ? (
              <img
                src={product.image}
                alt=""
                loading="lazy"
                className="h-7 w-7 rounded-full border border-hairline object-cover"
              />
            ) : (
              <span aria-hidden className="h-7 w-7 rounded-full bg-white/40" />
            )}
            <span className="max-w-40 truncate font-medium text-ink">{product.name}</span>
            <span className="tabular font-semibold text-brand-600">{money(product.price)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
