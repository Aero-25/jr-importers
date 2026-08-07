import { useCallback, useEffect, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/auth/AuthProvider';
import { STORE } from '@/lib/constants';
import { Button, Input } from '@/ui';

/** Ten minutes. Long enough to serve a customer, short enough to matter. */
const IDLE_MS = 10 * 60 * 1000;

const ACTIVITY = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/**
 * Locks the console when it is left unattended.
 *
 * A till signed in on the counter is a till anyone can use — to ring up a sale,
 * approve a refund, or read what everything cost. The screen locks after ten
 * idle minutes and takes the signed-in person's password to come back.
 *
 * It does not sign out. Signing out would discard an in-progress sale, and a
 * cashier who loses a half-rung basket to a lock screen learns to keep the
 * screen awake instead.
 */
export function IdleLock() {
  const { profile, signOut } = useAuth();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<number>();

  const arm = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setLocked(true), IDLE_MS);
  }, []);

  useEffect(() => {
    if (locked) return;
    arm();
    for (const event of ACTIVITY) window.addEventListener(event, arm, { passive: true });

    // Leaving the tab is not idling, but coming back to a tab that sat open all
    // night should not find the console still unlocked.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') arm();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearTimeout(timer.current);
      for (const event of ACTIVITY) window.removeEventListener(event, arm);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [locked, arm]);

  async function unlock(event: React.FormEvent) {
    event.preventDefault();
    if (!profile?.email) return;

    setChecking(true);
    setError(null);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password,
      });
      if (authError) {
        setError('That password is not right.');
        return;
      }
      setPassword('');
      setLocked(false);
    } finally {
      setChecking(false);
    }
  }

  if (!locked) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Console locked"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-800/95 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={unlock}
        className="w-full max-w-sm rounded-3xl bg-surface p-7 shadow-2xl"
      >
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-lime-500 text-brand-800"
        >
          <Lock className="h-5 w-5" />
        </span>

        <h2 className="mt-5 font-display text-xl font-bold text-ink">Locked</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {STORE.name} left this screen for a while. Enter your password to carry on — nothing you
          were doing has been lost.
        </p>

        <p className="mt-4 truncate text-sm font-medium text-ink">{profile?.full_name ?? profile?.email}</p>

        <Input
          type="password"
          label="Password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error ?? undefined}
          className="mt-3"
        />

        <div className="mt-5 flex gap-2">
          <Button type="submit" loading={checking} disabled={!password} className="flex-1">
            Unlock
          </Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </form>
    </div>
  );
}
