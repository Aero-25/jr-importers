import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Download, LogOut, Menu, Moon, Smartphone, Sun, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ADMIN_APK_URL } from '@/lib/constants';
import { useAuth } from '@/auth/AuthProvider';
import { initials } from '@/lib/format';
import { IconButton } from '@/ui';
import { useSpecular } from '@/ui/effects';
import { visibleSections } from '../nav';
import { IdleLock } from './IdleLock';

const APK_NOTICE_KEY = 'jr-apk-notice-dismissed';

/**
 * True only where downloading the APK makes sense: an Android browser.
 *
 * Two exclusions matter. iPhones cannot install an APK, so the notice would
 * only advertise something unusable. And the packaged app itself runs this
 * same console in a Capacitor WebView — it must not advertise itself, so both
 * the injected bridge global and the WebView's "; wv" UA marker opt out.
 */
function wantsApkNotice(): boolean {
  const ua = navigator.userAgent;
  return /android/i.test(ua) && !/; wv\)/i.test(ua) && !('Capacitor' in window);
}

/**
 * Console chrome.
 *
 * The rail is a floating glass panel rather than a flush sidebar: it is inset
 * from every edge, so the ambient field reads around it and the console feels
 * like the storefront rather than a separate product.
 *
 * The nav list scrolls independently of the brand and the account footer. With
 * twenty modules the list is taller than a laptop screen, and scrolling the
 * whole rail would take the sign-out button off-screen with it.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  // The highlight follows the pointer across the rail, which is what makes a
  // flat panel read as a curved surface catching light.
  const rail = useSpecular<HTMLDivElement>();
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('jr-console-theme') as 'dark' | 'light' | null) ?? 'light',
  );
  const [apkNotice, setApkNotice] = useState(
    () => wantsApkNotice() && localStorage.getItem(APK_NOTICE_KEY) !== '1',
  );

  function dismissApkNotice() {
    localStorage.setItem(APK_NOTICE_KEY, '1');
    setApkNotice(false);
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('jr-console-theme', theme);
  }, [theme]);

  // Navigating on a phone should close the drawer behind you.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const sections = visibleSections(isAdmin);

  return (
    <div className="min-h-screen">
      <div className="field" aria-hidden />

      <div className="relative z-10 lg:grid lg:grid-cols-[17rem_1fr] lg:gap-0">
        {/* The scrim must live INSIDE this wrapper: `relative z-10` opens a
            stacking context, and a sibling placed outside it is compared
            against the wrapper's z-10 — not the rail's z-40 — so it would
            paint over the drawer and swallow its taps. */}
        {navOpen && (
          <div
            className="fixed inset-0 z-30 bg-brand-900/40 backdrop-blur-sm lg:hidden"
            onClick={() => setNavOpen(false)}
            aria-hidden
          />
        )}

        {/* ── Rail ───────────────────────────────────────────────────────── */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-[17rem] p-3 transition-transform duration-300 ease-out',
            'lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 lg:py-3 lg:pl-3 lg:pr-0',
            navOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <div
            ref={rail.ref}
            {...rail.specularProps}
            className="glass glass-strong rail-glass sheen flex h-full flex-col overflow-hidden rounded-[1.75rem]"
          >
            {/* Brand — fixed, never scrolls away */}
            <div className="flex shrink-0 items-center gap-2.5 px-4 py-4">
              <span className="sweep flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold text-white">
                JR
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-sm font-bold text-ink">Retail Console</p>
                <p className="truncate text-2xs text-ink-subtle">JR Importers</p>
              </div>
              <IconButton
                label="Close navigation"
                variant="ghost"
                size="sm"
                className="lg:hidden"
                icon={<X className="h-4 w-4" />}
                onClick={() => setNavOpen(false)}
              />
            </div>

            {/* Nav — the only part that scrolls */}
            <nav
              aria-label="Console"
              className="rail-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-2"
            >
              {sections.map((section) => (
                <div key={section.id} className="mb-4">
                  <h2 className="px-2.5 pb-2 pt-1 text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-subtle/80">
                    {section.label}
                  </h2>
                  <ul className="space-y-0.5">
                    {section.items.map((item) => (
                      <li key={item.id}>
                        <NavLink
                          to={item.path}
                          end={item.path === '/'}
                          className={({ isActive }) =>
                            cn(
                              'group relative flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all duration-150',
                              isActive
                                ? 'rail-active font-semibold text-white'
                                : 'text-ink-muted hover:bg-ink/[0.06] hover:text-ink',
                            )
                          }
                        >
                          {({ isActive }) => (
                            <>
                              {/* Lime marker on the active item — the accent
                                  doing wayfinding rather than decoration. */}
                              <span
                                aria-hidden
                                className={cn(
                                  'absolute left-0 h-5 w-1 rounded-r-full bg-lime-500 transition-opacity',
                                  isActive ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <item.icon aria-hidden className="h-4 w-4 shrink-0" />
                              <span className="truncate">{item.label}</span>
                            </>
                          )}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>

            {/* Account — fixed, so sign-out never scrolls away */}
            <div className="shrink-0 border-t border-white/25 bg-white/25 p-3 backdrop-blur-sm dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5">
                <span
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lime-500 text-xs font-bold text-brand-800"
                >
                  {initials(profile?.full_name ?? profile?.email)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">
                    {profile?.full_name ?? 'Staff'}
                  </p>
                  <p className="truncate text-2xs capitalize text-ink-subtle">{profile?.role}</p>
                </div>
              </div>

              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
                >
                  {theme === 'dark' ? (
                    <Sun aria-hidden className="h-3.5 w-3.5" />
                  ) : (
                    <Moon aria-hidden className="h-3.5 w-3.5" />
                  )}
                  {theme === 'dark' ? 'Light' : 'Dark'}
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-hairline px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                >
                  <LogOut aria-hidden className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Content ────────────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-col">
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 px-3 pt-3 lg:hidden">
            <div className="glass glass-strong flex h-14 w-full items-center gap-3 rounded-2xl px-3">
              <IconButton
                label="Open navigation"
                variant="ghost"
                icon={<Menu className="h-5 w-5" />}
                onClick={() => setNavOpen(true)}
              />
              <span className="font-display text-sm font-bold text-ink">Retail Console</span>
            </div>
          </header>

          {apkNotice && (
            <div className="px-3 pt-3 lg:hidden">
              <div className="glass flex items-center gap-3 rounded-2xl py-2.5 pl-4 pr-2">
                <Smartphone aria-hidden className="h-4 w-4 shrink-0 text-brand-500" />
                <p className="min-w-0 flex-1 text-sm text-ink">
                  This console is also an Android app — faster on the counter.
                </p>
                <a
                  href={ADMIN_APK_URL}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-lime-500 px-3 text-xs font-semibold text-brand-800 transition-colors hover:bg-lime-400"
                >
                  <Download aria-hidden className="h-3.5 w-3.5" />
                  Download
                </a>
                <IconButton
                  label="Dismiss"
                  variant="ghost"
                  size="sm"
                  icon={<X className="h-4 w-4" />}
                  onClick={dismissApkNotice}
                />
              </div>
            </div>
          )}

          <main className="min-w-0 flex-1 p-3 lg:p-4">
            <div className="glass min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-3xl lg:min-h-[calc(100vh-2rem)]">
              {children}
            </div>
          </main>
        </div>
      </div>

      <IdleLock />
    </div>
  );
}

/** Consistent page header for every console module. */
export function ModuleHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline/70 px-6 py-5">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-brand-700">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
