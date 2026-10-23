import { Link } from 'react-router';
import { MessageCircleQuestion, Ruler, Tag } from 'lucide-react';
import { formatNumber, formatPriceRange, type AssortmentStore, type NeedStoresResponse } from '@titl/shared';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { DistanceEta } from '../data/DistanceEta.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { ProductImage } from '../product/ProductImage.js';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { paths } from '../../lib/paths.js';
import { openAsk } from '../../state/ask.js';
import { cn } from '../../lib/cn.js';
import { askShop } from './askTarget.js';
import { CandidateShops } from './CandidateShops.js';

const RUNG: Record<AssortmentStore['availability'], { tone: 'good' | 'info' | 'neutral'; title: string }> = {
  exact: { tone: 'good', title: 'همین کالا را ثبت کرده‌اند' },
  variant: { tone: 'info', title: 'مدل دیگری از همین کالا' },
  similar: { tone: 'neutral', title: 'مشابه، نه دقیقاً همین' },
  category_only: { tone: 'neutral', title: 'ممکن است داشته باشند' },
};

/** One shop in need mode: «۲ از ۳ مدل انتخابی شما» + thumbnails + price range + brands + sizes + open + distance. */
export function AssortmentRow({ store: s, compact, need }: { store: AssortmentStore; compact?: boolean; need?: string }) {
  return (
    <article className="flex flex-col gap-2.5 rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-extrabold text-ink">
            <Link to={paths.shop(s.shop.id)} className="hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary">
              {s.shop.name}
            </Link>
          </h3>
          <InMallGuide location={s.shop.location} variant="line" linkMall={false} />
        </div>
        <Badge tone={RUNG[s.availability].tone} size="sm">
          {s.availabilityLabel}
        </Badge>
      </header>
      <p className="text-meta text-ink-2">
        <b className="num text-ink">{formatNumber(s.matchCount)}</b> مدل مطابق
        {s.priceMin !== null || s.priceMax !== null ? <span className="num"> · {formatPriceRange(s.priceMin, s.priceMax)}</span> : null}
      </p>
      {s.samples.length && !compact ? (
        <ul className="flex gap-2" aria-label="نمونه کالاها">
          {s.samples.slice(0, 4).map((x) => (
            <li key={x.productId}>
              <Link to={paths.product(x.productId)} title={x.title} className="block focus-visible:outline-2 focus-visible:outline-primary">
                <ProductImage src={x.image} alt={x.title} className="size-14 rounded-xl border border-line-soft" />
              </Link>
            </li>
          ))}
          {s.matchCount > s.samples.length ? (
            <li className="num grid size-14 place-items-center rounded-xl bg-sunken text-caption font-bold text-ink-2">+{formatNumber(s.matchCount - s.samples.length)}</li>
          ) : null}
        </ul>
      ) : null}
      {s.brands.length || s.sizes.length ? (
        <div className="flex flex-col gap-1 text-caption text-muted">
          {s.brands.length ? (
            <p className="flex items-center gap-1 truncate">
              <Tag aria-hidden className="size-3.5 shrink-0" />
              {s.brands.slice(0, 5).join('، ')}
            </p>
          ) : null}
          {s.sizes.length ? (
            <p className="num flex items-center gap-1 truncate">
              <Ruler aria-hidden className="size-3.5 shrink-0" />
              سایزهای ثبت‌شده: {s.sizes.slice(0, 8).join('، ')}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <OpenStatusBadge status={s.shop.openStatus} size="sm" />
        <DistanceEta distanceKm={s.shop.distanceKm} etaMin={s.shop.etaMin} size="sm" />
      </div>
      {!compact ? <ReasonChips reasons={s.reasons} max={2} size="sm" /> : null}
      <Button size="sm" variant={s.availability === 'category_only' ? 'accent' : 'outline'} startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: [askShop(s.shop)], productTitle: need, questions: ['stock', 'variant', 'hours'], custom: undefined })}>
        بپرس
      </Button>
    </article>
  );
}

export interface StoreCoverageProps {
  data: NeedStoresResponse;
  /** Short need label for the ask flow, e.g. «کتانی مردانه سایز ۴۳». */
  needLabel?: string;
  compact?: boolean;
  limit?: number;
  className?: string;
}

/** Need-level store finder: cluster card → rows grouped by availability rung → category-only last (dashed). */
export function StoreCoverage({ data, needLabel, compact, limit, className }: StoreCoverageProps) {
  const stores = limit ? data.stores.slice(0, limit) : data.stores;
  const rungs: AssortmentStore['availability'][] = ['exact', 'variant', 'similar'];
  const catOnly = data.stores.filter((s) => s.availability === 'category_only');
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {data.clusters[0] && !compact ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-tint p-3.5 text-body leading-7 text-primary-ink">{data.clusters[0].text}</div>
      ) : null}
      {rungs.map((r) => {
        const rows = stores.filter((s) => s.availability === r);
        if (!rows.length) return null;
        return (
          <section key={r} aria-label={RUNG[r].title} className="flex flex-col gap-2.5">
            <h3 className="text-meta font-extrabold text-muted">
              {RUNG[r].title} <span className="num">({formatNumber(rows.length)})</span>
            </h3>
            {rows.map((s) => (
              <AssortmentRow key={s.shop.id} store={s} compact={compact} need={needLabel} />
            ))}
          </section>
        );
      })}
      {catOnly.length ? (
        <CandidateShops items={catOnly.map((s) => ({ shop: s.shop, matchedCategory: s.availabilityLabel, note: '' }))} productTitle={needLabel} compact={compact} title="ممکن است داشته باشند (فقط دسته فعالیت — موجودی نامشخص)" />
      ) : null}
    </div>
  );
}
