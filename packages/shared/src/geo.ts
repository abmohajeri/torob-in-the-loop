import type { LatLng, NavLinks, TravelMode } from './types.js';

const R_KM = 6371.0088;
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Ray-casting point-in-polygon; polygon as [lat, lng] pairs. */
export function pointInPolygon(p: LatLng, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]!;
    const [yj, xj] = polygon[j]!;
    const intersect = yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * APPROXIMATE outline of Tehran's central traffic-restricted zone (طرح ترافیک), [lat, lng].
 * Bounded roughly by Motahari/Beheshti (N), Shohada/17 Shahrivar (E), Shoush/Molavi (S), Kargar (W).
 * Used only for advisory copy ("محدوده تقریبی طرح ترافیک"); never for hard decisions.
 */
export const TRAFFIC_ZONE_APPROX: [number, number][] = [
  [35.7285, 51.3885],
  [35.7285, 51.4455],
  [35.6955, 51.4475],
  [35.6655, 51.4425],
  [35.6655, 51.3935],
  [35.6905, 51.3885],
];

export function inTrafficZone(p: LatLng): boolean {
  return pointInPolygon(p, TRAFFIC_ZONE_APPROX);
}

/** Default map center: downtown Tehran (Ferdowsi / Jomhouri commercial district). */
export const TEHRAN_CENTER: LatLng = { lat: 35.6985, lng: 51.4145 };

/** Road distance ≈ straight-line × detour factor. */
export const DETOUR_FACTOR: Record<TravelMode, number> = { walk: 1.25, metro: 1.3, taxi: 1.4, car: 1.4 };

/**
 * Rough door-to-door travel time estimate (minutes). Labeled «تخمینی» in UI.
 * metro: assumes stations near both ends; callers with station data should prefer their own estimate.
 */
export function estimateTravelMinutes(distanceKm: number, mode: TravelMode, rushHour = false): number {
  const road = distanceKm * DETOUR_FACTOR[mode];
  switch (mode) {
    case 'walk':
      return Math.max(1, (road / 4.5) * 60);
    case 'metro':
      return road < 1.2 ? (road / 4.5) * 60 : 12 + (road / 28) * 60 + 6;
    case 'taxi':
      return (rushHour ? 6 : 4) + (road / (rushHour ? 13 : 20)) * 60;
    case 'car':
      return (rushHour ? 10 : 7) + (road / (rushHour ? 13 : 20)) * 60;
  }
}

/** Navigation links. `geo:` opens the user's installed map app (Neshan / Balad / Google) on Android. */
export function navLinksFor(p: LatLng, label = ''): NavLinks {
  const ll = `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const q = label ? `(${encodeURIComponent(label)})` : '';
  return {
    geo: `geo:${ll}?q=${ll}${q}`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    neshan: `https://neshan.org/maps/@${ll},17z,0p`,
    balad: `https://balad.ir/location?latitude=${p.lat.toFixed(6)}&longitude=${p.lng.toFixed(6)}&zoom=17`,
  };
}
