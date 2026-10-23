import { ArrowLeftRight, Info, MessageCircleQuestion, Shuffle } from 'lucide-react';
import { type AlternativesResponse, type StoreOffer } from '@titl/shared';
import { StoreOfferCard } from '../store/StoreOfferCard.js';
import { CandidateShops } from '../store/CandidateShops.js';
import { askShop } from '../store/askTarget.js';
import { ProductCard } from '../product/ProductCard.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { EmptyState } from '../ui/EmptyState.js';
import { Button } from '../ui/Button.js';
import { openAsk } from '../../state/ask.js';
import { cn } from '../../lib/cn.js';

export interface AlternativesPanelProps {
  data: AlternativesResponse;
  productId?: string;
  productTitle?: string | null;
  /** Adds «جایگزین کن در برنامه» to each same-product option. */
  onReplace?: (offer: StoreOffer) => void;
  /** Chat preview: top 2 same-product options, no similar products. */
  compact?: boolean;
  /** Hide the headline (the sheet shows it as its title). */
  hideHeadline?: boolean;
  className?: string;
}

/** «بسته بود؟ ۳ فروشگاه باز در همین پاساژ همین کالا را دارند» — same product → same passage → similar products. */
export function AlternativesPanel({ data, productId, productTitle, onReplace, compact, hideHeadline, className }: AlternativesPanelProps) {
  const same = compact ? data.sameProduct.slice(0, 2) : data.sameProduct;
  const tierB = [...data.samePassage, ...(data.fallbackTierB ?? [])];
  const empty = !data.sameProduct.length && !tierB.length && !data.similarProducts.length;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {!hideHeadline ? (
        <p className="flex items-start gap-2 text-title font-extrabold leading-7 text-heading">
          <Shuffle aria-hidden className="mt-1 size-5 shrink-0 text-accent-strong" />
          {data.headline}
        </p>
      ) : null}
      {data.relaxed ? (
        <p className="flex items-start gap-2 rounded-xl bg-info-tint px-3 py-2 text-meta text-info-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          برای پیدا کردن گزینه، یک شرط را برداشتیم: {data.relaxed.label}
        </p>
      ) : null}
      {empty ? (
        <EmptyState size="sm" title="جایگزین نزدیکی پیدا نشد" description="شعاع جستجو را بیشتر کنید یا از فروشگاه‌های هم‌دسته بپرسید." />
      ) : null}
      {same.map((o) => (
        <StoreOfferCard
          key={o.shop.id}
          offer={o}
          productId={productId}
          productTitle={productTitle ?? undefined}
          compact
          onAsk={(x) => openAsk({ shops: [askShop(x.shop)], productId, productTitle })}
          footer={
            <>
              {data.relativeChips?.[o.shop.id]?.length ? <ReasonChips reasons={data.relativeChips[o.shop.id]!} max={2} size="sm" /> : null}
              {onReplace ? (
                <Button size="sm" variant="primary" startIcon={ArrowLeftRight} onClick={() => onReplace(o)}>
                  جایگزین کن در برنامه
                </Button>
              ) : null}
            </>
          }
        />
      ))}
      {same.length > 1 && !compact ? (
        <Button variant="soft" size="sm" startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: same.slice(0, 3).map((o) => askShop(o.shop)), productId, productTitle })}>
          اول از این فروشگاه‌ها بپرس
        </Button>
      ) : null}
      {tierB.length ? <CandidateShops items={tierB} productId={productId} productTitle={productTitle} title="در همین پاساژ — شاید داشته باشند" compact={compact} /> : null}
      {!compact && data.similarProducts.length ? (
        <section aria-label="کالاهای مشابه" className="flex flex-col gap-2">
          <h3 className="text-body font-extrabold text-ink">مشابه، نه دقیقاً همین</h3>
          {data.similarProducts.slice(0, 4).map((p) => (
            <ProductCard key={p.id} product={p} layout="list" showCompare={false} maxReasons={1} />
          ))}
        </section>
      ) : null}
    </div>
  );
}
