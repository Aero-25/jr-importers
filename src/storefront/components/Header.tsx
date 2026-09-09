import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, ChevronRight, Menu, Scale, Search, ShoppingBag, User, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { CATEGORY_GROUPS, STORE } from '@/lib/constants';
import { useCart } from '@/data/cart';
import { useCompare } from '@/data/compare';
import { useAuth } from '@/auth/AuthProvider';
import '../shell.css';

export function Header() {
  const { count } = useCart();
  const { count: compareCount } = useCompare();
  const { isAuthenticated, profile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setTerm(params.get('q') ?? ''), [params]);
  useEffect(() => setMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typingAlready =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.key === '/' && !typingAlready) {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const query = term.trim();
    navigate(query ? `/shop?q=${encodeURIComponent(query)}` : '/shop');
    setMenuOpen(false);
    searchRef.current?.blur();
  }

  return (
    <header className={cn('coast-header', scrolled && 'coast-header--scrolled')}>
      <div className="coast-utility">
        <div className="coast-shell-width coast-utility-inner">
          <p><span className="coast-live-dot" />From Walvis Bay. Across Namibia.</p>
          <Link to="/about">Visit us at Pelican Mall<ArrowUpRight aria-hidden size={12} /></Link>
        </div>
      </div>

      <div className="coast-shell-width coast-masthead">
        <Link to="/" className="coast-brand" aria-label={`${STORE.name} home`}>
          <img src="/logo-mark.png" alt="" width={31} height={56} />
          <span className="coast-brand-wordmark">JR<span>IMPORTERS</span></span>
        </Link>

        <form onSubmit={submitSearch} className="coast-search" role="search">
          <label htmlFor="site-search" className="sr-only">Search products</label>
          <Search aria-hidden className="coast-search-symbol" size={19} />
          <input ref={searchRef} id="site-search" type="search" value={term} onChange={(event) => setTerm(event.target.value)} placeholder="Find your next phone, tablet or accessory" />
          <button type="submit" aria-label="Search products"><Search aria-hidden size={18} /></button>
        </form>

        <div className="coast-header-actions">
          <Link to="/compare" className="coast-header-action coast-compare-action" aria-label={`Compare, ${compareCount} product${compareCount === 1 ? '' : 's'}`}>
            <span className="coast-action-icon"><Scale aria-hidden size={21} />{compareCount > 0 && <span className="coast-count">{compareCount}</span>}</span>
            <span className="coast-action-label">Compare</span>
          </Link>
          <Link to={isAuthenticated ? '/account' : '/account/sign-in'} className="coast-header-action coast-account-action" aria-label={isAuthenticated ? 'My account' : 'Sign in'}>
            <User aria-hidden size={21} />
            <span className="coast-action-label">{isAuthenticated ? (profile?.full_name?.split(' ')[0] ?? 'Account') : 'Sign in'}</span>
          </Link>
          <Link to="/cart" className="coast-header-action coast-cart-action" aria-label={`Cart, ${count} item${count === 1 ? '' : 's'}`}>
            <span className="coast-action-icon"><ShoppingBag aria-hidden size={21} /><span className="coast-count">{count > 99 ? '99+' : count}</span></span>
            <span className="coast-action-label">My bag</span>
          </Link>
          <button ref={menuButtonRef} type="button" className="coast-menu-toggle" aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen} aria-controls="coast-mobile-menu" onClick={() => setMenuOpen((open) => !open)}>
            {menuOpen ? <X aria-hidden size={23} /> : <Menu aria-hidden size={23} />}
          </button>
        </div>
      </div>

      <div className="coast-category-bar">
        <div className="coast-shell-width coast-category-inner">
          <nav aria-label="Categories"><ul>
            <li><NavLink to="/shop" end className={({ isActive }) => cn('coast-all-products', isActive && 'is-active')}>Shop all</NavLink></li>
            {CATEGORY_GROUPS.map((group) => <li key={group.id}><NavLink to={`/shop/${group.id}`} className={({ isActive }) => cn(isActive && 'is-active')}>{group.label}</NavLink></li>)}
          </ul></nav>
          <Link to="/about" className="coast-about-link">Meet JR<ArrowUpRight aria-hidden size={14} /></Link>
        </div>
      </div>

      {menuOpen && (
        <div className="coast-mobile-menu" id="coast-mobile-menu">
          <p className="coast-menu-label">Find your everyday essential</p>
          <nav aria-label="Mobile categories">
            <Link to="/shop" onClick={() => setMenuOpen(false)}>Shop all products<ChevronRight aria-hidden size={17} /></Link>
            {CATEGORY_GROUPS.map((group) => <Link key={group.id} to={`/shop/${group.id}`} onClick={() => setMenuOpen(false)}>{group.label}<ChevronRight aria-hidden size={17} /></Link>)}
            <Link to="/about" onClick={() => setMenuOpen(false)}>About us<ChevronRight aria-hidden size={17} /></Link>
          </nav>
          <div className="coast-mobile-menu-bottom">
            <Link to="/compare" onClick={() => setMenuOpen(false)}><Scale aria-hidden size={18} />Compare{compareCount > 0 ? ` (${compareCount})` : ''}</Link>
            <Link to={isAuthenticated ? '/account' : '/account/sign-in'} onClick={() => setMenuOpen(false)}><User aria-hidden size={18} />{isAuthenticated ? 'My account' : 'Sign in'}</Link>
          </div>
          <Link className="coast-mobile-support" to="/support" onClick={() => setMenuOpen(false)}>Need a hand? Talk to our team<ArrowUpRight aria-hidden size={15} /></Link>
        </div>
      )}
    </header>
  );
}
