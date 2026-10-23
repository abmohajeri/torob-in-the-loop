import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Building2,
  Check,
  CirclePlus,
  Clock,
  CreditCard,
  Database,
  Eye,
  Flag,
  Layers,
  MessageCircleQuestion,
  Navigation,
  Package,
  Phone,
  Share2,
  Store,
  Tags,
  TrafficCone,
  TrainFront,
} from 'lucide-react';
import { REPORT_TYPE_META, formatJalaliDate, formatNumber, navLinksFor, type CrowdReport, type ShopDetail } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { Button, ButtonAnchor, ButtonLink } from '../components/ui/Button.js';
import { IconButton } from '../components/ui/IconButton.js';
import { SectionHeader } from '../components/ui/SectionHeader.js';
import { Sheet } from '../components/ui/Sheet.js';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton.js';
import { ErrorState } from '../components/ui/ErrorState.js';
import { Card } from '../components/ui/Card.js';
import { OpenStatusBadge } from '../components/data/OpenStatusBadge.js';
import { DistanceEta } from '../components/data/DistanceEta.js';
import { InMallGuide } from '../components/data/InMallGuide.js';
import { PaymentBadges } from '../components/data/PaymentBadges.js';
import { PriceTag } from '../components/data/PriceTag.js';
import { DataNote, DATA_NOTES } from '../components/data/DataNote.js';
import { Unknown } from '../components/data/Unknown.js';
import { HoursTable } from '../components/shop/HoursTable.js';
import { ShopReports } from '../components/shop/ShopReports.js';
import { askShop } from '../components/store/askTarget.js';
import { DynamicIcon } from '../lib/icons.js';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';
import { getSessionId } from '../lib/session.js';
import { SHARE_TOAST, shareOrCopy } from '../lib/share.js';
import { useContextQuery } from '../state/useContextStore.js';
import { PLAN_TOAST, useIsInPlan, usePlan } from '../state/usePlan.js';
import { openAsk } from '../state/ask.js';
import { openAlternatives } from '../state/alt.js';
import type { InquiryQuestion } from '@titl/shared';

function maskPhone(p: string): string {
  const s = p.replace(/\s/g, '');
  return s.length < 6 ? '••••' : `${s.slice(0, 4)} ••• ••${s.slice(-2)}`;
}

/** Full-screen card to show a guard/shopkeeper (large type + wake lock while open). */
function ShowGuideSheet({ shop, open, onOpenChange }: { shop: ShopDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  useEffect(() => {
    if (!open) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, [open]);
  const loc = shop.location;
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="نشان دادن به نگهبان یا فروشنده" size="full">
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <p className="text-[2.25rem] font-extrabold leading-tight text-heading">{shop.name}</p>
        {loc.guide.length ? (
          loc.guide.map((g, i) => (
            <p key={i} className="text-[1.75rem] font-bold leading-snug text-ink">
              {g}
            </p>
          ))
        ) : (
          <p className="text-[1.5rem] leading-snug text-ink">{shop.address ?? 'نشانی ثبت نشده'}</p>
        )}
        <p className="text-meta text-muted">ببخشید، این فروشگاه کجاست؟</p>
      </div>
    </Sheet>
  );
}

export default function ShopPage() {
  const { id = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { ctx, ctxKey } = useContextQuery();
  const productId = new URLSearchParams(location.search).get('product') ?? undefined;
  const q = useQuery({ queryKey: qk.shop(id, ctxKey), queryFn: ({ signal }) => api.shop(id, ctx, signal), enabled: !!id });
  const s = q.data;
  useDocumentTitle(s?.name ?? 'فروشگاه');
  const products = useQuery({ queryKey: qk.shopProducts(id, '', 1, ctxKey), queryFn: ({ signal }) => api.shopProducts(id, { limit: 6 }, ctx, signal), enabled: !!s?.hasOffers, retry: false });
  const slug = s?.location.mall?.slug;
  const mall = useQuery({ queryKey: qk.mall(slug ?? '', ctxKey), queryFn: ({ signal }) => api.mall(slug!, ctx, signal), enabled: !!slug, retry: false, staleTime: 5 * 60_000 });
  const neighbours = useMemo(() => {
    if (!s || !mall.data || s.location.floorNum === null) return [];
    const floor = mall.data.floors.find((f) => f.floorNum === s.location.floorNum);
    return (floor?.shops ?? []).filter((x) => x.id !== s.id).slice(0, 6);
  }, [s, mall.data]);
  const [showGuide, setShowGuide] = useState(false);
  const inPlan = useIsInPlan(id, productId);
  const addStop = usePlan((st) => st.addStop);
  const removeStop = usePlan((st) => st.removeStop);
  const offer = productId ? products.data?.items.find((x) => x.product.id === productId) : undefined;

  const ask = (questions?: InquiryQuestion[]) => s && openAsk({ shops: [askShop(s)], productId, productTitle: offer?.product.title, questions });
  useEffect(() => {
    if (s && location.hash === '#ask') {
      ask();
      navigate({ hash: '' }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, location.hash]);

  const report = useMutation({
    mutationFn: (type: CrowdReport['type']) => api.reportShop(id, { type, sessionId: getSessionId() }),
    onSuccess: (_r, type) => {
      toast.success(`گزارش «${REPORT_TYPE_META[type].label}» ثبت شد؛ به خریداران دیگر هم نشان می‌دهیم.`);
      void qc.invalidateQueries({ queryKey: qk.shopAll(id) });
    },
    onError: () => toast.error('ثبت گزارش ممکن نشد؛ دوباره تلاش کنید.'),
  });

  const share = async () => {
    const r = await shareOrCopy({ title: s?.name, text: s?.location.guide.join('، '), url: window.location.href });
    if (SHARE_TOAST[r]) toast(SHARE_TOAST[r]!);
  };
  const togglePlan = () => {
    if (!s) return;
    if (inPlan) {
      removeStop(s.id, productId);
      toast('از برنامه بازدید حذف شد.');
      return;
    }
    const r = addStop({ shopId: s.id, productId, shopName: s.name, productTitle: offer?.product.title ?? null, mallName: s.location.mall?.name ?? null });
    if (r === 'added') toast.success(PLAN_TOAST.added, { action: { label: 'مشاهده برنامه', onClick: () => navigate(paths.plan) } });
    else toast.warning(PLAN_TOAST[r]);
  };

  if (q.isPending)
    return (
      <>
        <PageHeader title="فروشگاه" />
        <div aria-busy className="flex flex-col gap-4 px-4 pt-2">
          <SkeletonText lines={2} />
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </>
    );
  if (q.isError || !s)
    return (
      <>
        <PageHeader title="فروشگاه" />
        <div className="px-4 pt-8">
          <ErrorState error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
        </div>
      </>
    );

  const nav = navLinksFor({ lat: s.lat, lng: s.lng }, s.name);
  const metro = s.nearbyMetro[0];

  return (
    <>
      <PageHeader title={s.name} subtitle={s.area ?? undefined} actions={<IconButton icon={Share2} label="اشتراک‌گذاری نشانی" onClick={share} />} />
      <div className="flex flex-col gap-5 px-4 pt-2">
        {/* 1. identity */}
        <section className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <OpenStatusBadge status={s.openStatus} size="lg" />
            <DistanceEta distanceKm={s.distanceKm} etaMin={s.etaMin} />
          </div>
          {s.address ? <p className="text-meta leading-6 text-ink-2">{s.address}</p> : null}
        </section>

        {/* 2. in-mall guide (above the fold) */}
        {s.location.mall || s.location.guide.length ? (
          <InMallGuide location={s.location} onAsk={s.location.confidence !== 'high' ? () => ask(['location']) : undefined} />
        ) : (
          <Unknown label="جزئیات نشانی داخل پاساژ ثبت نشده" onAsk={() => ask(['location'])} askLabel="نشانی دقیق را بپرس" />
        )}
        {neighbours.length ? (
          <p className="-mt-2 flex flex-wrap items-center gap-x-1.5 text-meta text-ink-2">
            <Layers aria-hidden className="size-4 text-primary" />
            همسایه‌های همین طبقه:
            {neighbours.map((n, i) => (
              <span key={n.id}>
                <Link to={paths.shop(n.id)} className="hit-44 num font-medium text-primary-strong hover:underline">
                  {n.location.unit ? `واحد ${n.location.unit}` : n.name}
                </Link>
                {i < neighbours.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" startIcon={Eye} onClick={() => setShowGuide(true)}>
            نشان دادن به نگهبان
          </Button>
          {slug ? (
            <ButtonLink to={paths.mall(slug)} variant="secondary" startIcon={Building2}>
              همه طبقه‌ها
            </ButtonLink>
          ) : (
            <Button variant="secondary" startIcon={Flag} onClick={() => openAlternatives({ reason: 'not_found', shopId: s.id, shopName: s.name, productId, origin: { lat: s.lat, lng: s.lng } })}>
              پیدایش نکردم
            </Button>
          )}
        </div>

        {/* 3. for you (when opened from a product) */}
        {offer ? (
          <Card padding="md" tone="brand">
            <p className="mb-1 text-meta font-bold text-primary-ink">این فروشگاه برای شما</p>
            <Link to={paths.product(offer.product.id)} className="mb-2 block text-body font-bold text-ink hover:text-primary-strong">
              {offer.product.title}
            </Link>
            <PriceTag price={offer.price} onAsk={() => ask(['price'])} />
          </Card>
        ) : null}

        {/* 4. actions */}
        <div className="flex gap-2">
          <Button variant="accent" startIcon={MessageCircleQuestion} className="flex-1" onClick={() => ask()}>
            بپرس
          </Button>
          <ButtonAnchor href={nav.neshan} external variant="secondary" startIcon={Navigation} aria-label={`مسیریابی به ${s.name}`}>
            مسیر
          </ButtonAnchor>
          <Button variant={inPlan ? 'soft' : 'secondary'} startIcon={inPlan ? Check : CirclePlus} onClick={togglePlan} aria-pressed={inPlan}>
            {inPlan ? 'در برنامه' : 'برنامه'}
          </Button>
        </div>
        {metro || s.inTrafficZone ? (
          <div className="flex flex-col gap-1 text-meta text-ink-2">
            {metro ? (
              <p className="flex items-center gap-1.5">
                <TrainFront aria-hidden className="size-4 text-primary" />
                مترو {metro.name} ({metro.lines.map((l) => `خط ${l.ref}`).join('، ')}) — <span className="num">{formatNumber(metro.walkMin)}</span> دقیقه پیاده
              </p>
            ) : null}
            {s.inTrafficZone ? (
              <p className="flex items-center gap-1.5 text-warn-ink">
                <TrafficCone aria-hidden className="size-4" />
                داخل محدوده طرح ترافیک — مترو یا تاکسی پیشنهاد می‌شود
              </p>
            ) : null}
          </div>
        ) : null}

        {/* 5. hours */}
        <Card as="section" padding="md" aria-labelledby="hours">
          <SectionHeader id="hours" as="h2" icon={Clock} title="ساعت کاری" subtitle="اعلام فروشنده" className="mb-3" />
          <HoursTable hours={s.hours} at={ctx.visitAt} onAsk={() => ask(['hours'])} />
        </Card>

        {/* 6. payments */}
        <Card as="section" padding="md" aria-labelledby="pay">
          <SectionHeader id="pay" as="h2" icon={CreditCard} title="روش‌های پرداخت" subtitle="با نوع اطلاعات" className="mb-3" />
          <PaymentBadges payment={s.payment} showHints showFastDelivery showKalabarg showUnknown onAsk={() => ask(['installment', 'kalabarg'])} />
        </Card>

        {/* 7. categories */}
        <Card as="section" padding="md" aria-labelledby="cats">
          <SectionHeader id="cats" as="h2" icon={Tags} title="دسته‌های فعالیت" subtitle="نشانه موجود بودن کالا نیست" className="mb-3" />
          {s.categories.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {s.categories.map((c) => (
                <li key={c} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-caption text-ink-2">
                  {c}
                </li>
              ))}
            </ul>
          ) : (
            <Unknown label="دسته فعالیت ثبت نشده" />
          )}
        </Card>

        {products.data?.items.length ? (
          <section aria-labelledby="prods" className="flex flex-col gap-2">
            <SectionHeader id="prods" icon={Package} title="کالاهای ثبت‌شده" count={products.data.total} />
            <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-card">
              {products.data.items.map((it) => (
                <li key={it.product.id}>
                  <Link to={paths.product(it.product.id)} className="flex flex-col gap-1 px-3.5 py-3 hover:bg-primary-tint/40 focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="line-clamp-2 text-meta font-bold text-ink">{it.sellerTitle ?? it.product.title}</span>
                    <PriceTag price={it.price} size="sm" showLabel={false} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 8. reports */}
        <Card as="section" padding="md" aria-labelledby="reports">
          <SectionHeader id="reports" as="h2" icon={Flag} title="گزارش خریداران" className="mb-3" />
          <ShopReports reports={s.reports} />
          <p className="mb-2 mt-4 text-meta font-bold text-ink">شما رفتید؟ گزارش دهید:</p>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(REPORT_TYPE_META) as CrowdReport['type'][]).map((t) => (
              <Button key={t} size="sm" variant="secondary" disabled={report.isPending} onClick={() => report.mutate(t)}>
                <DynamicIcon name={REPORT_TYPE_META[t].icon} className="size-4" />
                {REPORT_TYPE_META[t].label}
              </Button>
            ))}
          </div>
        </Card>

        {/* 9. source */}
        <Card as="section" padding="md" tone="muted" aria-labelledby="src">
          <SectionHeader id="src" as="h2" icon={Database} title="منبع اطلاعات" className="mb-3" />
          <dl className="flex flex-col gap-2 text-meta">
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted">داده‌ها</dt>
              <dd className="text-ink-2">
                ترب — {formatNumber(s.stats.offerCount)} پیشنهاد{s.stats.lastPriceChange ? `، آخرین تغییر قیمت ${formatJalaliDate(s.stats.lastPriceChange)}` : ''}
              </dd>
            </div>
            {s.phone ? (
              <div className="flex gap-2">
                <dt className="w-28 shrink-0 text-muted">تلفن</dt>
                <dd className="flex items-center gap-1 text-ink-2">
                  <Phone aria-hidden className="size-3.5" />
                  <span className="num" dir="ltr">
                    {maskPhone(s.phone)}
                  </span>
                  <span className="text-caption text-muted">(شماره نمایشی دیتاست)</span>
                </dd>
              </div>
            ) : null}
            <div className="flex gap-2">
              <dt className="w-28 shrink-0 text-muted">نام فروشگاه</dt>
              <dd className="text-ink-2">{s.nameIsReal ? 'نام واقعی (اینستاگرام/وب‌سایت ثبت شده)' : 'ناشناس‌سازی‌شده در داده‌های ترب'}</dd>
            </div>
          </dl>
          <DataNote className="mt-3" icon={Store}>
            {DATA_NOTES.fakePhones} برای پرسیدن از دکمه «بپرس» استفاده کنید.
          </DataNote>
        </Card>
      </div>
      <ShowGuideSheet shop={s} open={showGuide} onOpenChange={setShowGuide} />
    </>
  );
}
