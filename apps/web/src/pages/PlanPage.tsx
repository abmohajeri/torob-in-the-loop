import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Lightbulb, Navigation, Route, Search, Share2, Trash2, WifiOff } from 'lucide-react';
import { formatTimeOfDay, navLinksFor, TRAVEL_MODE_META, type TravelMode, type VisitPlan } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { StickyCTA } from '../components/layout/StickyCTA.js';
import { Button, ButtonAnchor, ButtonLink } from '../components/ui/Button.js';
import { IconButton } from '../components/ui/IconButton.js';
import { Segmented } from '../components/ui/Tabs.js';
import { Switch } from '../components/ui/Switch.js';
import { EmptyState } from '../components/ui/EmptyState.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { ReasonChips } from '../components/data/ReasonChips.js';
import { DataNote, DATA_NOTES } from '../components/data/DataNote.js';
import { LazyMap } from '../components/map/LazyMap.js';
import { PlanSummary } from '../components/plan/PlanSummary.js';
import { PlanTimeline } from '../components/plan/PlanTimeline.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { TRAVEL_MODE_ICON } from '../lib/icons.js';
import { useDocumentTitle, useOnlineStatus } from '../lib/hooks.js';
import { SHARE_TOAST, shareOrCopy } from '../lib/share.js';
import { describeVisitAt } from '../lib/visit-time.js';
import { useContextQuery } from '../state/useContextStore.js';
import { planStopInputs, usePlan } from '../state/usePlan.js';
import { openContextSheet } from '../state/useUi.js';

const MODES: TravelMode[] = ['walk', 'metro', 'taxi', 'car'];

function shareText(plan: VisitPlan): string {
  const lines = plan.stops.map((s, i) => `${(i + 1).toLocaleString('fa-IR')}. ${s.shop.name}${s.guide.guide.length ? ` — ${s.guide.guide.join('، ')}` : ''} (رسیدن ${formatTimeOfDay(s.arriveAt)})`);
  return `برنامه بازدید من:\n${lines.join('\n')}`;
}

export default function PlanPage() {
  useDocumentTitle('برنامه بازدید');
  const [sp] = useSearchParams();
  const online = useOnlineStatus();
  const { ctx, ctxKey } = useContextQuery();
  const { stops, mode: pMode, departAt: pDepart, keepOrder, lastPlan, setMode, setKeepOrder, setLastPlan, removeStop, clear } = usePlan();
  const mode = pMode ?? ctx.travelMode ?? 'walk';
  const departAt = pDepart ?? ctx.visitAt;
  const [current, setCurrent] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(sp.get('changed'));
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1500);
    return () => clearTimeout(t);
  }, [flash]);

  const stopsKey = stops.map((s) => `${s.shopId}:${s.productId ?? ''}`).join('|');
  const q = useQuery({
    queryKey: [...qk.plan(stopsKey, mode, departAt ?? 'now', ctxKey), keepOrder],
    queryFn: ({ signal }) =>
      api.plan({ stops: planStopInputs(stops), origin: ctx.location ? { lat: ctx.location.lat, lng: ctx.location.lng } : undefined, departAt, mode, keepOrder, context: ctx }, signal),
    enabled: stops.length > 0 && online,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
  });
  useEffect(() => {
    if (q.data) setLastPlan(q.data);
  }, [q.data, setLastPlan]);

  const usingCache = !q.data && !!lastPlan && stops.length > 0;
  const plan = q.data ?? (usingCache ? lastPlan : null);

  const markers = useMemo(
    () => plan?.stops.map((s, i) => ({ id: s.shop.id, lat: s.shop.lat, lng: s.shop.lng, kind: 'stop' as const, text: (i + 1).toLocaleString('fa-IR'), label: s.shop.name, selected: current === i })) ?? [],
    [plan, current],
  );
  const route = useMemo(() => (plan ? [...(plan.origin ? [plan.origin] : []), ...plan.stops.map((s) => ({ lat: s.shop.lat, lng: s.shop.lng }))] : []), [plan]);

  const clearAll = () => {
    const prev = usePlan.getState().stops;
    clear();
    toast('برنامه پاک شد.', { action: { label: 'برگرداندن', onClick: () => usePlan.setState({ stops: prev }) } });
  };
  const share = async () => {
    if (!plan) return;
    const r = await shareOrCopy({ title: 'برنامه بازدید', text: shareText(plan), url: window.location.origin + paths.plan });
    if (SHARE_TOAST[r]) toast(SHARE_TOAST[r]!);
  };
  const target = plan ? plan.stops[current === null ? 0 : current + 1] : undefined;
  const navHref = current === null ? plan?.navLinks.neshan : target ? navLinksFor({ lat: target.shop.lat, lng: target.shop.lng }, target.shop.name).neshan : undefined;

  if (!stops.length)
    return (
      <>
        <PageHeader title="برنامه بازدید" noBack />
        <div className="px-4 pt-6">
          <EmptyState
            icon={Route}
            title="هنوز فروشگاهی به برنامه اضافه نکرده‌اید"
            description="در کارت هر فروشگاه «برنامه» را بزنید؛ ترتیب بهینه، ساعت باز بودن هنگام رسیدن و راهنمای داخل پاساژ را این‌جا می‌چینیم."
            actions={
              <ButtonLink to={paths.search()} startIcon={Search}>
                پیدا کردن کالا و فروشگاه
              </ButtonLink>
            }
          />
        </div>
      </>
    );

  return (
    <>
      <PageHeader title="برنامه بازدید" subtitle={describeVisitAt(departAt)} noBack actions={<IconButton icon={Trash2} label="پاک کردن برنامه" onClick={clearAll} />} />
      <div className="flex flex-col gap-4 px-4 pt-2">
        {!online || usingCache ? (
          <DataNote variant="boxed" tone="warn" icon={WifiOff}>
            آفلاین هستید — آخرین برنامه و راهنماهای داخل پاساژ در دسترس است.
          </DataNote>
        ) : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-line/80 bg-surface p-3 shadow-card">
          <Segmented
            label="نحوه رفت‌وآمد"
            size="sm"
            fullWidth
            value={mode}
            onChange={(v) => setMode(v)}
            options={MODES.map((m) => ({ value: m, label: TRAVEL_MODE_META[m].label.split(' ')[0]!, icon: TRAVEL_MODE_ICON[m] }))}
          />
          <div className="flex items-center justify-between gap-2">
            <Button size="sm" variant="ghost" startIcon={CalendarClock} onClick={() => openContextSheet('visitTime')}>
              حرکت: {describeVisitAt(departAt)}
            </Button>
            <label className="flex items-center gap-2 text-meta text-ink-2">
              ترتیب خودم
              <Switch checked={keepOrder} onCheckedChange={setKeepOrder} label="حفظ ترتیب انتخابی من" />
            </label>
          </div>
        </div>

        {!plan && q.isPending ? (
          <>
            <Skeleton className="h-24 w-full rounded-2xl" />
            <Skeleton className="h-44 w-full rounded-2xl" />
            <Skeleton className="h-40 w-full rounded-2xl" />
          </>
        ) : !plan && q.isError ? (
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        ) : plan ? (
          <>
            <PlanSummary plan={plan} />
            {plan.warnings.length ? <ReasonChips reasons={plan.warnings} max={4} /> : null}
            {online ? (
              <LazyMap markers={markers} route={route} user={plan.origin} fit interactive={false} className="h-[180px] overflow-hidden rounded-2xl border border-line" label="نقشه مسیر بازدید" />
            ) : null}
            <PlanTimeline
              plan={plan}
              current={current}
              onArrive={(i) => setCurrent(i)}
              onRemove={(s) => {
                removeStop(s.shop.id, s.product?.id);
                toast('از برنامه حذف شد.');
              }}
              highlightShopId={flash}
            />
            {plan.tips.length ? (
              <ul className="flex flex-col gap-1.5 rounded-2xl border border-accent-100 bg-accent-tint p-3.5">
                {plan.tips.map((t) => (
                  <li key={t} className="flex items-start gap-2 text-meta leading-6 text-accent-ink">
                    <Lightbulb aria-hidden className="mt-0.5 size-4 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            ) : null}
            <DataNote>{DATA_NOTES.estimates}</DataNote>
          </>
        ) : null}
      </div>
      {plan ? (
        <StickyCTA>
          {navHref ? (
            <ButtonAnchor href={navHref} external variant="primary" size="lg" startIcon={Navigation}>
              {current === null ? 'شروع مسیر' : 'مسیر توقف بعدی'}
            </ButtonAnchor>
          ) : null}
          <Button variant="secondary" size="lg" startIcon={Share2} onClick={share}>
            اشتراک‌گذاری
          </Button>
        </StickyCTA>
      ) : null}
    </>
  );
}
