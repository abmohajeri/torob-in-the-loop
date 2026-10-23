import { useId, useState, type ReactNode } from 'react';
import { Info, type LucideIcon } from 'lucide-react';
import { useDismiss } from '../../lib/hooks.js';
import { cn } from '../../lib/cn.js';

export interface InfoPopoverProps {
  /** Popover body (Persian explanation, e.g. how freshness is computed). */
  children: ReactNode;
  title?: ReactNode;
  /** Accessible name of the trigger, e.g. «توضیح تازگی قیمت». */
  label?: string;
  icon?: LucideIcon;
  /** Custom trigger content (rendered inside the button) instead of the icon. */
  trigger?: ReactNode;
  /** Horizontal anchoring of the bubble relative to the trigger. */
  align?: 'start' | 'end' | 'center';
  side?: 'top' | 'bottom';
  className?: string;
  triggerClassName?: string;
}

/**
 * Tap-to-open explanation bubble (no hover-only content on mobile). Closes on outside tap / Escape.
 */
export function InfoPopover({
  children,
  title,
  label = 'توضیح بیشتر',
  icon: Icon = Info,
  trigger,
  align = 'center',
  side = 'top',
  className,
  triggerClassName,
}: InfoPopoverProps) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss<HTMLSpanElement>(open, () => setOpen(false));
  const id = useId();
  return (
    <span ref={ref} className={cn('relative inline-flex align-middle', className)}>
      <button
        type="button"
        aria-label={trigger ? undefined : label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={cn(
          'hit-44 inline-flex items-center gap-1 rounded-full text-faint transition-colors hover:text-primary-strong',
          'focus-visible:outline-2 focus-visible:outline-primary',
          open && 'text-primary-strong',
          triggerClassName,
        )}
      >
        {trigger ?? <Icon aria-hidden className="size-4" />}
      </button>
      {open ? (
        <span
          id={id}
          role="note"
          className={cn(
            'absolute z-40 w-64 max-w-[78vw] rounded-2xl border border-line bg-surface p-3 text-start text-meta font-normal text-ink-2 shadow-raised animate-pop-in',
            side === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
            align === 'start' && 'start-0',
            align === 'end' && 'end-0',
            align === 'center' && 'left-1/2 -translate-x-1/2',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {title ? <span className="mb-1 block font-bold text-ink">{title}</span> : null}
          <span className="block leading-relaxed">{children}</span>
        </span>
      ) : null}
    </span>
  );
}
