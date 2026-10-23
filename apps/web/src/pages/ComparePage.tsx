import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Search, Store } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { CompareTable } from '../components/compare/CompareTable.js';
import { ButtonLink } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useContextQuery } from '../state/useContextStore.js';
import { useCompare } from '../state/useCompare.js';

/** Product comparison: ids from `?ids=` (shareable) or the compare tray. Summary first, then the table. */
export default function ComparePage() {
  useDocumentTitle('مقایسه کالاها');
  const [params, setParams] = useSearchParams();
  const trayItems = useCompare((s) => s.items);
  const remove = useCompare((s) => s.remove);
  const urlIds = params.get('ids')?.split(',').filter(Boolean);
  const ids = useMemo(() => urlIds ?? trayItems.map((i) => i.id), [urlIds?.join(','), trayItems]); // eslint-disable-line react-hooks/exhaustive-deps
  const { ctx, ctxKey } = useContextQuery();

  useEffect(() => {
    if (!urlIds && ids.length) setParams({ ids: ids.join(',') }, { replace: true });
  }, [urlIds, ids, setParams]);

  const q = useQuery({
    queryKey: qk.compareProducts(ids, ctxKey),
    queryFn: ({ signal }) => api.compareProducts(ids, ctx, signal),
    enabled: ids.length >= 2,
  });

  const drop = (id: string) => {
    remove(id);
    const next = ids.filter((x) => x !== id);
    setParams(next.length ? { ids: next.join(',') } : {}, { replace: true });
  };

  return (
    <>
      <PageHeader title="مقایسه کالاها" subtitle={ids.length ? `${formatNumber(ids.length)} کالا` : undefined} backTo="/search" />
      <div className="px-4 pt-2">
        {ids.length < 2 ? (
          <EmptyState
            icon={ArrowLeftRight}
            title={ids.length ? 'یک کالای دیگر هم انتخاب کنید' : 'هنوز کالایی برای مقایسه انتخاب نکرده‌اید'}
            description="روی کارت هر کالا «مقایسه» را بزنید؛ تا ۴ کالا را کنار هم می‌بینید — قیمت، تعداد فروشنده حضوری و مشخصات."
            actions={
              <ButtonLink to={paths.search()} startIcon={Search}>
                جستجوی کالا
              </ButtonLink>
            }
          />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} retrying={q.isFetching} />
        ) : !q.data ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-4">
            <CompareTable
              columns={q.data.products.map((p) => ({
                id: p.id,
                title: p.title,
                image: p.image,
                group: p.categoryGroup,
                href: paths.product(p.id),
                reasons: q.data.highlights.find((h) => h.productId === p.id)?.reasons,
                onRemove: () => drop(p.id),
              }))}
              rows={q.data.rows}
              summary={q.data.summary}
              summarySource={q.data.summarySource}
            />
            <div className="grid grid-cols-2 gap-2">
              {q.data.products.map((p) => (
                <ButtonLink key={p.id} to={paths.productStores(p.id)} variant="secondary" size="sm" startIcon={Store} className="min-w-0">
                  <span className="truncate">فروشنده‌های {p.brand ?? 'کالا'}</span>
                </ButtonLink>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
