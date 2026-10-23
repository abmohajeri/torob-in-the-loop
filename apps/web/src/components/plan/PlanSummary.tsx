import { Link } from 'react-router';
import { AlertTriangle, ChevronLeft, Clock, MapPinned, Route, TrafficCone } from 'lucide-react';
import { formatDistance, formatMinutes, formatNumber, formatTimeOfDay, TRAVEL_MODE_META, type VisitPlan } from '@titl/shared';
import { TRAVEL_MODE_ICON } from '../../lib/icons.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

export interface PlanSummaryProps {
  plan: VisitPlan;
  /** Chat preview: one card + «مشاهده کامل». */
  compact?: boolean;
  className?: string;
}

/** «۳ توقف · ۲۵ دقیقه پیاده · ۱٫۴ کیلومتر» + leave-by line + top warning. */
export function PlanSummary({ plan, compact, className }: PlanSummaryProps) {
  const ModeIcon = TRAVEL_MODE_ICON[plan.mode];
  const closed = plan.stops.filter((s) => s.openAtArrival.state === 'closed' || s.openAtArrival.state === 'opens_later_today').length;
  const body = (
    <>
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-strong text-white">
          <Route className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-title font-extrabold text-heading">
            {formatNumber(plan.stops.length)} توقف · {formatMinutes(plan.totalMinutes)}
          </p>
          <p className="flex flex-wrap items-center gap-x-1.5 text-meta text-ink-2">
            <ModeIcon aria-hidden className="size-4 text-primary" />
            {TRAVEL_MODE_META[plan.mode].label} · <span className="num">{formatDistance(plan.totalDistanceKm)}</span> · حرکت <span className="num">{formatTimeOfDay(plan.departAt)}</span>
          </p>
        </div>
        {compact ? (
          <span className="inline-flex shrink-0 items-center text-caption font-bold text-primary-strong">
            مشاهده کامل
            <ChevronLeft aria-hidden className="size-4" />
          </span>
        ) : null}
      </div>
      {plan.leaveBy ? (
        <p className="mt-2.5 flex items-start gap-2 text-meta leading-6 text-good-ink">
          <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          اگر تا ساعت <b className="num">{formatTimeOfDay(plan.leaveBy)}</b> راه بیفتید، همه فروشگاه‌ها هنگام رسیدن باز هستند.
        </p>
      ) : closed ? (
        <p className="mt-2.5 flex items-start gap-2 text-meta leading-6 text-bad-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          {formatNumber(closed)} فروشگاه هنگام رسیدن باز نیست؛ زمان حرکت را عوض کنید.
        </p>
      ) : null}
      {!compact && plan.trafficZone.anyStopInside && plan.trafficZone.note ? (
        <p className="mt-1.5 flex items-start gap-2 text-meta leading-6 text-warn-ink">
          <TrafficCone aria-hidden className="mt-0.5 size-4 shrink-0" />
          {plan.trafficZone.note}
        </p>
      ) : null}
      {compact && plan.stops.length ? (
        <p className="mt-2 flex items-center gap-1.5 truncate text-caption text-muted">
          <MapPinned aria-hidden className="size-3.5 shrink-0" />
          {plan.stops.map((s) => s.shop.name).join(' ← ')}
        </p>
      ) : null}
    </>
  );
  const cls = cn('block rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card', className);
  return compact ? (
    <Link to={paths.plan} className={cn(cls, 'press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary')}>
      {body}
    </Link>
  ) : (
    <section className={cls} aria-label="خلاصه برنامه">
      {body}
    </section>
  );
}
