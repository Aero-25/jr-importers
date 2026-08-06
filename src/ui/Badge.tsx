import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { ORDER_STATUS_TONE } from '@/lib/constants';

export type Tone = 'neutral' | 'brand' | 'info' | 'success' | 'warn' | 'danger' | 'gold';

const TONES: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-muted border-hairline',
  brand: 'bg-brand-500/12 text-brand-300 border-brand-500/30',
  info: 'bg-info/12 text-info border-info/30',
  success: 'bg-success/12 text-success border-success/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  danger: 'bg-danger/12 text-danger border-danger/30',
  gold: 'bg-gold-500/12 text-gold-400 border-gold-500/30',
};

export function Badge({
  children,
  tone = 'neutral',
  size = 'md',
  icon,
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-2xs' : 'px-2.5 py-0.5 text-xs',
        TONES[tone],
        className,
      )}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {children}
    </span>
  );
}

/** Order status with the tone mapping applied from one place. */
export function StatusBadge({ status, size }: { status: string | null; size?: 'sm' | 'md' }) {
  const label = status ?? 'Unknown';
  const tone = (ORDER_STATUS_TONE[label] ?? 'neutral') as Tone;
  return (
    <Badge tone={tone} size={size}>
      {label}
    </Badge>
  );
}

/**
 * Stock level, stated in words as well as colour.
 * `reorderLevel` comes from the product so each line has its own threshold.
 */
export function StockBadge({
  stock,
  reorderLevel = 10,
  size,
}: {
  stock: number;
  reorderLevel?: number;
  size?: 'sm' | 'md';
}) {
  if (stock <= 0) {
    return (
      <Badge tone="danger" size={size}>
        Out of stock
      </Badge>
    );
  }
  if (stock <= reorderLevel) {
    return (
      <Badge tone="warn" size={size}>
        Low · {stock} left
      </Badge>
    );
  }
  return (
    <Badge tone="success" size={size}>
      In stock · {stock}
    </Badge>
  );
}
