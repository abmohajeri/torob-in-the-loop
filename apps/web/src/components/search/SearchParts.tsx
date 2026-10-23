import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDownWideNarrow, Search, SlidersHorizontal, Wallet, X } from 'lucide-react';
import { formatNumber, type BudgetReality, type Facets, type SearchRequest, type SearchSort, type UserContext } from '@titl/shared';
import { Sheet } from '../ui/Sheet.js';
import { Button } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { Switch } from '../ui/Switch.js';
import { Segmented } from '../ui/Tabs.js';
import { cn } from '../../lib/cn.js';

/** Search input row (submit on Enter; clear button). */
export function SearchBox({ value, onSubmit, autoFocus }: { value: string; onSubmit: (q: string) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState(value);
  useEffect(() => setQ(value), [value]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(q.trim());
  };
  return (
    <form role="search" onSubmit={submit} className="flex h-12 items-center gap-2 rounded-2xl border border-line bg-surface ps-3.5 pe-1.5 shadow-card focus-within:border-primary">
      <Search aria-hidden className="size-5 text-primary" />
      <label htmlFor="search-q" className="sr-only">
        جستجوی کالا
      </label>
      <input
        id="search-q"
        type="search"
        enterKeyHint="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        placeholder="نام کالا، برند یا نیازتان…"
        className="h-full min-w-0 flex-1 bg-transparent text-body text-ink outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {q ? (
        <button type="button" aria-label="پاک کردن" onClick={() => setQ('')} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-sunken">
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </form>
  );
}

const SORTS: { value: SearchSort; label: string }[] = [
  { value: 'relevance', label: 'مرتبط‌ترین' },
  { value: 'price_asc', label: 'ارزان‌ترین' },
  { value: 'sellers', label: 'فروشنده بیشتر' },
  { value: 'distance', label: 'نزدیک‌ترین' },
];

export interface FiltersSheetProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  facets: Facets;
  req: SearchRequest;
  total: number;
  onApply: (patch: Partial<SearchRequest>) => void;
}

/** Filters (category · brand · price tier · audience · near-only · sort) with live facet counts and a counted footer. */
export function FiltersSheet({ open, onOpenChange, facets, req, total, onApply }: FiltersSheetProps) {
  const [draft, setDraft] = useState<Partial<SearchRequest>>({});
  useEffect(() => {
    if (open) setDraft({ category: req.category, brand: req.brand, priceMin: req.priceMin, priceMax: req.priceMax, audience: req.audience, nearOnly: req.nearOnly, sort: req.sort });
  }, [open, req]);
  const set = (p: Partial<SearchRequest>) => setDraft((d) => ({ ...d, ...p }));
  const tierCount = facets.priceTiers.find((t) => t.min === draft.priceMin && t.max === draft.priceMax)?.count;
  const count = draft.brand ? facets.brands.find((b) => b.value === draft.brand)?.count : draft.category ? facets.categories.find((c) => c.value === draft.category)?.count : tierCount;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="فیلترها"
      icon={SlidersHorizontal}
      size="tall"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setDraft({})}>
            پاک کردن
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
          >
            نمایش {count != null ? `حدود ${formatNumber(count)}` : formatNumber(total)} کالا
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        <FacetGroup title="مرتب‌سازی">
          <Segmented label="مرتب‌سازی" fullWidth size="sm" value={draft.sort ?? 'relevance'} onChange={(v) => set({ sort: v })} options={SORTS} />
        </FacetGroup>
        {facets.categories.length > 1 ? (
          <FacetGroup title="دسته">
            {facets.categories.slice(0, 10).map((c) => (
              <Chip key={c.value} selected={draft.category === c.value} count={c.count} onClick={() => set({ category: draft.category === c.value ? undefined : c.value })}>
                {c.label}
              </Chip>
            ))}
          </FacetGroup>
        ) : null}
        {facets.brands.length ? (
          <FacetGroup title="برند">
            {facets.brands.slice(0, 12).map((b) => (
              <Chip key={b.value} selected={draft.brand === b.value} count={b.count} onClick={() => set({ brand: draft.brand === b.value ? undefined : b.value })}>
                {b.label}
              </Chip>
            ))}
          </FacetGroup>
        ) : null}
        {facets.priceTiers.length ? (
          <FacetGroup title="بازه قیمت">
            {facets.priceTiers.map((t) => {
              const on = draft.priceMin === (t.min ?? undefined) && draft.priceMax === (t.max ?? undefined);
              return (
                <Chip key={t.id} selected={on} count={t.count} onClick={() => set(on ? { priceMin: undefined, priceMax: undefined } : { priceMin: t.min ?? undefined, priceMax: t.max ?? undefined })}>
                  {t.label}
                </Chip>
              );
            })}
          </FacetGroup>
        ) : null}
        {facets.audiences.length ? (
          <FacetGroup title="برای">
            {facets.audiences.map((a) => (
              <Chip key={a.value} selected={draft.audience === a.value} count={a.count} onClick={() => set({ audience: draft.audience === a.value ? undefined : (a.value as SearchRequest['audience']) })}>
                {a.label}
              </Chip>
            ))}
          </FacetGroup>
        ) : null}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-3">
          <span className="text-body text-ink">
            فقط کالاهایی با فروشنده نزدیک
            {facets.nearCount != null ? <span className="num block text-caption text-muted">{formatNumber(facets.nearCount)} کالا</span> : null}
          </span>
          <Switch checked={!!draft.nearOnly} onCheckedChange={(v) => set({ nearOnly: v || undefined })} label="فقط فروشنده نزدیک" />
        </div>
      </div>
    </Sheet>
  );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-meta font-bold text-ink">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** SV8 «BudgetRealityCard»: budget below what credible products cost → honest line + one-tap actions. */
export function BudgetRealityCard({ data, onAction }: { data: BudgetReality; onAction: (a: { contextPatch?: Partial<UserContext>; searchPatch?: Partial<SearchRequest> }) => void }) {
  return (
    <section className="rounded-2xl border border-accent-200 bg-accent-tint p-3.5">
      <p className="flex gap-2 text-meta leading-6 text-ink">
        <Wallet aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-ink" />
        {data.text}
      </p>
      {data.actions.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {data.actions.map((a, i) => (
            <Button key={a.id} size="sm" variant={i === 0 ? 'accent' : 'secondary'} onClick={() => onAction(a)}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function SortHint({ sort, className }: { sort?: SearchSort; className?: string }) {
  if (!sort || sort === 'relevance') return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-caption text-muted', className)}>
      <ArrowDownWideNarrow aria-hidden className="size-3.5" />
      {SORTS.find((s) => s.value === sort)?.label}
    </span>
  );
}
