import { Link, useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronLeft, CirclePlus, PhoneCall, Repeat, Shuffle } from 'lucide-react';
import type { Inquiry } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { api, errorMessage, request } from '../../lib/api.js';
import { qk } from '../../lib/queryKeys.js';
import { paths } from '../../lib/paths.js';
import { PLAN_TOAST, useIsInPlan, usePlan } from '../../state/usePlan.js';
import { openAlternatives } from '../../state/alt.js';
import { cn } from '../../lib/cn.js';
import { statusMeta } from './meta.js';
import { Countdown, SimulatedPill } from './parts.js';
import { ResultChips } from './InquiryResultView.js';

export interface InquiryCardProps {
  inquiry: Inquiry;
  /** Chat/preview variant: no actions row, single line of state. */
  compact?: boolean;
  /** Hide the product line (e.g. inside a batch that already names the product). */
  hideProduct?: boolean;
  className?: string;
}

/** Latest transcript line (streaming preview on the board). */
function lastLine(i: Inquiry) {
  for (let k = i.events.length - 1; k >= 0; k--) {
    const e = i.events[k]!;
    if (e.type === 'line' && e.text.trim()) return e;
  }
  return null;
}

/** Hook: «همین حالا دوباره» (retry now) with cache update. */
export function useRetryInquiry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        return await request<Inquiry>('POST', `/inquiries/${encodeURIComponent(id)}/call-now`, { body: {} });
      } catch {
        return api.retryInquiry(id);
      }
    },
    onSuccess: (inq) => {
      if (inq) qc.setQueryData(qk.inquiry(inq.id), inq);
      void qc.invalidateQueries({ queryKey: qk.inquiriesAll() });
      toast.success('تماس دوباره شروع شد.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** One call on the live board: avatar + shop + state → streaming line → result chips → next step. */
export function InquiryCard({ inquiry: i, compact, hideProduct, className }: InquiryCardProps) {
  const navigate = useNavigate();
  const meta = statusMeta(i.status);
  const line = meta.phase === 'live' ? lastLine(i) : null;
  const retry = useRetryInquiry();
  const productId = i.product?.id;
  const inPlan = useIsInPlan(i.shop.id, productId);
  const addStop = usePlan((s) => s.addStop);
  const ringing = i.status === 'calling' || i.status === 'in_call';
  const Icon = meta.icon;
  const r = i.result;
  const failed = meta.phase === 'failed' || r?.stock === 'out_of_stock';

  const addToPlan = () => {
    const res = addStop({ shopId: i.shop.id, productId, shopName: i.shop.name, productTitle: i.product?.title ?? null, mallName: i.shop.location.mall?.name ?? null });
    if (res === 'added') toast.success(PLAN_TOAST.added, { action: { label: 'مشاهده برنامه', onClick: () => navigate(paths.plan) } });
    else toast.warning(PLAN_TOAST[res]);
  };

  return (
    <article className={cn('relative rounded-2xl border bg-surface p-3.5 shadow-card', ringing ? 'border-accent-200' : 'border-line/80', className)}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn('relative grid size-11 shrink-0 place-items-center rounded-full', ringing ? 'bg-accent-tint text-accent-strong' : meta.phase === 'done' ? 'bg-primary-tint text-primary-strong' : 'bg-sunken text-ink-2')}>
          {ringing ? <span className="absolute inset-0 rounded-full ring-2 ring-accent/50 motion-safe:animate-ping [animation-duration:1.5s]" /> : null}
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-extrabold text-ink">
            <Link to={paths.inquiry(i.id)} className="rounded after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-2 focus-visible:outline-primary">
              {i.shop.name}
            </Link>
          </h3>
          {!hideProduct && i.product ? <p className="truncate text-caption text-muted">{i.product.title}</p> : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={meta.tone} icon={meta.icon} size="sm">
              {meta.label}
            </Badge>
            {i.attempts > 1 ? <span className="num text-caption text-muted">تلاش {i.attempts} از {i.maxAttempts}</span> : null}
          </div>
        </div>
        <ChevronLeft aria-hidden className="mt-3 size-5 shrink-0 text-faint" />
      </div>

      {line ? (
        <p className="mt-2.5 line-clamp-2 rounded-xl bg-surface-2 px-3 py-2 text-meta leading-6 text-ink-2">
          <span className="font-bold text-ink">{line.speaker === 'store' ? 'فروشنده: ' : 'دستیار: '}</span>
          {line.text}
        </p>
      ) : null}

      {r ? (
        <div className="mt-2.5">
          <ResultChips result={r} />
          {!compact && r.summary ? <p className="mt-1.5 line-clamp-2 text-meta text-muted">{r.summary}</p> : null}
        </div>
      ) : null}

      {i.statusNote && !r ? <p className="mt-2 text-meta leading-6 text-ink-2">{i.statusNote}</p> : null}
      {!r && !i.statusNote && meta.phase === 'waiting' && i.nextAttemptAt ? (
        <p className="mt-2.5 text-meta text-ink-2">
          {i.status === 'scheduled_at_open' ? 'الان بسته است · تماس خودکار ساعت ' : i.status === 'callback_promised' ? 'اگر خبری نشد، دوباره تماس می‌گیرم: ' : 'تماس دوباره '}
          <Countdown at={i.nextAttemptAt} className="font-bold text-ink" />
        </p>
      ) : null}

      {!compact ? (
        <div className="relative z-10 mt-3 flex flex-wrap items-center gap-2">
          {i.simulated ? <SimulatedPill className="me-auto" /> : <span className="me-auto" />}
          {meta.phase === 'waiting' ? (
            <Button size="sm" variant="accent" startIcon={PhoneCall} loading={retry.isPending} onClick={() => retry.mutate(i.id)}>
              همین حالا دوباره
            </Button>
          ) : null}
          {failed && productId ? (
            <Button size="sm" variant="outline" startIcon={Shuffle} onClick={() => openAlternatives({ reason: r?.stock === 'out_of_stock' ? 'out_of_stock' : 'unreachable', productId, productTitle: i.product?.title, shopId: i.shop.id, shopName: i.shop.name })}>
              جایگزین‌ها
            </Button>
          ) : null}
          {meta.phase === 'failed' && i.status !== 'cancelled' ? (
            <Button size="sm" variant="secondary" startIcon={Repeat} loading={retry.isPending} onClick={() => retry.mutate(i.id)}>
              دوباره بپرس
            </Button>
          ) : null}
          {r && r.stock !== 'out_of_stock' ? (
            <Button size="sm" variant={inPlan ? 'soft' : 'primary'} startIcon={inPlan ? Check : CirclePlus} onClick={inPlan ? () => navigate(paths.plan) : addToPlan}>
              {inPlan ? 'در برنامه' : 'به برنامه'}
            </Button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
