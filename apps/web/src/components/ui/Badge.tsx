import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { TONE_OUTLINE, TONE_SOFT, TONE_SOLID, type BadgeTone } from './tone.js';

export interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: BadgeTone;
  variant?: 'soft' | 'solid' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  /** Small dot instead of an icon (e.g. live/online). */
  dot?: boolean;
  children: ReactNode;
}

const SIZE = {
  sm: 'h-5 gap-1 px-1.5 text-caption [&_svg]:size-3',
  md: 'h-6 gap-1 px-2 text-caption [&_svg]:size-3.5',
  lg: 'h-7 gap-1.5 px-2.5 text-meta [&_svg]:size-4',
} as const;

/**
 * Static status label (NOT interactive — use `Chip` for actions). Always pair tone with an icon or explicit text;
 * status is never conveyed by color alone.
 */
export function Badge({ tone = 'neutral', variant = 'soft', size = 'md', icon: Icon, dot, className, children, ...rest }: BadgeProps) {
  const palette = variant === 'solid' ? TONE_SOLID : variant === 'outline' ? TONE_OUTLINE : TONE_SOFT;
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center rounded-full border font-medium whitespace-nowrap',
        SIZE[size],
        palette[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" /> : Icon ? <Icon aria-hidden /> : null}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}
export type { BadgeTone } from './tone.js';
