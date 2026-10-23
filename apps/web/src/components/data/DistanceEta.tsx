import { LocateFixed, MapPin } from 'lucide-react';
import { formatDistance, formatMinutes, type TravelMode } from '@titl/shared';
import { TRAVEL_MODE_ICON } from '../../lib/icons.js';
import { TRAVEL_VERB } from '../../lib/labels.js';
import { openContextSheet } from '../../state/useUi.js';
import { cn } from '../../lib/cn.js';

export interface DistanceEtaProps {
  distanceKm: number | null | undefined;
  etaMin?: number | null;
  mode?: TravelMode;
  /** Without a location, show a «تعیین موقعیت» link that opens the location sheet (default true). */
  promptLocation?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** «۱٫۲ کیلومتر · ۱۵ دقیقه پیاده (تخمینی)» — estimates are always labeled as such. */
export function DistanceEta({ distanceKm, etaMin, mode = 'walk', promptLocation = true, size = 'md', className }: DistanceEtaProps) {
  const text = size === 'sm' ? 'text-caption' : 'text-meta';
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) {
    if (!promptLocation) return null;
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openContextSheet('location');
        }}
        className={cn(
          'hit-44 inline-flex items-center gap-1 rounded-full font-bold text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary',
          text,
          className,
        )}
      >
        <LocateFixed aria-hidden className="size-4" />
        برای دیدن فاصله، موقعیت را تعیین کنید
      </button>
    );
  }
  const ModeIcon = TRAVEL_MODE_ICON[mode];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-ink-2', text, className)}>
      <span className="inline-flex items-center gap-1 font-bold">
        <MapPin aria-hidden className="size-4 text-primary" />
        <span className="num">{formatDistance(distanceKm)}</span>
      </span>
      {etaMin !== null && etaMin !== undefined && Number.isFinite(etaMin) ? (
        <span className="inline-flex items-center gap-1 text-muted">
          <span aria-hidden>·</span>
          <ModeIcon aria-hidden className="size-4" />
          <span className="num">
            {formatMinutes(etaMin)} {TRAVEL_VERB[mode]}
          </span>
          <span className="rounded bg-sunken px-1 text-caption text-faint">تخمینی</span>
        </span>
      ) : null}
    </span>
  );
}
