import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ShieldCheck, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Input, Notice, useToast } from '@/ui';

interface Factor {
  id: string;
  friendly_name?: string;
  status: string;
}

/**
 * Two-factor enrolment for the account that is signed in.
 *
 * A manager account can change prices, approve refunds and read what everything
 * cost. A password alone is thin protection for that, particularly on a device
 * that sits on a shop counter all day.
 *
 * Enrolment is per-person and opt-in. Forcing it across the shop is a policy
 * decision with a real failure mode — a cashier locked out mid-Saturday by a
 * flat phone — so that stays a choice for the owner rather than a default.
 */
export function MfaPanel() {
  const toast = useToast();
  const qc = useQueryClient();

  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const factors = useQuery<Factor[], Error>({
    queryKey: ['mfa', 'factors'],
    queryFn: async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (error) throw new Error(error.message);
      return (data?.totp ?? []) as Factor[];
    },
  });

  const verified = (factors.data ?? []).filter((f) => f.status === 'verified');

  // An enrolment that is started and abandoned leaves an unverified factor
  // behind, which then blocks the next attempt with "already enrolled".
  useEffect(() => {
    return () => {
      if (factorId && !busy) void supabase.auth.mfa.unenroll({ factorId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function begin() {
    setBusy(true);
    try {
      const stale = (factors.data ?? []).filter((f) => f.status !== 'verified');
      for (const f of stale) await supabase.auth.mfa.unenroll({ factorId: f.id });

      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `JR Importers · ${new Date().toLocaleDateString()}`,
      });
      if (error) throw new Error(error.message);

      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolling(true);
    } catch (error) {
      toast.error('Could not start enrolment', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!factorId) return;
    setBusy(true);
    try {
      const { data: challenge, error: challengeError } =
        await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw new Error(challengeError.message);

      const { error } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: code.trim(),
      });
      if (error) throw new Error(error.message);

      toast.success('Two-factor is on', 'You will be asked for a code the next time you sign in.');
      setEnrolling(false);
      setQr(null);
      setSecret(null);
      setFactorId(null);
      setCode('');
      void qc.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch {
      toast.error('That code was not accepted', 'Codes expire after 30 seconds — try the next one.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (error) throw new Error(error.message);
      toast.success('Two-factor removed');
      void qc.invalidateQueries({ queryKey: ['mfa', 'factors'] });
    } catch (error) {
      toast.error('Could not remove it', error instanceof Error ? error.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span
          aria-hidden
          className="flex h-10 w-10 items-center justify-center rounded-full bg-lime-500 text-brand-800"
        >
          <ShieldCheck className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-bold text-ink">Two-factor sign-in</h3>
          <p className="text-sm text-ink-muted">
            A code from your phone as well as your password.
          </p>
        </div>
        {verified.length > 0 ? (
          <Badge tone="success" icon={<Check className="h-3 w-3" />}>
            On
          </Badge>
        ) : (
          <Badge tone="warn">Off</Badge>
        )}
      </div>

      {verified.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {verified.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-3 rounded-xl border border-hairline px-3 py-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-ink">
                {f.friendly_name ?? 'Authenticator app'}
              </span>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-4 w-4" />}
                loading={busy}
                onClick={() => void remove(f.id)}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : enrolling && qr ? (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-ink-muted">
            Scan this with Google Authenticator, Microsoft Authenticator or 1Password, then enter
            the six-digit code it shows.
          </p>
          <img
            src={qr}
            alt="Two-factor setup QR code"
            className="h-44 w-44 rounded-xl border border-hairline bg-white p-2"
          />
          {secret && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted">Cannot scan it?</summary>
              <code className="mt-2 block break-all rounded-lg bg-raised px-3 py-2 text-xs">
                {secret}
              </code>
            </details>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <Input
              label="Six-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              className="w-36"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Button loading={busy} disabled={code.length !== 6} onClick={confirm}>
              Turn it on
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (factorId) void supabase.auth.mfa.unenroll({ factorId });
                setEnrolling(false);
                setQr(null);
                setFactorId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <Notice tone="info" className="mb-3">
            Keep a second device or the recovery codes from your authenticator somewhere safe. If
            you lose the phone and have no backup, only Supabase support can get the account back.
          </Notice>
          <Button loading={busy} onClick={begin}>
            Set it up
          </Button>
        </div>
      )}
    </section>
  );
}
