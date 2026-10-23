import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: ReactNode;
  /** Visually hide the label (still announced). */
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  startIcon?: LucideIcon;
  /** Trailing content inside the field (unit «میلیون تومان», clear button…). */
  end?: ReactNode;
  size?: 'md' | 'lg';
  containerClassName?: string;
}

/**
 * Text input with label/hint/error wiring. Font-size ≥ 16px avoids iOS zoom-on-focus.
 * For numbers typed with Persian digits use `inputMode="decimal"` + `parseLocaleNumber` (lib/numbers.ts).
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, startIcon: Icon, end, size = 'md', className, containerClassName, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errId = error ? `${inputId}-err` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', containerClassName)}>
      {label ? (
        <label htmlFor={inputId} className={cn('text-meta font-bold text-ink-2', hideLabel && 'sr-only')}>
          {label}
        </label>
      ) : null}
      <div
        className={cn(
          'group flex items-center gap-2 rounded-2xl border bg-surface px-3.5 transition-[border-color,box-shadow] duration-200',
          'focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/15',
          error ? 'border-bad' : 'border-line hover:border-primary-200',
          size === 'lg' ? 'h-13' : 'h-12',
        )}
      >
        {Icon ? <Icon aria-hidden className="size-5 shrink-0 text-faint group-focus-within:text-primary-strong" /> : null}
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[hintId, errId].filter(Boolean).join(' ') || undefined}
          className={cn('h-full min-w-0 flex-1 bg-transparent text-[1rem] text-ink outline-none', className)}
          {...rest}
        />
        {end}
      </div>
      {error ? (
        <p id={errId} className="text-caption font-medium text-bad-ink">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-caption text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
