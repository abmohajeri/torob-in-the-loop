import { Link } from 'react-router';
import { Building2, ChevronLeft, Layers, TrafficCone, TrainFront } from 'lucide-react';
import { formatNumber, type MallDetail } from '@titl/shared';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

export interface MallSummaryCardProps {
  mall: MallDetail;
  compact?: boolean;
  className?: string;
}

/** Passage summary: name · area · shops · floors · metro/traffic zone → /mall/:slug. */
export function MallSummaryCard({ mall: m, compact, className }: MallSummaryCardProps) {
  const metro = m.nearbyMetro[0];
  return (
    <Link
      to={paths.mall(m.mall.slug)}
      className={cn('flex items-start gap-3 rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary', className)}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong">
        <Building2 className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-extrabold text-ink">{m.mall.name}</p>
        <p className="num text-meta text-ink-2">
          {formatNumber(m.mall.shopCount)} فروشگاه
          <Layers aria-hidden className="ms-2 me-0.5 inline size-3.5 text-muted" />
          {formatNumber(m.floors.length)} طبقه{m.mall.area ? ` · ${m.mall.area}` : ''}
        </p>
        {!compact ? (
          <p className="mt-1 flex flex-wrap gap-x-3 text-caption text-muted">
            {metro ? (
              <span className="inline-flex items-center gap-1">
                <TrainFront aria-hidden className="size-3.5" />
                مترو {metro.name} · {formatNumber(metro.walkMin)} دقیقه پیاده
              </span>
            ) : null}
            {m.inTrafficZone ? (
              <span className="inline-flex items-center gap-1 text-warn-ink">
                <TrafficCone aria-hidden className="size-3.5" />
                داخل طرح ترافیک
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
      <span className="mt-1 inline-flex shrink-0 items-center text-caption font-bold text-primary-strong">
        مشاهده کامل
        <ChevronLeft aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
