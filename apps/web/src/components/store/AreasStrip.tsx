import { Footprints, MapPin, TrafficCone, TrainFront } from 'lucide-react';
import { formatDistance, formatMinutes, formatNumber, formatTomanShort, type AreaSummary } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export interface AreasStripProps {
  areas: AreaSummary[];
  /** Selected area (filters the list). */
  selected?: string | null;
  onSelect?: (area: string | null) => void;
  compact?: boolean;
  className?: string;
}

/** Horizontal area cards: «جمهوری — ۱۹ فروشنده · از ۳۸٫۹ م · ۲۵ دقیقه». Tap to filter the list. */
export function AreasStrip({ areas, selected, onSelect, compact, className }: AreasStripProps) {
  if (!areas.length) return null;
  const rows = compact ? areas.slice(0, 4) : areas;
  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 scrollbar-none', className)}>
      <ul className="flex w-max gap-2.5 pb-1" aria-label="محله‌ها">
        {rows.map((a) => {
          const active = selected === a.area;
          const Tag = onSelect ? 'button' : 'div';
          return (
            <li key={a.area}>
              <Tag
                {...(onSelect ? { type: 'button' as const, onClick: () => onSelect(active ? null : a.area), 'aria-pressed': active } : {})}
                className={cn(
                  'flex w-52 flex-col items-start gap-1 rounded-2xl border bg-surface p-3 text-start shadow-card',
                  onSelect && 'cursor-pointer press transition-colors hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary',
                  active ? 'border-primary ring-2 ring-primary/25' : 'border-line/80',
                )}
              >
                <span className="flex w-full items-center gap-1.5 text-body font-extrabold text-ink">
                  <MapPin aria-hidden className="size-4 shrink-0 text-primary" />
                  <span className="truncate">{a.area}</span>
                </span>
                <span className="num text-meta text-ink-2">
                  {formatNumber(a.storeCount)} فروشنده{a.priceMin !== null ? ` · از ${formatTomanShort(a.priceMin, false)}` : ''}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 text-caption text-muted">
                  {a.distanceKm !== null ? <span className="num">{formatDistance(a.distanceKm)}{a.etaMin !== null ? ` · ${formatMinutes(a.etaMin)}` : ''}</span> : null}
                  {a.walkableCluster ? (
                    <span className="inline-flex items-center gap-0.5 text-good-ink">
                      <Footprints aria-hidden className="size-3.5" />
                      پیاده‌روی بین مغازه‌ها
                    </span>
                  ) : null}
                </span>
                {a.inTrafficZone || a.nearestMetro ? (
                  <span className="flex flex-wrap gap-x-2 text-caption text-muted">
                    {a.inTrafficZone ? (
                      <span className="inline-flex items-center gap-0.5 text-warn-ink">
                        <TrafficCone aria-hidden className="size-3.5" />
                        طرح ترافیک
                      </span>
                    ) : null}
                    {a.nearestMetro ? (
                      <span className="inline-flex items-center gap-0.5">
                        <TrainFront aria-hidden className="size-3.5" />
                        مترو {a.nearestMetro.name}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </Tag>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
