import { Link } from 'react-router';
import { ChevronLeft, MapPin, Store } from 'lucide-react';
import type { ShopDetail, ShopLite } from '@titl/shared';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { DistanceEta } from '../data/DistanceEta.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

export interface ShopSummaryCardProps {
  shop: ShopDetail | ShopLite;
  /** Chat preview (one row + «مشاهده کامل»). */
  compact?: boolean;
  className?: string;
}

/** Shop identity: name · area · open status · distance · in-mall line; links to /shop/:id. */
export function ShopSummaryCard({ shop, compact, className }: ShopSummaryCardProps) {
  return (
    <Link
      to={paths.shop(shop.id)}
      className={cn('flex items-start gap-3 rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary', className)}
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong">
        <Store className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-extrabold text-ink">{shop.name}</p>
        {shop.area ? (
          <p className="flex items-center gap-1 text-caption text-muted">
            <MapPin aria-hidden className="size-3.5" />
            {shop.area}
          </p>
        ) : null}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <OpenStatusBadge status={shop.openStatus} size="sm" />
          <DistanceEta distanceKm={shop.distanceKm} etaMin={shop.etaMin} size="sm" promptLocation={false} />
        </div>
        {!compact ? <InMallGuide location={shop.location} variant="line" linkMall={false} className="mt-1" /> : null}
      </div>
      <span className="mt-1 inline-flex shrink-0 items-center text-caption font-bold text-primary-strong">
        {compact ? 'مشاهده کامل' : null}
        <ChevronLeft aria-hidden className="size-4" />
      </span>
    </Link>
  );
}
