import type { ReactNode } from 'react';
import { CircleHelp, MessageCircleQuestion } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface UnknownProps {
  /** What is unknown, e.g. «قیمت ثبت نشده» (default «نامشخص»). */
  label?: ReactNode;
  /** Why it is unknown, e.g. «فروشنده ثبت نکرده». */
  why?: ReactNode;
  /** «بپرس» action — every unknown can be asked from the store. */
  onAsk?: () => void;
  askLabel?: string;
  size?: 'sm' | 'md';
  /** Inline (text flow) vs block (own row). */
  inline?: boolean;
  className?: string;
}

/**
 * Explicit "unknown" value: dashed outline + question icon + reason + optional «بپرس».
 * Never render missing data as 0, "—" or an empty space.
 */
export function Unknown({ label = 'نامشخص', why, onAsk, askLabel = 'بپرس', size = 'md', inline, className }: UnknownProps) {
  return (
    <span className={cn(inline ? 'inline-flex' : 'flex', 'max-w-full flex-wrap items-center gap-x-2 gap-y-1', className)}>
      <span
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-full border border-dashed border-line bg-surface-2 font-medium text-muted',
          size === 'sm' ? 'h-6 px-2 text-caption [&_svg]:size-3.5' : 'h-7 px-2.5 text-meta [&_svg]:size-4',
        )}
      >
        <CircleHelp aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      {why ? <span className="text-caption text-faint">{why}</span> : null}
      {onAsk ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAsk();
          }}
          className={cn(
            'hit-44 inline-flex items-center gap-1 rounded-full font-bold text-accent-strong press hover:text-accent-800',
            'focus-visible:outline-2 focus-visible:outline-primary',
            size === 'sm' ? 'text-caption [&_svg]:size-3.5' : 'text-meta [&_svg]:size-4',
          )}
        >
          <MessageCircleQuestion aria-hidden />
          {askLabel}
        </button>
      ) : null}
    </span>
  );
}
