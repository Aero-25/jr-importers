import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/cn';
import { CATEGORY_GROUPS, PRICE_BANDS } from '@/lib/constants';

interface Chip {
  label: string;
  to: string;
  active: boolean;
}

/**
 * The filter rail from direction 01, in glass.
 *
 * Category groups and budget bands sit on one line because a shopper thinks of
 * them the same way — "phones under four thousand" is one thought, not two.
 * It scrolls horizontally rather than wrapping, so the rail stays one line
 * deep on a phone and the first chips are always in the same place.
 */
export function ChipRail({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  const currentGroup = pathname.startsWith('/shop/') ? pathname.split('/')[2] : null;
  const min = params.get('min');
  const max = params.get('max');
  const hasBand = Boolean(min || max);

  const chips: Chip[] = [
    {
      label: 'All phones',
      to: '/shop/phones',
      active: currentGroup === 'phones' && !hasBand,
    },
    ...PRICE_BANDS.map((band) => {
      const next = new URLSearchParams();
      if ('min' in band && band.min) next.set('min', String(band.min));
      if ('max' in band && band.max) next.set('max', String(band.max));

      return {
        label: band.label,
        to: `/shop/phones?${next.toString()}`,
        // Active when both bounds match what is in the URL, so the open band
        // ("N$10 000 and up", which sets only `min`) does not also light up
        // whenever `max` happens to be absent.
        active:
          currentGroup === 'phones' &&
          (next.get('min') ?? null) === min &&
          (next.get('max') ?? null) === max,
      };
    }),
    ...CATEGORY_GROUPS.filter((group) => group.id !== 'phones').map((group) => ({
      label: group.label,
      to: `/shop/${group.id}`,
      active: currentGroup === group.id,
    })),
  ];

  return (
    <nav
      aria-label="Filter phones"
      className={cn('overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      <ul className="flex w-max gap-2 px-4 py-3">
        {chips.map((chip) => (
          <li key={chip.label}>
            <Link
              to={chip.to}
              aria-current={chip.active ? 'page' : undefined}
              className={cn(
                'inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-sm transition-all duration-200',
                chip.active
                  ? 'bg-brand-600 font-semibold text-white shadow-card'
                  : 'glass font-medium text-ink hover:brightness-105',
              )}
            >
              {chip.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
