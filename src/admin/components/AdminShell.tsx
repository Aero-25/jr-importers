import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/auth/AuthProvider';
import { initials } from '@/lib/format';
import { Button, IconButton } from '@/ui';
import { visibleSections } from '../nav';

export function AdminShell({ children }: { children: ReactNode }) {
  const { profile, isAdmin, signOut } = useAuth();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('jr-console-theme') as 'dark' | 'light' | null) ?? 'dark',
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('jr-console-theme', theme);
  }, [theme]);

  // Navigating on a phone should close the drawer behind you.
  useEffect(() => setNavOpen(false), [location.pathname]);

  const sections = visibleSections(isAdmin);

  return (
    <div className="min-h-screen bg-canvas lg:grid lg:grid-cols-[16rem_1fr]">
      {/* Backdrop only exists on small screens, where the nav is a drawer. */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-hairline bg-surface',
          'transition-transform duration-200 ease-out lg:static lg:translate-x-0',
          navOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-hairline px-4">
          <img src="/icon.svg" alt="" width={28} height={28} className="h-7 w-7" />
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-bold text-ink">Retail Console</p>
            <p className="truncate text-2xs text-ink-subtle">JR Importers</p>
          </div>
          <IconButton
            label="Close navigation"
            variant="ghost"
            size="sm"
            className="ml-auto lg:hidden"
            icon={<X className="h-4 w-4" />}
            onClick={() => setNavOpen(false)}
          />
        </div>

        <nav aria-label="Console" className="flex-1 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.id} className="mb-5">
              <h2 className="px-2 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
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
                          'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                          isActive
                            ? 'bg-brand-500/12 font-medium text-brand-300'
                            : 'text-ink-muted hover:bg-raised hover:text-ink',
                        )
                      }
                    >
                      <item.icon aria-hidden className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-hairline p-3">
          <div className="flex items-center gap-2.5 px-1 py-2">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-xs font-semibold text-brand-300"
            >
              {initials(profile?.full_name ?? profile?.email)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">{profile?.full_name ?? 'Staff'}</p>
              <p className="truncate text-2xs capitalize text-ink-subtle">{profile?.role}</p>
            </div>
          </div>

          <div className="mt-1 flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              fullWidth
              icon={<LogOut className="h-4 w-4" />}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-hairline bg-canvas/90 px-4 backdrop-blur lg:hidden">
          <IconButton
            label="Open navigation"
            variant="ghost"
            icon={<Menu className="h-5 w-5" />}
            onClick={() => setNavOpen(true)}
          />
          <span className="font-display text-sm font-bold text-ink">Retail Console</span>
        </header>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
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
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-6 py-5">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
