import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeftRight, ChevronDown, CirclePlus, CreditCard, Info, MessageCircleQuestion, Radius } from 'lucide-react';
import { INSTALLMENT_PROVIDERS, formatNumber, type StoreOffer, type StoresResponse } from '@titl/shared';
import { StoreResultCard } from './StoreResultCard.js';
import { VisitTimeBanner } from '../data/VisitTimeBanner.js';
import { TrustLegendButton } from '../data/TrustLabel.js';
import { DataNote } from '../data/DataNote.js';
import { Button } from '../ui/Button.js';
import { askStores } from '../../lib/ask.js';
import { paths } from '../../lib/paths.js';
import { usePlan } from '../../state/usePlan.js';
import { useContextStore, useUserContext } from '../../state/useContextStore.js';
import { toast } from 'sonner';
import { cn } from '../../lib/cn.js';

/** SV9 installment tier (server field when present, else derived from the registered payment info). */
export type InstallmentTier = 'in_person' | 'declared_unknown_channel' | 'seller_text' | 'none_recorded';

export function installmentTierOf(o: StoreOffer): InstallmentTier {
  const server = (o as StoreOffer & { installmentTier?: InstallmentTier }).installmentTier;
  if (server) return server;
  const inst = o.shop.payment.options.filter((p) => INSTALLMENT_PROVIDERS.includes(p.provider));
  if (inst.some((p) => p.channel === 'in_person')) return 'in_person';
  if (inst.length) return 'declared_unknown_channel';
  if (o.shop.payment.textHints.includes('installment')) return 'seller_text';
  return 'none_recorded';
}

const TIER_META: Record<InstallmentTier, { title: string; note?: string; frame: string }> = {
  in_person: { title: 'قسطی حضوری (اعلام فروشنده)', frame: 'border-solid border-primary bg-primary-tint/50' },
  declared_unknown_channel: { title: 'قسطی اعلام شده، حضوری بودنش نامشخص', note: 'ممکن است فقط برای خرید آنلاین باشد', frame: 'border-solid border-line bg-surface' },
  seller_text: { title: 'در توضیحات فروشنده آمده', frame: 'border-dashed border-faint bg-surface' },
  none_recorded: { title: 'قسطی بودن ثبت نشده', frame: 'border-dashed border-line bg-surface-2' },
};
const TIER_ORDER: InstallmentTier[] = ['in_person', 'declared_unknown_channel', 'seller_text', 'none_recorded'];

export interface StoreResultsProps {
  data: StoresResponse;
  /** Show at most this many cards (assistant block); «همه» links to the stores page. */
  limit?: number;
  className?: string;
}

/**
 * Stores for a product: visit-time banner (W8) · installment tiers when قسطی is on (W6) · compact cards (W3) ·
 * multi-select sticky bar [از هر n بپرس] [مقایسه] [به برنامه] · Kalabarg note.
 */
export function StoreResults({ data, limit, className }: StoreResultsProps) {
  const ctx = useUserContext();
  const patch = useContextStore((s) => s.patch);
  const navigate = useNavigate();
  const addStop = usePlan((s) => s.addStop);
  const [selected, setSelected] = useState<string[]>([]);
  const [showNone, setShowNone] = useState(false);
  const productId = data.product.id;
  const stores = limit ? data.stores.slice(0, limit) : data.stores;

  const onAsk = (o: StoreOffer) => askStores([o], data.product);
  const byIds = (ids: string[]) => ids.map((id) => data.stores.find((s) => s.shop.id === id)).filter((o): o is StoreOffer => !!o);
  const toggle = (o: StoreOffer) =>
    setSelected((s) => (s.includes(o.shop.id) ? s.filter((x) => x !== o.shop.id) : s.length >= 5 ? s : [...s, o.shop.id]));

  const tiers = useMemo(() => {
    const m: Record<InstallmentTier, StoreOffer[]> = { in_person: [], declared_unknown_channel: [], seller_text: [], none_recorded: [] };
    for (const o of data.stores) m[installmentTierOf(o)].push(o);
    return m;
  }, [data.stores]);

  const card = (o: StoreOffer) => (
    <StoreResultCard
      key={o.shop.id}
      offer={o}
      productId={productId}
      productTitle={data.product.title}
      onAsk={onAsk}
      selected={selected.includes(o.shop.id)}
      onToggleSelect={toggle}
    />
  );

  const nearest5 = [...data.stores].sort((a, b) => (a.shop.distanceKm ?? 99) - (b.shop.distanceKm ?? 99)).slice(0, 5).map((o) => o.shop.id);
  const top = tiers.in_person.length + tiers.declared_unknown_channel.length;

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-meta text-ink-2">
          <b className="num">{formatNumber(data.stores.length)}</b> فروشنده حضوری
          {data.excludedByFilters > 0 ? <span className="text-muted"> · {formatNumber(data.excludedByFilters)} فروشگاه با فیلترهای شما پنهان شد</span> : null}
        </p>
        <TrustLegendButton />
      </div>

      <VisitTimeBanner statuses={data.stores.map((s) => s.shop.openStatus)} />

      {ctx.installment ? (
        <>
          {top === 0 ? (
            <section className="rounded-2xl border border-dashed border-accent-200 bg-accent-tint p-3.5">
              <p className="flex gap-2 text-meta text-ink">
                <CreditCard aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-ink" />
                {ctx.maxDistanceKm ? `در ${formatNumber(ctx.maxDistanceKm)} کیلومتری` : 'در این فهرست'} هیچ فروشنده‌ای قسطی حضوری ثبت نکرده.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="accent" startIcon={MessageCircleQuestion} onClick={() => askStores(byIds(nearest5), data.product, ['installment', 'stock', 'price'])}>
                  از {formatNumber(nearest5.length)} فروشگاه نزدیک بپرس
                </Button>
                <Button size="sm" variant="secondary" startIcon={Radius} onClick={() => patch({ maxDistanceKm: 10 })}>
                  شعاع ۱۰ کیلومتر
                </Button>
              </div>
            </section>
          ) : null}
          {TIER_ORDER.map((t) => {
            const list = tiers[t];
            if (!list.length) return null;
            const meta = TIER_META[t];
            const collapsed = t === 'none_recorded' && !showNone;
            return (
              <section key={t} className={cn('rounded-2xl border-2 p-2.5', meta.frame)} aria-label={meta.title}>
                <header className="mb-2 flex flex-wrap items-center gap-x-2 px-1">
                  <h3 className="text-meta font-bold text-ink">
                    {meta.title} · <span className="num">{formatNumber(list.length)}</span>
                  </h3>
                  {meta.note ? <p className="text-caption text-muted">{meta.note}</p> : null}
                </header>
                {collapsed ? (
                  <div className="flex flex-wrap gap-2 px-1 pb-1">
                    <Button size="sm" variant="secondary" startIcon={ChevronDown} onClick={() => setShowNone(true)}>
                      نمایش {formatNumber(list.length)} فروشگاه
                    </Button>
                    <Button
                      size="sm"
                      variant="accent"
                      startIcon={MessageCircleQuestion}
                      onClick={() => askStores(list.slice(0, 5), data.product, ['installment', 'stock', 'price'])}
                    >
                      از ۵ فروشگاه نزدیک بپرس قسطی دارند؟
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">{(limit ? list.slice(0, limit) : list).map(card)}</div>
                )}
              </section>
            );
          })}
        </>
      ) : (
        <div className="flex flex-col gap-2.5">{stores.map(card)}</div>
      )}

      {ctx.kalabarg ? (
        <DataNote icon={Info} tone="info" variant="boxed">
          کالابرگ برای هیچ فروشگاهی در داده‌های ترب ثبت نشده؛ نتایج را حذف نمی‌کنیم و در استعلام می‌پرسیم.
        </DataNote>
      ) : null}

      {limit && data.stores.length > limit ? (
        <Button variant="outline" fullWidth onClick={() => navigate(paths.productStores(productId))}>
          همه {formatNumber(data.stores.length)} فروشنده
        </Button>
      ) : null}

      {selected.length ? (
        <div className="app-fixed bottom-[calc(var(--bottom-ui)+0.5rem)] z-30 px-3">
          <div className="flex animate-slide-up flex-col gap-2 rounded-2xl border border-line bg-surface p-3 shadow-float" role="region" aria-label="فروشگاه‌های انتخاب‌شده">
            <p className="text-meta font-bold text-ink">
              <span className="num">{formatNumber(selected.length)}</span> فروشگاه انتخاب شد
              <button type="button" className="ms-2 text-caption font-medium text-muted underline" onClick={() => setSelected([])}>
                لغو
              </button>
            </p>
            <div className="flex gap-1.5">
              <Button size="sm" variant="accent" className="flex-1" startIcon={MessageCircleQuestion} onClick={() => askStores(byIds(selected), data.product)}>
                از هر {formatNumber(selected.length)} بپرس
              </Button>
              <Button size="sm" variant="secondary" startIcon={ArrowLeftRight} disabled={selected.length < 2} onClick={() => navigate(paths.compareStores(productId, selected))}>
                مقایسه
              </Button>
              <Button
                size="sm"
                variant="secondary"
                startIcon={CirclePlus}
                onClick={() => {
                  let n = 0;
                  for (const id of selected) {
                    const o = data.stores.find((s) => s.shop.id === id);
                    if (o && addStop({ shopId: id, productId, shopName: o.shop.name, productTitle: data.product.title, mallName: o.shop.location.mall?.name ?? null }) === 'added') n++;
                  }
                  toast.success(`${formatNumber(n)} فروشگاه به برنامه اضافه شد.`, { action: { label: 'برنامه', onClick: () => navigate(paths.plan) } });
                  setSelected([]);
                }}
              >
                به برنامه
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
