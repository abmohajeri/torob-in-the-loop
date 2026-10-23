/**
 * Deterministic insights (SV11) — pure. Used by both the LLM and the rules assistant, and attached
 * to StoresResponse / NeedStoresResponse, so both modes say the same smart, honest things.
 * Every sentence is derived from data on the input; nothing is invented.
 */
import type { ClusterSummary, Inquiry, Insight, ShopLite, StoreOffer, UserContext, VisitPlan } from '@titl/shared';
import { formatNumber, formatTomanShort, inTrafficZone, tehranParts } from '@titl/shared';

export interface InsightInput {
  ctx: UserContext;
  /** Ranked stores (best first). */
  stores: StoreOffer[];
  clusters?: ClusterSummary[];
  inquiries?: Inquiry[];
  plan?: VisitPlan | null;
  /** Visit moment (ctx.visitAt or now). */
  at: Date;
  /** Hidden replica count (SV8), when known. */
  hiddenReplicas?: number;
  /** Optional nearest-metro line for the top cluster, e.g. «ایستگاه سعدی (خط ۲) — ۴ دقیقه پیاده». */
  metroLine?: string | null;
  limit?: number;
}

const TOP = 5;
const fa = formatNumber;

function staleOf(s: StoreOffer): boolean {
  return s.price.price !== null && (!!s.price.likelyOutdated || s.price.freshness === 'stale' || s.price.freshness === 'very_stale');
}

function isOpen(sh: ShopLite): boolean {
  return sh.openStatus.state === 'open' || sh.openStatus.state === 'closing_soon';
}

export function insights(input: InsightInput): Insight[] {
  const { ctx, stores } = input;
  const top = stores.slice(0, TOP);
  const out: Insight[] = [];

  // same-passage cluster
  const c = input.clusters?.[0];
  if (c && c.storeCount >= 3) {
    out.push({ code: 'same_passage_cluster', tone: 'good', text: c.text, shopIds: c.shopIds.slice(0, 12) });
  }

  // trade-off: cheapest fresh vs nearest open
  const fresh = stores.filter((s) => s.price.price !== null && s.price.freshness === 'fresh');
  const cheapestFresh = fresh.reduce<StoreOffer | null>((b, s) => (!b || s.price.price! < b.price.price! ? s : b), null);
  const nearestOpen = stores
    .filter((s) => isOpen(s.shop) && s.shop.etaMin !== null)
    .reduce<StoreOffer | null>((b, s) => (!b || s.shop.etaMin! < b.shop.etaMin! ? s : b), null);
  if (cheapestFresh && nearestOpen && cheapestFresh.shop.id !== nearestOpen.shop.id && nearestOpen.price.price !== null) {
    const save = nearestOpen.price.price - cheapestFresh.price.price!;
    const extra = (cheapestFresh.shop.etaMin ?? 0) - (nearestOpen.shop.etaMin ?? 0);
    if (save > 0 && extra > 0) {
      out.push({
        code: 'tradeoff',
        tone: 'info',
        text: `ارزان‌ترین قیمت تازه ${formatTomanShort(save)} ارزان‌تر از نزدیک‌ترین فروشگاه باز است، اما حدود ${fa(extra)} دقیقه دورتر`,
        shopIds: [cheapestFresh.shop.id, nearestOpen.shop.id],
      });
    }
  }

  // stale prices among the top results
  const stale = top.filter(staleOf);
  if (stale.length >= 2 || (stale.length === 1 && top.length <= 2)) {
    out.push({
      code: 'stale_price',
      tone: 'warn',
      text: `${fa(stale.length)} فروشگاه از ${fa(top.length)} فروشگاه اول قیمت قدیمی دارند — قبل از رفتن استعلام کنید`,
      shopIds: stale.map((s) => s.shop.id),
    });
  }

  // closing before arrival
  const closing = top.filter((s) => s.shop.openStatus.state === 'closing_soon' || s.shop.openStatus.state === 'closed');
  if (closing.length) {
    const s = closing[0]!;
    out.push({
      code: 'closing_before_arrival',
      tone: 'warn',
      text:
        s.shop.openStatus.state === 'closing_soon'
          ? `«${s.shop.name}» نزدیک زمان رسیدن شما می‌بندد (${s.shop.openStatus.label})`
          : `«${s.shop.name}» در زمان رسیدن شما بسته است (${s.shop.openStatus.label})`,
      shopIds: closing.map((x) => x.shop.id),
    });
  }

  // suspiciously cheap / replica claims
  const odd = stores.filter((s) => s.price.status === 'suspicious' || s.attrs?.authenticity === 'replica');
  if (odd.length) {
    out.push({
      code: 'suspiciously_cheap',
      tone: 'warn',
      text: `${fa(odd.length)} فروشگاه قیمت غیرعادی یا عبارت «طرح/کپی» در عنوان خود دارند؛ این قیمت‌ها در مقایسه حساب نشده‌اند`,
      shopIds: odd.map((s) => s.shop.id).slice(0, 10),
    });
  }

  // installment channel unknown
  if (ctx.installment) {
    const unknown = stores.filter((s) => s.shop.installmentTier === 'declared_unknown_channel');
    if (unknown.length) {
      out.push({
        code: 'installment_channel_unknown',
        tone: 'info',
        text: `${fa(unknown.length)} فروشگاه اقساط اعلام کرده‌اند ولی مشخص نیست حضوری هم می‌پذیرند — بپرسید`,
        shopIds: unknown.map((s) => s.shop.id).slice(0, 10),
      });
    }
  }

  // traffic zone (driving only)
  if (ctx.travelMode === 'car' && top.some((s) => inTrafficZone(s.shop))) {
    out.push({
      code: 'traffic_zone',
      tone: 'warn',
      text: 'مقصد داخل محدودهٔ طرح ترافیک است؛ با مترو یا تاکسی راحت‌تر می‌رسید',
      action: { label: 'با مترو حساب کن', contextPatch: { travelMode: 'metro' } },
    });
  }
  if (input.metroLine) out.push({ code: 'metro', tone: 'info', text: input.metroLine });

  // weekend / Thursday
  const day = tehranParts(input.at).weekday;
  if (day === 'fri') {
    out.push({ code: 'weekend', tone: 'warn', text: 'جمعه‌ها بیشتر فروشگاه‌ها تعطیل‌اند؛ پیش از رفتن ساعت کاری را بپرسید' });
  } else if (day === 'thu' && tehranParts(input.at).hour >= 14) {
    out.push({ code: 'weekend', tone: 'info', text: 'پنجشنبه‌عصر خیلی از فروشگاه‌ها زودتر می‌بندند' });
  }

  if (input.hiddenReplicas && input.hiddenReplicas > 0) {
    out.push({
      code: 'replicas_hidden',
      tone: 'info',
      text: `${fa(input.hiddenReplicas)} کالای «طرح/کپی» پنهان شد`,
      action: { label: 'نمایش', contextPatch: { showReplicas: true } },
    });
  }

  // inquiries: a confirmed cheaper/pricier answer is worth surfacing
  const answered = (input.inquiries ?? []).filter((q) => q.result && q.result.priceDeltaPct !== null && Math.abs(q.result.priceDeltaPct) >= 5);
  if (answered.length) {
    const q = answered[0]!;
    const d = q.result!.priceDeltaPct!;
    out.push({
      code: 'stale_price',
      tone: d > 0 ? 'warn' : 'good',
      text: `طبق استعلام، قیمت «${q.shop.name}» ${fa(Math.abs(Math.round(d)))}٪ ${d > 0 ? 'بیشتر' : 'کمتر'} از قیمت ثبت‌شده است`,
      shopIds: [q.shop.id],
    });
  }
  if (input.plan?.warnings.length) {
    const w = input.plan.warnings.find((x) => x.tone === 'warn' || x.tone === 'bad');
    if (w) out.push({ code: 'closing_before_arrival', tone: w.tone, text: w.label });
  }
  return out.slice(0, input.limit ?? 6);
}
