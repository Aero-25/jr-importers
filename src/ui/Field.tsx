import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/cn';

const CONTROL = cn(
  'w-full rounded-lg border border-hairline bg-surface px-3 text-ink',
  'placeholder:text-ink-subtle',
  'transition-colors duration-150',
  'hover:border-ink-subtle focus:border-brand-400',
  'disabled:cursor-not-allowed disabled:opacity-60',
  'aria-[invalid=true]:border-danger',
);

/**
 * Label + control + help/error, wired together by id.
 *
 * Errors use `aria-describedby` rather than only colour, so a screen reader
 * and a colour-blind user both get the message.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="block text-xs font-medium uppercase tracking-wide text-ink-muted"
        >
          {label}
          {required && (
            <span className="ml-1 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-subtle">{hint}</p>
      )}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, className, containerClassName, id, required, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={inputId}
      className={containerClassName}
    >
      <div className="relative">
        {leading && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          >
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            CONTROL,
            'h-10',
            leading && 'pl-9',
            trailing && 'pr-9',
            className,
          )}
          {...rest}
        />
        {trailing && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle">
            {trailing}
          </span>
        )}
      </div>
      {describedBy && (
        <span id={describedBy} className="sr-only">
          {error ?? hint}
        </span>
      )}
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id, required, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <textarea
        ref={ref}
        id={fieldId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'resize-y py-2', className)}
        {...rest}
      />
    </Field>
  );
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Convenience for simple lists; ignored when `children` is supplied. */
  options?: ReadonlyArray<{ value: string; label: string } | string>;
  placeholder?: string;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    hint,
    error,
    options,
    placeholder,
    className,
    containerClassName,
    id,
    required,
    children,
    ...rest
  },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;

  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      htmlFor={fieldId}
      className={containerClassName}
    >
      <select
        ref={ref}
        id={fieldId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'h-10 appearance-none pr-8', className)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%23708' %3E%3Cpath d='M6 8l4 4 4-4'/%3E%3C/svg%3E\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 0.6rem center',
          backgroundSize: '1.1rem',
        }}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children ??
          options?.map((opt) => {
            const value = typeof opt === 'string' ? opt : opt.value;
            const text = typeof opt === 'string' ? opt : opt.label;
            return (
              <option key={value} value={value}>
                {text}
              </option>
            );
          })}
      </select>
    </Field>
  );
});

/** Checkbox with an inline label; the whole row is the click target. */
export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode; hint?: ReactNode }
>(function Checkbox({ label, hint, className, id, ...rest }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="flex gap-2.5">
      <input
        ref={ref}
        id={fieldId}
        type="checkbox"
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-hairline bg-surface',
          'text-brand-500 accent-brand-500',
          className,
        )}
        {...rest}
      />
      <label htmlFor={fieldId} className="cursor-pointer select-none text-sm text-ink">
        {label}
        {hint && <span className="block text-xs text-ink-subtle">{hint}</span>}
      </label>
    </div>
  );
});
