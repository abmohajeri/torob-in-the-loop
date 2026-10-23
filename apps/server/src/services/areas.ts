/**
 * Area summaries: for a product (where its sellers cluster) or the whole catalog.
 */
import type { AreaSummary, UserContext } from '@titl/shared';
import { quickEta } from '../domain/travel.js';
import type { Core } from './core.js';
import { distanceTo, resolveCtx, round2 } from './context.js';
import { productRowById } from './products.js';
import { areasOf, buildStoreOffers } from './stores.js';

export function getAreas(core: Core, productId: string | null, ctx: UserContext): AreaSummary[] {
  const rc = resolveCtx(ctx);
  if (productId) {
    const row = productRowById(core, productId);
    if (!row) return [];
    return areasOf(core, rc, buildStoreOffers(core, rc, row).stores);
  }
  const out: AreaSummary[] = [...core.areas.values()]
    .filter((a) => a.shopsWithOffers > 0)
    .map((a) => {
      const d = distanceTo(rc, a);
      return {
        area: a.name,
        lat: a.lat,
        lng: a.lng,
        storeCount: a.shopsWithOffers,
        priceMin: null,
        priceMax: null,
        distanceKm: d === null ? null : round2(d),
        etaMin: d === null ? null : quickEta(d, rc.mode, rc.rush),
        walkableCluster: false,
        inTrafficZone: a.inTrafficZone,
        nearestMetro: core.metro.nearest(a, 1, 2)[0] ?? null,
      };
    });
  out.sort((a, b) => (a.distanceKm !== null && b.distanceKm !== null ? a.distanceKm - b.distanceKm : b.storeCount - a.storeCount));
  return out;
}
