/**
 * Walkable clusters (SV7), the never-empty nearest-cluster notice (SV6) and visit-time helpers
 * (SV5: soonest opening, next good window). All open checks are evaluated at ARRIVAL time.
 */
import type { ClusterSummary, GoodWindow, NearestClusterNotice, SoonestOpening, TravelMode } from '@titl/shared';
import { DAY_NAMES_FA, DAY_ORDER, TRAVEL_MODE_META, formatClock, formatNumber, haversineKm, minutesToHHMM } from '@titl/shared';
import { isOpenState, stateAt } from '../domain/hours.js';
import { quickEta, walkMinutes } from '../domain/travel.js';
import type { Core, ShopRec } from './core.js';
import { arrivalMow, rangeLabel, round2, type ReqCtx } from './context.js';

export const CLUSTER_LINK_KM = 0.3;
const MAX_CLUSTER_INPUT = 800;
const WEEK_MIN = 10080;

export interface ClusterItem {
  shop: ShopRec;
  price: number | null;
}

/** Single-link clustering (≤ 300 m) of stores, biggest walkable groups first. */
export function clusterStores(core: Core, rc: ReqCtx, items: ClusterItem[], linkKm = CLUSTER_LINK_KM): ClusterSummary[] {
  const list = items.slice(0, MAX_CLUSTER_INPUT);
  const n = list.length;
  const parent = list.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = list[i]!.shop;
      const b = list[j]!.shop;
      // cheap reject before haversine (≈ 0.0027° lat per 300 m)
      if (Math.abs(a.lat - b.lat) > linkKm / 100 || Math.abs(a.lng - b.lng) > linkKm / 80) continue;
      if (haversineKm(a, b) <= linkKm) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, ClusterItem[]>();
  list.forEach((it, i) => {
    const r = find(i);
    const g = groups.get(r) ?? [];
    g.push(it);
    groups.set(r, g);
  });
  const out: ClusterSummary[] = [];
  for (const g of groups.values()) out.push(summarizeCluster(core, rc, g));
  out.sort((a, b) => b.storeCount - a.storeCount || (a.etaFromUser ?? 1e9) - (b.etaFromUser ?? 1e9));
  return out;
}

function mostCommon(values: (string | null | undefined)[]): string | null {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  let best: string | null = null;
  let bn = 0;
  for (const [k, c] of m) if (c > bn) [best, bn] = [k, c];
  return best;
}

function summarizeCluster(core: Core, rc: ReqCtx, g: ClusterItem[]): ClusterSummary {
  const lat = g.reduce((s, x) => s + x.shop.lat, 0) / g.length;
  const lng = g.reduce((s, x) => s + x.shop.lng, 0) / g.length;
  const centroid = { lat: round2x(lat), lng: round2x(lng) };
  const mall = mostCommon(g.map((x) => (x.shop.mallId !== null ? core.malls.get(x.shop.mallId)?.name : null)));
  const area = mostCommon(g.map((x) => x.shop.area));
  const label = mall && area && !mall.includes(area) ? `${mall} (${area})` : mall ?? area ?? 'نامشخص';
  const prices = g.map((x) => x.price).filter((p): p is number => p !== null);
  const openAtVisit = g.filter((x) => isOpenState(stateAt(x.shop.compiled, arrivalMow(rc, x.shop)).state)).length;
  const d = rc.location ? haversineKm(rc.location, centroid) : null;
  let spread = 0;
  for (const x of g) spread = Math.max(spread, haversineKm(centroid, x.shop) * 2);
  const spreadM = Math.max(50, Math.round((spread * 1000) / 50) * 50);
  const n = g.length;
  const text =
    n >= 2
      ? `بهترین جا برای خرید حضوری: ${formatNumber(n)} فروشنده در ${formatNumber(spreadM)} متر — با ${formatNumber(Math.max(2, walkMinutes(spread)))} دقیقه پیاده‌روی حضوری مقایسه کنید`
      : `۱ فروشنده در ${label}`;
  return {
    id: `c_${g.map((x) => x.shop.rid).sort((a, b) => a - b)[0]}`,
    centroid,
    label,
    storeCount: n,
    shopIds: g.map((x) => x.shop.id),
    priceMin: prices.length ? Math.min(...prices) : null,
    priceMax: prices.length ? Math.max(...prices) : null,
    openAtVisit,
    etaFromUser: d === null ? null : quickEta(d, rc.mode, rc.rush),
    distanceKm: d === null ? null : round2(d),
    text,
  };
}

function round2x(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * SV6: nothing inside the range → nearest cluster outside it, with the two actions
 * [محدوده را تا آنجا گسترش بده] [از فروشگاه‌های دسته‌مرتبط همین‌جا بپرس].
 */
export function nearestClusterNotice(core: Core, rc: ReqCtx, outside: ClusterItem[]): NearestClusterNotice | null {
  if (!outside.length || !rc.location) return null;
  const clusters = clusterStores(core, rc, outside);
  if (!clusters.length) return null;
  // nearest, but prefer a real cluster (≥ 3 stores) when it is at most 1.5× farther
  const byDist = [...clusters].sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
  const nearest = byDist[0]!;
  const dense = byDist.find((c) => c.storeCount >= 3 && (c.distanceKm ?? 1e9) <= (nearest.distanceKm ?? 0) * 1.5 + 0.5);
  const c = dense ?? nearest;
  const mode: TravelMode = rc.mode;
  const km = Math.ceil(((c.distanceKm ?? 0) + 0.5) * 2) / 2;
  const r = rc.range;
  const inRangeLabel = r ? ` (${rangeLabel(r)})` : '';
  return {
    text: `در محدودهٔ انتخابی${inRangeLabel} فروشنده‌ای ثبت نشده. نزدیک‌ترین خوشه: ${c.label} — ${formatNumber(c.storeCount)} فروشنده، حدود ${formatNumber(c.etaFromUser ?? 0)} دقیقه با ${TRAVEL_MODE_META[mode].label}`,
    cluster: c,
    actions: [
      { id: 'expand_range', label: 'محدوده را تا آنجا گسترش بده', contextPatch: { range: { kind: 'radius', km }, maxDistanceKm: km } },
      { id: 'ask_category_shops', label: 'از فروشگاه‌های دسته‌مرتبط همین‌جا بپرس' },
    ],
  };
}

function dayWord(rc: ReqCtx, absMinFromNow: number): string {
  const startDay = Math.floor(rc.mow / 1440);
  const targetMow = rc.mow + absMinFromNow;
  const diff = Math.floor(targetMow / 1440) - startDay;
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  return DAY_NAMES_FA[DAY_ORDER[Math.floor(targetMow / 1440) % 7]!];
}

/** SV5: the soonest opening (at arrival) among shops that are not open; null when one is open or none reopens. */
export function soonestOpening(core: Core, rc: ReqCtx, shops: ShopRec[]): SoonestOpening | null {
  let best: { shop: ShopRec; wait: number; abs: number } | null = null;
  for (const s of shops) {
    const mow = arrivalMow(rc, s);
    const st = stateAt(s.compiled, mow);
    if (isOpenState(st.state)) return null;
    if (st.opensAbs === undefined) continue;
    const wait = st.opensAbs - (mow + WEEK_MIN);
    if (wait > 0 && (!best || wait < best.wait)) best = { shop: s, wait, abs: st.opensAbs };
  }
  if (!best) return null;
  const s = best.shop;
  const where = (s.mallId !== null ? core.malls.get(s.mallId)?.name : null) ?? s.area ?? s.name;
  const clock = formatClock(minutesToHHMM(best.abs % 1440));
  const eta = rc.location ? arrivalMow(rc, s) - rc.mow : 0;
  return {
    at: new Date(rc.at.getTime() + (best.wait + Math.max(0, eta)) * 60_000).toISOString(),
    shopId: s.id,
    text: `${rc.visitIsNow ? 'الان' : 'در زمان مراجعه'} هیچ فروشنده‌ای باز نیست؛ زودترین بازگشایی: ${dayWord(rc, best.wait + Math.max(0, eta))} ${clock} — ${where}`,
  };
}

export const GOOD_WINDOW_SHARE = 0.7;
export const LOW_OPEN_SHARE = 0.35;

/** Share (0..1) of shops with declared hours that are open at arrival; null when none declared. */
export function openShareAtArrival(rc: ReqCtx, shops: ShopRec[]): number | null {
  const known = shops.filter((s) => s.compiled);
  if (!known.length) return null;
  return known.filter((s) => isOpenState(stateAt(s.compiled, arrivalMow(rc, s)).state)).length / known.length;
}

/**
 * SV5: when < 35 % of the relevant shops are open at arrival, the next 30-min slot (within 7 days)
 * where ≥ 70 % of them are open. Never shifts anything by itself — the UI offers a one-tap shift.
 */
export function nextGoodWindow(rc: ReqCtx, shops: ShopRec[]): GoodWindow | null {
  const known = shops.filter((s) => s.compiled).slice(0, 400);
  if (known.length < 2) return null;
  const share0 = openShareAtArrival(rc, known);
  if (share0 === null || share0 >= LOW_OPEN_SHARE) return null;
  const start = Math.ceil(rc.mow / 30) * 30;
  for (let t = start; t < rc.mow + WEEK_MIN; t += 30) {
    const mow = t % WEEK_MIN;
    const open = known.filter((s) => isOpenState(stateAt(s.compiled, mow).state)).length;
    const share = open / known.length;
    if (share >= GOOD_WINDOW_SHARE) {
      const ahead = t - rc.mow;
      const clock = formatClock(minutesToHHMM(mow % 1440));
      return {
        at: new Date(rc.at.getTime() + ahead * 60_000).toISOString(),
        openShare: Math.round(share * 100) / 100,
        label: `${dayWord(rc, ahead)} ساعت ${clock} — ${formatNumber(Math.round(share * 100))}٪ این فروشگاه‌ها باز هستند`,
      };
    }
  }
  return null;
}
