import type { ReactNode } from 'react';
import { SearchX, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Primary/secondary actions — an empty state is never a dead end (widen radius, remove filter, ask stores…). */
  actions?: ReactNode;
  /** Extra content under the actions (e.g. suggestion chips). */
  children?: ReactNode;
  tone?: 'neutral' | 'brand' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TONE = {
  neutral: 'bg-sunken text-muted',
  brand: 'bg-primary-tint text-primary-strong ring-1 ring-primary-100',
  accent: 'bg-accent-tint text-accent-strong ring-1 ring-accent-100',
} as const;

/** Friendly empty result with an icon medallion, explanation and next-step actions. */
export function EmptyState({ icon: Icon = SearchX, title, description, actions, children, tone = 'brand', size = 'md', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center animate-rise-in',
        size === 'sm' ? 'gap-2 px-4 py-6' : size === 'lg' ? 'gap-3 px-6 py-14' : 'gap-3 px-5 py-10',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'relative grid place-items-center rounded-[1.75rem]',
          size === 'sm' ? 'size-12 [&_svg]:size-6' : 'size-16 [&_svg]:size-8',
          TONE[tone],
        )}
      >
        <Icon />
      </span>
      <div className="flex max-w-[22rem] flex-col gap-1">
        <h3 className={cn('font-extrabold text-heading', size === 'sm' ? 'text-body' : 'text-title')}>{title}</h3>
        {description ? <p className="text-meta text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
      {children}
    </div>
  );
}
