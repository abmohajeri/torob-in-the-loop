import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.js';

export type IconButtonVariant = 'ghost' | 'secondary' | 'soft' | 'primary' | 'accent' | 'overlay';
export type IconButtonSize = 'sm' | 'md' | 'lg';

const VARIANT: Record<IconButtonVariant, string> = {
  ghost: 'text-ink-2 hover:bg-sunken/80',
  secondary: 'bg-surface text-ink-2 border border-line shadow-card hover:border-primary-200 hover:text-primary-strong',
  soft: 'bg-primary-tint text-primary-strong hover:bg-primary-100',
  primary: 'bg-primary-strong text-white shadow-glow hover:bg-primary-800',
  accent: 'bg-accent-strong text-white shadow-glow-accent hover:bg-accent-800',
  overlay: 'bg-surface/90 text-ink-2 shadow-card backdrop-blur hover:text-primary-strong',
};

/** sm is 36px visually with a 44px hit area; md = 44px; lg = 48px. */
const SIZE: Record<IconButtonSize, string> = {
  sm: 'size-9 rounded-xl [&_svg]:size-[1.125rem] hit-44',
  md: 'size-11 rounded-xl [&_svg]:size-5',
  lg: 'size-12 rounded-2xl [&_svg]:size-[1.375rem]',
};

const BASE =
  'relative inline-flex shrink-0 items-center justify-center press disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

interface IconButtonOwnProps {
  /** Accessible name (Persian) — required for icon-only controls. */
  label: string;
  icon: LucideIcon;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** Small count bubble (e.g. unread). 0/undefined hides it. */
  badge?: number;
  loading?: boolean;
  /** Show a round button instead of rounded-square. */
  round?: boolean;
}

function Badge({ n }: { n?: number }) {
  if (!n) return null;
  return (
    <span className="absolute -top-1 -end-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent-strong px-1 text-caption leading-none font-bold text-white ring-2 ring-surface num">
      {n > 9 ? '+۹' : formatNumber(n)}
    </span>
  );
}

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>, IconButtonOwnProps {}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon: Icon, variant = 'ghost', size = 'md', badge, loading, round, className, type = 'button', disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], SIZE[size], round && 'rounded-full', className)}
      {...rest}
    >
      {loading ? <Spinner size="sm" label={null} /> : <Icon aria-hidden />}
      <Badge n={badge} />
    </button>
  );
});

export interface IconLinkProps extends Omit<LinkProps, 'children'>, Omit<IconButtonOwnProps, 'loading'> {}

/** Icon-only navigation link. */
export const IconLink = forwardRef<HTMLAnchorElement, IconLinkProps>(function IconLink(
  { label, icon: Icon, variant = 'ghost', size = 'md', badge, round, className, ...rest },
  ref,
) {
  return (
    <Link ref={ref} aria-label={label} title={label} className={cn(BASE, VARIANT[variant], SIZE[size], round && 'rounded-full', className)} {...rest}>
      <Icon aria-hidden />
      <Badge n={badge} />
    </Link>
  );
});
