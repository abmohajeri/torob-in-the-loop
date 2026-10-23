import { Link, useNavigate } from 'react-router';
import { AlertTriangle, Building2, Circle, CircleCheck, Loader2, MinusCircle, Footprints, Info, MapPinned, Route, Store, XCircle, type LucideIcon } from 'lucide-react';
import {
  formatDistance,
  formatMinutes,
  formatNumber,
  formatPriceRange,
  formatTimeOfDay,
  type Tone,
  type UIBlock,
} from '@titl/shared';
import { ProductCard } from '../product/ProductCard.js';
import { ProductImage } from '../product/ProductImage.js';
import { StoreResults } from '../search/StoreResults.js';
import { DiscoveryFlow, type DiscoveryResult } from '../discovery/DiscoveryFlow.js';
import { CompareTable } from '../compare/CompareTable.js';
import { InquiryList } from '../inquiry/InquiryList.js';
import { AlternativesPanel } from '../alternatives/AlternativesPanel.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { Button, ButtonLink } from '../ui/Button.js';
import { Chip } from '../ui/Chip.js';
import { askStores } from '../../lib/ask.js';
import { paths } from '../../lib/paths.js';
import { useContextStore } from '../../state/useContextStore.js';
import { cn } from '../../lib/cn.js';

const NOTICE: Record<Tone, { icon: LucideIcon; cls: string }> = {
  good: { icon: CircleCheck, cls: 'border-good-line bg-good-tint text-good-ink' },
  info: { icon: Info, cls: 'border-info-line bg-info-tint text-info-ink' },
  warn: { icon: AlertTriangle, cls: 'border-warn-line bg-warn-tint text-warn-ink' },
  bad: { icon: XCircle, cls: 'border-bad-line bg-bad-tint text-bad-ink' },
};

function BlockTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-meta font-bold text-heading">{children}</h3>;
}

/** Discovery answers → /search URL params + context patch. */
export function useApplyDiscovery(q?: string) {
  const navigate = useNavigate();
  const patch = useContextStore((s) => s.patch);
  return (r: DiscoveryResult) => {
    if (Object.keys(r.context).length) patch(r.context);
    const s = r.search;
    const params = new URLSearchParams();
    const text = [q, ...(s.keywords ?? [])].filter(Boolean).join(' ');
    if (s.q || text) params.set('q', s.q ?? text);
    for (const k of ['category', 'group', 'brand', 'priceMin', 'priceMax', 'audience', 'sort'] as const) if (s[k] != null) params.set(k, String(s[k]));
    for (const sp of s.spec ?? []) params.append('spec', sp);
    navigate(`/search?${params.toString()}`);
  };
}

export interface BlockRendererProps {
  block: UIBlock;
  /** Quick replies / chips send a chat message. */
  onSend?: (message: string) => void;
  disabled?: boolean;
}

/** Renders every `UIBlock` kind the assistant can emit (shared contract in @titl/shared). */
export function BlockRenderer({ block, onSend, disabled }: BlockRendererProps) {
  const applyDiscovery = useApplyDiscovery();
  const patchCtx = useContextStore((s) => s.patch);
  switch (block.kind) {
    case 'products':
      return (
        <section>
          {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
          <div className="flex flex-col gap-2">
            {block.items.slice(0, 6).map((p) => (
              <ProductCard key={p.id} product={p} layout="list" maxReasons={2} />
            ))}
          </div>
          {block.total && block.total > block.items.length ? (
            <ButtonLink to={paths.search(block.parsed?.raw)} variant="outline" fullWidth className="mt-2">
              همه {formatNumber(block.total)} نتیجه
            </ButtonLink>
          ) : null}
        </section>
      );
    case 'discovery':
      return <DiscoveryFlow data={block.data} onDone={applyDiscovery} />;
    case 'product': {
      const p = block.data;
      return (
        <Link to={paths.product(p.id)} className="press flex gap-3 rounded-2xl border border-line bg-surface p-3 shadow-card">
          <ProductImage src={p.image} alt="" group={p.categoryGroup} className="size-20 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-body font-bold text-ink">{p.title}</p>
            <p className="num mt-1 text-meta font-bold text-ink-2">{formatPriceRange(p.priceMin, p.priceMax)}</p>
            <p className="text-caption text-muted">{formatNumber(p.sellerCount)} فروشنده حضوری</p>
          </div>
        </Link>
      );
    }
    case 'stores':
      return (
        <section>
          <BlockTitle>فروشنده‌های «{block.data.product.title}»</BlockTitle>
          <StoreResults data={block.data} limit={block.limit ?? 3} />
        </section>
      );
    case 'compare_products':
      return (
        <CompareTable
          compact
          columns={block.data.products.map((p) => ({ id: p.id, title: p.title, image: p.image, group: p.categoryGroup, href: paths.product(p.id) }))}
          rows={block.data.rows}
          summary={block.data.summary}
          summarySource={block.data.summarySource}
        />
      );
    case 'compare_stores':
      return (
        <CompareTable
          compact
          columns={block.data.stores.map((s) => ({ id: s.shop.id, title: s.shop.name, href: paths.shop(s.shop.id) }))}
          rows={block.data.rows}
          summary={block.data.summary}
        />
      );
    case 'inquiries':
      return <InquiryList inquiries={block.items} compact limit={3} />;
    case 'plan': {
      // TODO(web-b): swap for components/plan/* when it lands.
      const plan = block.data;
      return (
        <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <BlockTitle>
            <span className="inline-flex items-center gap-1.5">
              <Route aria-hidden className="size-4 text-primary" /> برنامه بازدید · {formatNumber(plan.stops.length)} توقف · {formatMinutes(plan.totalMinutes)}
            </span>
          </BlockTitle>
          <ol className="space-y-2">
            {plan.stops.map((s) => (
              <li key={s.order} className="flex items-start gap-2">
                <span className="num grid size-6 shrink-0 place-items-center rounded-full bg-primary-strong text-caption font-bold text-white">{formatNumber(s.order)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-meta font-bold text-ink">{s.shop.name}</p>
                  <p className="num text-caption text-muted">
                    رسیدن {formatTimeOfDay(s.arriveAt)} · {s.openAtArrival.label}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <ButtonLink to={paths.plan} variant="primary" fullWidth className="mt-3">
            مشاهده و شروع مسیر
          </ButtonLink>
        </section>
      );
    }
    case 'alternatives':
      return <AlternativesPanel data={block.data} compact />;
    case 'areas':
      return (
        <section>
          <BlockTitle>{block.product ? `کجا «${block.product.title}» را حضوری بخرم؟` : 'محدوده‌های پیشنهادی'}</BlockTitle>
          <div className="flex flex-col gap-2">
            {block.items.slice(0, 4).map((a) => (
              <div key={a.area} className="rounded-2xl border border-line bg-surface p-3 shadow-card">
                <p className="flex items-center gap-1.5 text-body font-bold text-ink">
                  <MapPinned aria-hidden className="size-4 text-primary" />
                  {a.area}
                </p>
                <p className="num mt-0.5 text-meta text-ink-2">
                  {formatNumber(a.storeCount)} فروشنده · از {formatPriceRange(a.priceMin, a.priceMax)}
                  {a.distanceKm != null ? ` · ${formatDistance(a.distanceKm)}` : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5 text-caption text-muted">
                  {a.walkableCluster ? (
                    <span className="inline-flex items-center gap-1">
                      <Footprints aria-hidden className="size-3.5" /> فروشگاه‌ها پیاده به هم نزدیک‌اند
                    </span>
                  ) : null}
                  {a.nearestMetro ? <span>مترو {a.nearestMetro.name} · {formatNumber(a.nearestMetro.walkMin)} دقیقه پیاده</span> : null}
                  {a.inTrafficZone ? <span className="text-warn-ink">داخل طرح ترافیک</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      );
    case 'shop': {
      // TODO(web-b): swap for components/shop/* when it lands.
      const s = block.data;
      return (
        <section className="rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <Link to={paths.shop(s.id)} className="text-title font-bold text-ink hover:text-primary-strong">
            {s.name}
          </Link>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <OpenStatusBadge status={s.openStatus} size="sm" />
            {s.distanceKm != null ? <span className="num text-caption text-muted">{formatDistance(s.distanceKm)}</span> : null}
          </div>
          <InMallGuide location={s.location} variant="card" className="mt-2" onAsk={() => askStores([s], null, ['location'])} />
          <div className="mt-3 flex gap-2">
            <ButtonLink to={paths.shop(s.id)} variant="secondary" size="sm" className="flex-1">
              صفحه فروشگاه
            </ButtonLink>
            <Button variant="accent" size="sm" className="flex-1" onClick={() => askStores([s])}>
              بپرس
            </Button>
          </div>
        </section>
      );
    }
    case 'mall': {
      // TODO(web-b): swap for components/mall/* when it lands.
      const m = block.data;
      return (
        <Link to={paths.mall(m.mall.slug)} className="press flex items-center gap-3 rounded-2xl border border-line bg-surface p-3.5 shadow-card">
          <Building2 aria-hidden className="size-8 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-body font-bold text-ink">{m.mall.name}</span>
            <span className="num text-caption text-muted">
              {formatNumber(m.mall.shopCount)} فروشگاه · {formatNumber(m.floors.length)} طبقه{m.mall.area ? ` · ${m.mall.area}` : ''}
            </span>
          </span>
        </Link>
      );
    }
    case 'insights':
      return (
        <ul className="flex flex-col gap-1.5">
          {block.items.map((it, i) => {
            const n = NOTICE[it.tone];
            return (
              <li key={`${it.code}-${i}`} className={cn('flex flex-wrap items-start gap-2 rounded-xl border px-3 py-2 text-meta', n.cls)}>
                <n.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1 text-ink">{it.text}</span>
                {it.action?.href ? (
                  <Link to={it.action.href} className="hit-44 font-bold underline-offset-4 hover:underline">
                    {it.action.label}
                  </Link>
                ) : it.action?.contextPatch ? (
                  <button type="button" onClick={() => patchCtx(it.action!.contextPatch!)} className="hit-44 font-bold underline-offset-4 hover:underline">
                    {it.action.label}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      );
    case 'agent_plan':
      return (
        <section className="rounded-2xl border border-line bg-surface-2 p-3" aria-label={block.title ?? 'مراحل کار دستیار'}>
          {block.title ? <BlockTitle>{block.title}</BlockTitle> : null}
          <ol className="flex flex-col gap-1.5">
            {block.steps.map((st, i) => (
              <li key={i} className="flex items-center gap-2 text-meta">
                {st.status === 'done' ? (
                  <CircleCheck aria-hidden className="size-4 text-good" />
                ) : st.status === 'running' ? (
                  <Loader2 aria-hidden className="size-4 text-primary motion-safe:animate-spin" />
                ) : st.status === 'skipped' ? (
                  <MinusCircle aria-hidden className="size-4 text-faint" />
                ) : (
                  <Circle aria-hidden className="size-4 text-faint" />
                )}
                <span className={cn(st.status === 'done' ? 'text-ink' : st.status === 'running' ? 'font-bold text-ink' : 'text-muted', st.status === 'skipped' && 'line-through')}>
                  {st.label}
                </span>
              </li>
            ))}
          </ol>
        </section>
      );
    case 'need_stores': {
      // TODO(web-b): swap for the StoreCoverage (W4) component when it lands.
      const d = block.data;
      return (
        <section>
          <BlockTitle>
            {formatNumber(d.stores.length)} فروشگاه برای این خرید
          </BlockTitle>
          <div className="flex flex-col gap-2">
            {d.stores.slice(0, 4).map((r) => (
              <Link key={r.shop.id} to={paths.shop(r.shop.id)} className="press flex flex-col gap-1 rounded-2xl border border-line bg-surface p-3 shadow-card">
                <span className="flex items-center gap-2">
                  <Store aria-hidden className="size-4 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-body font-bold text-ink">{r.shop.name}</span>
                  {r.shop.distanceKm != null ? <span className="num text-caption text-muted">{formatDistance(r.shop.distanceKm)}</span> : null}
                </span>
                <span className="text-caption text-ink-2">
                  {r.availabilityLabel}
                  {r.matchCount ? ` · ${formatNumber(r.matchCount)} مدل` : ''}
                  {r.priceMin != null ? ` · ${formatPriceRange(r.priceMin, r.priceMax)}` : ''}
                </span>
                <OpenStatusBadge status={r.shop.openStatus} size="sm" className="w-fit" />
              </Link>
            ))}
          </div>
        </section>
      );
    }
    case 'quick_replies':
      return (
        <div className="flex flex-wrap gap-2" role="group" aria-label="پاسخ‌های پیشنهادی">
          {block.options.map((o) => (
            <Chip key={o.message} size="md" disabled={disabled} onClick={() => onSend?.(o.message)}>
              {o.label}
            </Chip>
          ))}
        </div>
      );
    case 'notice': {
      const n = NOTICE[block.tone];
      return (
        <p className={cn('flex gap-2 rounded-xl border px-3 py-2.5 text-meta', n.cls)}>
          <n.icon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="text-ink">{block.text}</span>
        </p>
      );
    }
    default:
      return null;
  }
}

