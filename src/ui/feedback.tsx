import type { ReactNode } from 'react';
import { AlertCircle, Loader2, PackageOpen, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label}>
      <Loader2 className={cn('h-5 w-5 animate-spin text-ink-subtle', className)} aria-hidden />
    </span>
  );
}

export function LoadingScreen({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3">
      <Spinner className="h-8 w-8" />
      <p className="text-sm text-ink-muted">{label}</p>
    </div>
  );
}

/** Grey placeholder block. `lines > 1` renders a stack with a short last line. */
export function Skeleton({
  className,
  lines = 1,
}: {
  className?: string;
  lines?: number;
}) {
  if (lines === 1) return <div className={cn('skeleton h-4 rounded', className)} aria-hidden />;

  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={cn('skeleton h-4 rounded', i === lines - 1 && 'w-2/3', className)}
        />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  message,
  icon,
  action,
  className,
}: {
  title: string;
  message?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span aria-hidden className="mb-3 text-ink-subtle">
        {icon ?? <PackageOpen className="h-10 w-10" />}
      </span>
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/**
 * Failure state with a retry affordance.
 * Always surfaces the real message — a cashier who can read "coupon expired"
 * can resolve it at the till; "Something went wrong" strands them.
 */
export function ErrorState({
  title = 'Could not load this',
  error,
  onRetry,
  className,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = error instanceof Error ? error.message : error ? String(error) : undefined;

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}
    >
      <AlertCircle aria-hidden className="mb-3 h-10 w-10 text-danger" />
      <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
      {message && <p className="mt-1 max-w-md text-sm text-ink-muted">{message}</p>}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-4"
          icon={<RefreshCw className="h-4 w-4" />}
          onClick={onRetry}
        >
          Try again
        </Button>
      )}
    </div>
  );
}

/** Full-width banner for page-level notices that must not be missed. */
export function Notice({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success';
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/40 bg-info/10 text-info',
    warn: 'border-warn/40 bg-warn/10 text-warn',
    danger: 'border-danger/40 bg-danger/10 text-danger',
    success: 'border-success/40 bg-success/10 text-success',
  };

  return (
    <div className={cn('rounded-lg border p-3', tones[tone], className)}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      {children && <div className="text-sm text-ink-muted">{children}</div>}
    </div>
  );
}
