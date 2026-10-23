/**
 * Location gazetteer (areas, landmarks, metro stations, malls) and reverse lookup.
 */
import type { LatLng, Place } from '@titl/shared';
import { haversineKm, normalizeForSearch } from '@titl/shared';
import type { Core, PlaceRec } from './core.js';

const KIND_BONUS: Record<Place['kind'], number> = { area: 0.3, landmark: 0.2, mall: 0.1, metro: 0 };

function toPlace(p: PlaceRec): Place {
  const out: Place = { id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng };
  if (p.subtitle) out.subtitle = p.subtitle;
  return out;
}

export function places(core: Core, q: string, limit = 10): Place[] {
  const n = Math.min(50, Math.max(1, limit));
  const qn = normalizeForSearch(q);
  if (!qn) {
    return [...core.places]
      .sort((a, b) => b.weight + KIND_BONUS[b.kind] - (a.weight + KIND_BONUS[a.kind]))
      .slice(0, n)
      .map(toPlace);
  }
  const tokens = qn.split(' ');
  const scored: { p: PlaceRec; s: number }[] = [];
  for (const p of core.places) {
    const name = p.nameNorm;
    let s: number;
    if (name === qn) s = 4;
    else if (name.startsWith(qn)) s = 3;
    else if (name.split(' ').some((w) => w.startsWith(qn))) s = 2.5;
    else if (name.includes(qn)) s = 2;
    else if (tokens.length > 1 && tokens.every((t) => name.includes(t))) s = 1.5;
    else continue;
    scored.push({ p, s: s + p.weight + KIND_BONUS[p.kind] - name.length / 200 });
  }
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, n).map(({ p }) => toPlace(p));
}

export function reversePlace(core: Core, p: LatLng): Place | null {
  let best: { p: PlaceRec; d: number } | null = null;
  for (const pl of core.places) {
    if (pl.kind !== 'area' && pl.kind !== 'landmark') continue;
    const d = haversineKm(p, pl);
    if (d > 2) continue;
    // landmarks are more specific; prefer them when about as close as the nearest area
    const eff = pl.kind === 'landmark' ? d * 0.85 : d;
    if (!best || eff < best.d) best = { p: pl, d: eff };
  }
  return best ? toPlace(best.p) : null;
}
