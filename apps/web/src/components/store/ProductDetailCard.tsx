import { Link } from 'react-router';
import { ChevronLeft, Info, Store } from 'lucide-react';
import { FRESHNESS_META, formatJalaliDate, formatNumber, formatPriceRange, formatTomanShort, type Freshness, type ProductDetail, type ProductSummary } from '@titl/shared';
import { ProductImage } from '../product/ProductImage.js';
import { BrandLine } from '../product/ProductCard.js';
import { FreshnessBadge } from '../data/FreshnessBadge.js';
import { DataNote } from '../data/DataNote.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

/** «گوشی سامسونگ A07 | حافظه 64 رم 4» → name + variant chips. */
export function splitTitle(title: string): { name: string; variants: string[] } {
  const [name, ...rest] = title.split(/\s+\|\s+/);
  return { name: name ?? title, variants: rest.flatMap((r) => r.split(/\s+[-–،,]\s+/)).filter(Boolean) };
}

const BUCKETS: { key: Freshness; cls: string }[] = [
  { key: 'fresh', cls: 'bg-good' },
  { key: 'recent', cls: 'bg-info' },
  { key: 'stale', cls: 'bg-warn' },
  { key: 'very_stale', cls: 'bg-bad' },
  { key: 'unknown', cls: 'bg-faint' },
];

/** Stacked bar of registered-price ages (never color-only: legend with labels + counts). */
export function FreshnessBar({ buckets }: { buckets: Record<Freshness, number> }) {
  const total = BUCKETS.reduce((s, b) => s + (buckets[b.key] ?? 0), 0);
  if (!total) return null;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        {BUCKETS.map((b) => (buckets[b.key] ? <span key={b.key} className={b.cls} style={{ width: `${(buckets[b.key] / total) * 100}%` }} /> : null))}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption text-muted">
        {BUCKETS.filter((b) => buckets[b.key]).map((b) => (
          <li key={b.key} className="inline-flex items-center gap-1">
            <span aria-hidden className={cn('size-2 rounded-full', b.cls)} />
            {FRESHNESS_META[b.key].short} <span className="num">{formatNumber(buckets[b.key])}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface ProductDetailCardProps {
  /** Full detail; a ProductSummary always renders the compact row. */
  product: ProductDetail | ProductSummary;
  /** Chat preview: image + title + price range + «مشاهده کامل». */
  compact?: boolean;
  className?: string;
}

/** Product header: image · name + variant chips · brand (with source) · registered price panel (range, median, ages). */
export function ProductDetailCard({ product: p, compact, className }: ProductDetailCardProps) {
  const { name, variants } = splitTitle(p.title);
  if (compact || !('priceStats' in p))
    return (
      <Link to={paths.product(p.id)} className={cn('flex items-center gap-3 rounded-2xl border border-line/80 bg-surface p-3 shadow-card press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary', className)}>
        <ProductImage src={p.image} alt={p.title} group={p.categoryGroup} className="size-16 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-meta font-bold text-ink">{p.title}</p>
          <p className="num mt-0.5 text-meta font-extrabold text-heading">{formatPriceRange(p.priceMin, p.priceMax)}</p>
          <p className="text-caption text-muted">
            <Store aria-hidden className="me-1 inline size-3.5" />
            {formatNumber(p.sellerCount)} فروشنده حضوری
          </p>
        </div>
        <span className="inline-flex items-center text-caption font-bold text-primary-strong">
          مشاهده کامل
          <ChevronLeft aria-hidden className="size-4" />
        </span>
      </Link>
    );
  const s = p.priceStats;
  return (
    <section className={cn('flex flex-col gap-4', className)} aria-label="مشخصات کالا">
      <div className="overflow-hidden rounded-3xl border border-line/80 bg-surface shadow-card">
        <div className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none">
          {(p.images.length ? p.images : [p.image]).slice(0, 5).map((src, i) => (
            <ProductImage key={i} src={src} alt={i === 0 ? p.title : `${p.title} — تصویر ${formatNumber(i + 1)}`} group={p.categoryGroup} priority={i === 0} rounded="rounded-none" className="aspect-[4/3] w-full shrink-0 snap-center" />
          ))}
        </div>
      </div>
      <div>
        <BrandLine brand={p.brand} inferred={p.brandInferred} />
        <h2 className="mt-1 text-headline font-extrabold leading-8 text-heading">
          <bdi>{name}</bdi>
        </h2>
        {variants.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="مدل">
            {variants.map((v) => (
              <li key={v} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-caption font-medium text-ink-2">
                <bdi>{v}</bdi>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="mt-1.5 text-caption text-muted">{p.category}</p>
      </div>
      <div className="rounded-2xl border border-line/80 bg-surface p-4 shadow-card">
        <p className="text-caption font-medium text-muted">بازه قیمت ثبت‌شده فروشندگان حضوری</p>
        <p className="num mt-1 text-headline font-extrabold leading-tight text-heading">{formatPriceRange(s.min, s.max)}</p>
        {s.median !== null ? (
          <p className="mt-1 text-meta text-ink-2">
            قیمت میانه: <span className="num font-bold">{formatTomanShort(s.median)}</span>
            {s.newest ? <span className="text-muted"> · جدیدترین ثبت {formatJalaliDate(s.newest, false)}</span> : null}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FreshnessBadge freshness={p.freshness} changedAt={p.lastPriceChange} size="sm" explain />
          <span className="num text-caption text-muted">
            {formatNumber(s.validCount)} قیمت معتبر{s.missingCount ? ` · ${formatNumber(s.missingCount)} بدون قیمت` : ''}
            {s.suspiciousCount ? ` · ${formatNumber(s.suspiciousCount)} غیرعادی کنار گذاشته شد` : ''}
          </span>
        </div>
        <div className="mt-3">
          <FreshnessBar buckets={s.freshnessBuckets} />
        </div>
        <DataNote className="mt-3" icon={Info}>
          قیمت‌ها اعلام فروشنده در ترب است، نه قیمت امروز؛ موجودی را از فروشگاه می‌پرسیم.
        </DataNote>
      </div>
      {p.notes.length ? (
        <ul className="flex flex-col gap-1">
          {p.notes.map((n) => (
            <li key={n}>
              <DataNote>{n}</DataNote>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
