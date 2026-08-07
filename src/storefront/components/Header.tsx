import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { useCart } from '@/data/cart';
import { useAuth } from '@/auth/AuthProvider';

/**
 * Floating pill header.
 *
 * Detached from the top edge so the light field shows around it and the pill
 * reads as an object above the page rather than a bar welded to it. Everything
 * inside is white on the deep colour sweep; the vivid version of that spectrum
 * is the ring and the glow.
 */
export function Header() {
  const { count } = useCart();
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // `/` focuses search, the way every catalogue site behaves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingAlready =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !typingAlready) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `/shop?q=${encodeURIComponent(query)}` : '/shop');
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4 sm:pt-4">
      <div
        className={cn(
          'sweep sweep-ring relative mx-auto flex max-w-7xl items-center gap-2 rounded-full',
          'px-2.5 transition-[height] duration-300 sm:gap-3 sm:px-4',
          // Tightens once you start reading, giving the page back a little
          // room without the pill ever leaving.
          scrolled ? 'h-16' : 'h-16 sm:h-[4.5rem]',
        )}
      >
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2 rounded-full pl-1.5 pr-1"
          aria-label={`${STORE.name} home`}
        >
          <img
            src="/logo-mark.png"
            alt=""
            width={27}
            height={48}
            className="h-10 w-auto sm:h-12"
          />
          <span className="hidden font-display text-base font-bold tracking-tight text-white sm:block">
            JR <span className="text-lime-400">Importers</span>
          </span>
        </Link>

        <nav aria-label="Categories" className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {CATEGORY_GROUPS.map((group) => (
              <li key={group.id}>
                <NavLink
                  to={`/shop/${group.id}`}
                  className={({ isActive }) =>
                    cn(
                      'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'sweep-pill text-white'
                        : 'text-white/80 hover:bg-white/10 hover:text-white',
                    )
                  }
                >
                  {group.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <form
          onSubmit={submitSearch}
          className="ml-auto hidden max-w-xs flex-1 md:block"
          role="search"
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70"
            />
            <input
              ref={searchRef}
              id="site-search"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search phones, chargers, repairs…"
              className="sweep-pill h-9 w-full rounded-full pl-9 pr-4 text-sm text-white placeholder:text-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            to={isAuthenticated ? '/account' : '/account/sign-in'}
            className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm text-white/85 transition-colors hover:bg-white/10 hover:text-white sm:flex"
          >
            <User aria-hidden className="h-4 w-4" />
            <span className="max-w-24 truncate">
              {isAuthenticated ? (profile?.full_name?.split(' ')[0] ?? 'Account') : 'Sign in'}
            </span>
          </Link>

          <Link
            to="/cart"
            className="relative rounded-full p-2.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag aria-hidden className="h-5 w-5" />
            {count > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-lime-500 px-1 text-2xs font-bold text-brand-800">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>

          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-full p-2.5 text-white/85 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
          >
            {menuOpen ? (
              <X aria-hidden className="h-5 w-5" />
            ) : (
              <Menu aria-hidden className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* The drawer is its own panel, so the pill never grows into a slab. */}
      {menuOpen && (
        <div className="glass glass-strong mx-auto mt-2 max-w-7xl rounded-3xl p-3 lg:hidden">
          <form onSubmit={submitSearch} role="search" className="md:hidden">
            <label htmlFor="mobile-search" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
              />
              <input
                id="mobile-search"
                type="search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Search phones…"
                className="h-11 w-full rounded-full border border-hairline bg-canvas/70 pl-9 pr-4 text-sm text-ink"
              />
            </div>
          </form>

          <nav aria-label="Categories" className="mt-3">
            <ul className="grid grid-cols-2 gap-2">
              {CATEGORY_GROUPS.map((group) => (
                <li key={group.id}>
                  <Link
                    to={`/shop/${group.id}`}
                    onClick={() => setMenuOpen(false)}
                    className="glass block rounded-2xl px-4 py-3 text-sm font-medium text-ink"
                  >
                    {group.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <Link
            to={isAuthenticated ? '/account' : '/account/sign-in'}
            onClick={() => setMenuOpen(false)}
            className="glass mt-2 flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium text-ink"
          >
            <User aria-hidden className="h-4 w-4" />
            {isAuthenticated ? 'My account' : 'Sign in'}
          </Link>
        </div>
      )}
    </header>
  );
}
