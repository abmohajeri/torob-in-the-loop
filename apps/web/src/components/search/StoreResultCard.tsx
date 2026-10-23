import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Check, ChevronDown, CirclePlus, MessageCircleQuestion, Navigation, Trophy } from 'lucide-react';
import { formatNumber, navLinksFor, type StoreOffer } from '@titl/shared';
import { DistanceEta } from '../data/DistanceEta.js';
import { PaymentBadges } from '../data/PaymentBadges.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { WarrantyBadge } from '../data/WarrantyBadge.js';
import { PriceTrustLine, SellerTitleTags, UnknownsChip, offerUnknowns } from '../data/TrustLabel.js';
import { VisitOpenBadge } from '../data/VisitTimeBanner.js';
import { Button, ButtonAnchor } from '../ui/Button.js';
import { Sheet } from '../ui/Sheet.js';
import { Skeleton } from '../ui/Skeleton.js';
import { inMallLine } from '../../lib/labels.js';
import { paths } from '../../lib/paths.js';
import { PLAN_TOAST, useIsInPlan, usePlan } from '../../state/usePlan.js';
import { useUserContext } from '../../state/useContextStore.js';
import { cn } from '../../lib/cn.js';

export interface StoreResultCardProps {
  offer: StoreOffer;
  productId?: string;
  productTitle?: string;
  onAsk: (offer: StoreOffer) => void;
  selected?: boolean;
  onToggleSelect?: (offer: StoreOffer) => void;
  className?: string;
}

/**
 * W3 compact store card (~150 px collapsed):
 *   rank · name · checkbox / price + one trust line / open + distance / in-mall line / ≤2 reasons + unknowns chip /
 *   [بپرس] [مسیر] [به برنامه]. Expand → payments, warranty, seller-title flags, «چرا رتبه ۱؟».
 */
export function StoreResultCard({ offer, productId, productTitle, onAsk, selected, onToggleSelect, className }: StoreResultCardProps) {
  const { shop } = offer;
  const ctx = useUserContext();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const inPlan = useIsInPlan(shop.id, productId);
  const addStop = usePlan((s) => s.addStop);
  const removeStop = usePlan((s) => s.removeStop);
  const nav = navLinksFor({ lat: shop.lat, lng: shop.lng }, shop.name);
  const mall = inMallLine(shop.location);
  const unknowns = offerUnknowns(offer, { kalabarg: ctx.kalabarg });
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
        'flex flex-col gap-2 rounded-2xl border bg-surface p-3 shadow-card transition-[border-color,box-shadow] duration-200',
        selected ? 'border-primary ring-2 ring-primary/25' : 'border-line/80',
        className,
      )}
    >
      <header className="flex items-center gap-2">
        <span
          aria-label={`رتبه ${formatNumber(offer.rank)}`}
          className={cn('num grid size-7 shrink-0 place-items-center rounded-lg text-meta font-extrabold', offer.rank === 1 ? 'bg-primary-strong text-white' : 'bg-sunken text-ink-2')}
        >
          {offer.rank === 1 ? <Trophy aria-hidden className="size-4" /> : formatNumber(offer.rank)}
        </span>
        <h3 className="min-w-0 flex-1 truncate text-body font-bold text-ink">
          <Link to={paths.shop(shop.id)} className="rounded hover:text-primary-strong">
            {shop.name}
          </Link>
        </h3>
        {onToggleSelect ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={!!selected}
            aria-label={`انتخاب ${shop.name}`}
            onClick={() => onToggleSelect(offer)}
            className={cn(
              'hit-44 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors',
              selected ? 'border-primary-strong bg-primary-strong text-white' : 'border-faint bg-surface text-transparent hover:border-primary',
            )}
          >
            <Check aria-hidden className="size-4" />
          </button>
        ) : null}
      </header>

      <PriceTrustLine offer={offer} />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VisitOpenBadge status={shop.openStatus} onAsk={() => onAsk(offer)} />
        <DistanceEta distanceKm={shop.distanceKm} etaMin={shop.etaMin} mode={ctx.travelMode ?? 'walk'} size="sm" />
      </div>
      {mall ? <p className="truncate text-caption text-muted">{mall}</p> : null}

      <div className="flex flex-wrap items-center gap-1.5">
        <ReasonChips reasons={offer.reasons} max={2} size="sm" />
        <UnknownsChip items={unknowns} onAsk={() => onAsk(offer)} />
      </div>

      {expanded ? (
        <div id={`store-more-${shop.id}`} className="flex animate-fade-in flex-col gap-2 border-t border-line-soft pt-2">
          <WarrantyBadge warranty={offer.warranty} size="sm" />
          <PaymentBadges payment={shop.payment} size="sm" />
          <SellerTitleTags titles={offer.sellerTitles} />
          {offer.sellerTitles.length > 1 ? (
            <p className="text-caption text-muted">{formatNumber(offer.sellerTitles.length)} مدل/رنگ مختلف از این کالا در این فروشگاه ثبت شده.</p>
          ) : null}
          <button type="button" onClick={() => setWhyOpen(true)} className="hit-44 w-fit text-meta font-medium text-primary-strong underline-offset-4 hover:underline">
            چرا رتبه {formatNumber(offer.rank)}؟
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Button variant="accent" size="sm" startIcon={MessageCircleQuestion} onClick={() => onAsk(offer)} className="flex-1">
          بپرس
        </Button>
        <ButtonAnchor href={nav.neshan} target="_blank" rel="noreferrer" variant="secondary" size="sm" startIcon={Navigation} aria-label={`مسیر تا ${shop.name}`}>
          مسیر
        </ButtonAnchor>
        <Button variant={inPlan ? 'soft' : 'secondary'} size="sm" startIcon={inPlan ? Check : CirclePlus} onClick={togglePlan} aria-pressed={inPlan}>
          {inPlan ? 'در برنامه' : 'به برنامه'}
        </Button>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`store-more-${shop.id}`}
          aria-label={expanded ? 'جزئیات کمتر' : 'جزئیات بیشتر'}
          onClick={() => setExpanded((e) => !e)}
          className="hit-44 grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken"
        >
          <ChevronDown aria-hidden className={cn('size-5 transition-transform duration-200', expanded && 'rotate-180')} />
        </button>
      </div>

      <Sheet open={whyOpen} onOpenChange={setWhyOpen} title={`چرا رتبه ${formatNumber(offer.rank)}؟`} description={shop.name}>
        <WhyRank offer={offer} />
      </Sheet>
    </article>
  );
}

/** Plain-language ranking reasons + factor bars (derived from the score and reasons). */
function WhyRank({ offer }: { offer: StoreOffer }) {
  const s = offer.shop;
  const factors: { label: string; value: number; note: string }[] = [
    { label: 'امتیاز کلی', value: offer.score, note: `${formatNumber(Math.round(offer.score))} از ۱۰۰` },
    {
      label: 'نزدیکی',
      value: s.distanceKm == null ? 0 : Math.max(0, 100 - s.distanceKm * 12),
      note: s.distanceKm == null ? 'موقعیت شما مشخص نیست' : `${formatNumber(Math.round(s.distanceKm * 10) / 10)} کیلومتر`,
    },
    {
      label: 'تازگی قیمت',
      value: { fresh: 100, recent: 70, stale: 35, very_stale: 10, unknown: 0 }[offer.price.freshness],
      note: offer.price.ageDays == null ? 'تاریخ ثبت نشده' : `${formatNumber(offer.price.ageDays)} روز پیش`,
    },
    { label: 'باز بودن در زمان مراجعه', value: s.openStatus.state === 'open' ? 100 : s.openStatus.state === 'closing_soon' ? 60 : s.openStatus.state === 'unknown' ? 30 : 0, note: s.openStatus.label },
  ];
  return (
    <div className="space-y-4">
      <ul className="space-y-3">
        {factors.map((f) => (
          <li key={f.label}>
            <div className="mb-1 flex justify-between text-meta">
              <span className="font-medium text-ink">{f.label}</span>
              <span className="text-muted">{f.note}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${f.label}: ${f.note}`}>
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(Math.min(100, Math.max(4, f.value)))}%` }} />
            </div>
          </li>
        ))}
      </ul>
      {offer.reasons.length ? (
        <div>
          <p className="mb-2 text-meta font-bold text-ink">دلیل‌ها به زبان ساده</p>
          <ReasonChips reasons={offer.reasons} max={8} />
        </div>
      ) : null}
      <p className="text-caption text-muted">رتبه‌بندی بر پایه قیمت ثبت‌شده، فاصله، تازگی اطلاعات و شرایط شماست؛ تبلیغاتی در آن نیست.</p>
    </div>
  );
}

export function StoreResultCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line/80 bg-surface p-3">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-9 w-full" />
    </div>
  );
}
