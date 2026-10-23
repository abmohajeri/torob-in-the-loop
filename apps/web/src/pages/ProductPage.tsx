import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ListChecks, MessageCircleQuestion, Share2, Sparkles, Store, Users } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { StickyCTA } from '../components/layout/StickyCTA.js';
import { IconButton } from '../components/ui/IconButton.js';
import { Button, ButtonLink } from '../components/ui/Button.js';
import { SectionHeader } from '../components/ui/SectionHeader.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { DataNote } from '../components/data/DataNote.js';
import { ReasonChips } from '../components/data/ReasonChips.js';
import { ProductCard } from '../components/product/ProductCard.js';
import { StoreOfferCardSkeleton } from '../components/store/StoreOfferCard.js';
import { ProductDetailCard } from '../components/store/ProductDetailCard.js';
import { StoreList } from '../components/store/StoreList.js';
import { AreasStrip } from '../components/store/AreasStrip.js';
import { askShop } from '../components/store/askTarget.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { SHARE_TOAST, shareOrCopy } from '../lib/share.js';
import { useContextQuery } from '../state/useContextStore.js';
import { openAsk } from '../state/ask.js';

export default function ProductPage() {
  const { id = '' } = useParams();
  const { ctx, ctxKey } = useContextQuery();
  const product = useQuery({ queryKey: qk.product(id, ctxKey), queryFn: ({ signal }) => api.product(id, ctx, signal), enabled: !!id });
  const stores = useQuery({ queryKey: qk.productStores(id, 'smart', ctxKey, 12), queryFn: ({ signal }) => api.productStores(id, { sort: 'smart', limit: 12 }, ctx, signal), enabled: !!id });
  const similar = useQuery({ queryKey: qk.productSimilar(id, ctxKey, 4), queryFn: ({ signal }) => api.productSimilar(id, { limit: 4 }, ctx, signal), enabled: !!id, retry: false });
  const p = product.data;
  useDocumentTitle(p?.title ?? 'کالا');

  const share = async () => {
    const r = await shareOrCopy({ title: p?.title, url: window.location.href });
    if (SHARE_TOAST[r]) toast(SHARE_TOAST[r]!);
  };
  const top3 = stores.data?.stores.slice(0, 3) ?? [];

  return (
    <>
      <PageHeader title="جزئیات کالا" subtitle={p?.category} backTo={paths.search()} actions={<IconButton icon={Share2} label="اشتراک‌گذاری" onClick={share} />} />
      <div className="flex flex-col gap-6 px-4 pt-2">
        {product.isPending ? (
          <div aria-busy className="flex flex-col gap-4">
            <Skeleton className="aspect-[4/3] w-full rounded-3xl" />
            <SkeletonText lines={2} />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </div>
        ) : product.isError ? (
          <ErrorState error={product.error} onRetry={() => void product.refetch()} retrying={product.isFetching} />
        ) : p ? (
          <>
            <ProductDetailCard product={p} />
            {p.reasons.length ? <ReasonChips reasons={p.reasons} max={4} /> : null}
            {p.sellerCount <= 1 ? (
              <DataNote variant="boxed" tone="info" icon={Users}>
                این کالا فقط یک فروشنده حضوری دارد. فروشگاه‌های هم‌دسته در فهرست فروشنده‌ها با برچسب «ممکن است داشته باشند» آمده‌اند.
              </DataNote>
            ) : null}

            <section aria-labelledby="where" className="flex flex-col gap-3">
              <SectionHeader id="where" icon={Store} title="کجا حضوری بخرم؟" count={p.sellerCount} more={{ label: 'همه فروشنده‌ها', to: paths.productStores(p.id) }} />
              {stores.data?.areas.length ? <AreasStrip areas={stores.data.areas} compact /> : null}
              {stores.isPending ? (
                <StoreOfferCardSkeleton />
              ) : stores.isError ? (
                <ErrorState size="sm" error={stores.error} onRetry={() => void stores.refetch()} />
              ) : stores.data ? (
                <StoreList data={stores.data} limit={3} showCandidates={false} />
              ) : null}
            </section>

            {p.specs.length ? (
              <details className="group rounded-2xl border border-line/80 bg-surface shadow-card">
                <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 text-body font-extrabold text-heading">
                  <ListChecks aria-hidden className="size-5 text-primary" />
                  مشخصات فنی <span className="num text-meta font-medium text-muted">({formatNumber(p.specs.length)})</span>
                  <span className="ms-auto text-caption font-bold text-primary-strong group-open:hidden">نمایش</span>
                  <span className="ms-auto hidden text-caption font-bold text-primary-strong group-open:inline">بستن</span>
                </summary>
                <dl className="divide-y divide-line-soft border-t border-line-soft px-4">
                  {p.specs.map((s) => (
                    <div key={s.key + s.value} className="flex gap-3 py-2.5 text-meta">
                      <dt className="w-32 shrink-0 text-muted">{s.key}</dt>
                      <dd className="min-w-0 flex-1 text-ink">
                        <bdi>{s.value}</bdi>
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            ) : (
              <DataNote>مشخصات فنی این کالا در ترب ثبت نشده است.</DataNote>
            )}

            {similar.data?.length ? (
              <section aria-labelledby="similar" className="flex flex-col gap-3">
                <SectionHeader id="similar" icon={Sparkles} title="مشابه، نه دقیقاً همین" />
                {similar.data.map((s) => (
                  <ProductCard key={s.id} product={s} layout="list" maxReasons={1} />
                ))}
              </section>
            ) : null}
          </>
        ) : null}
      </div>
      {p ? (
        <StickyCTA>
          {top3.length ? (
            <Button variant="accent" startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: top3.map((o) => askShop(o.shop)), productId: p.id, productTitle: p.title, group: p.categoryGroup })}>
              از {formatNumber(top3.length)} فروشگاه بپرس
            </Button>
          ) : null}
          <ButtonLink to={paths.productStores(p.id)} variant="secondary" startIcon={Store}>
            فروشنده‌ها ({formatNumber(p.sellerCount)})
          </ButtonLink>
        </StickyCTA>
      ) : null}
    </>
  );
}
