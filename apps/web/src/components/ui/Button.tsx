import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { Spinner } from './Spinner.js';

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'outline' | 'soft' | 'ghost' | 'danger' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BASE =
  'inline-flex items-center justify-center font-bold whitespace-nowrap select-none press ' +
  'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-primary-strong text-white shadow-glow hover:bg-primary-800 active:bg-primary-900',
  accent: 'bg-accent-strong text-white shadow-glow-accent hover:bg-accent-800 active:bg-accent-900',
  secondary: 'bg-surface text-ink border border-line shadow-card hover:border-primary-200 hover:bg-primary-tint/60',
  outline: 'bg-surface text-primary-strong border border-primary-strong/45 hover:bg-primary-tint hover:border-primary-strong',
  soft: 'bg-primary-tint text-primary-ink border border-primary-100 hover:bg-primary-100',
  ghost: 'bg-transparent text-ink-2 hover:bg-sunken/80',
  danger: 'bg-bad text-white hover:bg-bad-ink',
  link: 'bg-transparent text-primary-strong underline-offset-4 hover:underline',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 rounded-xl px-3 text-meta [&_svg]:size-4',
  md: 'h-11 gap-2 rounded-xl px-4 text-body [&_svg]:size-[1.125rem]',
  lg: 'h-12 gap-2 rounded-2xl px-5 text-body [&_svg]:size-5',
};

const LINK_SIZE: Record<ButtonSize, string> = {
  sm: 'gap-1 text-meta [&_svg]:size-4',
  md: 'gap-1.5 text-body [&_svg]:size-[1.125rem]',
  lg: 'gap-1.5 text-title [&_svg]:size-5',
};

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/** Class string for anything that should look like a button (links, labels…). */
export function buttonClasses({ variant = 'primary', size = 'md', fullWidth }: ButtonStyleProps = {}, className?: string): string {
  return cn(BASE, VARIANT[variant], variant === 'link' ? LINK_SIZE[size] : SIZE[size], variant === 'link' && 'hit-44', fullWidth && 'w-full', className);
}

interface ContentProps {
  /** Icon on the reading-start side (right in RTL). */
  startIcon?: LucideIcon;
  /** Icon on the reading-end side (left in RTL), e.g. ChevronLeft for "next". */
  endIcon?: LucideIcon;
  loading?: boolean;
  children?: ReactNode;
}

function Content({ startIcon: Start, endIcon: End, loading, children }: ContentProps) {
  return (
    <>
      {loading ? <Spinner size="sm" label={null} /> : Start ? <Start aria-hidden /> : null}
      {children}
      {End && !loading ? <End aria-hidden /> : null}
    </>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ButtonStyleProps, ContentProps {}

/** Primary action button. `variant="accent"` = orange CTA (e.g. «استعلام از فروشگاه‌ها»). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, startIcon, endIcon, loading, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClasses({ variant, size, fullWidth }, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      <Content startIcon={startIcon} endIcon={endIcon} loading={loading}>
        {children}
      </Content>
    </button>
  );
});

export interface ButtonLinkProps extends LinkProps, ButtonStyleProps, Omit<ContentProps, 'loading'> {}

/** In-app navigation styled as a button (react-router `Link`). */
export const ButtonLink = forwardRef<HTMLAnchorElement, ButtonLinkProps>(function ButtonLink(
  { variant, size, fullWidth, startIcon, endIcon, className, children, ...rest },
  ref,
) {
  return (
    <Link ref={ref} className={buttonClasses({ variant, size, fullWidth }, className)} {...rest}>
      <Content startIcon={startIcon} endIcon={endIcon}>
        {children}
      </Content>
    </Link>
  );
});

export interface ButtonAnchorProps extends AnchorHTMLAttributes<HTMLAnchorElement>, ButtonStyleProps, Omit<ContentProps, 'loading'> {
  /** Open in a new tab with `rel="noopener noreferrer"` (default for http links). */
  external?: boolean;
}

/** External link (navigation apps, websites) styled as a button. */
export const ButtonAnchor = forwardRef<HTMLAnchorElement, ButtonAnchorProps>(function ButtonAnchor(
  { variant, size, fullWidth, startIcon, endIcon, className, children, external, href, ...rest },
  ref,
) {
  const isExternal = external ?? /^https?:/.test(href ?? '');
  return (
    <a
      ref={ref}
      href={href}
      className={buttonClasses({ variant, size, fullWidth }, className)}
      {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      {...rest}
    >
      <Content startIcon={startIcon} endIcon={endIcon}>
        {children}
      </Content>
    </a>
  );
});
