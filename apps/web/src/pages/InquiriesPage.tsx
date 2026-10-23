import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Info, Search, Wifi, WifiOff } from 'lucide-react';
import { formatNumber, type Inquiry } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { ButtonLink } from '../components/ui/Button.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { InquiryList } from '../components/inquiry/InquiryList.js';
import { isFinal } from '../components/inquiry/meta.js';
import { SimulatedPill } from '../components/inquiry/parts.js';
import { api, ApiError } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useSessionId } from '../lib/session.js';
import { useUi } from '../state/useUi.js';

export default function InquiriesPage() {
  useDocumentTitle('پیگیری‌ها');
  const [sp] = useSearchParams();
  const sessionId = useSessionId();
  const live = useUi((s) => s.live);
  const q = useQuery({
    queryKey: qk.inquiries(sessionId),
    queryFn: ({ signal }) => api.inquiries(sessionId, signal),
    select: (d) => d.inquiries,
    retry: false,
    // Fallback polling while live events are unavailable and calls are in progress.
    refetchInterval: (query) => {
      const list = (query.state.data as { inquiries: Inquiry[] } | undefined)?.inquiries ?? [];
      return live !== 'open' && list.some((i) => !isFinal(i)) ? 3000 : false;
    },
  });
  const list = q.data ?? [];
  const activeN = list.filter((i) => !isFinal(i) && !i.result).length;
  const doneN = list.filter((i) => i.result).length;
  const announce = useMemo(() => (doneN ? `${formatNumber(doneN)} پاسخ دریافت شد` : ''), [doneN]);
  const notReady = q.error instanceof ApiError && q.error.status === 404;

  return (
    <>
      <PageHeader
        title="پیگیری‌ها"
        subtitle={list.length ? `${formatNumber(activeN)} در جریان · ${formatNumber(doneN)} پاسخ` : 'تماس‌ها و پاسخ فروشنده‌ها'}
        noBack
        actions={
          <span className="inline-flex items-center gap-1 px-2 text-caption text-muted" title={live === 'open' ? 'به‌روزرسانی زنده' : 'به‌روزرسانی دوره‌ای'}>
            {live === 'open' ? <Wifi aria-hidden className="size-4 text-primary" /> : <WifiOff aria-hidden className="size-4" />}
            {live === 'open' ? 'زنده' : 'دوره‌ای'}
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-4 pt-2">
        <p className="sr-only" aria-live="polite" aria-atomic>
          {announce}
        </p>
        {q.isPending ? (
          <>
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="h-28 w-full rounded-2xl" />
          </>
        ) : q.isError && !notReady ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !list.length ? (
          <EmptyState
            icon={BellRing}
            title={notReady ? 'سرویس پیگیری هنوز راه نیفتاده' : 'هنوز از فروشگاهی نپرسیده‌اید'}
            description="در صفحه یک کالا یا فهرست فروشنده‌ها «بپرس» را بزنید؛ دستیار از طرف شما موجودی، قیمت امروز و ساعت کاری را می‌پرسد و نتیجه همین‌جا می‌آید."
            actions={
              <ButtonLink to={paths.search()} startIcon={Search}>
                پیدا کردن کالا
              </ButtonLink>
            }
          >
            <SimulatedPill className="mt-3" />
          </EmptyState>
        ) : (
          <>
            <p className="flex items-start gap-2 text-meta leading-6 text-muted">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              لازم نیست صبر کنید؛ هر پاسخی برسد همین‌جا و با اعلان نشان داده می‌شود.
            </p>
            <InquiryList inquiries={list} highlightBatch={sp.get('batch')} />
          </>
        )}
      </div>
    </>
  );
}
