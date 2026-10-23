import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CirclePlus, PhoneCall, PhoneOff, Repeat, Shuffle } from 'lucide-react';
import { formatJalaliDate, formatNumber, formatTimeOfDay, formatToman, type Inquiry } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { StickyCTA } from '../components/layout/StickyCTA.js';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { FreshnessBadge } from '../components/data/FreshnessBadge.js';
import { CallTranscript } from '../components/inquiry/CallTranscript.js';
import { InquiryResultView } from '../components/inquiry/InquiryResultView.js';
import { useRetryInquiry } from '../components/inquiry/InquiryCard.js';
import { Countdown, SimulatedPill } from '../components/inquiry/parts.js';
import { PRIVACY_LINE, isFinal, questionMeta, statusMeta } from '../components/inquiry/meta.js';
import { AlternativesPanel } from '../components/alternatives/AlternativesPanel.js';
import { api, errorMessage } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { PLAN_TOAST, useIsInPlan, usePlan } from '../state/usePlan.js';
import { useUi } from '../state/useUi.js';
import { openAlternatives } from '../state/alt.js';
import { cn } from '../lib/cn.js';

function CallHeader({ i }: { i: Inquiry }) {
  const m = statusMeta(i.status);
  const ringing = i.status === 'calling' || i.status === 'in_call' || i.status === 'queued';
  return (
    <section className="flex flex-col items-center gap-2 rounded-3xl border border-line/80 bg-surface px-4 py-5 text-center shadow-card">
      <span aria-hidden className={cn('relative grid size-16 place-items-center rounded-full', ringing ? 'bg-accent-tint text-accent-strong' : m.phase === 'done' ? 'bg-primary-tint text-primary-strong' : 'bg-sunken text-ink-2')}>
        {ringing ? <span className="absolute inset-0 rounded-full ring-2 ring-accent/50 motion-safe:animate-ping [animation-duration:1.5s]" /> : null}
        <m.icon className="size-7" />
      </span>
      <Link to={paths.shop(i.shop.id)} className="text-title font-extrabold text-heading hover:text-primary-strong">
        {i.shop.name}
      </Link>
      {i.product ? <p className="line-clamp-2 text-meta text-muted">{i.product.title}</p> : null}
      {/* ONE atomic live region for the call state */}
      <p role="status" aria-live="polite" aria-atomic className="sr-only">
        تماس با {i.shop.name} — {m.label}
      </p>
      <Badge tone={m.tone} icon={m.icon} size="lg">
        {m.label}
      </Badge>
      <p className="num text-caption text-muted">
        تلاش {formatNumber(Math.max(1, i.attempts))} از {formatNumber(i.maxAttempts)} · شروع {formatTimeOfDay(i.createdAt)}
      </p>
      {i.nextAttemptAt && m.phase === 'waiting' ? (
        <p className="text-meta text-ink-2">
          {i.status === 'scheduled_at_open' ? 'فروشگاه الان بسته است؛ تماس خودکار ساعت ' : 'تماس دوباره '}
          <Countdown at={i.nextAttemptAt} className="font-bold text-ink" />
        </p>
      ) : null}
      {i.statusNote ? <p className="text-meta leading-6 text-ink-2">{i.statusNote}</p> : null}
      {i.simulated ? <SimulatedPill /> : null}
    </section>
  );
}

export default function InquiryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const live = useUi((s) => s.live);
  const q = useQuery({
    queryKey: qk.inquiry(id),
    queryFn: ({ signal }) => api.inquiry(id, signal),
    enabled: !!id,
    retry: false,
    refetchInterval: (query) => (live !== 'open' && query.state.data && !isFinal(query.state.data) ? 2500 : false),
  });
  const i = q.data;
  useDocumentTitle(i ? `استعلام از ${i.shop.name}` : 'استعلام');
  const retry = useRetryInquiry();
  const cancel = useMutation({
    mutationFn: () => api.cancelInquiry(id),
    onSuccess: (inq) => {
      if (inq) qc.setQueryData(qk.inquiry(id), inq);
      void qc.invalidateQueries({ queryKey: qk.inquiriesAll() });
      toast('استعلام لغو شد.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const inPlan = useIsInPlan(i?.shop.id ?? '', i?.product?.id);
  const addStop = usePlan((s) => s.addStop);

  if (q.isPending)
    return (
      <>
        <PageHeader title="استعلام" backTo={paths.inquiries} />
        <div className="flex flex-col gap-4 px-4 pt-2">
          <Skeleton className="h-52 w-full rounded-3xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      </>
    );
  if (q.isError || !i)
    return (
      <>
        <PageHeader title="استعلام" backTo={paths.inquiries} />
        <div className="px-4 pt-8">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        </div>
      </>
    );

  const m = statusMeta(i.status);
  const liveCall = m.phase === 'live';
  const r = i.result;
  const failed = m.phase === 'failed' || r?.stock === 'out_of_stock';
  const reg = i.registeredPrice;

  return (
    <>
      <PageHeader title="استعلام از فروشگاه" subtitle={i.shop.name} backTo={paths.inquiries} />
      <div className="flex flex-col gap-4 px-4 pt-2">
        <CallHeader i={i} />
        <section aria-label="سؤال‌ها" className="flex flex-col gap-2">
          <p className="text-meta font-bold text-ink">سؤال‌های شما</p>
          <ul className="flex flex-wrap gap-1.5">
            {i.questions.map((qq) => {
              const qm = questionMeta(qq);
              return (
                <li key={qq} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken px-2.5 text-caption font-medium text-ink-2">
                  <qm.icon aria-hidden className="size-3.5 text-primary" />
                  {qq === 'custom' && i.customQuestion ? i.customQuestion : qm.label}
                </li>
              );
            })}
          </ul>
          {reg ? (
            <div className="flex flex-wrap items-center gap-2 text-meta text-ink-2">
              قیمت ثبت‌شده هنگام پرسش: <b className="num text-ink">{reg.price !== null ? formatToman(reg.price) : 'ثبت نشده'}</b>
              <FreshnessBadge freshness={reg.freshness} changedAt={reg.changedAt} size="sm" />
            </div>
          ) : null}
          <p className="text-caption text-muted">{PRIVACY_LINE}</p>
        </section>

        {r ? <InquiryResultView inquiry={i} /> : null}

        <section aria-labelledby="transcript" className="flex flex-col gap-3 rounded-2xl border border-line/80 bg-surface-2 p-3.5">
          <h2 id="transcript" className="flex items-center gap-2 text-body font-extrabold text-heading">
            <PhoneCall aria-hidden className="size-[1.125rem] text-primary" />
            متن گفتگو
          </h2>
          {i.events.length ? (
            <CallTranscript events={i.events} live={liveCall} follow />
          ) : (
            <p className="text-meta text-muted">{liveCall ? 'در حال برقراری تماس…' : 'هنوز گفتگویی ثبت نشده است.'}</p>
          )}
          <p className="text-caption text-muted">
            {formatJalaliDate(i.createdAt)} · {i.channel === 'seller_inbox' ? 'صندوق فروشنده' : i.channel === 'bale' ? 'بله' : 'تماس شبیه‌سازی‌شده'}
          </p>
        </section>

        {i.alternatives ? (
          <section aria-label="جایگزین‌ها" className="flex flex-col gap-3">
            <AlternativesPanel data={i.alternatives} productId={i.product?.id} productTitle={i.product?.title} />
          </section>
        ) : null}
      </div>

      {m.phase !== 'done' || (r && r.stock !== 'out_of_stock') || (failed && i.product && !i.alternatives) ? (
      <StickyCTA>
        {m.phase === 'waiting' ? (
          <Button variant="accent" startIcon={PhoneCall} loading={retry.isPending} onClick={() => retry.mutate(i.id)}>
            همین حالا دوباره
          </Button>
        ) : null}
        {liveCall || m.phase === 'waiting' ? (
          <Button variant="secondary" startIcon={PhoneOff} loading={cancel.isPending} onClick={() => cancel.mutate()}>
            لغو استعلام
          </Button>
        ) : null}
        {failed && i.product && !i.alternatives ? (
          <Button variant="accent" startIcon={Shuffle} onClick={() => openAlternatives({ reason: r?.stock === 'out_of_stock' ? 'out_of_stock' : 'unreachable', productId: i.product!.id, productTitle: i.product!.title, shopId: i.shop.id, shopName: i.shop.name })}>
            جایگزین‌ها
          </Button>
        ) : null}
        {m.phase === 'failed' && i.status !== 'cancelled' ? (
          <Button variant="secondary" startIcon={Repeat} loading={retry.isPending} onClick={() => retry.mutate(i.id)}>
            دوباره بپرس
          </Button>
        ) : null}
        {r && r.stock !== 'out_of_stock' ? (
          <Button
            variant={inPlan ? 'soft' : 'primary'}
            startIcon={inPlan ? Check : CirclePlus}
            onClick={() => {
              if (inPlan) return navigate(paths.plan);
              const res = addStop({ shopId: i.shop.id, productId: i.product?.id, shopName: i.shop.name, productTitle: i.product?.title ?? null, mallName: i.shop.location.mall?.name ?? null });
              if (res === 'added') toast.success(PLAN_TOAST.added, { action: { label: 'مشاهده برنامه', onClick: () => navigate(paths.plan) } });
              else toast.warning(PLAN_TOAST[res]);
            }}
          >
            {inPlan ? 'در برنامه بازدید' : 'افزودن به برنامه بازدید'}
          </Button>
        ) : null}
      </StickyCTA>
      ) : null}
    </>
  );
}
