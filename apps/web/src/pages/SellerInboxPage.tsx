import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Inbox, Wifi, WifiOff } from 'lucide-react';
import { formatNumber, type Inquiry, type SellerLiveEvent } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { SellerInquiryCard } from '../components/seller/SellerInquiryCard.js';
import { api, ApiError } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { connectEventSource, type LiveStatus } from '../lib/sse.js';
import { upsertInquiry } from '../hooks/useLiveEvents.js';

export default function SellerInboxPage() {
  const { shopId = '' } = useParams();
  const qc = useQueryClient();
  const [live, setLive] = useState<LiveStatus>('connecting');
  const shop = useQuery({ queryKey: qk.shop(shopId, ''), queryFn: ({ signal }) => api.shop(shopId, {}, signal), enabled: !!shopId, retry: false });
  const q = useQuery({
    queryKey: qk.sellerInquiries(shopId),
    queryFn: ({ signal }) => api.sellerInquiries(shopId, signal),
    select: (d) => d.inquiries,
    enabled: !!shopId,
    retry: false,
    refetchInterval: live === 'open' ? false : 5000,
  });
  useDocumentTitle(shop.data ? `صندوق ${shop.data.name}` : 'صندوق فروشنده');

  useEffect(() => {
    if (!shopId) return;
    const conn = connectEventSource<SellerLiveEvent>(api.sellerEventsUrl(shopId), {
      onStatus: setLive,
      onMessage: (ev) => {
        if (ev.type !== 'seller.inquiry') return;
        let isNew = false;
        qc.setQueryData<{ inquiries: Inquiry[] }>(qk.sellerInquiries(shopId), (old) => {
          isNew = !old?.inquiries.some((i) => i.id === ev.inquiry.id);
          return { inquiries: upsertInquiry(old?.inquiries ?? [], ev.inquiry) };
        });
        if (isNew) toast.info('سؤال تازه از یک خریدار', { description: ev.inquiry.product?.title });
      },
    });
    return () => conn.close();
  }, [shopId, qc]);

  const list = q.data ?? [];
  const pending = list.filter((i) => !(i.result && i.resultSource === 'seller_inbox'));
  const answered = list.filter((i) => i.result && i.resultSource === 'seller_inbox');
  const stale = list.filter((i) => (i.registeredPrice?.ageDays ?? 0) > 30).length;
  const notReady = q.error instanceof ApiError && q.error.status === 404;

  return (
    <>
      <PageHeader
        title={shop.data?.name ?? 'صندوق فروشنده'}
        subtitle={list.length ? `امروز ${formatNumber(list.length)} نفر درباره کالاهای شما پرسیدند${stale ? ` · ${formatNumber(stale)} قیمت شما بیش از ۳۰ روز قدیمی است` : ''}` : 'سؤال‌های خریداران'}
        backTo={paths.seller}
        actions={
          <span className="inline-flex items-center gap-1 px-2 text-caption text-muted">
            {live === 'open' ? <Wifi aria-hidden className="size-4 text-primary" /> : <WifiOff aria-hidden className="size-4" />}
            {live === 'open' ? 'زنده' : 'دوره‌ای'}
          </span>
        }
      />
      <div className="flex flex-col gap-4 px-4 pt-2">
        {q.isPending ? (
          <Skeleton className="h-64 w-full rounded-2xl" />
        ) : q.isError && !notReady ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !list.length ? (
          <EmptyState icon={Inbox} title={notReady ? 'صندوق فروشنده هنوز راه نیفتاده' : 'سؤال تازه‌ای نیست'} description="هر وقت خریداری درباره کالاهای شما بپرسد، همین‌جا با دکمه‌های پاسخ سریع نمایش داده می‌شود." />
        ) : (
          <>
            {pending.length ? (
              <section aria-label="منتظر پاسخ" className="flex flex-col gap-3">
                <h2 className="text-meta font-bold text-accent-ink">منتظر پاسخ شما ({formatNumber(pending.length)})</h2>
                {pending.map((i) => (
                  <SellerInquiryCard key={i.id} inquiry={i} shopId={shopId} />
                ))}
              </section>
            ) : null}
            {answered.length ? (
              <section aria-label="پاسخ داده شده" className="flex flex-col gap-3">
                <h2 className="text-meta font-bold text-muted">پاسخ داده شده ({formatNumber(answered.length)})</h2>
                {answered.map((i) => (
                  <SellerInquiryCard key={i.id} inquiry={i} shopId={shopId} />
                ))}
              </section>
            ) : null}
          </>
        )}
      </div>
    </>
  );
}
