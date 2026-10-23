import { cn } from '../../lib/cn.js';

export interface SpinnerProps {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  /** Accessible label; pass `null` when a parent already announces the busy state. */
  label?: string | null;
  className?: string;
}

const SIZE = { xs: 'size-3.5', sm: 'size-4', md: 'size-6', lg: 'size-9' } as const;

/** Circular indeterminate spinner (inherits `currentColor`). Prefer skeletons for content loading. */
export function Spinner({ size = 'md', label = 'در حال بارگذاری', className }: SpinnerProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', SIZE[size], className)}
      role={label ? 'status' : undefined}
      aria-label={label ?? undefined}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
