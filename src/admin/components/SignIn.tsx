import { useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { STORE } from '@/lib/constants';
import { Button, Card, Input, useToast } from '@/ui';

export function SignIn() {
  const { signIn } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (error) {
      // Deliberately vague: this form is reachable by anyone, so it must not
      // reveal whether an email exists.
      toast.error('Sign-in failed', 'Check your email and password and try again.');
      if (import.meta.env.DEV) console.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <Card className="w-full max-w-sm p-6">
        <div className="flex items-center gap-3">
          <img src="/icon-192.png" alt="" width={36} height={36} className="h-9 w-9" />
          <div>
            <h1 className="font-display text-lg font-bold text-ink">Retail Console</h1>
            <p className="text-xs text-ink-muted">{STORE.name}</p>
          </div>
        </div>

        <form onSubmit={submit} className="mt-6 space-y-3">
          <Input
            label="Staff email"
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-autofocus
          />
          <Input
            label="Password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" fullWidth size="lg" loading={busy}>
            Sign in
          </Button>
        </form>

        <p className="mt-4 flex items-start gap-2 text-xs text-ink-subtle">
          <ShieldCheck aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Access is limited to staff accounts. Every action is attributed to your user.
        </p>
      </Card>
    </div>
  );
}
