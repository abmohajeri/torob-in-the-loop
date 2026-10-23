import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Check, CreditCard, MapPin, Plus, Store, Wand2 } from 'lucide-react';
import { formatDistance, formatNumber, type ProductSummary } from '@titl/shared';
import { ProductImage } from './ProductImage.js';
import { FreshnessBadge } from '../data/FreshnessBadge.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { Skeleton } from '../ui/Skeleton.js';
import { productPriceLabel, sellerCountLabel } from '../../lib/labels.js';
import { paths } from '../../lib/paths.js';
import { COMPARE_TOAST, useCompare, useIsComparing } from '../../state/useCompare.js';
import { cn } from '../../lib/cn.js';

export interface ProductCardProps {
  product: ProductSummary;
  /** grid = 2-column tile (search results) · list = horizontal row (assistant blocks, similar products). */
  layout?: 'grid' | 'list';
  /** Show the «مقایسه» toggle (default true). */
  showCompare?: boolean;
  /** Max reason chips (default 2 in grid, 3 in list). */
  maxReasons?: number;
  /** Custom destination (default product page). */
  to?: string;
  /** Called before navigation (e.g. record recent product). */
  onOpen?: (product: ProductSummary) => void;
  /** Eager-load the image (first row). */
  priority?: boolean;
  className?: string;
}

/** Brand line with an «تشخیص خودکار» tag when the brand was inferred from the title. */
export function BrandLine({ brand, inferred, className }: { brand: string | null; inferred: boolean; className?: string }) {
  if (!brand) return null;
  return (
    <span className={cn('flex min-w-0 items-center gap-1 text-caption font-bold text-primary-strong', className)}>
      <span className="truncate">{brand}</span>
      {inferred ? (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-sunken px-1 py-px text-[0.6875rem] font-medium text-muted" title="برند از روی عنوان کالا تشخیص داده شده است">
          <Wand2 aria-hidden className="size-3" />
          تشخیص خودکار
        </span>
      ) : null}
    </span>
  );
}

/** Compare toggle (checkbox semantics) bound to the compare store, with a toast on add/remove/full. */
export function CompareToggle({ product, className, compact }: { product: Pick<ProductSummary, 'id' | 'title' | 'image'>; className?: string; compact?: boolean }) {
  const on = useIsComparing(product.id);
  const toggle = useCompare((s) => s.toggle);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={on ? 'حذف از مقایسه' : 'افزودن به مقایسه'}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const r = toggle({ id: product.id, title: product.title, image: product.image });
        if (r === 'full') toast.warning(COMPARE_TOAST.full);
      }}
      className={cn(
        'hit-44 inline-flex items-center gap-1 rounded-full border font-bold press focus-visible:outline-2 focus-visible:outline-primary',
        compact ? 'h-7 px-2 text-caption' : 'h-8 px-2.5 text-caption',
        on ? 'border-primary-strong bg-primary-strong text-white' : 'border-line bg-surface/95 text-ink-2 hover:border-primary-200 hover:text-primary-strong',
        className,
      )}
    >
      {on ? <Check aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
      مقایسه
    </button>
  );
}

function PriceBlock({ product, large }: { product: ProductSummary; large?: boolean }) {
  const price = productPriceLabel(product);
  return price.known ? (
    <p className={cn('num font-extrabold leading-snug text-ink', large ? 'text-title' : 'text-body')}>
      {!price.single ? <span className="me-1 text-caption font-medium text-muted">از</span> : null}
      {price.text}
    </p>
  ) : (
    <p className="text-meta font-bold text-muted">قیمت ثبت نشده</p>
  );
}

/**
 * Product tile: image · brand (+inferred tag) · 2-line title · registered price range · in-person seller count ·
 * nearest seller · freshness · installment availability · «why» chips · compare toggle.
 */
export function ProductCard({ product, layout = 'grid', showCompare = true, maxReasons, to, onOpen, priority, className }: ProductCardProps) {
  const href = to ?? paths.product(product.id);
  const meta = (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
      <span className={cn('inline-flex items-center gap-1', product.sellerCount > 0 ? 'font-bold text-ink-2' : '')}>
        <Store aria-hidden className="size-3.5 text-primary" />
        {sellerCountLabel(product.sellerCount)}
      </span>
      {product.nearest ? (
        <span className="inline-flex items-center gap-1">
          <MapPin aria-hidden className="size-3.5 text-primary" />
          <span className="num">نزدیک‌ترین {formatDistance(product.nearest.distanceKm)}</span>
        </span>
      ) : null}
    </div>
  );
  const extras = (
    <div className="flex flex-wrap items-center gap-1.5">
      {product.validPriceCount > 0 ? <FreshnessBadge freshness={product.freshness} size="sm" variant="short" /> : null}
      {product.installmentSellers > 0 ? (
        <span className="inline-flex h-5 items-center gap-1 rounded-full border border-accent-200 bg-accent-tint px-1.5 text-caption font-medium text-accent-ink">
          <CreditCard aria-hidden className="size-3" />
          قسطی در {formatNumber(product.installmentSellers)} فروشگاه
        </span>
      ) : null}
    </div>
  );

  if (layout === 'list') {
    return (
      <article className={cn('group relative flex gap-3 rounded-2xl border border-line/80 bg-surface p-2.5 shadow-card transition-[box-shadow,border-color] duration-200 hover:border-primary-200 hover:shadow-raised', className)}>
        <div className="w-24 shrink-0 self-start">
          <ProductImage src={product.image} alt="" group={product.categoryGroup} priority={priority} className="border border-line-soft" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <BrandLine brand={product.brand} inferred={product.brandInferred} />
          <h3 className="clamp-2 text-meta font-bold leading-6 text-ink">
            <Link to={href} onClick={() => onOpen?.(product)} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary">
              {product.title}
            </Link>
          </h3>
          <PriceBlock product={product} />
          {meta}
          {extras}
          <ReasonChips reasons={product.reasons} max={maxReasons ?? 3} size="sm" className="mt-0.5" />
        </div>
        {showCompare ? (
          <div className="absolute top-2 end-2 z-10">
            <CompareToggle product={product} compact />
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article className={cn('group relative flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-card transition-[box-shadow,border-color,transform] duration-200 ease-snappy hover:border-primary-200 hover:shadow-raised', className)}>
      <div className="relative border-b border-line-soft">
        <ProductImage src={product.image} alt="" group={product.categoryGroup} priority={priority} rounded="rounded-none" />
        {showCompare ? (
          <div className="absolute top-2 start-2 z-10">
            <CompareToggle product={product} compact />
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <BrandLine brand={product.brand} inferred={product.brandInferred} />
        <h3 className="clamp-2 min-h-12 text-meta font-bold leading-6 text-ink">
          <Link to={href} onClick={() => onOpen?.(product)} className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-primary">
            {product.title}
          </Link>
        </h3>
        <div className="mt-auto flex flex-col gap-1.5">
          <PriceBlock product={product} />
          {meta}
          {extras}
          <ReasonChips reasons={product.reasons} max={maxReasons ?? 2} size="sm" />
        </div>
      </div>
    </article>
  );
}

/** Loading placeholder matching ProductCard's geometry (no layout shift). */
export function ProductCardSkeleton({ layout = 'grid', className }: { layout?: 'grid' | 'list'; className?: string }) {
  if (layout === 'list') {
    return (
      <div aria-hidden className={cn('flex gap-3 rounded-2xl border border-line/80 bg-surface p-2.5 shadow-card', className)}>
        <Skeleton className="size-24 shrink-0" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton shape="line" className="h-3 w-16" />
          <Skeleton shape="line" className="w-11/12" />
          <Skeleton shape="line" className="w-7/12" />
          <Skeleton shape="line" className="mt-1 h-4 w-28" />
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden className={cn('flex flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-card', className)}>
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton shape="line" className="h-3 w-14" />
        <Skeleton shape="line" className="w-full" />
        <Skeleton shape="line" className="w-8/12" />
        <Skeleton shape="line" className="mt-2 h-4 w-24" />
        <Skeleton shape="line" className="h-3 w-20" />
      </div>
    </div>
  );
}

/** Responsive 2-column grid for ProductCards. */
export function ProductGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-2 gap-2.5', className)}>{children}</div>;
}
