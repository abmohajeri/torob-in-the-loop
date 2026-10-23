import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpDown, Compass, List, Map as MapIcon, MessageCircleQuestion, Scale, Store, X } from 'lucide-react';
import { formatNumber, formatTomanShort, type NeedStoresResponse, type StoreOffer, type StoreSort } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { StickyCTA } from '../components/layout/StickyCTA.js';
import { Segmented } from '../components/ui/Tabs.js';
import { Button } from '../components/ui/Button.js';
import { IconButton } from '../components/ui/IconButton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { DataNote } from '../components/data/DataNote.js';
import { ReasonChips } from '../components/data/ReasonChips.js';
import { LazyMap, type MapMarker } from '../components/map/LazyMap.js';
import { StoreOfferCardSkeleton } from '../components/store/StoreOfferCard.js';
import { StoreList, storesHeadline } from '../components/store/StoreList.js';
import { AreasStrip } from '../components/store/AreasStrip.js';
import { StoreCoverage } from '../components/store/StoreCoverage.js';
import { CandidateShops } from '../components/store/CandidateShops.js';
import { askShop } from '../components/store/askTarget.js';
import { api, request } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useContextQuery } from '../state/useContextStore.js';
import { openAsk } from '../state/ask.js';

const SORTS: { value: StoreSort; label: string }[] = [
  { value: 'smart', label: 'پیشنهادی' },
  { value: 'price', label: 'ارزان‌ترین' },
  { value: 'distance', label: 'نزدیک‌ترین' },
  { value: 'freshness', label: 'قیمت جدیدتر' },
];

type Mode = 'product' | 'need';

export default function ProductStoresPage() {
  const { id = '' } = useParams();
  const [sp, setSp] = useSearchParams();
  const navigate = useNavigate();
  const sort = (SORTS.some((s) => s.value === sp.get('sort')) ? sp.get('sort') : 'smart') as StoreSort;
  const mode: Mode = sp.get('mode') === 'need' ? 'need' : 'product';
  const [view, setView] = useState<'list' | 'map'>('list');
  const [area, setArea] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const { ctx, ctxKey } = useContextQuery();

  const q = useQuery({ queryKey: qk.productStores(id, sort, ctxKey), queryFn: ({ signal }) => api.productStores(id, { sort }, ctx, signal), enabled: !!id, placeholderData: (prev) => prev });
  const data = q.data;
  const p = data?.product;
  useDocumentTitle(p ? `فروشنده‌های ${p.title}` : 'فروشنده‌ها');

  const need = useQuery({
    queryKey: ['bz', 'need', p?.category ?? '', p?.categoryGroup ?? '', ctxKey],
    queryFn: ({ signal }) => request<NeedStoresResponse>('GET', '/need/stores', { query: { category: p!.category, limit: 30 }, ctx, signal }),
    enabled: mode === 'need' && !!p,
    retry: false,
    staleTime: 60_000,
  });

  const setParam = (k: string, v: string | null) =>
    setSp(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (v === null) n.delete(k);
        else n.set(k, v);
        return n;
      },
      { replace: true },
    );

  const toggle = (o: StoreOffer) => setSelected((s) => (s.includes(o.shop.id) ? s.filter((x) => x !== o.shop.id) : s.length >= 4 ? s : [...s, o.shop.id]));
  const selectedOffers = useMemo(() => data?.stores.filter((s) => selected.includes(s.shop.id)) ?? [], [data, selected]);

  const markers: MapMarker[] = useMemo(() => {
    if (!data) return [];
    const byMall = new Map<string, { lat: number; lng: number; count: number; min: number | null; name: string; id: string }>();
    for (const s of data.stores) {
      const key = s.shop.location.mall ? `m${s.shop.location.mall.id}` : s.shop.id;
      const cur = byMall.get(key) ?? { lat: s.shop.lat, lng: s.shop.lng, count: 0, min: null, name: s.shop.location.mall?.name ?? s.shop.name, id: s.shop.id };
      cur.count++;
      if (s.price.price !== null && (cur.min === null || s.price.price < cur.min)) cur.min = s.price.price;
      byMall.set(key, cur);
    }
    return [...byMall.entries()].map(([k, m]) => ({
      id: k.startsWith('m') ? `mall:${m.id}` : m.id,
      lat: m.lat,
      lng: m.lng,
      kind: 'price' as const,
      label: `${m.name} · ${formatNumber(m.count)} فروشنده`,
      text: m.count > 1 ? `${formatNumber(m.count)} · از ${formatTomanShort(m.min, false)}` : formatTomanShort(m.min, false),
    }));
  }, [data]);

  return (
    <>
      <PageHeader title={mode === 'need' ? 'کجا بروم؟' : 'فروشنده‌های حضوری'} subtitle={p?.title} backTo={p ? paths.product(p.id) : '/'}>
        <div className="px-4 pb-2">
          <Segmented
            label="نوع جستجو"
            fullWidth
            size="sm"
            value={mode}
            onChange={(v) => setParam('mode', v === 'need' ? 'need' : null)}
            options={[
              { value: 'product', label: 'همین کالا', icon: Store, count: p?.sellerCount },
              { value: 'need', label: 'فروشگاه‌های هم‌دسته', icon: Compass },
            ]}
          />
        </div>
      </PageHeader>
      <div className="flex flex-col gap-4 px-4 pt-2">
        {q.isPending ? (
          <>
            <StoreOfferCardSkeleton />
            <StoreOfferCardSkeleton />
          </>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : !data || !p ? null : mode === 'need' ? (
          <>
            <p className="text-body leading-7 text-ink-2">
              فروشگاه‌هایی که در دسته «{p.category}» کالا ثبت کرده‌اند؛ مناسب وقتی هنوز مدل دقیق را انتخاب نکرده‌اید و می‌خواهید چند مدل را یک‌جا ببینید.
            </p>
            {need.isPending ? (
              <StoreOfferCardSkeleton />
            ) : need.isError || !need.data ? (
              <>
                <DataNote variant="boxed" tone="info">
                  جستجوی هم‌دسته هنوز روی سرور فعال نیست؛ فعلاً فروشگاه‌های هم‌دسته‌ای را نشان می‌دهیم که در دسته فعالیتشان «{p.category}» ثبت شده است.
                </DataNote>
                <CandidateShops items={data.categoryOnly} productId={p.id} productTitle={p.title} group={p.categoryGroup} />
              </>
            ) : need.data.stores.length ? (
              <>
                <p className="text-title font-extrabold text-heading">
                  {formatNumber(need.data.stores.length)} فروشگاه {p.category}
                </p>
                <StoreCoverage data={need.data} needLabel={p.category} />
              </>
            ) : (
              <EmptyState title="فروشگاه هم‌دسته‌ای پیدا نشد" description="شعاع یا شرط‌ها را تغییر دهید." />
            )}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="text-body font-bold leading-7 text-heading">{storesHeadline(data)}</p>
              {data.appliedFilters.length ? <ReasonChips reasons={data.appliedFilters} max={6} size="sm" /> : null}
            </div>
            <div className="flex items-center gap-2">
              <Segmented label="مرتب‌سازی" size="sm" className="min-w-0 flex-1" value={sort} onChange={(v) => setParam('sort', v === 'smart' ? null : v)} options={SORTS} />
              <IconButton icon={view === 'list' ? MapIcon : List} label={view === 'list' ? 'نمایش روی نقشه' : 'نمایش فهرست'} variant="secondary" onClick={() => setView(view === 'list' ? 'map' : 'list')} />
            </div>
            {q.isFetching && q.isPlaceholderData ? (
              <p role="status" className="flex items-center gap-1.5 text-caption text-muted">
                <ArrowUpDown aria-hidden className="size-3.5" />
                در حال مرتب‌سازی…
              </p>
            ) : null}
            {data.areas.length > 1 ? <AreasStrip areas={data.areas} selected={area} onSelect={setArea} /> : null}
            {view === 'map' ? (
              <LazyMap
                markers={markers}
                user={ctx.location ?? null}
                fit
                className="h-[55dvh] overflow-hidden rounded-2xl border border-line"
                label="نقشه فروشنده‌ها"
                onMarkerClick={(m) => (m.id.startsWith('mall:') ? navigate(paths.shop(m.id.slice(5))) : navigate(paths.shop(m.id)))}
              />
            ) : data.stores.length ? (
              <StoreList data={data} area={area} selectable selected={selected} onToggleSelect={toggle} />
            ) : (
              <>
                <EmptyState
                  title="با شرط‌های فعلی فروشنده‌ای نماند"
                  description={data.excludedByFilters ? `${formatNumber(data.excludedByFilters)} فروشگاه با فیلترهای شما پنهان شده است.` : 'این کالا فروشنده حضوری ثبت‌شده ندارد.'}
                />
                <CandidateShops items={data.categoryOnly} productId={p.id} productTitle={p.title} group={p.categoryGroup} />
              </>
            )}
          </>
        )}
      </div>
      {mode === 'product' && p && selectedOffers.length ? (
        <StickyCTA note={`${formatNumber(selectedOffers.length)} فروشگاه انتخاب شد${selectedOffers.length >= 4 ? ' (حداکثر)' : ''}`}>
          <Button variant="accent" startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: selectedOffers.map((o) => askShop(o.shop)), productId: p.id, productTitle: p.title, group: p.categoryGroup })}>
            از هر {formatNumber(selectedOffers.length)} بپرس
          </Button>
          <Button variant="secondary" startIcon={Scale} disabled={selectedOffers.length < 2} onClick={() => navigate(paths.compareStores(p.id, selected))}>
            مقایسه
          </Button>
          <IconButton icon={X} label="لغو انتخاب" variant="ghost" className="!flex-none" onClick={() => setSelected([])} />
        </StickyCTA>
      ) : null}
    </>
  );
}
