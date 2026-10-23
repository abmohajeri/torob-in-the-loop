import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Lightbulb, Shuffle } from 'lucide-react';
import { ALT_REASON_META, formatToman, type AltReason, type CrowdReport, type StoreOffer } from '@titl/shared';
import { Sheet } from '../ui/Sheet.js';
import { ErrorState } from '../ui/ErrorState.js';
import { StoreOfferCardSkeleton } from '../store/StoreOfferCard.js';
import { api } from '../../lib/api.js';
import { qk, contextKey } from '../../lib/queryKeys.js';
import { getSessionId } from '../../lib/session.js';
import { paths } from '../../lib/paths.js';
import { getUserContext } from '../../state/useContextStore.js';
import { usePlan } from '../../state/usePlan.js';
import { useAlt } from '../../state/alt.js';
import { AlternativesPanel } from './AlternativesPanel.js';

const REPORT_FOR: Partial<Record<AltReason, CrowdReport['type']>> = { closed: 'closed', not_found: 'not_found', out_of_stock: 'out_of_stock', too_expensive: 'price_mismatch' };

const FALLBACK_HEADLINE: Record<string, string> = {
  over_budget: 'بیشتر از بودجه بود؟ گزینه‌های ارزان‌تر',
  no_installment: 'قسطی نداشت؟ فروشگاه‌هایی که قسطی اعلام کرده‌اند',
};

/** Global alternatives sheet (85%): fetched on open, files a crowd report for on-site reasons, swaps plan stops. */
export function AlternativesSheet() {
  const { open, target, close } = useAlt();
  const navigate = useNavigate();
  const ctx = useMemo(() => (open ? getUserContext() : {}), [open]);
  const q = useQuery({
    queryKey: [...qk.alternatives({ productId: target?.productId, shopId: target?.shopId, reason: target?.reason ?? 'closed' }, contextKey(ctx)), target?.origin?.lat ?? null],
    queryFn: ({ signal }) => api.alternatives({ productId: target!.productId, shopId: target!.shopId, reason: target!.reason, context: ctx, origin: target!.origin }, signal),
    enabled: open && !!target,
    staleTime: 60_000,
    retry: false,
  });

  const report = useMutation({
    mutationFn: (type: CrowdReport['type']) => api.reportShop(target!.shopId!, { type, sessionId: getSessionId() }),
  });

  const stops = usePlan((s) => s.stops);
  const replace = (o: StoreOffer) => {
    const st = usePlan.getState();
    const idx = stops.findIndex((s) => s.shopId === target?.shopId);
    st.removeStop(target!.shopId!, target!.productId);
    const r = st.addStop({ shopId: o.shop.id, productId: target?.productId, shopName: o.shop.name, productTitle: target?.productTitle ?? null, mallName: o.shop.location.mall?.name ?? null });
    if (r === 'added' && idx >= 0) {
      const now = usePlan.getState().stops;
      st.moveStop(now.length - 1, Math.min(idx, now.length - 1));
    }
    close();
    toast.success(`«${o.shop.name}» جای «${target?.shopName ?? 'فروشگاه قبلی'}» در برنامه نشست.`);
    navigate(`${paths.plan}?changed=${encodeURIComponent(o.shop.id)}`);
  };

  const reason = target?.reason ?? 'closed';
  const meta = (ALT_REASON_META as Record<string, { label: string; headline: string } | undefined>)[reason];
  const title = q.data?.headline ?? meta?.headline ?? FALLBACK_HEADLINE[reason] ?? 'گزینه‌های جایگزین';
  const reportType = REPORT_FOR[reason];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (o) return;
        close();
      }}
      title={title}
      description={target?.shopName ? `به‌جای «${target.shopName}»${target.productTitle ? ` · ${target.productTitle}` : ''}` : (target?.productTitle ?? undefined)}
      icon={Shuffle}
      size="tall"
    >
      <div className="flex flex-col gap-3">
        {reportType && target?.shopId && !report.isSuccess ? (
          <button
            type="button"
            onClick={() =>
              report.mutate(reportType, {
                onSuccess: () => toast.success(`گزارش «${meta?.label ?? ''}» ثبت شد؛ به خریداران دیگر هم نشان می‌دهیم.`),
                onError: () => toast.error('ثبت گزارش ممکن نشد.'),
              })
            }
            className="hit-44 self-start rounded-full border border-line bg-surface px-3 py-1.5 text-meta font-medium text-ink-2 press hover:border-primary-200"
          >
            گزارش «{meta?.label}» برای «{target.shopName}» را ثبت کن
          </button>
        ) : null}
        {reason === 'too_expensive' && target?.registeredPrice ? (
          <p className="flex items-start gap-2 rounded-xl bg-accent-tint px-3 py-2 text-meta leading-6 text-accent-ink">
            <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
            قیمت ثبت‌شده همین فروشگاه در ترب {formatToman(target.registeredPrice)} است — می‌توانید به آن اشاره کنید.
          </p>
        ) : null}
        {q.isPending ? (
          <>
            <StoreOfferCardSkeleton />
            <StoreOfferCardSkeleton />
          </>
        ) : q.isError ? (
          <ErrorState size="sm" error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : q.data ? (
          <AlternativesPanel data={q.data} hideHeadline productId={target?.productId} productTitle={target?.productTitle} onReplace={target?.replaceInPlan && target.shopId ? replace : undefined} />
        ) : null}
      </div>
    </Sheet>
  );
}
