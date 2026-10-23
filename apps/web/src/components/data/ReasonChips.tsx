import { formatNumber, type Reason } from '@titl/shared';
import { TONE_ICON, TONE_SOFT } from '../ui/tone.js';
import { cn } from '../../lib/cn.js';

export interface ReasonChipsProps {
  reasons: Reason[];
  /** Max chips before «+N» (default 3). */
  max?: number;
  size?: 'sm' | 'md';
  /** Hide tone icons (very dense rows). */
  noIcon?: boolean;
  className?: string;
}

/**
 * «Why» chips: why something is recommended (good/info) or a caveat (warn/bad). Static labels — not buttons.
 */
export function ReasonChips({ reasons, max = 3, size = 'md', noIcon, className }: ReasonChipsProps) {
  if (!reasons.length) return null;
  const shown = reasons.slice(0, max);
  const rest = reasons.length - shown.length;
  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="دلیل‌های پیشنهاد">
      {shown.map((r) => {
        const Icon = TONE_ICON[r.tone];
        return (
          <li
            key={`${r.code}-${r.label}`}
            className={cn(
              'inline-flex max-w-full items-center gap-1 rounded-lg border font-medium',
              size === 'sm' ? 'px-1.5 py-0.5 text-caption [&_svg]:size-3' : 'px-2 py-1 text-caption [&_svg]:size-3.5',
              TONE_SOFT[r.tone],
            )}
          >
            {noIcon ? null : <Icon aria-hidden />}
            <span className="truncate">{r.label}</span>
          </li>
        );
      })}
      {rest > 0 ? (
        <li className="rounded-lg bg-sunken px-1.5 py-0.5 text-caption font-medium text-muted" aria-label={`${formatNumber(rest)} دلیل دیگر`}>
          +{formatNumber(rest)}
        </li>
      ) : null}
    </ul>
  );
}
