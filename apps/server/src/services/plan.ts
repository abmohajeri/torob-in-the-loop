/**
 * Visit plan: ordered stops with travel legs, open-at-arrival status, dwell time, per-stop and
 * plan-wide warnings, «leave by» time, metro and in-mall tips (docs/ARCHITECTURE.md §6 plan).
 */
import { randomUUID } from 'node:crypto';
import type { LatLng, MetroStationRef, PlanStop, ProductSummary, Reason, StoreOffer, TravelMode, UserContext, VisitPlan, VisitPlanRequest } from '@titl/shared';
import {
  DAY_NAMES_FA,
  addMinutes,
  formatClock,
  formatMinutes,
  formatNumber,
  isRushHour,
  minutesToHHMM,
  navLinksFor,
  tehranParts,
} from '@titl/shared';
import { isDayClosed, isOpenState, minuteOfWeek, openStatusAt, shortThursdayClose, stateAt } from '../domain/hours.js';
import { orderStops } from '../domain/route.js';
import { linesLabel, travelEstimate } from '../domain/travel.js';
import type { Core, ShopRec } from './core.js';
import { locationOf, resolveCtx, toShopLite } from './context.js';
import { basicReasons, productRowById, sellerGeo, summarize } from './products.js';
import { buildStoreOffers } from './stores.js';

const BASE_DWELL = 10;
const EXTRA_PRODUCT_DWELL = 5;
const MAX_STOPS = 12;

interface StopIn {
  shop: ShopRec;
  productIds: string[];
}

export function plan(core: Core, req: VisitPlanRequest, ctx: UserContext = {}): VisitPlan {
  const rc = resolveCtx(ctx);
  const departAt = req.departAt && !Number.isNaN(Date.parse(req.departAt)) ? new Date(req.departAt) : rc.at;
  const mode: TravelMode = req.mode ?? ctx.travelMode ?? 'taxi';
  const origin: LatLng | null = req.origin ?? rc.location;

  // dedupe shops (several products in one shop = one stop with a longer dwell)
  const stopsIn: StopIn[] = [];
  const byShop = new Map<string, StopIn>();
  for (const s of req.stops.slice(0, MAX_STOPS * 2)) {
    const shop = core.shopsById.get(s.shopId);
    if (!shop) continue;
    let st = byShop.get(shop.id);
    if (!st) {
      if (stopsIn.length >= MAX_STOPS) continue;
      st = { shop, productIds: [] };
      byShop.set(shop.id, st);
      stopsIn.push(st);
    }
    if (s.productId && !st.productIds.includes(s.productId)) st.productIds.push(s.productId);
  }

  const order = req.keepOrder
    ? stopsIn.map((_, i) => i)
    : orderStops(
        stopsIn.map((s) => ({ lat: s.shop.lat, lng: s.shop.lng, mallId: s.shop.mallId, floorNum: s.shop.floorNum, unit: s.shop.unit, plaque: s.shop.plaque })),
        origin,
      );

  // per-request rc at departure for ShopLite distances (from origin)
  const liteRc = resolveCtx({ ...ctx, ...(origin ? { location: { ...origin, label: ctx.location?.label ?? '', source: ctx.location?.source ?? 'map' } } : {}), visitAt: departAt.toISOString(), travelMode: mode });

  const stops: PlanStop[] = [];
  let t = departAt;
  let prev: LatLng | null = origin;
  let totalKm = 0;
  let minSlack = Infinity;
  let leaveByOk = true;
  const metroLegs: string[] = [];
  for (const idx of order) {
    const sIn = stopsIn[idx]!;
    const shop = sIn.shop;
    let leg: PlanStop['legFromPrev'] = null;
    if (prev) {
      const est = travelEstimate(prev, shop, mode, t, core.metro);
      leg = { distanceKm: Math.round(est.distanceKm * 100) / 100, minutes: est.minutes, mode: est.mode };
      totalKm += est.distanceKm;
      if (est.mode === 'metro' && est.fromStation && est.toStation) {
        metroLegs.push(`از ایستگاه ${est.fromStation.name} تا ${est.toStation.name}${est.toStation.lines.length ? ` (${linesLabel(est.toStation.lines)})` : ''}`);
      }
      t = addMinutes(t, est.minutes);
    }
    const arrive = t;
    const status = openStatusAt(shop.compiled, arrive);
    const dwell = BASE_DWELL + EXTRA_PRODUCT_DWELL * Math.max(0, sIn.productIds.length - 1);
    const warnings = stopWarnings(shop, arrive, status, dwell);

    // leave-by slack: minutes we could still delay departure with this stop open for the whole dwell
    const st = stateAt(shop.compiled, minuteOfWeek(tehranParts(arrive)));
    if (isOpenState(st.state)) {
      if (!st.allDay && st.minutesToClose !== undefined) minSlack = Math.min(minSlack, st.minutesToClose - dwell);
    } else leaveByOk = false;

    let product: ProductSummary | null = null;
    let offer: StoreOffer | null = null;
    const pid = sIn.productIds[0];
    if (pid) {
      const row = productRowById(core, pid);
      if (row) {
        const geo = sellerGeo(core, liteRc, row.rid);
        product = summarize(core, liteRc, row, basicReasons(row, geo, liteRc), geo);
        offer = buildStoreOffers(core, liteRc, row, { filter: false, onlyShops: new Set([shop.id]) }).stores[0] ?? null;
        if (!offer) warnings.push({ code: 'no_offer', label: 'این فروشگاه این کالا را ثبت نکرده؛ موجودی را بپرسید', tone: 'warn' });
      }
    }
    const lite = { ...toShopLite(core, liteRc, shop), openStatus: status };
    stops.push({
      order: stops.length + 1,
      shop: lite,
      product,
      offer,
      legFromPrev: leg,
      arriveAt: arrive.toISOString(),
      openAtArrival: status,
      dwellMin: dwell,
      warnings,
      guide: locationOf(shop),
    });
    t = addMinutes(arrive, dwell);
    prev = shop;
  }

  const totalMinutes = Math.round((t.getTime() - departAt.getTime()) / 60_000);
  let leaveBy: string | null = null;
  if (stops.length && leaveByOk && Number.isFinite(minSlack) && minSlack >= 0) leaveBy = addMinutes(departAt, minSlack).toISOString();

  // plan-wide warnings & tips
  const warnings: Reason[] = [];
  const parts = tehranParts(departAt);
  if (parts.weekday === 'fri') warnings.push({ code: 'friday', label: 'جمعه است؛ بیشتر فروشگاه‌ها و پاساژها تعطیل‌اند', tone: 'warn' });
  if (parts.weekday === 'thu') warnings.push({ code: 'thursday', label: 'پنجشنبه‌ها برخی فروشگاه‌ها زودتر می‌بندند', tone: 'info' });
  if ((mode === 'taxi' || mode === 'car') && isRushHour(departAt)) {
    warnings.push({ code: 'rush', label: 'ساعت اوج ترافیک است؛ زمان‌ها با ترافیک سنگین تخمین زده شده‌اند', tone: 'info' });
  }
  const closedStops = stops.filter((s) => !isOpenState(s.openAtArrival.state) && s.openAtArrival.state !== 'unknown').length;
  if (closedStops) warnings.push({ code: 'closed_stops', label: `${formatNumber(closedStops)} فروشگاه هنگام رسیدن شما باز نیست`, tone: 'bad' });
  const unknownStops = stops.filter((s) => s.openAtArrival.state === 'unknown').length;
  if (unknownStops) warnings.push({ code: 'unknown_hours', label: `ساعت کاری ${formatNumber(unknownStops)} فروشگاه ثبت نشده؛ قبل از رفتن تماس بگیرید`, tone: 'warn' });
  const anyInside = stopsIn.some((s) => s.shop.inTrafficZone);
  let zoneNote: string | null = null;
  if (anyInside) {
    zoneNote =
      mode === 'car'
        ? 'بخشی از مسیر در محدوده طرح ترافیک است؛ با خودروی شخصی به مجوز نیاز دارید — مترو یا تاکسی راحت‌تر است'
        : 'بخشی از مسیر در محدوده طرح ترافیک است؛ مترو یا تاکسی بهترین گزینه است';
    if (mode === 'car') warnings.push({ code: 'traffic_zone', label: 'محدوده طرح ترافیک', tone: 'warn' });
  }

  const tips: string[] = [];
  const metro: MetroStationRef[] = [];
  const seen = new Set<string>();
  for (const s of stops) {
    const m = core.metro.nearest(s.shop, 1, 1.5)[0];
    if (m && !seen.has(m.name)) {
      seen.add(m.name);
      metro.push(m);
    }
  }
  if (metroLegs.length) tips.push(...metroLegs.slice(0, 2).map((l) => `مترو: ${l}`));
  else if (metro[0]) {
    const m = metro[0];
    tips.push(`نزدیک‌ترین ایستگاه مترو به اولین فروشگاه: ${m.name}${m.lines.length ? ` (${linesLabel(m.lines)})` : ''} — ${formatMinutes(m.walkMin)} پیاده`);
  }
  const mallCounts = new Map<number, number>();
  for (const s of stopsIn) if (s.shop.mallId !== null) mallCounts.set(s.shop.mallId, (mallCounts.get(s.shop.mallId) ?? 0) + 1);
  for (const [mid, n] of mallCounts) {
    if (n < 2) continue;
    const name = core.malls.get(mid)?.name ?? 'پاساژ';
    tips.push(`${formatNumber(n)} فروشگاه در «${name}» پشت سر هم چیده شده‌اند؛ از طبقه پایین به بالا بروید تا مسیرتان کوتاه شود`);
  }
  if (leaveBy) tips.push(`برای اینکه همه فروشگاه‌ها باز باشند، تا ساعت ${formatClock(minutesToHHMM(tehranParts(leaveBy).minutes))} راه بیفتید`);
  if (stops.some((s) => s.offer && (s.offer.price.freshness === 'stale' || s.offer.price.freshness === 'very_stale'))) {
    tips.push('برخی قیمت‌ها قدیمی‌اند؛ پیش از رفتن با «استعلام» موجودی و قیمت را بپرسید');
  }

  const first = stops[0];
  return {
    id: `plan_${randomUUID().slice(0, 8)}`,
    createdAt: rc.now.toISOString(),
    departAt: departAt.toISOString(),
    leaveBy,
    mode,
    origin,
    stops,
    totalMinutes,
    totalDistanceKm: Math.round(totalKm * 100) / 100,
    warnings,
    tips,
    trafficZone: { anyStopInside: anyInside, note: zoneNote },
    metro: metro.slice(0, 4),
    navLinks: navLinksFor(first ? first.shop : origin ?? { lat: 35.6985, lng: 51.4145 }, first?.shop.name ?? ''),
  };
}

export function stopWarnings(shop: ShopRec, arrive: Date, status: ReturnType<typeof openStatusAt>, dwell: number): Reason[] {
  const out: Reason[] = [];
  const day = tehranParts(arrive).weekday;
  if (status.state === 'closed' || status.state === 'opens_later_today') {
    out.push({ code: 'closed_at_arrival', label: `هنگام رسیدن بسته است — ${status.label.replace(/^بسته — /, '')}`, tone: 'bad' });
  } else if (isOpenState(status.state) && status.minutesToClose !== undefined && status.minutesToClose <= Math.max(30, dwell)) {
    out.push({ code: 'closing_soon', label: `${formatNumber(status.minutesToClose)} دقیقه بعد از رسیدن می‌بندد`, tone: 'warn' });
  } else if (status.state === 'unknown') {
    out.push({ code: 'hours_unknown', label: 'ساعت کاری ثبت نشده — قبل از رفتن بپرسید', tone: 'warn' });
  }
  if (day === 'fri' && isDayClosed(shop.hours, 'fri')) out.push({ code: 'friday', label: 'جمعه‌ها تعطیل است', tone: 'bad' });
  if (day === 'thu') {
    const c = shortThursdayClose(shop.hours);
    if (c !== null) out.push({ code: 'thursday', label: `${DAY_NAMES_FA.thu}\u200cها زودتر می‌بندد (ساعت ${formatClock(minutesToHHMM(c % 1440))})`, tone: 'info' });
  }
  return out;
}
