import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Building2, Lightbulb, Navigation, TrafficCone, TrainFront } from 'lucide-react';
import { formatNumber, navLinksFor } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { ButtonAnchor } from '../components/ui/Button.js';
import { ChipScroller } from '../components/ui/Chip.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { LazyMap } from '../components/map/LazyMap.js';
import { FloorDirectory } from '../components/mall/FloorDirectory.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useContextQuery } from '../state/useContextStore.js';

export default function MallPage() {
  const { slug = '' } = useParams();
  const [sp] = useSearchParams();
  const { ctx, ctxKey } = useContextQuery();
  const q = useQuery({ queryKey: qk.mall(slug, ctxKey), queryFn: ({ signal }) => api.mall(slug, ctx, signal), enabled: !!slug });
  const d = q.data;
  useDocumentTitle(d?.mall.name ?? 'پاساژ');
  const nav = d ? navLinksFor({ lat: d.mall.lat, lng: d.mall.lng }, d.mall.name) : null;

  return (
    <>
      <PageHeader title={d?.mall.name ?? 'پاساژ'} subtitle={d ? `${formatNumber(d.mall.shopCount)} فروشگاه ثبت‌شده${d.mall.area ? ` · ${d.mall.area}` : ''}` : undefined} />
      <div className="flex flex-col gap-5 px-4 pt-2">
        {q.isPending ? (
          <>
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-64 w-full rounded-2xl" />
          </>
        ) : q.isError || !d ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : (
          <>
            <LazyMap center={{ lat: d.mall.lat, lng: d.mall.lng }} zoom={17} markers={[{ id: 'mall', lat: d.mall.lat, lng: d.mall.lng, kind: 'mall', label: d.mall.name }]} interactive={false} className="h-40 overflow-hidden rounded-2xl border border-line" label={`موقعیت ${d.mall.name}`} />
            <div className="flex flex-col gap-1.5 text-meta text-ink-2">
              {d.nearbyMetro[0] ? (
                <p className="flex items-center gap-1.5">
                  <TrainFront aria-hidden className="size-4 text-primary" />
                  مترو {d.nearbyMetro[0].name} — <span className="num">{formatNumber(d.nearbyMetro[0].walkMin)}</span> دقیقه پیاده
                </p>
              ) : null}
              {d.inTrafficZone ? (
                <p className="flex items-center gap-1.5 text-warn-ink">
                  <TrafficCone aria-hidden className="size-4" />
                  داخل محدوده طرح ترافیک
                </p>
              ) : null}
            </div>
            {nav ? (
              <ButtonAnchor href={nav.neshan} external variant="secondary" startIcon={Navigation}>
                مسیریابی تا {d.mall.name}
              </ButtonAnchor>
            ) : null}
            {d.tips.length ? (
              <ul className="flex flex-col gap-1.5 rounded-2xl border border-accent-100 bg-accent-tint p-3.5">
                {d.tips.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-meta leading-6 text-accent-ink">
                    <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
            {d.categories.length ? (
              <ChipScroller label="دسته‌های پرتکرار">
                {d.categories.slice(0, 8).map((c) => (
                  <span key={c.value} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-line bg-surface px-3 text-caption text-ink-2">
                    {c.label} <span className="num text-muted">{formatNumber(c.count)}</span>
                  </span>
                ))}
              </ChipScroller>
            ) : null}
            <section aria-labelledby="dir" className="flex flex-col gap-3">
              <h2 id="dir" className="flex items-center gap-2 text-title font-extrabold text-heading">
                <Building2 aria-hidden className="size-5 text-primary" />
                راهنمای طبقه‌به‌طبقه
              </h2>
              <FloorDirectory floors={d.floors} highlightShopId={sp.get('shop')} />
            </section>
          </>
        )}
      </div>
    </>
  );
}
