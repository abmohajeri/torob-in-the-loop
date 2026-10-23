/**
 * Agent-local deterministic insights (SV11 shape). Used when services do not supply `insights` yet;
 * shared by the LLM tool summaries and the rules assistant so both modes say the same smart things.
 */
import {
  formatClock,
  formatDistance,
  formatMinutes,
  formatNumber,
  formatTomanShort,
  tehranParts,
  type Insight,
  type ProductSummary,
  type StoreOffer,
  type StoresResponse,
  type UserContext,
  type VisitPlan,
} from '@titl/shared';

const fa = (n: number) => formatNumber(n);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Weekend / short-day warning for the visit moment. */
export function weekendInsight(ctx: UserContext, now: Date = new Date()): Insight | null {
  const at = ctx.visitAt ? new Date(ctx.visitAt) : now;
  const p = tehranParts(at);
  if (p.weekday === 'fri') return { code: 'weekend', tone: 'warn', text: 'جمعه است؛ بیشتر فروشگاه‌ها و پاساژها تعطیل‌اند. اگر می‌توانید شنبه بروید یا قبلش استعلام بگیرید.' };
  if (p.weekday === 'thu' && p.hour >= 13)
    return { code: 'weekend', tone: 'warn', text: 'پنجشنبه بعدازظهر است؛ خیلی از فروشگاه‌ها زودتر می‌بندند. پیش از رفتن ساعت کاری را بپرسید.' };
  return null;
}

export function storeInsights(res: StoresResponse, ctx: UserContext, now: Date = new Date()): Insight[] {
  if (res.insights?.length) return res.insights.slice(0, 4);
  const out: Insight[] = [];
  const stores = res.stores;
  if (!stores.length) {
    const w = weekendInsight(ctx, now);
    return w ? [w] : [];
  }
  const top = stores.slice(0, 5);

  // Same-passage cluster
  const cluster = res.clusters?.[0];
  if (cluster && cluster.storeCount >= 3) {
    out.push({ code: 'same_passage_cluster', tone: 'good', text: cluster.text, shopIds: cluster.shopIds.slice(0, 6) });
  } else {
    const byMall = new Map<string, StoreOffer[]>();
    for (const s of stores) {
      const m = s.shop.location.mall?.name;
      if (m) byMall.set(m, [...(byMall.get(m) ?? []), s]);
    }
    const best = [...byMall.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    if (best && best[1].length >= 3) {
      const prices = best[1].map((s) => s.price.price).filter((x): x is number => x != null);
      const from = prices.length ? ` · از ${formatTomanShort(Math.min(...prices))}` : '';
      out.push({
        code: 'same_passage_cluster',
        tone: 'good',
        text: `${fa(best[1].length)} فروشنده در ${best[0]} هستند${from}؛ یک‌جا می‌توانید قیمت‌ها را حضوری مقایسه کنید.`,
        shopIds: best[1].map((s) => s.shop.id).slice(0, 6),
      });
    }
  }

  // Closing before arrival
  const closing = top.filter((s) => s.shop.openStatus.state === 'closing_soon' || (s.shop.etaMin != null && s.shop.openStatus.minutesToClose != null && s.shop.openStatus.minutesToClose < s.shop.etaMin + 15));
  if (closing.length) {
    const s = closing[0]!;
    out.push({
      code: 'closing_before_arrival',
      tone: 'warn',
      text: `${s.shop.name} ${s.shop.openStatus.closesAt ? `تا ${formatClock(s.shop.openStatus.closesAt)}` : 'به‌زودی'} باز است${s.shop.etaMin != null ? ` و رسیدن‌تان حدود ${formatMinutes(s.shop.etaMin)} طول می‌کشد` : ''}؛ اول تماس بگیریم؟`,
      shopIds: closing.map((x) => x.shop.id),
    });
  }

  // Stale prices among the top
  const stale = top.filter((s) => s.price.freshness === 'stale' || s.price.freshness === 'very_stale');
  if (stale.length >= 2 || (stale.length && stale[0] === top[0])) {
    out.push({
      code: 'stale_price',
      tone: 'warn',
      text: `قیمت ثبت‌شدهٔ ${fa(stale.length)} فروشگاه از ${fa(top.length)} گزینهٔ اول قدیمی است؛ پیش از رفتن قیمت امروز را بپرسیم.`,
      shopIds: stale.map((s) => s.shop.id),
    });
  }

  // Suspiciously cheap
  const prices = stores.map((s) => s.price.price).filter((x): x is number => x != null);
  const med = median(prices);
  if (med) {
    const cheap = stores.find((s) => s.price.price != null && s.price.price < med * 0.8 && (s.price.ageDays ?? 0) > 30);
    if (cheap)
      out.push({
        code: 'suspiciously_cheap',
        tone: 'warn',
        text: `قیمت ${cheap.shop.name} (${formatTomanShort(cheap.price.price)}) خیلی پایین‌تر از قیمت رایج (${formatTomanShort(med)}) و قدیمی است؛ احتمالاً به‌روز نیست.`,
        shopIds: [cheap.shop.id],
      });
  }

  // Trade-off cheapest vs nearest
  const cheapest = [...stores].filter((s) => s.price.price != null).sort((a, b) => a.price.price! - b.price.price!)[0];
  const nearest = [...stores].filter((s) => s.shop.distanceKm != null).sort((a, b) => a.shop.distanceKm! - b.shop.distanceKm!)[0];
  if (cheapest && nearest && cheapest.shop.id !== nearest.shop.id && nearest.price.price != null && cheapest.shop.distanceKm != null) {
    const diff = nearest.price.price - cheapest.price.price!;
    if (diff > 0)
      out.push({
        code: 'tradeoff',
        tone: 'info',
        text: `ارزان‌ترین (${cheapest.shop.name}) ${formatDistance(cheapest.shop.distanceKm)} فاصله دارد؛ نزدیک‌ترین (${nearest.shop.name}، ${formatDistance(nearest.shop.distanceKm)}) حدود ${formatTomanShort(diff)} گران‌تر است.`,
        shopIds: [cheapest.shop.id, nearest.shop.id],
      });
  }

  // Installment channel unknown
  if (ctx.installment) {
    const unknown = top.filter((s) => s.shop.payment.installment && s.shop.payment.options.every((o) => o.channel === 'unknown'));
    if (unknown.length)
      out.push({
        code: 'installment_channel_unknown',
        tone: 'info',
        text: `${fa(unknown.length)} فروشگاه قسطی ثبت کرده‌اند ولی مشخص نیست حضوری هم قسطی می‌فروشند یا نه؛ می‌توانم بپرسم.`,
        shopIds: unknown.map((s) => s.shop.id),
      });
  }

  // Traffic zone / metro
  const tz = res.areas.find((a) => a.inTrafficZone && a.storeCount >= 2);
  if (tz) {
    const metro = tz.nearestMetro ? `؛ مترو ${tz.nearestMetro.name} ${formatMinutes(tz.nearestMetro.walkMin)} پیاده تا آنجاست` : '';
    out.push({ code: 'traffic_zone', tone: 'info', text: `${tz.area} داخل طرح ترافیک است؛ با مترو یا تاکسی بروید${metro}.` });
  }

  const w = weekendInsight(ctx, now);
  if (w) out.unshift(w);
  return out.slice(0, 4);
}

export function productInsights(items: ProductSummary[], total: number, ctx: UserContext): Insight[] {
  const out: Insight[] = [];
  if (ctx.budgetMax && items.length && items.every((p) => p.priceMin != null && p.priceMin > ctx.budgetMax!)) {
    const cheapest = Math.min(...items.map((p) => p.priceMin!));
    out.push({
      code: 'budget_reality',
      tone: 'warn',
      text: `با بودجهٔ ${formatTomanShort(ctx.budgetMax)} مدلی پیدا نشد؛ ارزان‌ترین گزینه از ${formatTomanShort(cheapest)} شروع می‌شود.`,
      action: { label: `بودجه تا ${formatTomanShort(Math.ceil(cheapest / 1e6) * 1e6)}`, contextPatch: { budgetMax: Math.ceil(cheapest / 1e6) * 1e6 } },
    });
  }
  const single = items.filter((p) => p.sellerCount <= 1).length;
  if (items.length >= 4 && single >= items.length - 1 && total > 0) {
    out.push({ code: 'tradeoff', tone: 'info', text: 'بیشتر این مدل‌ها فقط یک فروشنده دارند؛ بهتر است فروشگاه‌هایی را پیدا کنیم که چند مدل را یک‌جا دارند.' });
  }
  return out;
}

export function planInsights(plan: VisitPlan): Insight[] {
  const out: Insight[] = [];
  const closed = plan.stops.filter((s) => s.openAtArrival.state === 'closed' || s.openAtArrival.state === 'opens_later_today');
  if (closed.length)
    out.push({
      code: 'closing_before_arrival',
      tone: 'warn',
      text: `${fa(closed.length)} توقف هنگام رسیدن بسته است (${closed.map((s) => s.shop.name).join('، ')}).`,
      shopIds: closed.map((s) => s.shop.id),
    });
  if (plan.trafficZone.anyStopInside && plan.trafficZone.note) out.push({ code: 'traffic_zone', tone: 'info', text: plan.trafficZone.note });
  return out;
}

/** One short Persian sentence from the best insight (for text replies). */
export function insightSentence(ins: Insight[]): string | null {
  const pick = ins.find((i) => i.tone === 'warn') ?? ins[0];
  return pick ? pick.text : null;
}
