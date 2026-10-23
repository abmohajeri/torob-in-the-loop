/**
 * Travel estimates (pure). Times are rough, labeled «تخمینی» in the UI. Metro uses the nearest
 * stations at both ends (OSM data); when either end is farther than 1.5 km from a station we
 * fall back to taxi and say so.
 */
import type { LatLng, MetroStationRef, TravelMode } from '@titl/shared';
import { DETOUR_FACTOR, estimateTravelMinutes, haversineKm, isRushHour } from '@titl/shared';

export const MAX_STATION_WALK_KM = 1.5;
/** Legs shorter than this are walked whatever the chosen mode (nobody takes a taxi for 300 m). */
export const WALK_THRESHOLD_KM = 0.7;
const WALK_KMH = 4.5;
const METRO_KMH = 30;
const METRO_ENTRY_WAIT_MIN = 6;
const METRO_TRANSFER_MIN = 7;

export interface MetroLine {
  ref: string;
  color: string;
}

export interface MetroStation {
  id: number;
  name: string;
  nameEn: string | null;
  lat: number;
  lng: number;
  lines: MetroLine[];
}

export function walkMinutes(km: number): number {
  return Math.max(1, Math.round(((km * DETOUR_FACTOR.walk) / WALK_KMH) * 60));
}

export class MetroIndex {
  constructor(readonly stations: MetroStation[]) {}

  get size(): number {
    return this.stations.length;
  }

  nearest(p: LatLng, limit = 3, maxKm = Number.POSITIVE_INFINITY): MetroStationRef[] {
    if (!this.stations.length || limit <= 0) return [];
    const scored: { s: MetroStation; d: number }[] = [];
    for (const s of this.stations) {
      const d = haversineKm(p, s);
      if (d <= maxKm) scored.push({ s, d });
    }
    scored.sort((a, b) => a.d - b.d);
    return scored.slice(0, limit).map(({ s, d }) => toRef(s, d));
  }
}

export function toRef(s: MetroStation, distanceKm: number): MetroStationRef {
  return {
    name: s.name,
    nameEn: s.nameEn,
    lines: s.lines,
    lat: s.lat,
    lng: s.lng,
    distanceKm: Math.round(distanceKm * 100) / 100,
    walkMin: walkMinutes(distanceKm),
  };
}

export interface TravelEstimate {
  /** Mode actually used for the estimate (may differ from the requested one). */
  mode: TravelMode;
  requestedMode: TravelMode;
  /** Straight-line distance. */
  distanceKm: number;
  minutes: number;
  /** Persian note when we changed the mode or made a notable assumption. */
  note: string | null;
  fromStation?: MetroStationRef;
  toStation?: MetroStationRef;
}

/** Persian line list: «خط ۱ و ۴». */
export function linesLabel(lines: MetroLine[]): string {
  const refs = [...new Set(lines.map((l) => l.ref).filter(Boolean))];
  if (!refs.length) return '';
  const fa = refs.map((r) => r.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!));
  return `خط ${fa.length > 1 ? `${fa.slice(0, -1).join('، ')} و ${fa[fa.length - 1]}` : fa[0]}`;
}

export function travelEstimate(
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  at: Date | string = new Date(),
  metro?: MetroIndex | null,
): TravelEstimate {
  const km = haversineKm(from, to);
  const rush = isRushHour(at);
  const base = (m: TravelMode, note: string | null = null): TravelEstimate => ({
    mode: m,
    requestedMode: mode,
    distanceKm: km,
    minutes: Math.max(1, Math.round(estimateTravelMinutes(km, m, rush))),
    note,
  });
  if (mode === 'walk') return base('walk');
  if (km <= WALK_THRESHOLD_KM) return { ...base('walk'), note: 'فاصله کوتاه است؛ پیاده بروید' };
  if (mode !== 'metro') return base(mode);
  if (!metro || !metro.size) return base('taxi', 'اطلاعات مترو در دسترس نیست؛ زمان با تاکسی تخمین زده شد');
  const a = metro.nearest(from, 1)[0];
  const b = metro.nearest(to, 1)[0];
  if (!a || !b || a.distanceKm > MAX_STATION_WALK_KM || b.distanceKm > MAX_STATION_WALK_KM) {
    return base('taxi', 'ایستگاه مترو در فاصله پیاده‌روی نیست؛ زمان با تاکسی تخمین زده شد');
  }
  if (a.name === b.name) return { ...base('walk'), note: 'هر دو نقطه نزدیک یک ایستگاه‌اند؛ پیاده بروید' };
  const rideKm = haversineKm(a, b) * DETOUR_FACTOR.metro;
  const shared = a.lines.some((l) => b.lines.some((m) => m.ref === l.ref));
  const minutes =
    a.walkMin + METRO_ENTRY_WAIT_MIN + (rideKm / METRO_KMH) * 60 + (shared || !a.lines.length || !b.lines.length ? 0 : METRO_TRANSFER_MIN) + b.walkMin;
  const walkAlt = walkMinutes(km);
  if (walkAlt <= minutes) return { ...base('walk'), note: 'پیاده‌روی از مترو سریع‌تر است' };
  return {
    mode: 'metro',
    requestedMode: mode,
    distanceKm: km,
    minutes: Math.max(1, Math.round(minutes)),
    note: null,
    fromStation: a,
    toStation: b,
  };
}

/** Quick ETA (minutes) for list views — no metro station lookup unless provided. */
export function quickEta(km: number, mode: TravelMode, rush: boolean): number {
  if (mode !== 'walk' && km <= WALK_THRESHOLD_KM) return walkMinutes(km);
  return Math.max(1, Math.round(estimateTravelMinutes(km, mode, rush)));
}
