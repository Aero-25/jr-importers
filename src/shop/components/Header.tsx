import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { Menu, Search, ShoppingBag, User, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { useCart } from '@/data/cart';
import { useAuth } from '@/auth/AuthProvider';
import { Button, IconButton } from '@/ui';

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
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
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
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        // Glass only once there is content behind it to refract. Frosting an
        // empty header at the top of the page just looks like a grey bar.
        scrolled ? 'glass glass-strong border-b' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
        <Link to="/" className="flex shrink-0 items-center gap-2" aria-label={`${STORE.name} home`}>
          <img src="/icon.svg" alt="" width={32} height={32} className="h-8 w-8" />
          <span className="hidden font-display text-lg font-bold tracking-tight text-ink sm:block">
            JR <span className="text-brand-400">Importers</span>
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
                      'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-raised text-ink'
                        : 'text-ink-muted hover:bg-raised hover:text-ink',
                    )
                  }
                >
                  {group.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden max-w-sm flex-1 md:block" role="search">
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
            />
            <input
              ref={searchRef}
              id="site-search"
              type="search"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search phones, chargers, repairs…"
              className="h-10 w-full rounded-full border border-hairline bg-surface pl-9 pr-4 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-400"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-1 md:ml-0">
          <Link
            to={isAuthenticated ? '/account' : '/account/sign-in'}
            className="hidden items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-muted transition-colors hover:bg-raised hover:text-ink sm:flex"
          >
            <User aria-hidden className="h-4 w-4" />
            <span className="max-w-24 truncate">
              {isAuthenticated ? (profile?.full_name?.split(' ')[0] ?? 'Account') : 'Sign in'}
            </span>
          </Link>

          <Link
            to="/cart"
            className="relative rounded-lg p-2.5 text-ink-muted transition-colors hover:bg-raised hover:text-ink"
            aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}
          >
            <ShoppingBag aria-hidden className="h-5 w-5" />
            {count > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-2xs font-bold text-white">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Link>

          <IconButton
            label={menuOpen ? 'Close menu' : 'Open menu'}
            variant="ghost"
            className="lg:hidden"
            icon={menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          />
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-hairline bg-surface lg:hidden">
          <div className="mx-auto max-w-7xl space-y-3 px-4 py-4">
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
                  className="h-11 w-full rounded-full border border-hairline bg-canvas pl-9 pr-4 text-sm text-ink"
                />
              </div>
            </form>

            <nav aria-label="Categories">
              <ul className="grid grid-cols-2 gap-2">
                {CATEGORY_GROUPS.map((group) => (
                  <li key={group.id}>
                    <Link
                      to={`/shop/${group.id}`}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg bg-raised px-3 py-2.5 text-sm font-medium text-ink"
                    >
                      {group.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>

            <Button
              fullWidth
              variant="secondary"
              onClick={() => {
                navigate(isAuthenticated ? '/account' : '/account/sign-in');
                setMenuOpen(false);
              }}
              icon={<User className="h-4 w-4" />}
            >
              {isAuthenticated ? 'My account' : 'Sign in'}
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
