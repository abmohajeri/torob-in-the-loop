/**
 * Per-request resolved context: visit moment (Tehran wall clock computed once), reference
 * location, travel mode, and a memo of ShopLite objects so each shop is materialized once per call.
 */
import type {
  InMallLocation,
  LatLng,
  OpenStateDetail,
  OpenStatus,
  ProviderCode,
  SearchRange,
  ShopLite,
  TravelMode,
  UserContext,
} from '@titl/shared';
import { DAY_ORDER, DEFAULT_NEARBY_KM, formatNumber, haversineKm, isRushHour, tehranParts, type TehranParts } from '@titl/shared';
import { isOpenState, minuteOfWeek, stateAt, statusFromParts, type StateAt } from '../domain/hours.js';
import { quickEta } from '../domain/travel.js';
import type { Core, ShopRec } from './core.js';

/** Data snapshot moment (meta.data_as_of). Price ages are measured against it (DESIGN-REVIEW D2). */
let catalogAsOf: Date | null = null;

export function setCatalogAsOf(iso: string | null | undefined): void {
  const d = iso ? new Date(iso) : null;
  catalogAsOf = d && !Number.isNaN(d.getTime()) ? d : null;
}

export function getCatalogAsOf(): Date | null {
  return catalogAsOf;
}

export interface ReqCtx {
  ctx: UserContext;
  now: Date;
  /** Reference moment for price ages: the data snapshot (falls back to now). */
  asOf: Date;
  /** Effective search range (ctx.range, or maxDistanceKm as a radius alias). */
  range: SearchRange | null;
  /** The moment open-status is evaluated for (ctx.visitAt or now). */
  at: Date;
  atIso: string;
  parts: TehranParts;
  mow: number;
  /** Visit time within ±10 minutes of now. */
  visitIsNow: boolean;
  location: LatLng | null;
  /** Label for distance reasons («نزدیک ونک»); null = the user's own position. */
  locationLabel: string | null;
  mode: TravelMode;
  rush: boolean;
  nearbyKm: number;
  lite: Map<number, ShopLite>;
}

export interface ResolveOpts {
  now?: Date;
  /** Override the reference location (e.g. «نزدیک ونک» in the query). */
  location?: { lat: number; lng: number; label: string | null } | null;
  asOf?: Date;
}

/** (SV6) Effective range: explicit `range`, else `maxDistanceKm` as a radius. */
export function rangeOf(c: UserContext): SearchRange | null {
  const r = c.range;
  if (r) {
    if (r.kind === 'radius' && !(r.km && r.km > 0)) return c.maxDistanceKm ? { kind: 'radius', km: c.maxDistanceKm } : null;
    if (r.kind === 'areas' && !r.areas?.length) return null;
    if (r.kind === 'time' && !(r.maxMinutes && r.maxMinutes > 0)) return null;
    if (r.kind === 'route' && !r.dest) return null;
    return r;
  }
  return c.maxDistanceKm ? { kind: 'radius', km: c.maxDistanceKm } : null;
}

const ROUTE_CORRIDOR_KM = 0.8;

/** Distance (km) from p to the segment a→b (equirectangular, fine at city scale). */
function segmentKm(p: LatLng, a: LatLng, b: LatLng): number {
  const kx = 111.32 * Math.cos((a.lat * Math.PI) / 180);
  const ky = 110.57;
  const ax = a.lng * kx, ay = a.lat * ky, bx = b.lng * kx, by = b.lat * ky, px = p.lng * kx, py = p.lat * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** (SV6) Is the shop inside the effective range? Ranges that need a location pass when it is unknown. */
export function inRange(rc: ReqCtx, s: { lat: number; lng: number; area: string | null }, mallArea?: string | null): boolean {
  const r = rc.range;
  if (!r) return true;
  switch (r.kind) {
    case 'radius':
      return !rc.location || haversineKm(rc.location, s) <= (r.km ?? Infinity);
    case 'areas':
      return !!r.areas && ((s.area !== null && r.areas.includes(s.area)) || (!!mallArea && r.areas.includes(mallArea)));
    case 'time':
      return !rc.location || quickEta(haversineKm(rc.location, s), rc.mode, rc.rush) <= (r.maxMinutes ?? Infinity);
    case 'route':
      return !rc.location || !r.dest || segmentKm(s, rc.location, r.dest) <= ROUTE_CORRIDOR_KM;
  }
}

/** Short Persian label of the range for chips / notices. */
export function rangeLabel(r: SearchRange): string {
  switch (r.kind) {
    case 'radius':
      return `شعاع ${r.km! < 1 ? `${formatNumber(Math.round(r.km! * 1000))} متر` : `${formatNumber(r.km!)} کیلومتر`}`;
    case 'areas':
      return `محدوده: ${(r.areas ?? []).join('، ')}`;
    case 'time':
      return `حداکثر ${formatNumber(r.maxMinutes!)} دقیقه راه`;
    case 'route':
      return `سر راه${r.dest?.label ? ` ${r.dest.label}` : ''}`;
  }
}

export function resolveCtx(ctx: UserContext | undefined, opts: ResolveOpts = {}): ReqCtx {
  const c = ctx ?? {};
  const now = opts.now ?? new Date();
  let at = now;
  if (c.visitAt) {
    const d = new Date(c.visitAt);
    if (!Number.isNaN(d.getTime())) at = d;
  }
  const parts = tehranParts(at);
  let location: LatLng | null = c.location ? { lat: c.location.lat, lng: c.location.lng } : null;
  let locationLabel: string | null = null;
  if (c.location && c.location.source !== 'gps' && c.location.label) locationLabel = c.location.label;
  if (opts.location) {
    location = { lat: opts.location.lat, lng: opts.location.lng };
    locationLabel = opts.location.label;
  }
  return {
    ctx: c,
    now,
    asOf: opts.asOf ?? catalogAsOf ?? now,
    range: rangeOf(c),
    at,
    atIso: at.toISOString(),
    parts,
    mow: minuteOfWeek(parts),
    visitIsNow: Math.abs(at.getTime() - now.getTime()) <= 10 * 60_000,
    location,
    locationLabel,
    mode: c.travelMode ?? 'taxi',
    rush: isRushHour(at),
    nearbyKm: c.maxDistanceKm ?? DEFAULT_NEARBY_KM,
    lite: new Map(),
  };
}

export function distanceTo(rc: ReqCtx, p: LatLng): number | null {
  return rc.location ? haversineKm(rc.location, p) : null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const WEEK_MIN = 10080;

/** Minutes of travel to the shop (0 without a location). Arrival = visit time + this (SV5). */
export function etaTo(rc: ReqCtx, s: { lat: number; lng: number }): number {
  if (!rc.location) return 0;
  return quickEta(haversineKm(rc.location, s), rc.mode, rc.rush);
}

/** Minute-of-week at arrival. */
export function arrivalMow(rc: ReqCtx, s: { lat: number; lng: number }): number {
  return (rc.mow + etaTo(rc, s)) % WEEK_MIN;
}

/** State at ARRIVAL (visitAt + eta) — used for ranking, badges, filters, alternatives (SV5). */
export function shopState(rc: ReqCtx, s: ShopRec): StateAt {
  return stateAt(s.compiled, arrivalMow(rc, s));
}

export function detailOf(state: OpenStatus['state']): OpenStateDetail {
  switch (state) {
    case 'open':
      return 'open';
    case 'closing_soon':
      return 'closing_soon';
    case 'opens_later_today':
      return 'between_shifts';
    case 'closed':
      return 'closed_today';
    default:
      return 'unknown';
  }
}

export function shopOpenAtVisit(rc: ReqCtx, s: ShopRec): boolean {
  return isOpenState(shopState(rc, s).state);
}

/** Full status at ARRIVAL (visitAt + eta), with `detail` (SV5). */
export function shopStatus(rc: ReqCtx, s: ShopRec): OpenStatus {
  const eta = etaTo(rc, s);
  let st: OpenStatus;
  if (eta <= 0) st = statusFromParts(s.compiled, rc.parts, rc.atIso);
  else {
    const mow = (rc.mow + eta) % WEEK_MIN;
    const parts: TehranParts = { ...rc.parts, weekday: DAY_ORDER[Math.floor(mow / 1440)]!, minutes: mow % 1440, hour: Math.floor((mow % 1440) / 60), minute: mow % 60 };
    st = statusFromParts(s.compiled, parts, new Date(rc.at.getTime() + eta * 60_000).toISOString());
  }
  st.detail = detailOf(st.state);
  return st;
}

export function locationOf(s: ShopRec): InMallLocation {
  const g = s.guide;
  return {
    mall: g.mall,
    floorLabel: g.floorLabel,
    floorNum: g.floorNum,
    unit: g.unit,
    plaque: g.plaque,
    wing: g.wing,
    landmark: g.landmark,
    guide: g.guide,
    confidence: g.confidence,
    hints: g.hints,
  };
}

export function toShopLite(core: Core, rc: ReqCtx, s: ShopRec): ShopLite {
  const cached = rc.lite.get(s.rid);
  if (cached) return cached;
  const km = distanceTo(rc, s);
  const lite: ShopLite = {
    id: s.id,
    name: s.name,
    nameIsReal: s.nameIsReal,
    area: s.area,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    distanceKm: km === null ? null : round2(km),
    etaMin: km === null ? null : quickEta(km, rc.mode, rc.rush),
    location: locationOf(s),
    openStatus: shopStatus(rc, s),
    payment: s.payment,
    hasOffers: s.offerCount > 0,
    tier: s.tier,
    updateDiscipline: s.updateDiscipline,
    installmentTier: s.installmentTier,
  };
  void core;
  rc.lite.set(s.rid, lite);
  return lite;
}

/** Does the shop satisfy the payment requirements of the context? null = context asks nothing. */
export function paymentMatch(ctx: UserContext, s: ShopRec): { matched: boolean; label: string } | null {
  const wanted: ProviderCode[] = ctx.providers ?? [];
  if (!ctx.installment && !wanted.length) return null;
  if (wanted.length) {
    const hit = s.payment.options.find((o) => wanted.includes(o.provider));
    if (hit) return { matched: true, label: `${hit.label}${hit.channel === 'in_person' ? ' (حضوری)' : ''}` };
    return { matched: false, label: 'روش پرداخت درخواستی ثبت نشده' };
  }
  if (s.payment.installment) {
    const p = s.payment.options.find((o) => o.provider !== 'other');
    return { matched: true, label: p ? `قسطی با ${p.label}` : 'قسطی' };
  }
  return { matched: false, label: 'اقساط ثبت نشده' };
}
