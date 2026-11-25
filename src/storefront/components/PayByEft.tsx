import { useState } from 'react';
import { Check, Copy, Landmark } from 'lucide-react';
import { useBankDetails } from '@/data/banking';
import { STORE } from '@/lib/constants';
import { money } from '@/lib/format';
import { Card } from '@/ui';

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-brand-500/10 hover:text-ink"
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden className="h-4 w-4 text-success" /> : <Copy aria-hidden className="h-4 w-4" />}
    </button>
  );
}

/**
 * Banking details for an unpaid order, with the order reference to quote.
 * Shown on the order confirmation page until the shop marks the order paid.
 */
export function PayByEft({ reference, amount }: { reference: string; amount: number }) {
  const { data: bank, isLoading } = useBankDetails();
  if (isLoading) return null;

  const rows: Array<{ label: string; value: string; copy: boolean }> = bank
    ? [
        { label: 'Bank', value: bank.bankName, copy: false },
        { label: 'Account name', value: bank.accountName, copy: false },
        { label: 'Account number', value: bank.accountNumber, copy: true },
        { label: 'Branch code', value: bank.branchCode, copy: true },
        { label: 'Reference', value: reference, copy: true },
        { label: 'Amount', value: money(amount), copy: false },
      ]
    : [];
  const whatsapp = `https://wa.me/${STORE.phone.replace(/\D/g, '')}`;
  const mail = `mailto:${STORE.email}?subject=${encodeURIComponent(`Proof of payment ${reference}`)}`;

  return (
    <Card className="mt-6 p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-500/10 text-brand-500">
          <Landmark aria-hidden className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Pay by EFT</h2>
          <p className="text-sm text-ink-muted">Use your order reference so we can match your payment.</p>
        </div>
      </div>

      {bank ? (
        <dl className="mt-4 divide-y divide-hairline rounded-lg border border-hairline text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex min-h-11 items-center justify-between gap-3 px-4 py-1.5">
              <dt className="shrink-0 text-ink-muted">{row.label}</dt>
              <dd className="flex min-w-0 items-center gap-1 text-right">
                <span className={`tabular break-all font-semibold text-ink ${row.label === 'Reference' ? 'font-mono' : ''}`}>
                  {row.value}
                </span>
                {row.copy && <CopyButton value={row.value} label={row.label.toLowerCase()} />}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-ink-muted">We will send you our banking details shortly.</p>
      )}

      <p className="mt-4 text-sm text-ink-muted">
        Send proof of payment to{' '}
        <a href={mail} className="font-medium text-ink underline underline-offset-2">
          {STORE.email}
        </a>{' '}
        or WhatsApp{' '}
        <a href={whatsapp} className="font-medium text-ink underline underline-offset-2">
          {STORE.phone}
        </a>
        . We confirm your order once the payment reflects. Rather pay in store? Card and cash are welcome at{' '}
        {STORE.address}.
      </p>
    </Card>
  );
}
