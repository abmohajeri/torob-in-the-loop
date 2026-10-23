import { useState } from 'react';
import { Link } from 'react-router';
import { Crown, Sparkles, X } from 'lucide-react';
import type { CompareRow, Reason } from '@titl/shared';
import { ProductImage } from '../product/ProductImage.js';
import { ReasonChips } from '../data/ReasonChips.js';
import { Switch } from '../ui/Switch.js';
import { cn } from '../../lib/cn.js';

export interface CompareColumn {
  id: string;
  title: string;
  image?: string | null;
  group?: string;
  href?: string;
  reasons?: Reason[];
  onRemove?: () => void;
}

export interface CompareTableProps {
  columns: CompareColumn[];
  rows: CompareRow[];
  summary?: string | null;
  summarySource?: 'llm' | 'rules';
  /** Hide the «فقط تفاوت‌ها» toggle (compact assistant block). */
  compact?: boolean;
  className?: string;
}

/**
 * Side-by-side comparison: sticky first column (row labels), one column per item, best value marked with an icon +
 * text (never color alone), «فقط تفاوت‌ها» toggle. Scrolls horizontally inside its own container only.
 */
export function CompareTable({ columns, rows, summary, summarySource, compact, className }: CompareTableProps) {
  const [diffOnly, setDiffOnly] = useState(false);
  const shown = diffOnly ? rows.filter((r) => r.differs) : rows;
  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {summary ? (
        <div className="rounded-2xl border border-primary-200 bg-primary-tint/60 p-3.5">
          <p className="mb-1 flex items-center gap-1.5 text-caption font-bold text-primary-ink">
            <Sparkles aria-hidden className="size-4" />
            {summarySource === 'llm' ? 'جمع‌بندی دستیار' : 'جمع‌بندی'}
          </p>
          <p className="text-body leading-7 text-ink">{summary}</p>
        </div>
      ) : null}
      {!compact ? (
        <div className="flex items-center justify-between gap-3">
          <span id="diff-only-label" className="text-meta font-medium text-ink">فقط تفاوت‌ها را نشان بده</span>
          <Switch checked={diffOnly} onCheckedChange={setDiffOnly} labelledBy="diff-only-label" />
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
        <table className="w-full min-w-max border-collapse text-meta">
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 w-28 bg-surface-2 p-2 text-start text-caption font-medium text-muted">
                <span className="sr-only">ویژگی</span>
              </th>
              {columns.map((c) => (
                <th key={c.id} scope="col" className="w-40 max-w-44 border-s border-line-soft p-2 align-top font-normal">
                  <div className="flex flex-col gap-1.5">
                    {c.image !== undefined ? <ProductImage src={c.image ?? null} alt="" group={c.group} className="mx-auto aspect-square w-20" /> : null}
                    <div className="flex items-start gap-1">
                      {c.href ? (
                        <Link to={c.href} className="line-clamp-3 flex-1 text-start text-meta font-bold text-ink hover:text-primary-strong">
                          {c.title}
                        </Link>
                      ) : (
                        <span className="line-clamp-3 flex-1 text-start text-meta font-bold text-ink">{c.title}</span>
                      )}
                      {c.onRemove ? (
                        <button type="button" onClick={c.onRemove} aria-label={`حذف ${c.title} از مقایسه`} className="hit-44 grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken">
                          <X aria-hidden className="size-4" />
                        </button>
                      ) : null}
                    </div>
                    {c.reasons?.length ? <ReasonChips reasons={c.reasons} max={2} size="sm" /> : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key} className="border-t border-line-soft">
                <th scope="row" className="sticky start-0 z-10 bg-surface-2 p-2 text-start text-caption font-medium text-ink-2">
                  {r.key}
                </th>
                {columns.map((c, i) => {
                  const v = r.values[i];
                  const best = r.bestIndex === i;
                  return (
                    <td key={c.id} className={cn('border-s border-line-soft p-2 align-top text-ink', best && 'bg-good-tint')}>
                      {v == null ? (
                        <span className="text-muted">ثبت نشده</span>
                      ) : (
                        <span className={cn('num', best && 'font-bold text-good-ink')}>{v}</span>
                      )}
                      {best ? (
                        <span className="mt-0.5 flex items-center gap-0.5 text-caption font-medium text-good-ink">
                          <Crown aria-hidden className="size-3" />
                          بهترین
                        </span>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!shown.length ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-4 text-center text-muted">
                  تفاوتی بین این موارد ثبت نشده.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
