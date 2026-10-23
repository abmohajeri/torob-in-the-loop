import { TriangleAlert } from 'lucide-react';
import { formatJalaliDate, formatNumber, formatRelative, type RegisteredPrice, type VerifiedInfo } from '@titl/shared';
import { FreshnessBadge } from './FreshnessBadge.js';
import { Unknown } from './Unknown.js';
import { VerifiedBadge } from './VerifiedBadge.js';
import { InfoPopover } from '../ui/InfoPopover.js';
import { cn } from '../../lib/cn.js';

export interface PriceTagProps {
  /** Registered price (as listed on Torob by the seller). */
  price: RegisteredPrice;
  /** Highest variant price at the same shop (shown as «تا …»). */
  priceMax?: number | null;
  /** Verified result from an inquiry — rendered as a SEPARATE block under the registered price. */
  verified?: VerifiedInfo | null;
  size?: 'sm' | 'md' | 'lg';
  /** Show «ثبت: ۱۹ مهر ۱۴۰۵ · ۱۲ روز پیش» + freshness badge (default true). */
  showDate?: boolean;
  /** Small «قیمت ثبت‌شده» caption above the number (default true). */
  showLabel?: boolean;
  /** «بپرس» action for missing / suspicious / stale prices. */
  onAsk?: () => void;
  className?: string;
}

const NUM_SIZE = { sm: 'text-body', md: 'text-title', lg: 'text-headline' } as const;

/** Persian-digit integer Toman without unit (unit rendered smaller next to it). */
const toman = (n: number) => formatNumber(Math.round(n));

/**
 * Registered price + Jalali date + relative age + freshness. Missing → «قیمت ثبت نشده», suspicious →
 * «قیمت غیرعادی — احتمالاً خطای ثبت» with the raw value shown transparently. A verified price (call / seller)
 * is a distinct sky-blue block below — the two are never merged into one number.
 */
export function PriceTag({ price, priceMax, verified, size = 'md', showDate = true, showLabel = true, onAsk, className }: PriceTagProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {price.status === 'ok' && price.price !== null ? (
        <div className="min-w-0">
          {showLabel ? (
            <span className="flex items-center gap-1 text-caption font-medium text-muted">
              قیمت ثبت‌شده در ترب
              <InfoPopover label="قیمت ثبت‌شده یعنی چه؟" align="start">
                این قیمتی است که فروشنده در ترب ثبت کرده و ممکن است تغییر کرده باشد. موجودی و قیمت روز را با «استعلام» از
                فروشگاه بپرسید.
              </InfoPopover>
            </span>
          ) : null}
          <p className={cn('num flex flex-wrap items-baseline gap-x-1 font-extrabold leading-tight text-ink', NUM_SIZE[size])}>
            <span>{toman(price.price)}</span>
            {priceMax && priceMax > price.price ? (
              <>
                <span className="text-meta font-medium text-muted">تا</span>
                <span>{toman(priceMax)}</span>
              </>
            ) : null}
            <span className="text-caption font-medium text-muted">تومان</span>
          </p>
        </div>
      ) : price.status === 'suspicious' ? (
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-warn-line bg-warn-tint px-2 py-0.5 text-caption font-bold text-warn-ink">
            <TriangleAlert aria-hidden className="size-3.5" />
            قیمت غیرعادی — احتمالاً خطای ثبت
          </span>
          {price.rawPrice !== null ? (
            <span className="num text-caption text-muted">
              مقدار ثبت‌شده: <span className="line-through decoration-warn/60">{toman(price.rawPrice)} تومان</span>
            </span>
          ) : null}
          {onAsk ? <Unknown label="قیمت واقعی نامشخص" onAsk={onAsk} askLabel="قیمت را بپرس" size="sm" /> : null}
        </div>
      ) : (
        <Unknown label="قیمت ثبت نشده" why="فروشنده قیمتی ثبت نکرده است" onAsk={onAsk} askLabel="قیمت را بپرس" size={size === 'sm' ? 'sm' : 'md'} />
      )}

      {showDate && price.status !== 'missing' ? (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <FreshnessBadge freshness={price.freshness} changedAt={price.changedAt} size="sm" variant={size === 'sm' ? 'short' : 'long'} />
          {price.changedAt ? (
            <span className="text-caption text-muted">
              ثبت: {formatJalaliDate(price.changedAt)} · {formatRelative(price.changedAt)}
            </span>
          ) : (
            <span className="text-caption text-muted">تاریخ تغییر قیمت ثبت نشده</span>
          )}
        </div>
      ) : null}

      {verified ? <VerifiedBadge info={verified} /> : null}
    </div>
  );
}
