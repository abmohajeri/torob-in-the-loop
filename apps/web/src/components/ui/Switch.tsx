import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name when there is no visible label (`aria-labelledby` wins when given). */
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/** iOS-style switch (role="switch"); thumb moves to the reading-end side (left in RTL) when on. */
export function Switch({ checked, onCheckedChange, label, labelledBy, describedBy, disabled, id, className }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'hit-44 relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors duration-200 ease-snappy',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50',
        checked ? 'border-primary-strong bg-primary-strong' : 'border-line bg-sunken',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute top-1/2 size-[1.375rem] -translate-y-1/2 rounded-full bg-white shadow-[0_1px_3px_rgb(15_23_42/0.25)]',
          'transition-[inset-inline-start] duration-200 ease-snappy',
          checked ? 'start-[calc(100%-1.375rem-2px)]' : 'start-[2px]',
        )}
      />
    </button>
  );
}

export interface ToggleRowProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Content shown under the row (e.g. provider chips when installment is on, a data note). */
  children?: ReactNode;
  /** Small badge next to the title (e.g. «داده ندارد»). */
  badge?: ReactNode;
  className?: string;
}

/** Settings row: icon · title + description · switch. The whole row is tappable. */
export function ToggleRow({ icon: Icon, title, description, checked, onCheckedChange, disabled, children, badge, className }: ToggleRowProps) {
  const id = useId();
  const titleId = `${id}-t`;
  const descId = `${id}-d`;
  return (
    <div className={cn('py-3', className)}>
      <div className="flex items-center gap-3">
        {Icon ? (
          <span
            aria-hidden
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-2xl transition-colors duration-200 [&_svg]:size-5',
              checked ? 'bg-primary-tint text-primary-strong' : 'bg-sunken text-muted',
            )}
          >
            <Icon />
          </span>
        ) : null}
        <div
          className={cn('min-w-0 flex-1', !disabled && 'cursor-pointer')}
          onClick={() => !disabled && onCheckedChange(!checked)}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span id={titleId} className="text-body font-bold text-ink">
              {title}
            </span>
            {badge}
          </div>
          {description ? (
            <p id={descId} className="text-meta text-muted">
              {description}
            </p>
          ) : null}
        </div>
        <Switch
          checked={checked}
          onCheckedChange={onCheckedChange}
          labelledBy={titleId}
          describedBy={description ? descId : undefined}
          disabled={disabled}
        />
      </div>
      {children ? <div className="mt-3 ps-[3.25rem]">{children}</div> : null}
    </div>
  );
}
