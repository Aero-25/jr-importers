import { Link } from 'react-router-dom';
import { useSeo } from '../seo';

export default function NotFound() {
  useSeo({ title: 'Page not found', noIndex: true });

  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-display text-6xl font-bold text-brand-500">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold text-ink">We could not find that page</h1>
      <p className="mt-2 text-ink-muted">
        The link may be old, or the product may have been removed.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-lg bg-brand-500 px-4 text-sm font-medium text-white hover:bg-brand-400"
        >
          Go home
        </Link>
        <Link
          to="/shop"
          className="inline-flex h-10 items-center rounded-lg border border-hairline px-4 text-sm font-medium text-ink hover:border-brand-400"
        >
          Browse the shop
        </Link>
      </div>
    </div>
  );
}
