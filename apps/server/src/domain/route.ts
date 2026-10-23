/**
 * Visit ordering: stops in the same mall are kept together (floors ascending, then unit), mall/stop
 * groups are ordered by nearest-neighbour from the origin and improved with 2-opt (open path).
 */
import type { LatLng } from '@titl/shared';
import { haversineKm } from '@titl/shared';
import { floorSortKey, unitSortKey } from './mall.js';

export interface RouteItem extends LatLng {
  /** Mall id; items sharing a mall are visited consecutively. */
  mallId: number | null;
  floorNum: number | null;
  unit: string | null;
  plaque: string | null;
}

/** Total open-path length visiting `pts` in order, starting at `origin` when given. */
export function pathKm(pts: LatLng[], origin: LatLng | null): number {
  let d = 0;
  let prev: LatLng | null = origin;
  for (const p of pts) {
    if (prev) d += haversineKm(prev, p);
    prev = p;
  }
  return d;
}

function nearestNeighbour(pts: LatLng[], origin: LatLng | null, start?: number): number[] {
  const left = new Set(pts.map((_, i) => i));
  const order: number[] = [];
  let cur: LatLng | null = origin;
  if (start !== undefined) {
    order.push(start);
    left.delete(start);
    cur = pts[start]!;
  }
  while (left.size) {
    let best = -1;
    let bestD = Infinity;
    for (const i of left) {
      const d = cur ? haversineKm(cur, pts[i]!) : 0;
      if (d < bestD) [best, bestD] = [i, d];
    }
    order.push(best);
    left.delete(best);
    cur = pts[best]!;
  }
  return order;
}

function twoOpt(order: number[], pts: LatLng[], origin: LatLng | null): number[] {
  let best = [...order];
  let bestLen = pathKm(best.map((i) => pts[i]!), origin);
  let improved = true;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 0; i < best.length - 1; i++) {
      for (let k = i + 1; k < best.length; k++) {
        const cand = [...best.slice(0, i), ...best.slice(i, k + 1).reverse(), ...best.slice(k + 1)];
        const len = pathKm(cand.map((j) => pts[j]!), origin);
        if (len + 1e-9 < bestLen) {
          best = cand;
          bestLen = len;
          improved = true;
        }
      }
    }
  }
  return best;
}

/** Order of point indices minimizing the open path (NN + 2-opt; tries every start without an origin). */
export function orderPoints(pts: LatLng[], origin: LatLng | null): number[] {
  if (pts.length <= 1) return pts.map((_, i) => i);
  if (origin) return twoOpt(nearestNeighbour(pts, origin), pts, origin);
  let best: number[] = [];
  let bestLen = Infinity;
  for (let s = 0; s < pts.length; s++) {
    const o = twoOpt(nearestNeighbour(pts, null, s), pts, null);
    const len = pathKm(o.map((i) => pts[i]!), null);
    if (len < bestLen) [best, bestLen] = [o, len];
  }
  return best;
}

/** Visit order for plan stops (indices into `items`). */
export function orderStops(items: RouteItem[], origin: LatLng | null): number[] {
  const groups: { key: string; idx: number[] }[] = [];
  const byKey = new Map<string, { key: string; idx: number[] }>();
  items.forEach((it, i) => {
    const key = it.mallId !== null ? `m${it.mallId}` : `s${i}`;
    let g = byKey.get(key);
    if (!g) {
      g = { key, idx: [] };
      byKey.set(key, g);
      groups.push(g);
    }
    g.idx.push(i);
  });
  const reps: LatLng[] = groups.map((g) => ({
    lat: g.idx.reduce((s, i) => s + items[i]!.lat, 0) / g.idx.length,
    lng: g.idx.reduce((s, i) => s + items[i]!.lng, 0) / g.idx.length,
  }));
  const gOrder = groups.length > 8 ? nearestNeighbour(reps, origin, origin ? undefined : 0) : orderPoints(reps, origin);
  const out: number[] = [];
  for (const gi of gOrder) {
    const g = groups[gi]!;
    const inner = [...g.idx].sort(
      (a, b) =>
        floorSortKey(items[a]!.floorNum) - floorSortKey(items[b]!.floorNum) ||
        unitSortKey(items[a]!.unit, items[a]!.plaque) - unitSortKey(items[b]!.unit, items[b]!.plaque) ||
        a - b,
    );
    out.push(...inner);
  }
  return out;
}
