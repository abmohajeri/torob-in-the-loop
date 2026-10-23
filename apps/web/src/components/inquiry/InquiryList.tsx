import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Award, CirclePlus, Package } from 'lucide-react';
import { formatClockish } from '../../lib/labels.js';
import { formatNumber, formatTomanShort, type Inquiry } from '@titl/shared';
import { Button, ButtonLink } from '../ui/Button.js';
import { paths } from '../../lib/paths.js';
import { PLAN_TOAST, usePlan } from '../../state/usePlan.js';
import { cn } from '../../lib/cn.js';
import { InquiryCard } from './InquiryCard.js';
import { isFinal, statusMeta } from './meta.js';

export interface InquiryBatch {
  id: string;
  title: string;
  items: Inquiry[];
  createdAt: string;
}

/** Group inquiries by batch (newest batch first; singles become their own group). */
export function groupInquiries(list: Inquiry[]): InquiryBatch[] {
  const map = new Map<string, InquiryBatch>();
  for (const i of list) {
    const id = i.batchId ?? i.id;
    let b = map.get(id);
    if (!b) {
      b = { id, title: i.product?.title ?? 'پرسش از فروشگاه', items: [], createdAt: i.createdAt };
      map.set(id, b);
    }
    b.items.push(i);
    if (i.createdAt > b.createdAt) b.createdAt = i.createdAt;
  }
  return [...map.values()].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** «۳ فروشگاه · ۲ پاسخ داده‌اند» */
export function batchLine(items: Inquiry[]): string {
  const answered = items.filter((i) => i.result).length;
  const live = items.filter((i) => !isFinal(i) && !i.result).length;
  const parts = [`${formatNumber(items.length)} فروشگاه`];
  if (answered) parts.push(`${formatNumber(answered)} پاسخ داده‌اند`);
  if (live) parts.push(`${formatNumber(live)} در جریان`);
  return parts.join(' · ');
}

/** Best confirmed option in a batch: in stock, lowest confirmed price. */
export function bestOf(items: Inquiry[]): Inquiry | null {
  const ok = items.filter((i) => i.result && (i.result.stock === 'in_stock' || i.result.stock === 'limited'));
  if (!ok.length) return null;
  return ok.sort((a, b) => (a.result!.price ?? Infinity) - (b.result!.price ?? Infinity))[0]!;
}

/** «بهترین گزینه الان: …» — shown once ≥2 calls in a batch have resolved. */
export function BatchSummary({ items, className }: { items: Inquiry[]; className?: string }) {
  const navigate = useNavigate();
  const addStop = usePlan((s) => s.addStop);
  const resolved = items.filter((i) => isFinal(i) || i.result).length;
  const best = bestOf(items);
  if (resolved < 2 || !best) return null;
  const r = best.result!;
  const failed = items.filter((i) => statusMeta(i.status).phase === 'failed' || i.result?.stock === 'out_of_stock');
  return (
    <div className={cn('rounded-2xl border border-primary-200 bg-primary-tint p-3.5', className)} role="status">
      <p className="flex items-start gap-2 text-body leading-7 text-primary-ink">
        <Award aria-hidden className="mt-1 size-5 shrink-0 text-primary-strong" />
        <span>
          <b>بهترین گزینه الان: {best.shop.name}</b> — {r.stock === 'limited' ? 'موجودی محدود' : 'موجود'}
          {r.price !== null ? `، ${formatTomanShort(r.price)}` : ''}
          {r.holdUntil ? `، تا ${formatClockish(r.holdUntil)} نگه می‌دارند` : ''}
        </span>
      </p>
      {failed.length ? <p className="mt-1 ps-7 text-meta text-ink-2">{failed.map((f) => f.shop.name).join('، ')} پاسخ مثبت نداد؛ از دکمه «جایگزین‌ها» گزینه‌های نزدیک را ببینید.</p> : null}
      <div className="mt-2.5 flex gap-2 ps-7">
        <Button
          size="sm"
          startIcon={CirclePlus}
          onClick={() => {
            const res = addStop({ shopId: best.shop.id, productId: best.product?.id, shopName: best.shop.name, productTitle: best.product?.title ?? null, mallName: best.shop.location.mall?.name ?? null });
            if (res === 'added') toast.success(PLAN_TOAST.added, { action: { label: 'مشاهده برنامه', onClick: () => navigate(paths.plan) } });
            else toast.warning(PLAN_TOAST[res]);
          }}
        >
          افزودن به برنامه بازدید
        </Button>
      </div>
    </div>
  );
}

export interface InquiryListProps {
  inquiries: Inquiry[];
  /** Chat preview: compact cards, at most `limit` rows + «دیدن همه». */
  compact?: boolean;
  limit?: number;
  groupByBatch?: boolean;
  /** Batch id to emphasise (from `?batch=`). */
  highlightBatch?: string | null;
  className?: string;
}

/** Inquiry board: batches («گوشی A07 · ۳ فروشگاه · ۲ پاسخ داده‌اند») of live call cards. */
export function InquiryList({ inquiries, compact, limit, groupByBatch = true, highlightBatch, className }: InquiryListProps) {
  if (compact || !groupByBatch) {
    const rows = limit ? inquiries.slice(0, limit) : inquiries;
    return (
      <div className={cn('flex flex-col gap-2.5', className)}>
        {rows.map((i) => (
          <InquiryCard key={i.id} inquiry={i} compact={compact} />
        ))}
        {limit && inquiries.length > limit ? (
          <ButtonLink to={paths.inquiries} variant="link" size="sm" className="self-start">
            دیدن همه {formatNumber(inquiries.length)} پیگیری
          </ButtonLink>
        ) : null}
      </div>
    );
  }
  const batches = groupInquiries(inquiries);
  return (
    <div className={cn('flex flex-col gap-6', className)}>
      {batches.map((b) => (
        <section key={b.id} aria-label={b.title} className={cn('flex flex-col gap-2.5', highlightBatch === b.id && 'rounded-3xl bg-accent-tint/50 p-2 -mx-2 ring-1 ring-accent-100')}>
          <header className="flex items-start gap-2 px-1">
            <Package aria-hidden className="mt-1 size-[1.125rem] shrink-0 text-primary" />
            <div className="min-w-0">
              <h2 className="line-clamp-1 text-body font-extrabold text-heading">{b.title}</h2>
              <p className="text-meta text-muted">{batchLine(b.items)}</p>
            </div>
          </header>
          <BatchSummary items={b.items} />
          {b.items.map((i) => (
            <InquiryCard key={i.id} inquiry={i} hideProduct={!!i.product} />
          ))}
        </section>
      ))}
    </div>
  );
}
