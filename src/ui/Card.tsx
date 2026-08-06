import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Card({
  className,
  glass = false,
  interactive = false,
  ...rest
}: HTMLAttributes<HTMLDivElement> & { glass?: boolean; interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-card border border-hairline bg-surface shadow-card',
        glass && 'glass',
        interactive &&
          'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-lift',
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({
  title,
  description,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-3 border-b border-hairline px-5 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="truncate font-display text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-end gap-2 border-t border-hairline px-5 py-3',
        className,
      )}
      {...rest}
    />
  );
}

/**
 * A single headline metric.
 *
 * `delta` is rendered with an explicit ▲/▼ as well as colour so the direction
 * survives greyscale printing and colour-blindness.
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  delta,
  tone = 'neutral',
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  delta?: { value: string; direction: 'up' | 'down' | 'flat' };
  tone?: 'neutral' | 'brand' | 'info' | 'success' | 'warn' | 'danger';
  className?: string;
}) {
  const accent = {
    neutral: 'text-ink-muted',
    brand: 'text-brand-300',
    info: 'text-info',
    success: 'text-success',
    warn: 'text-warn',
    danger: 'text-danger',
  }[tone];

  const deltaTone =
    delta?.direction === 'up'
      ? 'text-success'
      : delta?.direction === 'down'
        ? 'text-danger'
        : 'text-ink-subtle';

  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
        {icon && <span className={cn('shrink-0', accent)}>{icon}</span>}
      </div>
      <p className="tabular mt-2 font-display text-2xl font-semibold text-ink">{value}</p>
      <div className="mt-1 flex items-center gap-2">
        {delta && (
          <span className={cn('tabular text-xs font-medium', deltaTone)}>
            {delta.direction === 'up' ? '▲' : delta.direction === 'down' ? '▼' : '■'} {delta.value}
          </span>
        )}
        {sub && <span className="truncate text-xs text-ink-subtle">{sub}</span>}
      </div>
    </Card>
  );
}

/** Page-level section wrapper used across console modules. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      {title && <CardHeader title={title} description={description} actions={actions} />}
      <div className={cn(title ? '' : 'pt-0', bodyClassName ?? 'p-5')}>{children}</div>
    </Card>
  );
}
