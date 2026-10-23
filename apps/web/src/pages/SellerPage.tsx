import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Inbox, Search, Store } from 'lucide-react';
import type { ShopLite } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { TextField } from '../components/ui/TextField.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { OpenStatusBadge } from '../components/data/OpenStatusBadge.js';
import { InMallGuide } from '../components/data/InMallGuide.js';
import { api, ApiError } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDebouncedValue, useDocumentTitle } from '../lib/hooks.js';

function ShopRow({ shop }: { shop: ShopLite }) {
  return (
    <li>
      <Link to={paths.sellerInbox(shop.id)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary-strong">
          <Store className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body font-extrabold text-ink">{shop.name}</span>
          <InMallGuide location={shop.location} variant="line" linkMall={false} />
          <OpenStatusBadge status={shop.openStatus} size="sm" plain />
        </span>
        <ChevronLeft aria-hidden className="size-5 text-faint" />
      </Link>
    </li>
  );
}

/** Seller entry: pick your shop (shops that were asked about come first). */
export default function SellerPage() {
  useDocumentTitle('پنل فروشنده');
  const [q, setQ] = useState('');
  const dq = useDebouncedValue(q.trim(), 250);
  const shops = useQuery({
    queryKey: qk.sellerShops(dq),
    queryFn: async ({ signal }) => {
      try {
        return await api.sellerShops(dq, signal);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && dq) return api.shops(dq, 20, signal);
        throw e;
      }
    },
    retry: false,
  });

  return (
    <>
      <PageHeader title="پنل فروشنده" subtitle="به سؤال خریداران با یک لمس جواب دهید" backTo="/" />
      <div className="flex flex-col gap-4 px-4 pt-2">
        <div className="rounded-2xl border border-primary-200 bg-primary-tint p-4 text-body leading-7 text-primary-ink">
          <Inbox aria-hidden className="mb-1 size-6 text-primary-strong" />
          خریداران از طریق Torob in the Loop درباره موجودی، قیمت امروز و نگه‌داشتن کالا سؤال می‌کنند. پاسخ شما با برچسب «پاسخ مستقیم فروشنده» بالاتر از پاسخ‌های تلفنی نمایش داده می‌شود.
        </div>
        <TextField label="فروشگاه شما" placeholder="نام فروشگاه یا پاساژ" startIcon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
        {shops.isPending ? (
          <>
            <Skeleton className="h-16 w-full rounded-2xl" />
            <Skeleton className="h-16 w-full rounded-2xl" />
          </>
        ) : shops.data?.length ? (
          <section aria-labelledby="shops-h" className="flex flex-col gap-2">
            <h2 id="shops-h" className="text-meta font-bold text-muted">
              {dq ? 'نتیجه جستجو' : 'فروشگاه‌هایی که از آن‌ها سؤال شده'}
            </h2>
            <ul className="flex flex-col gap-2">
              {shops.data.map((s) => (
                <ShopRow key={s.id} shop={s} />
              ))}
            </ul>
          </section>
        ) : (
          <EmptyState
            icon={Store}
            size="sm"
            title={dq ? 'فروشگاهی با این نام پیدا نشد' : 'هنوز سؤالی برای فروشگاه‌ها ثبت نشده'}
            description={dq ? 'بخشی از نام فروشگاه یا نام پاساژ را بنویسید.' : 'نام فروشگاه خود را جستجو کنید تا صندوق پیام‌هایش باز شود.'}
          />
        )}
      </div>
    </>
  );
}
