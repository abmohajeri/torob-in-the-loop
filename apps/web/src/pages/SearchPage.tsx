import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info, MessageCircleQuestion, SearchX, SlidersHorizontal, Wand2 } from 'lucide-react';
import { EXAMPLE_QUERIES, formatNumber, type Audience, type SearchRequest, type SearchSort } from '@titl/shared';
import { ProductCard, ProductCardSkeleton, ProductGrid } from '../components/product/ProductCard.js';
import { BudgetRealityCard, FiltersSheet, SearchBox, SortHint } from '../components/search/SearchParts.js';
import { DiscoveryFlow } from '../components/discovery/DiscoveryFlow.js';
import { useApplyDiscovery } from '../components/blocks/BlockRenderer.js';
import { Button, ButtonLink } from '../components/ui/Button.js';
import { Chip, ChipScroller, RemovableChip } from '../components/ui/Chip.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { useContextQuery, useContextStore } from '../state/useContextStore.js';
import { useRecent } from '../state/useRecent.js';

const PAGE = 20;

function readReq(p: URLSearchParams): SearchRequest {
  const num = (k: string) => (p.get(k) ? Number(p.get(k)) : undefined);
  return {
    q: p.get('q') ?? undefined,
    category: p.get('category') ?? undefined,
    group: p.get('group') ?? undefined,
    brand: p.get('brand') ?? undefined,
    priceMin: num('priceMin'),
    priceMax: num('priceMax'),
    audience: (p.get('audience') as Audience) ?? undefined,
    nearOnly: p.get('nearOnly') === '1' || undefined,
    spec: p.getAll('spec'),
    sort: (p.get('sort') as SearchSort) ?? undefined,
  };
}

function writeReq(req: SearchRequest): URLSearchParams {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(req)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    if (Array.isArray(v)) v.forEach((x) => out.append(k, String(x)));
    else out.set(k, v === true ? '1' : String(v));
  }
  return out;
}

/**
 * Search: query box · parse chips (removable) · notices / budget reality · result grid · filters sheet ·
 * «کمکم کن انتخاب کنم» discovery. Never a dead end: did-you-mean, relax actions, discovery and examples.
 */
export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const req = useMemo(() => readReq(params), [params]);
  const { ctx, ctxKey } = useContextQuery();
  const patchCtx = useContextStore((s) => s.patch);
  const addQuery = useRecent((s) => s.addQuery);
  const [limit, setLimit] = useState(PAGE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [discover, setDiscover] = useState(false);
  const applyDiscovery = useApplyDiscovery(req.q);
  const hasQuery = !!(req.q || req.category || req.group || req.brand);
  useDocumentTitle(req.q ? `«${req.q}»` : 'جستجوی کالا');

  const search = useQuery({
    queryKey: qk.search({ ...req, limit }, ctxKey),
    queryFn: ({ signal }) => api.search({ ...req, limit }, ctx, signal),
    enabled: hasQuery,
    placeholderData: keepPreviousData,
  });
  const disc = useQuery({
    queryKey: qk.discover({ q: req.q, category: req.category }, ctxKey),
    queryFn: ({ signal }) => api.discover({ q: req.q, category: req.category }, ctx, signal),
    enabled: discover || (search.isSuccess && search.data.total === 0),
  });

  const update = (patch: Partial<SearchRequest>) => {
    setLimit(PAGE);
    setParams(writeReq({ ...req, ...patch }));
  };
  const submit = (q: string) => {
    if (q) addQuery(q);
    setDiscover(false);
    setLimit(PAGE);
    setParams(writeReq({ q }));
  };

  const data = search.data;
  const filterCount = [req.category, req.brand, req.priceMin ?? req.priceMax, req.audience, req.nearOnly, req.spec?.length].filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 px-4 pt-2">
      <h1 className="sr-only">جستجوی کالا</h1>
      <SearchBox value={req.q ?? ''} onSubmit={submit} autoFocus={!hasQuery} />

      {!hasQuery ? (
        <section className="flex flex-col gap-3 pt-2">
          <p className="text-body text-ink-2">نام کالا را بنویسید یا اگر مطمئن نیستید چه بخرید، با چند سؤال کمکتان می‌کنیم.</p>
          <Button variant="soft" startIcon={Wand2} onClick={() => setDiscover(true)} className="w-fit">
            کمکم کن انتخاب کنم
          </Button>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUERIES.slice(0, 5).map((q) => (
              <Chip key={q} onClick={() => submit(q)}>
                {q}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}

      {data?.parsed.chips.length || filterCount ? (
        <ChipScroller label="برداشت ما از جستجو">
          {data?.parsed.chips.map((c) =>
            c.removable && c.qWithout !== undefined ? (
              <RemovableChip key={`${c.key}-${c.label}`} size="sm" removeLabel={`حذف ${c.label}`} onRemove={() => update({ q: c.qWithout })}>
                {c.label}
              </RemovableChip>
            ) : (
              <Chip key={`${c.key}-${c.label}`} size="sm" active>
                {c.label}
              </Chip>
            ),
          )}
          {req.brand ? <RemovableChip size="sm" removeLabel="حذف برند" onRemove={() => update({ brand: undefined })}>{req.brand}</RemovableChip> : null}
          {req.priceMin || req.priceMax ? (
            <RemovableChip size="sm" removeLabel="حذف بازه قیمت" onRemove={() => update({ priceMin: undefined, priceMax: undefined })}>
              بازه قیمت
            </RemovableChip>
          ) : null}
          {req.nearOnly ? <RemovableChip size="sm" removeLabel="حذف فقط نزدیک" onRemove={() => update({ nearOnly: undefined })}>فقط نزدیک</RemovableChip> : null}
        </ChipScroller>
      ) : null}

      {hasQuery ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-meta text-ink-2" aria-live="polite">
            {data ? (
              <>
                <b className="num">{formatNumber(data.total)}</b> کالا با فروشنده حضوری
              </>
            ) : (
              <Skeleton className="h-5 w-32" />
            )}
            <SortHint sort={req.sort} className="ms-2" />
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" startIcon={Wand2} onClick={() => setDiscover((d) => !d)} aria-expanded={discover}>
              کمکم کن
            </Button>
            <Button size="sm" variant="secondary" startIcon={SlidersHorizontal} onClick={() => setFiltersOpen(true)} disabled={!data}>
              فیلتر{filterCount ? ` (${formatNumber(filterCount)})` : ''}
            </Button>
          </div>
        </div>
      ) : null}

      {discover ? (
        disc.data ? (
          <DiscoveryFlow data={disc.data} onDone={(r) => { setDiscover(false); applyDiscovery(r); }} />
        ) : disc.isError ? (
          <p className="text-meta text-muted">پرسش‌های راهنما برای این جستجو در دسترس نیست.</p>
        ) : (
          <Skeleton className="h-56 w-full rounded-2xl" />
        )
      ) : null}

      {data?.budgetReality ? (
        <BudgetRealityCard
          data={data.budgetReality}
          onAction={(a) => {
            if (a.contextPatch) patchCtx(a.contextPatch);
            if (a.searchPatch) update(a.searchPatch);
          }}
        />
      ) : null}

      {data?.notices?.map((n) => (
        <p key={n.code} className="flex gap-2 rounded-xl border border-info-line bg-info-tint px-3 py-2 text-meta text-ink">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-info-ink" />
          {n.label}
        </p>
      ))}

      {data?.didYouMean ? (
        <p className="text-meta text-ink-2">
          منظورتان{' '}
          <button type="button" className="hit-44 font-bold text-primary-strong underline underline-offset-4" onClick={() => submit(data.didYouMean!)}>
            {data.didYouMean}
          </button>{' '}
          بود؟
        </p>
      ) : null}

      {data?.hiddenReplicas ? (
        <p className="text-caption text-muted">{formatNumber(data.hiddenReplicas)} کالای طرح/کپی پنهان شد.</p>
      ) : null}

      {search.isError && !data ? (
        <ErrorState error={search.error} onRetry={() => search.refetch()} retrying={search.isFetching} />
      ) : hasQuery && !data ? (
        <ProductGrid>
          {Array.from({ length: 6 }, (_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </ProductGrid>
      ) : data && data.items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="کالای مطابقی پیدا نشد"
          description={filterCount ? 'فیلترها نتیجه را خالی کرده‌اند. یکی را بردارید یا از دستیار کمک بگیرید.' : 'شاید با نام دیگری ثبت شده باشد. از دستیار بپرسید یا با چند سؤال کمکتان کنیم.'}
          actions={
            <>
              {filterCount ? (
                <Button variant="primary" onClick={() => setParams(writeReq({ q: req.q }))}>
                  حذف همه فیلترها
                </Button>
              ) : null}
              <ButtonLink to={paths.assistant(req.q)} variant={filterCount ? 'secondary' : 'primary'} startIcon={MessageCircleQuestion}>
                از دستیار بپرس
              </ButtonLink>
            </>
          }
        />
      ) : data ? (
        <>
          <ProductGrid className={search.isFetching ? 'opacity-70 transition-opacity' : undefined}>
            {data.items.map((p, i) => (
              <ProductCard key={p.id} product={p} priority={i < 4} />
            ))}
          </ProductGrid>
          {data.total > data.items.length ? (
            <Button variant="outline" fullWidth loading={search.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
              نمایش بیشتر ({formatNumber(data.total - data.items.length)} کالای دیگر)
            </Button>
          ) : null}
        </>
      ) : null}

      {data ? <FiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} facets={data.facets} req={req} total={data.total} onApply={update} /> : null}
    </div>
  );
}
