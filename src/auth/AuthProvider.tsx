import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { UserRow } from '@/lib/database.types';
import { ADMIN_ROLES, STAFF_ROLES } from '@/lib/constants';

export interface AuthState {
  session: Session | null;
  user: User | null;
  /** The `public.users` row: role, active flag, display name. */
  profile: UserRow | null;
  /** False only while the initial session check is in flight. */
  ready: boolean;
  isAuthenticated: boolean;
  /** Mirrors `public.is_admin()` — admin | owner | manager, and active. */
  isAdmin: boolean;
  /** May open the console at all (adds cashier/staff). */
  isStaff: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, meta: { name: string; phone?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserRow | null>(null);
  const [ready, setReady] = useState(false);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    // A missing row is normal right after sign-up, before the auth trigger has
    // mirrored the user across. Treat it as "no elevated role" rather than an error.
    setProfile(error ? null : data);
  }, []);

  useEffect(() => {
    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session);
      void loadProfile(data.session?.user.id).finally(() => {
        if (!cancelled) setReady(true);
      });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void loadProfile(nextSession?.user.id);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(error.message);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, meta: { name: string; phone?: string }) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: { data: { name: meta.name, phone: meta.phone ?? null } },
      });
      if (error) throw new Error(error.message);
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/account?reset=1`,
    });
    if (error) throw new Error(error.message);
  }, []);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user.id),
    [loadProfile, session?.user.id],
  );

  const value = useMemo<AuthState>(() => {
    const role = profile?.role?.toLowerCase() ?? '';
    const active = profile?.active ?? false;

    return {
      session,
      user: session?.user ?? null,
      profile,
      ready,
      isAuthenticated: Boolean(session),
      isAdmin: active && ADMIN_ROLES.includes(role),
      isStaff: active && STAFF_ROLES.includes(role),
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
    };
  }, [session, profile, ready, signIn, signUp, signOut, resetPassword, refreshProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
