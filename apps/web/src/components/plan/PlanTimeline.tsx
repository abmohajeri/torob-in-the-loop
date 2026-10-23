import { Fragment } from 'react';
import { Link } from 'react-router';
import { Building2, Footprints, Hand, MapPinCheck, Navigation, Trash2 } from 'lucide-react';
import { formatClock, formatDistance, formatMinutes, formatTimeOfDay, formatTomanShort, navLinksFor, TRAVEL_MODE_META, type PlanStop, type VisitPlan } from '@titl/shared';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { VerifiedBadge } from '../data/VerifiedBadge.js';
import { Button, ButtonAnchor } from '../ui/Button.js';
import { IconButton } from '../ui/IconButton.js';
import { paths } from '../../lib/paths.js';
import { formatClockish } from '../../lib/labels.js';
import { cn } from '../../lib/cn.js';
import { OnSiteActions } from './OnSiteActions.js';

export interface PlanTimelineProps {
  plan: VisitPlan;
  /** Index of the stop the user is at (on-site mode); null = not started. */
  current: number | null;
  onArrive: (index: number) => void;
  onRemove?: (stop: PlanStop) => void;
  /** Shop id to flash (after a swap). */
  highlightShopId?: string | null;
}

function legText(stop: PlanStop, prev: PlanStop | undefined): string | null {
  const leg = stop.legFromPrev;
  if (!leg) return null;
  const sameMall = prev && prev.shop.location.mall && prev.shop.location.mall.id === stop.shop.location.mall?.id;
  const base = `${formatMinutes(leg.minutes)} ${TRAVEL_MODE_META[leg.mode].label} · ${formatDistance(leg.distanceKm)}`;
  if (!sameMall) return base;
  const df = (stop.shop.location.floorNum ?? 0) - (prev!.shop.location.floorNum ?? 0);
  const floor = stop.shop.location.floorNum === null || prev!.shop.location.floorNum === null ? '' : df === 0 ? ' ← همین طبقه' : df > 0 ? ` ← ${df === 1 ? 'یک' : df} طبقه بالاتر` : ` ← ${df === -1 ? 'یک' : -df} طبقه پایین‌تر`;
  return `${formatMinutes(leg.minutes)} پیاده · همین پاساژ${floor}`;
}

/** Vertical timeline of stops: arrival time, open-at-arrival, verified result + hold, in-mall guide, on-site actions. */
export function PlanTimeline({ plan, current, onArrive, onRemove, highlightShopId }: PlanTimelineProps) {
  return (
    <ol className="relative flex flex-col" aria-label="توقف‌ها">
      {plan.stops.map((s, i) => {
        const prev = plan.stops[i - 1];
        const leg = legText(s, prev);
        const mallStart = s.shop.location.mall && (!prev || prev.shop.location.mall?.id !== s.shop.location.mall.id);
        const mallCount = mallStart ? plan.stops.filter((x) => x.shop.location.mall?.id === s.shop.location.mall!.id).length : 0;
        const here = current === i;
        const done = current !== null && i < current;
        const nav = navLinksFor({ lat: s.shop.lat, lng: s.shop.lng }, s.shop.name);
        const verified = s.offer?.verified;
        return (
          <Fragment key={`${s.shop.id}-${s.product?.id ?? ''}`}>
            {leg ? (
              <li aria-hidden={false} className="flex items-center gap-3 py-1.5 ps-4">
                <span className="h-8 w-0.5 rounded-full bg-line" />
                <span className="flex items-center gap-1.5 text-caption text-muted">
                  <Footprints aria-hidden className="size-3.5" />
                  <span className="num">{leg}</span>
                </span>
              </li>
            ) : null}
            {mallStart && mallCount > 1 ? (
              <li className="mt-1 flex items-center gap-1.5 px-1 pb-1.5 text-meta font-bold text-primary-strong">
                <Building2 aria-hidden className="size-4" />
                {s.shop.location.mall!.name} — {mallCount.toLocaleString('fa-IR')} توقف
              </li>
            ) : null}
            <li
              className={cn(
                'relative rounded-2xl border bg-surface p-3.5 shadow-card transition-[box-shadow,border-color] duration-300',
                here ? 'border-primary ring-2 ring-primary/25' : 'border-line/80',
                highlightShopId === s.shop.id && 'ring-4 ring-accent/40 border-accent',
                done && 'opacity-70',
              )}
              aria-current={here ? 'step' : undefined}
            >
              <div className="flex items-start gap-3">
                <span className={cn('num grid size-9 shrink-0 place-items-center rounded-full text-meta font-extrabold', here ? 'bg-primary-strong text-white' : 'bg-primary-tint text-primary-ink')}>
                  {(i + 1).toLocaleString('fa-IR')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="num text-caption font-medium text-muted">رسیدن حدود ساعت {formatTimeOfDay(s.arriveAt)} · {formatMinutes(s.dwellMin)} توقف</p>
                  <h3 className="text-body font-extrabold text-ink">
                    <Link to={paths.shop(s.shop.id)} className="hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary">
                      {s.shop.name}
                    </Link>
                  </h3>
                  {s.product ? <p className="truncate text-caption text-muted">{s.product.title}</p> : null}
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="text-caption text-muted">هنگام رسیدن:</span>
                    <OpenStatusBadge status={s.openAtArrival} size="sm" />
                  </div>
                  {s.offer?.price.price != null && !verified ? (
                    <p className="mt-1 text-caption text-ink-2">
                      قیمت ثبت‌شده <span className="num font-bold">{formatTomanShort(s.offer.price.price)}</span>
                    </p>
                  ) : null}
                </div>
                {onRemove ? <IconButton icon={Trash2} label={`حذف ${s.shop.name} از برنامه`} size="sm" variant="ghost" onClick={() => onRemove(s)} /> : null}
              </div>
              {verified ? (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <VerifiedBadge info={verified} variant="compact" />
                  {verified.holdUntil ? (
                    <p className="flex items-center gap-1.5 text-meta font-medium text-verified">
                      <Hand aria-hidden className="size-4" />
                      نگه‌داشته شده تا <span className="num">{formatClockish(verified.holdUntil)}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
              {s.warnings.length ? <ReasonChips reasons={s.warnings} max={2} size="sm" className="mt-2" /> : null}
              {here ? (
                <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
                  <InMallGuide location={s.guide} variant="card" />
                  <OnSiteActions stop={s} />
                </div>
              ) : !s.shop.location.guide.length ? null : (
                <InMallGuide location={s.guide} variant="line" linkMall={false} className="mt-2" />
              )}
              <div className="mt-3 flex gap-2">
                <ButtonAnchor href={nav.neshan} external size="sm" variant="secondary" startIcon={Navigation} className="flex-1" aria-label={`مسیریابی به ${s.shop.name}`}>
                  مسیر
                </ButtonAnchor>
                {!here ? (
                  <Button size="sm" variant={current === null && i === 0 ? 'primary' : 'outline'} startIcon={MapPinCheck} className="flex-1" onClick={() => onArrive(i)}>
                    رسیدم
                  </Button>
                ) : null}
              </div>
              {s.openAtArrival.opensAt && s.openAtArrival.state !== 'open' ? (
                <p className="sr-only">باز می‌شود ساعت {formatClock(s.openAtArrival.opensAt)}</p>
              ) : null}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
