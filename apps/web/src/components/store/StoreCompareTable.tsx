import { useState } from 'react';
import { Link } from 'react-router';
import { Award, BadgeDollarSign, Clock, MapPin, Sparkles } from 'lucide-react';
import { formatDistance, formatNumber, formatTomanShort, type CompareStoresResponse, type StoreOffer } from '@titl/shared';
import { Switch } from '../ui/Switch.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

const UNKNOWN_RE = /^(نامشخص|ثبت نشده|استعلام نشده|—|-)$/;

function winners(stores: StoreOffer[]) {
  const out: { icon: typeof Award; label: string; name: string; detail?: string }[] = [];
  const priced = stores.filter((s) => s.price.price !== null);
  if (priced.length) {
    const c = [...priced].sort((a, b) => a.price.price! - b.price.price!)[0]!;
    out.push({ icon: BadgeDollarSign, label: 'ارزان‌ترین', name: c.shop.name, detail: formatTomanShort(c.price.price) });
  }
  const near = stores.filter((s) => s.shop.distanceKm !== null);
  if (near.length) {
    const n = [...near].sort((a, b) => a.shop.distanceKm! - b.shop.distanceKm!)[0]!;
    out.push({ icon: MapPin, label: 'نزدیک‌ترین', name: n.shop.name, detail: formatDistance(n.shop.distanceKm) });
  }
  const late = stores.filter((s) => s.shop.openStatus.closesAt);
  if (late.length > 1) {
    const l = [...late].sort((a, b) => (a.shop.openStatus.closesAt! < b.shop.openStatus.closesAt! ? 1 : -1))[0]!;
    out.push({ icon: Clock, label: 'دیرتر باز', name: l.shop.name, detail: `تا ${l.shop.openStatus.closesAt}` });
  }
  const top = [...stores].sort((a, b) => b.score - a.score)[0];
  if (top) out.push({ icon: Sparkles, label: 'امتیاز هوشمند', name: top.shop.name });
  return out;
}

export interface StoreCompareTableProps {
  data: CompareStoresResponse;
  /** Chat preview: winners strip + summary only. */
  compact?: boolean;
  className?: string;
}

/** Store comparison: summary → winners strip → side-by-side table (best value per row highlighted, «فقط تفاوت‌ها»). */
export function StoreCompareTable({ data, compact, className }: StoreCompareTableProps) {
  const [diffOnly, setDiffOnly] = useState(true);
  const rows = diffOnly ? data.rows.filter((r) => r.differs) : data.rows;
  const w = winners(data.stores);
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {data.summary ? (
        <p className="flex items-start gap-2 rounded-2xl border border-primary-200 bg-primary-tint p-3.5 text-body leading-7 text-primary-ink">
          <Award aria-hidden className="mt-1 size-5 shrink-0 text-primary-strong" />
          {data.summary}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-2" aria-label="برنده‌ها">
        {w.map((x) => (
          <li key={x.label} className="rounded-xl border border-line/80 bg-surface p-2.5 shadow-card">
            <span className="flex items-center gap-1 text-caption font-medium text-muted">
              <x.icon aria-hidden className="size-3.5 text-primary" />
              {x.label}
            </span>
            <span className="mt-0.5 block truncate text-meta font-bold text-ink">{x.name}</span>
            {x.detail ? <span className="num block text-caption text-ink-2">{x.detail}</span> : null}
          </li>
        ))}
      </ul>
      {compact ? null : (
        <>
          <div className="flex items-center justify-between gap-3">
            <span id="diff-only" className="text-meta font-medium text-ink-2">
              فقط تفاوت‌ها
            </span>
            <Switch checked={diffOnly} onCheckedChange={setDiffOnly} labelledBy="diff-only" />
          </div>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[22rem] border-separate border-spacing-0 overflow-hidden rounded-2xl border border-line/80 bg-surface text-meta shadow-card">
              <caption className="sr-only">مقایسه فروشگاه‌ها</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky start-0 z-10 w-28 bg-surface-2 p-2.5 text-start font-medium text-muted">
                    ویژگی
                  </th>
                  {data.stores.map((s) => (
                    <th key={s.shop.id} scope="col" className="min-w-32 bg-surface-2 p-2.5 text-start align-top">
                      <Link to={paths.shop(s.shop.id)} className="font-extrabold text-ink hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary">
                        {s.shop.name}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, ri) => (
                  <tr key={r.key} className={ri % 2 ? 'bg-surface-2/50' : ''}>
                    <th scope="row" className={cn('sticky start-0 z-10 border-t border-line-soft p-2.5 text-start align-top font-medium text-muted', ri % 2 ? 'bg-surface-2' : 'bg-surface')}>
                      {r.key}
                    </th>
                    {r.values.map((v, i) => {
                      const best = r.bestIndex === i;
                      const unknown = v === null || UNKNOWN_RE.test(v.trim());
                      return (
                        <td key={i} className={cn('border-t border-line-soft p-2.5 align-top leading-6', best && 'bg-primary-tint font-bold text-primary-ink', unknown && 'text-muted')}>
                          {best ? <Award aria-label="بهترین" className="me-1 inline size-3.5 align-[-2px] text-primary-strong" /> : null}
                          {v ?? 'نامشخص'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {diffOnly && rows.length < data.rows.length ? <p className="text-caption text-muted">{formatNumber(data.rows.length - rows.length)} ردیف یکسان پنهان است.</p> : null}
        </>
      )}
    </div>
  );
}
