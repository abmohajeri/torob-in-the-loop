import { EyeOff, Footprints, Lightbulb, Route } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { formatDistance, formatNumber, formatTomanShort, type ClusterSummary, type StoreOffer, type StoresResponse } from '@titl/shared';
import { StoreOfferCard } from './StoreOfferCard.js';
import { CandidateShops } from './CandidateShops.js';
import { Button, ButtonLink } from '../ui/Button.js';
import { paths } from '../../lib/paths.js';
import { openAsk } from '../../state/ask.js';
import { usePlan } from '../../state/usePlan.js';
import { cn } from '../../lib/cn.js';
import { askShop } from './askTarget.js';

/** «۲۷ فروشنده · اختلاف قیمت ثبت‌شده تا ۱۸ میلیون · ارزان‌ترین ۶۰۰ متر از شما» */
export function storesHeadline(data: Pick<StoresResponse, 'stores' | 'product'>): string {
  const prices = data.stores.map((s) => s.price.price).filter((p): p is number => p !== null);
  const parts = [`${formatNumber(data.stores.length)} فروشنده`];
  if (prices.length > 1) {
    const spread = Math.max(...prices) - Math.min(...prices);
    if (spread > 0) parts.push(`اختلاف قیمت ثبت‌شده تا ${formatTomanShort(spread)}`);
  }
  const cheapest = [...data.stores].filter((s) => s.price.price !== null).sort((a, b) => a.price.price! - b.price.price!)[0];
  if (cheapest?.shop.distanceKm != null) parts.push(`ارزان‌ترین ${formatDistance(cheapest.shop.distanceKm)} از شما`);
  return parts.join(' · ');
}

/** Cluster card: «بهترین جا برای خرید حضوری: ۲۱ فروشنده در ۳۰۰ متر …» + plan the top 4 in it. */
export function ClusterCard({ cluster, stores, productId, productTitle }: { cluster: ClusterSummary; stores: StoreOffer[]; productId?: string; productTitle?: string }) {
  const navigate = useNavigate();
  const addStop = usePlan((s) => s.addStop);
  const top = stores.filter((s) => cluster.shopIds.includes(s.shop.id)).slice(0, 4);
  const plan = () => {
    let added = 0;
    for (const o of top) if (addStop({ shopId: o.shop.id, productId, shopName: o.shop.name, productTitle: productTitle ?? null, mallName: o.shop.location.mall?.name ?? null }) === 'added') added++;
    toast.success(added ? `${formatNumber(added)} فروشگاه به برنامه بازدید اضافه شد.` : 'این فروشگاه‌ها از قبل در برنامه هستند.');
    navigate(paths.plan);
  };
  return (
    <div className="rounded-2xl border border-primary-200 bg-primary-tint p-3.5">
      <p className="flex items-start gap-2 text-body leading-7 text-primary-ink">
        <Footprints aria-hidden className="mt-1 size-5 shrink-0 text-primary-strong" />
        <span>{cluster.text || `بهترین جا برای خرید حضوری: ${formatNumber(cluster.storeCount)} فروشنده در ${cluster.label}`}</span>
      </p>
      {top.length > 1 ? (
        <Button size="sm" variant="primary" startIcon={Route} className="mt-2" onClick={plan}>
          برنامه بازدید از {formatNumber(top.length)} فروشگاه برتر این خوشه
        </Button>
      ) : null}
    </div>
  );
}

export interface StoreListProps {
  data: StoresResponse;
  /** Chat preview: top N rows + «دیدن همه». */
  limit?: number;
  compact?: boolean;
  selectable?: boolean;
  selected?: string[];
  onToggleSelect?: (offer: StoreOffer) => void;
  /** Filter to one area (from AreasStrip). */
  area?: string | null;
  /** Show category-only candidates at the end (default true unless compact). */
  showCandidates?: boolean;
  onShowExcluded?: () => void;
  className?: string;
}

/** Stores that registered this product, best first, then category-only candidates in a dashed section. */
export function StoreList({ data, limit, compact, selectable, selected = [], onToggleSelect, area, showCandidates = !compact, onShowExcluded, className }: StoreListProps) {
  const p = data.product;
  const filtered = area ? data.stores.filter((s) => s.shop.area === area) : data.stores;
  const rows = limit ? filtered.slice(0, limit) : filtered;
  const cluster = !compact && !area ? data.clusters?.find((c) => c.storeCount >= 3) : undefined;
  const ask = (o: StoreOffer) => openAsk({ shops: [askShop(o.shop)], productId: p.id, productTitle: p.title, group: p.categoryGroup });
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {!compact && data.excludedByFilters > 0 ? (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-surface-2 px-3 py-2 text-meta text-ink-2">
          <EyeOff aria-hidden className="size-4 text-muted" />
          {formatNumber(data.excludedByFilters)} فروشگاه با فیلترهای شما پنهان شد
          {onShowExcluded ? (
            <button type="button" onClick={onShowExcluded} className="hit-44 font-bold text-primary-strong underline-offset-4 hover:underline">
              نمایش
            </button>
          ) : null}
        </p>
      ) : null}
      {!compact && data.insights?.length ? (
        <ul className="flex flex-col gap-1.5">
          {data.insights.filter((x) => !(cluster && x.code === 'same_passage_cluster')).slice(0, 2).map((ins) => (
            <li key={ins.code + ins.text} className="flex items-start gap-2 text-meta leading-6 text-ink-2">
              <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
              {ins.text}
            </li>
          ))}
        </ul>
      ) : null}
      {cluster ? <ClusterCard cluster={cluster} stores={data.stores} productId={p.id} productTitle={p.title} /> : null}
      {rows.map((o, idx) => (
        <StoreOfferCard
          key={o.shop.id}
          offer={o}
          productId={p.id}
          productTitle={p.title}
          onAsk={ask}
          compact={compact}
          highlight={!compact && !area && idx === 0 && o.rank === 1}
          selectable={selectable}
          selected={selected.includes(o.shop.id)}
          onToggleSelect={onToggleSelect}
        />
      ))}
      {limit && filtered.length > limit ? (
        <ButtonLink to={paths.productStores(p.id)} variant="outline" size="md" fullWidth>
          دیدن همه {formatNumber(filtered.length)} فروشنده
        </ButtonLink>
      ) : null}
      {showCandidates ? <CandidateShops items={data.categoryOnly} productId={p.id} productTitle={p.title} group={p.categoryGroup} compact={compact} limit={compact ? 3 : 8} /> : null}
    </div>
  );
}
