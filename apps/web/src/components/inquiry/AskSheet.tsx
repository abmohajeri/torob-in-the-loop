import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Lock, PhoneCall, Store } from 'lucide-react';
import { formatNumber, type InquiryQuestion } from '@titl/shared';
import { Sheet } from '../ui/Sheet.js';
import { Chip } from '../ui/Chip.js';
import { Button } from '../ui/Button.js';
import { TextField } from '../ui/TextField.js';
import { api, errorMessage } from '../../lib/api.js';
import { qk } from '../../lib/queryKeys.js';
import { paths } from '../../lib/paths.js';
import { getSessionId } from '../../lib/session.js';
import { getUserContext } from '../../state/useContextStore.js';
import { useAsk, type AskTarget } from '../../state/ask.js';
import { PRIVACY_LINE, QUESTION_META } from './meta.js';
import { SimulatedPill } from './parts.js';

const GROUP_EXTRAS: Record<string, InquiryQuestion[]> = {
  mobile: ['registry', 'condition', 'cash_vs_installment'],
  computer: ['condition', 'cash_vs_installment'],
  audio_video: ['condition'],
  shoes_bags: ['variant', 'condition'],
  fashion: ['variant', 'condition'],
  watch_jewelry: ['condition'],
};

/** Question chips offered for a target, in display order, and the ones selected by default. */
export function askQuestionsFor(target: AskTarget | null): { offered: InquiryQuestion[]; selected: InquiryQuestion[] } {
  const ctx = getUserContext();
  const extras = (target?.group && GROUP_EXTRAS[target.group]) || [];
  const offered: InquiryQuestion[] = ['stock', 'price', 'hours', 'hold', 'installment', ...extras, 'location', 'warranty', 'return_policy', 'kalabarg', 'custom'];
  const sel = new Set<InquiryQuestion>(target?.questions ?? ['stock', 'price']);
  if (!target?.questions) {
    if (ctx.installment || ctx.providers?.length) sel.add('installment');
    if (ctx.kalabarg) sel.add('kalabarg');
    if (target?.shops.some((s) => s.locationConfidence && s.locationConfidence !== 'high')) sel.add('location');
    if (!ctx.visitAt) sel.add('hours');
    if (target?.custom) sel.add('custom');
  }
  if (!target?.productId) {
    sel.delete('price');
  }
  return { offered: [...new Set(offered)], selected: offered.filter((q) => sel.has(q)) };
}

/** Global «از فروشگاه‌ها بپرس» sheet → creates a batch of (simulated) calls → opens the live board. */
export function AskSheet() {
  const { open, target, close } = useAsk();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const init = useMemo(() => askQuestionsFor(target), [target]);
  const [picked, setPicked] = useState<InquiryQuestion[]>(init.selected);
  const [custom, setCustom] = useState(target?.custom ?? '');
  useEffect(() => {
    setPicked(init.selected);
    setCustom(target?.custom ?? '');
  }, [init, target]);

  const shops = target?.shops ?? [];
  const closedCount = shops.filter((s) => s.closedNow).length;
  const toggle = (q: InquiryQuestion) => setPicked((p) => (p.includes(q) ? p.filter((x) => x !== q) : [...p, q]));
  const needsCustom = picked.includes('custom');
  const valid = picked.length > 0 && shops.length > 0 && (!needsCustom || custom.trim().length > 2);

  const create = useMutation({
    mutationFn: () =>
      api.createInquiries({
        sessionId: getSessionId(),
        productId: target?.productId,
        shopIds: shops.map((s) => s.id),
        questions: picked,
        customQuestion: needsCustom ? custom.trim() : undefined,
        context: getUserContext(),
      }),
    onSuccess: (res) => {
      const list = res?.inquiries ?? [];
      qc.setQueryData<{ inquiries: typeof list }>(qk.inquiries(getSessionId()), (old) => ({ inquiries: [...list, ...(old?.inquiries ?? []).filter((o) => !list.some((n) => n.id === o.id))] }));
      for (const i of list) qc.setQueryData(qk.inquiry(i.id), i);
      close();
      const batch = list[0]?.batchId;
      toast.success(`استعلام از ${formatNumber(list.length || shops.length)} فروشگاه شروع شد.`);
      navigate(list.length === 1 ? paths.inquiry(list[0]!.id) : `${paths.inquiries}${batch ? `?batch=${encodeURIComponent(batch)}` : ''}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const title = shops.length === 1 ? `از «${shops[0]!.name}» بپرسم؟` : `از ${formatNumber(shops.length)} فروشگاه بپرسم؟`;

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => (o ? null : close())}
      title={title}
      description={target?.productTitle ?? undefined}
      icon={PhoneCall}
      size="auto"
      footer={
        <div className="flex flex-col gap-2">
          <p className="text-center text-caption leading-5 text-muted">نتیجه‌ها معمولاً کمتر از یک دقیقه می‌رسد؛ لازم نیست صبر کنید — در «پیگیری‌ها» هم می‌آید.</p>
          <Button variant="accent" size="lg" fullWidth startIcon={PhoneCall} disabled={!valid} loading={create.isPending} onClick={() => create.mutate()}>
            شروع تماس‌ها
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {shops.length > 1 ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="فروشگاه‌ها">
            {shops.map((s) => (
              <li key={s.id} className="inline-flex h-7 items-center gap-1 rounded-full bg-sunken px-2.5 text-caption font-medium text-ink-2">
                <Store aria-hidden className="size-3.5 text-primary" />
                {s.name}
              </li>
            ))}
          </ul>
        ) : null}
        <fieldset>
          <legend className="mb-2 text-meta font-bold text-ink">چه چیزی را بپرسم؟</legend>
          <div className="flex flex-wrap gap-2">
            {init.offered.map((q) => {
              const m = QUESTION_META[q];
              return (
                <Chip key={q} size="md" icon={m.icon} selected={picked.includes(q)} aria-pressed={picked.includes(q)} onClick={() => toggle(q)}>
                  {m.label}
                </Chip>
              );
            })}
          </div>
        </fieldset>
        {needsCustom ? (
          <TextField label="سؤال دلخواه" placeholder="مثلاً: سایز ۴۳ مشکی دارید؟" value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={140} />
        ) : null}
        {picked.length ? (
          <div className="rounded-xl bg-surface-2 p-3 text-meta leading-6 text-ink-2">
            <p className="mb-1 font-bold text-ink">متن پرسش:</p>
            {picked
              .filter((q) => q !== 'custom')
              .map((q) => QUESTION_META[q].ask)
              .join(' ')}
            {needsCustom && custom.trim() ? ` ${custom.trim()}` : ''}
          </div>
        ) : null}
        {closedCount ? (
          <p className="flex items-start gap-2 text-meta text-info-ink">
            <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0" />
            {formatNumber(closedCount)} فروشگاه الان بسته است؛ تماس هنگام باز شدن انجام می‌شود و پیامتان همین حالا در صندوق فروشنده ثبت می‌شود.
          </p>
        ) : null}
        <p className="flex items-start gap-2 text-meta text-muted">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {PRIVACY_LINE}
        </p>
        <SimulatedPill />
      </div>
    </Sheet>
  );
}
