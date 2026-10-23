import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export interface SectionHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** Count shown after the title (e.g. number of stores). */
  count?: number;
  /** «همه» link on the reading-end side. */
  more?: { label?: string; to: string };
  /** Arbitrary trailing action (overrides `more`). */
  action?: ReactNode;
  as?: 'h2' | 'h3';
  id?: string;
  className?: string;
}

/** Title row for a content section: icon · title (count) · subtitle · «همه ←». */
export function SectionHeader({ title, subtitle, icon: Icon, count, more, action, as = 'h2', id, className }: SectionHeaderProps) {
  const H = as;
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {Icon ? (
          <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong [&_svg]:size-[1.125rem]">
            <Icon />
          </span>
        ) : null}
        <div className="min-w-0">
          <H id={id} className="flex items-baseline gap-1.5 text-title font-extrabold text-heading">
            <span className="truncate">{title}</span>
            {count !== undefined ? <span className="num text-meta font-medium text-muted">({formatNumber(count)})</span> : null}
          </H>
          {subtitle ? <p className="text-meta text-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ??
        (more ? (
          <Link
            to={more.to}
            className="hit-44 inline-flex shrink-0 items-center gap-0.5 rounded-lg text-meta font-bold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary"
          >
            {more.label ?? 'همه'}
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        ) : null)}
    </div>
  );
}
