import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'danger'
  | 'success'
  | 'gold';

export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-500 text-white hover:bg-brand-400 active:bg-brand-600 shadow-card disabled:hover:bg-brand-500',
  secondary:
    'bg-raised text-ink hover:bg-overlay border border-hairline disabled:hover:bg-raised',
  ghost: 'text-ink-muted hover:text-ink hover:bg-raised disabled:hover:bg-transparent',
  outline:
    'border border-hairline text-ink hover:border-brand-400 hover:text-brand-300 disabled:hover:border-hairline',
  danger: 'bg-danger text-white hover:brightness-110 active:brightness-95',
  success: 'bg-success text-white hover:brightness-110 active:brightness-95',
  gold: 'bg-gold-500 text-ink-inverse font-semibold hover:bg-gold-400 active:bg-gold-600',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
  // Sized for a finger on a POS touchscreen.
  xl: 'h-16 px-6 text-lg gap-2.5 rounded-xl font-semibold',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    icon,
    iconRight,
    fullWidth = false,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-colors duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        icon && <span aria-hidden className="shrink-0">{icon}</span>
      )}
      {children}
      {iconRight && !loading && <span aria-hidden className="shrink-0">{iconRight}</span>}
    </button>
  );
});

/** Square icon-only button. `label` is required — it becomes the accessible name. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, 'children' | 'icon' | 'iconRight' | 'fullWidth'> & {
    label: string;
    icon: ReactNode;
  }
>(function IconButton({ label, icon, size = 'md', className, ...rest }, ref) {
  const box = { sm: 'h-8 w-8', md: 'h-10 w-10', lg: 'h-12 w-12', xl: 'h-16 w-16' }[size];
  return (
    <Button
      ref={ref}
      size={size}
      aria-label={label}
      title={label}
      className={cn('px-0', box, className)}
      {...rest}
    >
      <span aria-hidden>{icon}</span>
    </Button>
  );
});
