import { useState } from 'react';
import { ArrowRight, Check, SkipForward, Sparkles } from 'lucide-react';
import { formatNumber, type DiscoveryOption, type DiscoveryResponse, type SearchRequest, type UserContext } from '@titl/shared';
import { Button } from '../ui/Button.js';
import { cn } from '../../lib/cn.js';

export interface DiscoveryResult {
  search: Partial<SearchRequest> & { keywords?: string[] };
  context: Partial<UserContext>;
  /** Human labels of the picked answers («تا ۸ میلیون», «سایز ۴۳»…). */
  labels: string[];
}

export interface DiscoveryFlowProps {
  data: DiscoveryResponse;
  onDone: (result: DiscoveryResult) => void;
  className?: string;
}

function merge(opts: DiscoveryOption[]): DiscoveryResult {
  const search: DiscoveryResult['search'] = {};
  const context: Partial<UserContext> = {};
  const labels: string[] = [];
  for (const o of opts) {
    const { keywords, spec, ...rest } = o.patch;
    Object.assign(search, rest);
    if (keywords?.length) search.keywords = [...(search.keywords ?? []), ...keywords];
    if (spec?.length) search.spec = [...(search.spec ?? []), ...spec];
    Object.assign(context, o.contextPatch);
    labels.push(o.label);
  }
  return { search, context, labels };
}

/**
 * «کمکم کن انتخاب کنم» — one question at a time with option counts, a running counter («۸۶۵ مدل ← ۱۲۰ ← ۱۲»),
 * and [رد شدن] / [قبلی] always available. Multi-select questions get an explicit [ادامه].
 */
export function DiscoveryFlow({ data, onDone, className }: DiscoveryFlowProps) {
  const qs = data.questions;
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const q = qs[step];

  const picked = (upTo = qs.length) =>
    qs.slice(0, upTo).flatMap((qq) => (answers[qq.id] ?? []).map((id) => qq.options.find((o) => o.id === id)).filter((o): o is DiscoveryOption => !!o));

  const trail = [data.totalProducts, ...qs.slice(0, step).map((qq) => {
    const sel = (answers[qq.id] ?? []).map((id) => qq.options.find((o) => o.id === id)?.count ?? 0);
    return sel.length ? sel.reduce((a, b) => a + b, 0) : null;
  })].filter((n): n is number => n !== null);

  const next = (nextAnswers = answers) => {
    if (step + 1 >= qs.length) {
      const all = qs.flatMap((qq) => (nextAnswers[qq.id] ?? []).map((id) => qq.options.find((o) => o.id === id)).filter((o): o is DiscoveryOption => !!o));
      onDone(merge(all));
    } else setStep(step + 1);
  };

  if (!q) {
    return (
      <div className={cn('rounded-2xl border border-line bg-surface p-4', className)}>
        <p className="text-body text-ink-2">{data.intro}</p>
        <Button className="mt-3" onClick={() => onDone(merge(picked()))}>
          نمایش نتایج
        </Button>
      </div>
    );
  }

  const sel = answers[q.id] ?? [];
  return (
    <section className={cn('rounded-2xl border border-primary-200 bg-surface p-4 shadow-card', className)} aria-label="کمک به انتخاب">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-caption font-bold text-primary-strong">
          <Sparkles aria-hidden className="size-4" />
          سؤال {formatNumber(step + 1)} از {formatNumber(qs.length)}
        </span>
        <span className="num text-caption text-muted" aria-label="تعداد مدل‌های باقی‌مانده">
          {trail.map((n) => formatNumber(n)).join(' ← ')} مدل
        </span>
      </div>
      <div className="mb-1 h-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${((step + 1) / qs.length) * 100}%` }} />
      </div>
      <h3 className="mt-3 text-title font-bold text-heading">{q.title}</h3>
      {q.subtitle ? <p className="mt-0.5 text-meta text-muted">{q.subtitle}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={q.title}>
        {q.options.map((o) => {
          const on = sel.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                const nextSel = q.multi ? (on ? sel.filter((x) => x !== o.id) : [...sel, o.id]) : [o.id];
                const na = { ...answers, [q.id]: nextSel };
                setAnswers(na);
                if (!q.multi) next(na);
              }}
              className={cn(
                'press flex min-h-14 flex-col items-start justify-center rounded-xl border px-3 py-2 text-start transition-colors',
                on ? 'border-primary bg-primary-tint text-primary-ink' : 'border-line bg-surface text-ink hover:border-primary-200',
              )}
            >
              <span className="flex w-full items-center gap-1 text-meta font-bold">
                {on ? <Check aria-hidden className="size-4" /> : null}
                {o.label}
              </span>
              <span className="num text-caption text-muted">
                {o.hint ? `${o.hint} · ` : ''}
                {formatNumber(o.count)} مدل
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center gap-2">
        {step > 0 ? (
          <Button size="sm" variant="ghost" startIcon={ArrowRight} onClick={() => setStep(step - 1)}>
            قبلی
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          startIcon={SkipForward}
          onClick={() => {
            const na = { ...answers, [q.id]: [] };
            setAnswers(na);
            next(na);
          }}
        >
          رد شدن
        </Button>
        {q.multi ? (
          <Button size="sm" className="ms-auto" disabled={!sel.length} onClick={() => next()}>
            ادامه
          </Button>
        ) : null}
      </div>
    </section>
  );
}
