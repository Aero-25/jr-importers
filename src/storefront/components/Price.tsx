import { money } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * A price, with the normal figure struck through when a sale price applies.
 * The saving is spelled out as a percentage so a shopper does not have to do
 * the sum, and the old price is announced to screen readers as such.
 */
export function Price({
  price,
  sale,
  className,
  wasClassName,
}: {
  price: number;
  sale: number | null;
  className?: string;
  wasClassName?: string;
}) {
  if (sale === null) return <span className={className}>{money(price)}</span>;
  const off = Math.round(((price - sale) / price) * 100);
  return (
    <span className="coast-price coast-price--sale inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={cn('coast-price__now', className)}>{money(sale)}</span>
      <s className={cn('coast-price__was text-sm font-medium text-ink-subtle', wasClassName)}>
        <span className="sr-only">Was </span>
        {money(price)}
      </s>
      {off > 0 && <span className="coast-price__off">−{off}%</span>}
    </span>
  );
}
