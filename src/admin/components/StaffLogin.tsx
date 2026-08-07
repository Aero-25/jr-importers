import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import { KeyRound, Mail, ShieldCheck } from 'lucide-react';
import { config } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { Button, Input, Notice, useToast } from '@/ui';

/**
 * A second Supabase client, holding no session.
 *
 * `signUp` signs the new account in on whichever client makes the call. Using
 * the app's own client would swap the manager's session for the cashier's
 * mid-task — they would finish creating a login and find themselves logged in
 * as the person they just created. This one persists nothing and shares no
 * storage key, so the console's session is untouched.
 */
const provisioner = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, storageKey: 'jr-provision' },
});

/**
 * Gets a readable sentence out of whatever was thrown.
 *
 * A failure here surfaced as the string "{}" — the useful part was a database
 * error nested inside the response, and Error.message was empty. An error
 * message nobody can act on is barely better than no message.
 */
function describe(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'msg', 'detail', 'hint']) {
      const value = e[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    try {
      const json = JSON.stringify(error);
      if (json && json !== '{}') return json;
    } catch {
      // Circular, and not worth chasing.
    }
  }
  return 'The server rejected it without saying why.';
}

function randomPassword() {
  // Readable aloud across a counter: no l/1/O/0, and grouped.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)))
      .map((v) => alphabet[v % alphabet.length])
      .join('');
  return `${pick(4)}-${pick(4)}-${pick(4)}`;
}

/**
 * Creating and resetting a staff member's login.
 *
 * The staff record and the login are two different things: the record decides
 * what someone may do, the login decides whether they can get in at all. Saving
 * the form only ever created the first, so a new person had a role and no way
 * to use it.
 */
export function StaffLogin({ email }: { email: string }) {
  const toast = useToast();
  const qc = useQueryClient();

  // auth.users is not reachable from the browser, so the answer comes from a
  // definer function rather than a guess based on the profile existing.
  const login = useQuery<boolean, Error>({
    queryKey: ['staff-login', email.trim().toLowerCase()],
    enabled: Boolean(email.trim()),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('staff_has_login', { p_email: email });
      if (error) throw new Error(error.message);
      return Boolean(data);
    },
  });
  const hasLogin = login.data ?? false;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  async function createLogin() {
    const chosen = password.trim() || randomPassword();
    if (chosen.length < 8) {
      toast.warn('Too short', 'Passwords need at least eight characters.');
      return;
    }

    setBusy(true);
    try {
      const { error } = await provisioner.auth.signUp({
        email: email.trim().toLowerCase(),
        password: chosen,
      });
      if (error) throw error;

      // Signed out immediately: the account exists, and this client has no
      // business holding a session for it.
      await provisioner.auth.signOut();

      setCreated(chosen);
      void qc.invalidateQueries({ queryKey: ['staff-login'] });
      toast.success('Login created', 'Give them the password and ask them to change it.');
    } catch (error) {
      const message = describe(error);
      toast.error(
        /already registered|already exists/i.test(message)
          ? 'That email already has a login'
          : 'Could not create it',
        message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${config.SITE_URL}/admin/`,
      });
      if (error) throw new Error(error.message);
      toast.success('Reset link sent', `Check ${email} — it can take a few minutes.`);
    } catch (error) {
      toast.error('Could not send it', describe(error));
    } finally {
      setBusy(false);
    }
  }

  if (!email.trim()) {
    return (
      <Notice tone="info" title="Add an email first">
        The email address is the login. Save one, then a password can be set here.
      </Notice>
    );
  }

  if (created) {
    return (
      <Notice tone="success" title="Login created">
        <p className="mb-2">
          Give {email} this password. It is shown once — there is no copy kept anywhere, by design.
        </p>
        <p className="tabular select-all rounded-lg bg-white/70 px-3 py-2 font-mono text-base font-bold text-ink">
          {created}
        </p>
      </Notice>
    );
  }

  return (
    <div className="rounded-xl border border-hairline bg-raised/60 p-3">
      <div className="flex items-center gap-2">
        <ShieldCheck aria-hidden className="h-4 w-4 text-lime-700" />
        <h3 className="text-sm font-semibold text-ink">
          {login.isLoading ? 'Checking…' : hasLogin ? 'This person can sign in' : 'No login yet'}
        </h3>
      </div>

      <p className="mt-1 text-xs text-ink-muted">
        {hasLogin
          ? 'Send them a reset link if they have forgotten their password.'
          : 'Saving this form records who they are and what they may do. It does not let them in — create the login here.'}
      </p>

      {hasLogin ? (
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          icon={<Mail className="h-4 w-4" />}
          loading={busy}
          onClick={sendReset}
        >
          Email a reset link
        </Button>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Input
            label="Password"
            hint="Leave blank and one will be generated."
            className="w-56"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            size="sm"
            icon={<KeyRound className="h-4 w-4" />}
            loading={busy}
            onClick={createLogin}
          >
            Create login
          </Button>
        </div>
      )}
    </div>
  );
}
