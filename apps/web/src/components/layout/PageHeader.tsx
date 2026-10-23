import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { IconButton } from '../ui/IconButton.js';
import { cn } from '../../lib/cn.js';

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Where «بازگشت» goes when there is no in-app history (deep link). Default «/». */
  backTo?: string;
  /** Hide the back button (top-level pages). */
  noBack?: boolean;
  /** Trailing actions (share, map…), placed on the left in RTL. */
  actions?: ReactNode;
  /** Extra row under the title (tabs, search field, context bar). */
  children?: ReactNode;
  className?: string;
}

/** Sticky page header with back (→ in RTL), title (1 line), optional subtitle and actions. */
export function PageHeader({ title, subtitle, backTo = '/', noBack, actions, children, className }: PageHeaderProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = () => {
    // react-router stores the history index; key 'default' means this is the first entry (deep link).
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0 && location.key !== 'default') navigate(-1);
    else navigate(backTo, { replace: true });
  };
  return (
    <header className={cn('sticky top-0 z-30 bg-canvas/88 pt-safe backdrop-blur-md', className)}>
      <div className="flex min-h-[var(--header-h)] items-center gap-1.5 px-2.5">
        {noBack ? <span className="w-1.5" /> : <IconButton icon={ArrowRight} label="بازگشت" onClick={goBack} />}
        <div className="min-w-0 flex-1 py-1.5">
          <h1 className="truncate text-title leading-snug font-extrabold text-heading">{title}</h1>
          {subtitle ? <p className="truncate text-caption text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </header>
  );
}
