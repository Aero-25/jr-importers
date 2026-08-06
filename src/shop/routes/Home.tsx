import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useCatalog } from '@/data/products';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { ErrorState } from '@/ui';
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard';
import { useSeo } from '../seo';

export default function Home() {
  useSeo({
    title: 'JR Importers — Phones, Laptops & Tech in Namibia',
    description:
      "Namibia's tech superstore. Imported smartphones, laptops, tablets, audio and accessories at import prices, with nationwide delivery from Windhoek.",
    path: '/',
  });

  const featured = useCatalog({ featuredOnly: true, inStockOnly: true, limit: 8 });
  const newest = useCatalog({ sort: 'newest', inStockOnly: true, limit: 12 });

  return (
    <>
      <section className="relative overflow-hidden border-b border-hairline">
        {/* Decorative wash — kept in CSS rather than an image so it costs nothing. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(60rem 30rem at 15% -10%, rgb(26 112 250 / 0.22), transparent 60%), radial-gradient(40rem 24rem at 90% 10%, rgb(240 180 41 / 0.12), transparent 60%)',
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:py-24">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
              <Sparkles aria-hidden className="h-3.5 w-3.5" />
              {STORE.tagline}
            </span>

            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.1] tracking-tight text-ink sm:text-6xl">
              Real tech.
              <br />
              <span className="text-brand-400">Import prices.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base text-ink-muted sm:text-lg">
              Smartphones, laptops, tablets, audio and accessories — imported, tested and
              warrantied. Delivered anywhere in {STORE.country}, or collect in {STORE.city}.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/shop"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-6 text-base font-medium text-white shadow-card transition-colors hover:bg-brand-400"
              >
                Shop everything
                <ArrowRight aria-hidden className="h-4 w-4" />
              </Link>
              <Link
                to="/support"
                className="inline-flex h-12 items-center rounded-xl border border-hairline px-6 text-base font-medium text-ink transition-colors hover:border-brand-400 hover:text-brand-300"
              >
                Request a specific model
              </Link>
            </div>
          </div>

          <nav aria-label="Shop by category" className="mt-12">
            <ul className="flex flex-wrap gap-2">
              {CATEGORY_GROUPS.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/shop/${group.id}`}
                    className="inline-flex items-center rounded-full border border-hairline bg-surface/60 px-4 py-2 text-sm text-ink-muted backdrop-blur transition-colors hover:border-brand-400 hover:text-ink"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </section>

      <ProductRail
        title="Featured this week"
        description="Hand-picked by the team."
        to="/shop"
        query={featured}
      />

      <ProductRail
        title="Just landed"
        description="The newest stock on the shelf."
        to="/shop"
        query={newest}
      />
    </>
  );
}

function ProductRail({
  title,
  description,
  to,
  query,
}: {
  title: string;
  description: string;
  to: string;
  query: ReturnType<typeof useCatalog>;
}) {
  if (query.isError) {
    return (
      <section className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState title={`Could not load ${title.toLowerCase()}`} error={query.error} onRetry={() => void query.refetch()} />
      </section>
    );
  }

  // An empty merchandising rail is not an error — just say nothing.
  if (!query.isLoading && query.data?.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">{description}</p>
        </div>
        <Link
          to={to}
          className="shrink-0 text-sm font-medium text-brand-400 transition-colors hover:text-brand-300"
        >
          View all →
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {query.isLoading
          ? Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : query.data
              ?.slice(0, 12)
              .map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 6} />
              ))}
      </div>
    </section>
  );
}
