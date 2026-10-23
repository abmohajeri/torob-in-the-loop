import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Check, CirclePlus, MessageCircleQuestion, Navigation, Trophy } from 'lucide-react';
import { formatNumber, navLinksFor, type StoreOffer, type TravelMode } from '@titl/shared';
import { DistanceEta } from '../data/DistanceEta.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { PaymentBadges } from '../data/PaymentBadges.js';
import { PriceTag } from '../data/PriceTag.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { StockBadge } from '../data/VerifiedBadge.js';
import { WarrantyBadge } from '../data/WarrantyBadge.js';
import { Button, ButtonAnchor } from '../ui/Button.js';
import { Skeleton } from '../ui/Skeleton.js';
import { paths } from '../../lib/paths.js';
import { PLAN_TOAST, useIsInPlan, usePlan } from '../../state/usePlan.js';
import { cn } from '../../lib/cn.js';

export interface StoreOfferCardProps {
  offer: StoreOffer;
  /** Product context (plan stop snapshot + ask flow). */
  productId?: string;
  productTitle?: string;
  /** «استعلام» — opens the ask flow. Default: navigates to the shop page with `#ask`. */
  onAsk?: (offer: StoreOffer) => void;
  /** Travel mode for the ETA label (default from server ETA; label says «پیاده» unless given). */
  mode?: TravelMode;
  /** Store-compare selection (checkbox in the header). */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (offer: StoreOffer) => void;
  /** Highlight as the top pick («بهترین انتخاب»). */
  highlight?: boolean;
  /** Hide payment/warranty rows (dense lists). */
  compact?: boolean;
  /** Extra content at the bottom (e.g. inquiry status). */
  footer?: ReactNode;
  className?: string;
}

/**
 * One store that has the product: name · in-mall line · distance/ETA · open status · registered price (+freshness)
 * · verified block (if asked) · warranty · payment badges · «why» chips · next steps [استعلام] [مسیر] [+برنامه].
 */
export function StoreOfferCard({
  offer,
  productId,
  productTitle,
  onAsk,
  mode = 'walk',
  selectable,
  selected,
  onToggleSelect,
  highlight,
  compact,
  footer,
  className,
}: StoreOfferCardProps) {
  const { shop } = offer;
  const navigate = useNavigate();
  const inPlan = useIsInPlan(shop.id, productId);
  const addStop = usePlan((s) => s.addStop);
  const removeStop = usePlan((s) => s.removeStop);
  const nav = navLinksFor({ lat: shop.lat, lng: shop.lng }, shop.name);
  const ask = () => (onAsk ? onAsk(offer) : navigate(`${paths.shop(shop.id)}#ask`));
  const togglePlan = () => {
    if (inPlan) {
      removeStop(shop.id, productId);
      toast('از برنامه بازدید حذف شد.');
      return;
    }
    const r = addStop({ shopId: shop.id, productId, shopName: shop.name, productTitle: productTitle ?? null, mallName: shop.location.mall?.name ?? null });
    if (r === 'added') toast.success(PLAN_TOAST.added, { action: { label: 'مشاهده برنامه', onClick: () => navigate(paths.plan) } });
    else toast.warning(PLAN_TOAST[r]);
  };

  return (
    <article
      className={cn(
        'relative flex flex-col gap-3 rounded-2xl border bg-surface p-3.5 shadow-card transition-[border-color,box-shadow] duration-200',
        highlight ? 'border-primary-300 ring-1 ring-primary-200' : 'border-line/80',
        selected && 'border-primary ring-2 ring-primary/25',
        className,
      )}
    >
      {highlight ? (
        <span className="absolute -top-2.5 start-3 inline-flex items-center gap-1 rounded-full bg-primary-strong px-2 py-0.5 text-caption font-bold text-white shadow-glow">
          <Trophy aria-hidden className="size-3.5" />
          بهترین انتخاب برای شما
        </span>
      ) : null}

      {/* Header: rank · name · open status · compare checkbox */}
      <header className="flex items-start gap-2.5">
        <span
          aria-label={`رتبه ${formatNumber(offer.rank)}`}
          className={cn(
            'num mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl text-meta font-extrabold',
            offer.rank === 1 ? 'bg-primary-strong text-white' : 'bg-sunken text-ink-2',
          )}
        >
          {formatNumber(offer.rank)}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-extrabold leading-7 text-ink">
            <Link to={paths.shop(shop.id)} className="rounded hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary">
              {shop.name}
            </Link>
          </h3>
          <InMallGuide location={shop.location} variant="line" className="mt-0.5" />
          {!shop.location.guide.length && shop.address ? <p className="mt-0.5 truncate text-caption text-muted">{shop.address}</p> : null}
        </div>
        {selectable ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label={selected ? 'حذف از مقایسه فروشگاه‌ها' : 'انتخاب برای مقایسه فروشگاه‌ها'}
            onClick={() => onToggleSelect?.(offer)}
            className={cn(
              'hit-44 grid size-7 shrink-0 place-items-center rounded-lg border-2 transition-colors focus-visible:outline-2 focus-visible:outline-primary',
              selected ? 'border-primary-strong bg-primary-strong text-white' : 'border-line bg-surface text-transparent hover:border-primary',
            )}
          >
            <Check aria-hidden className="size-4" />
          </button>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <OpenStatusBadge status={shop.openStatus} size="sm" />
        <DistanceEta distanceKm={shop.distanceKm} etaMin={shop.etaMin} mode={mode} size="sm" />
      </div>

      {/* Price: registered (+freshness) and, separately, verified */}
      <div className="rounded-xl bg-surface-2 p-3">
        <PriceTag price={offer.price} priceMax={offer.priceMax} verified={offer.verified} onAsk={ask} />
        {!offer.verified ? <StockBadge className="mt-2" size="sm" /> : null}
      </div>

      {!compact ? (
        <div className="flex flex-col gap-1.5">
          <WarrantyBadge warranty={offer.warranty} size="sm" />
          {shop.payment.options.length || shop.payment.textHints.length || shop.payment.fastDelivery ? (
            <PaymentBadges payment={shop.payment} size="sm" max={3} />
          ) : null}
        </div>
      ) : null}

      <ReasonChips reasons={offer.reasons} max={3} />

      <div className="flex items-center gap-2">
        <Button variant="accent" size="sm" startIcon={MessageCircleQuestion} onClick={ask} className="flex-1">
          استعلام
        </Button>
        <ButtonAnchor href={nav.neshan} variant="secondary" size="sm" startIcon={Navigation} aria-label={`مسیریابی به ${shop.name} با نشان`}>
          مسیر
        </ButtonAnchor>
        <Button variant={inPlan ? 'soft' : 'secondary'} size="sm" startIcon={inPlan ? Check : CirclePlus} onClick={togglePlan} aria-pressed={inPlan}>
          {inPlan ? 'در برنامه' : 'برنامه'}
        </Button>
      </div>

      {footer}
    </article>
  );
}

/** Loading placeholder with StoreOfferCard geometry. */
export function StoreOfferCardSkeleton({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn('flex flex-col gap-3 rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card', className)}>
      <div className="flex gap-2.5">
        <Skeleton className="size-8 shrink-0" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton shape="line" className="h-4 w-36" />
          <Skeleton shape="line" className="h-3 w-52" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton shape="line" className="h-5 w-28" />
        <Skeleton shape="line" className="h-5 w-24" />
      </div>
      <Skeleton className="h-20 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-9 flex-1" />
        <Skeleton className="h-9 w-20" />
        <Skeleton className="h-9 w-20" />
      </div>
    </div>
  );
}
