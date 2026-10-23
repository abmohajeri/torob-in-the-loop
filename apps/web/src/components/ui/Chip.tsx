import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export type ChipSize = 'sm' | 'md' | 'lg';

const SIZE: Record<ChipSize, string> = {
  sm: 'h-8 gap-1 px-3 text-caption [&_svg]:size-3.5',
  md: 'h-9 gap-1.5 px-3.5 text-meta [&_svg]:size-4',
  lg: 'h-11 gap-2 px-4 text-body [&_svg]:size-[1.125rem]',
};

const STATE = {
  idle: 'bg-surface text-ink-2 border-line hover:border-primary-200 hover:bg-primary-tint/50',
  active: 'bg-primary-tint text-primary-ink border-primary/70 hover:bg-primary-100',
  accent: 'bg-accent-tint text-accent-ink border-accent-200 hover:bg-accent-100',
} as const;

export interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  /** Toggle semantics (`aria-pressed`). Leave undefined for action chips (quick replies, sheet openers). */
  selected?: boolean;
  /** Visual "has a value" state without toggle semantics (context-bar openers). */
  active?: boolean;
  icon?: LucideIcon;
  /** Count bubble (e.g. number of active conditions, option counts). */
  count?: number;
  /** Content after the label (e.g. ChevronDown for sheet openers). */
  trailing?: ReactNode;
  size?: ChipSize;
  tone?: 'default' | 'accent';
}

/** Interactive pill (≥ 44px hit area). For static labels use `Badge`. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { children, selected, active, icon: Icon, count, trailing, size = 'md', tone = 'default', className, type = 'button', ...rest },
  ref,
) {
  const on = selected ?? active ?? false;
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={selected === undefined ? undefined : selected}
      className={cn(
        'hit-44 inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap press',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 disabled:pointer-events-none',
        SIZE[size],
        tone === 'accent' && !on ? STATE.accent : on ? STATE.active : STATE.idle,
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className={on ? 'text-primary-strong' : 'text-muted'} /> : null}
      <span className="truncate">{children}</span>
      {count !== undefined && count > 0 ? (
        <span
          className={cn(
            'grid h-5 min-w-5 place-items-center rounded-full px-1 text-caption leading-none font-bold num',
            on ? 'bg-primary-strong text-white' : 'bg-sunken text-ink-2',
          )}
        >
          {formatNumber(count)}
        </span>
      ) : null}
      {trailing}
    </button>
  );
});

export interface RemovableChipProps {
  children: ReactNode;
  onRemove: () => void;
  /** Accessible name of the remove button, e.g. «حذف فیلتر قسطی». */
  removeLabel?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  size?: ChipSize;
  className?: string;
}

/** Applied-filter / NLU chip with a separate remove (×) control. */
export function RemovableChip({ children, onRemove, removeLabel, icon: Icon, onClick, size = 'md', className }: RemovableChipProps) {
  const label = typeof children === 'string' ? children : '';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border font-medium whitespace-nowrap',
        SIZE[size],
        STATE.active,
        'pe-1',
        className,
      )}
    >
      {onClick ? (
        <button type="button" onClick={onClick} className="hit-44 inline-flex items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-primary rounded-full">
          {Icon ? <Icon aria-hidden className="text-primary-strong" /> : null}
          {children}
        </button>
      ) : (
        <>
          {Icon ? <Icon aria-hidden className="text-primary-strong" /> : null}
          {children}
        </>
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel ?? (label ? `حذف ${label}` : 'حذف')}
        className="hit-44 ms-0.5 grid size-6 place-items-center rounded-full text-primary-ink/80 hover:bg-primary-100 hover:text-primary-ink focus-visible:outline-2 focus-visible:outline-primary"
      >
        <X aria-hidden className="size-3.5" />
      </button>
    </span>
  );
}

/** Horizontally scrolling chip row with faded edges (for short single-line rows like the context bar). */
export function ChipScroller({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={cn('fade-inline -mx-4 overflow-x-auto scrollbar-none', className)}>
      <div className="flex w-max items-center gap-2 px-4 py-1">{children}</div>
    </div>
  );
}
