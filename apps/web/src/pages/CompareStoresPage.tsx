import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageCircleQuestion, Route, Scale } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { StickyCTA } from '../components/layout/StickyCTA.js';
import { Button, ButtonLink } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ProductDetailCard } from '../components/store/ProductDetailCard.js';
import { StoreCompareTable } from '../components/store/StoreCompareTable.js';
import { askShop } from '../components/store/askTarget.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useContextQuery } from '../state/useContextStore.js';
import { openAsk } from '../state/ask.js';
import { usePlan } from '../state/usePlan.js';
import { useNavigate } from 'react-router';

export default function CompareStoresPage() {
  const [sp] = useSearchParams();
  const productId = sp.get('product') ?? '';
  const shopIds = (sp.get('shops') ?? '').split(',').filter(Boolean);
  const { ctx, ctxKey } = useContextQuery();
  const navigate = useNavigate();
  const addStop = usePlan((s) => s.addStop);
  useDocumentTitle('مقایسه فروشگاه‌ها');
  const q = useQuery({
    queryKey: qk.compareStores(productId, shopIds, ctxKey),
    queryFn: ({ signal }) => api.compareStores(productId, shopIds, ctx, signal),
    enabled: !!productId && shopIds.length >= 2,
  });
  const d = q.data;

  return (
    <>
      <PageHeader title="مقایسه فروشگاه‌ها" subtitle={d?.product.title} backTo={productId ? paths.productStores(productId) : '/'} />
      <div className="flex flex-col gap-4 px-4 pt-2">
        {!productId || shopIds.length < 2 ? (
          <EmptyState
            icon={Scale}
            title="دست‌کم دو فروشگاه انتخاب کنید"
            description="در فهرست فروشنده‌های یک کالا، تیک دو تا چهار فروشگاه را بزنید و «مقایسه» را بزنید."
            actions={productId ? <ButtonLink to={paths.productStores(productId)}>فهرست فروشنده‌ها</ButtonLink> : <ButtonLink to={paths.search()}>جستجوی کالا</ButtonLink>}
          />
        ) : q.isPending ? (
          <>
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : d ? (
          <>
            <ProductDetailCard product={d.product} compact />
            <StoreCompareTable data={d} />
          </>
        ) : null}
      </div>
      {d ? (
        <StickyCTA>
          <Button variant="accent" startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: d.stores.map((o) => askShop(o.shop)), productId: d.product.id, productTitle: d.product.title, group: d.product.categoryGroup })}>
            از هر {formatNumber(d.stores.length)} بپرس
          </Button>
          <Button
            variant="secondary"
            startIcon={Route}
            onClick={() => {
              let n = 0;
              for (const o of d.stores) if (addStop({ shopId: o.shop.id, productId: d.product.id, shopName: o.shop.name, productTitle: d.product.title, mallName: o.shop.location.mall?.name ?? null }) === 'added') n++;
              toast.success(n ? `${formatNumber(n)} فروشگاه به برنامه اضافه شد.` : 'این فروشگاه‌ها از قبل در برنامه هستند.');
              navigate(paths.plan);
            }}
          >
            همه به برنامه
          </Button>
        </StickyCTA>
      ) : null}
    </>
  );
}
