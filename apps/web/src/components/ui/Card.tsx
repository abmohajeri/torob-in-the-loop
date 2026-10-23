import { forwardRef, type HTMLAttributes, type Ref } from 'react';
import { cn } from '../../lib/cn.js';

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Hover/press feedback (for clickable cards — put the link/button INSIDE for semantics). */
  interactive?: boolean;
  tone?: 'default' | 'muted' | 'brand' | 'accent' | 'warn';
}

const PAD = { none: '', sm: 'p-3', md: 'p-4', lg: 'p-5' } as const;
const TONE = {
  default: 'bg-surface border-line/80',
  muted: 'bg-surface-2 border-line-soft',
  brand: 'bg-primary-tint border-primary-200',
  accent: 'bg-accent-tint border-accent-200',
  warn: 'bg-warn-tint border-warn-line',
} as const;

/** White rounded-2xl surface with a soft shadow — the base of every content block. */
export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { as = 'div', padding = 'md', interactive, tone = 'default', className, ...rest },
  ref,
) {
  const Comp = as as 'div';
  return (
    <Comp
      ref={ref as Ref<HTMLDivElement>}
      className={cn(
        'rounded-2xl border shadow-card',
        TONE[tone],
        PAD[padding],
        interactive &&
          'transition-[box-shadow,border-color,transform] duration-200 ease-snappy hover:border-primary-200 hover:shadow-raised active:scale-[0.995]',
        className,
      )}
      {...rest}
    />
  );
});
