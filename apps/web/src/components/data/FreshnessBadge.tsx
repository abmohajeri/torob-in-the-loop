import { CircleCheck, CircleHelp, Clock3, Hourglass, TriangleAlert, type LucideIcon } from 'lucide-react';
import { FRESHNESS_META, formatJalaliDate, formatRelative, type Freshness } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { InfoPopover } from '../ui/InfoPopover.js';
import { FRESHNESS_TONE } from '../../lib/labels.js';
import { cn } from '../../lib/cn.js';

export const FRESHNESS_ICON: Record<Freshness, LucideIcon> = {
  fresh: CircleCheck,
  recent: Clock3,
  stale: Hourglass,
  very_stale: TriangleAlert,
  unknown: CircleHelp,
};

export interface FreshnessBadgeProps {
  freshness: Freshness;
  /** When the registered price last changed (for the explanation bubble). */
  changedAt?: string | null;
  /** short = «تازه» · long = «قیمت تازه». */
  variant?: 'short' | 'long';
  size?: 'sm' | 'md';
  /** Show an ⓘ explanation next to the badge. */
  explain?: boolean;
  className?: string;
}

/** Age of the registered price as a colored badge (≤۳ روز تازه · ≤۱۴ اخیر · ≤۶۰ قدیمی · بیشتر خیلی قدیمی). */
export function FreshnessBadge({ freshness, changedAt, variant = 'long', size = 'md', explain, className }: FreshnessBadgeProps) {
  const meta = FRESHNESS_META[freshness];
  const badge = (
    <Badge tone={FRESHNESS_TONE[freshness]} icon={FRESHNESS_ICON[freshness]} size={size} className={className}>
      {variant === 'short' ? meta.short : meta.label}
    </Badge>
  );
  if (!explain) return badge;
  return (
    <span className={cn('inline-flex items-center gap-0.5')}>
      {badge}
      <InfoPopover label="درباره تازگی قیمت" title={meta.label} align="end">
        {meta.hint}
        {changedAt ? (
          <span className="mt-1 block text-muted">
            آخرین تغییر: {formatJalaliDate(changedAt)} ({formatRelative(changedAt)})
          </span>
        ) : null}
      </InfoPopover>
    </span>
  );
}
