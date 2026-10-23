/**
 * Catalog services composition (docs/ARCHITECTURE.md §6). The in-memory core is loaded once;
 * late-bound providers (verification / reports) are always read through deps.providers at call time.
 */
import type { ServiceDeps } from '../deps.js';
import type { Services } from './types.js';
import { loadCore } from './core.js';
import { resolveCtx } from './context.js';
import { alternatives } from './alternatives.js';
import { getAreas } from './areas.js';
import { compareProducts, compareStores } from './compare.js';
import { discover } from './discovery.js';
import { getMall } from './malls.js';
import { meta } from './meta.js';
import { places, reversePlace } from './places.js';
import { plan } from './plan.js';
import { basicReasons, buildDetail, productRowById, sellerGeo, similarProducts, summarize } from './products.js';
import { parseFor, search } from './search.js';
import { findShops, getShop, getShopHours, getShopLite, getShopProducts, openStatus } from './shops.js';
import { getStores, registeredPrice } from './stores.js';
import { suggest } from './suggest.js';
import { budgetReality, getStoresForNeed } from './need.js';
import { dataQuality } from './meta.js';
import { insights } from '../domain/insights.js';

export function createServices(deps: ServiceDeps): Services {
  const core = loadCore(deps);
  return {
    meta: () => meta(core),
    parseQuery: (q, ctx) => parseFor(core, q, ctx).parsed,
    search: (req, ctx) => search(core, req, ctx),
    suggest: (q) => suggest(core, q),
    discover: (input, ctx) => discover(core, input, ctx),
    getProduct: (id, ctx) => {
      const row = productRowById(core, id);
      return row ? buildDetail(core, resolveCtx(ctx), row) : null;
    },
    getProductSummary: (id, ctx) => {
      const row = productRowById(core, id);
      if (!row) return null;
      const rc = resolveCtx(ctx);
      const geo = sellerGeo(core, rc, row.rid);
      return summarize(core, rc, row, basicReasons(row, geo, rc), geo);
    },
    getStores: (productId, ctx, opts) => getStores(core, productId, ctx, opts),
    getSimilar: (productId, ctx, limit = 8) => {
      const row = productRowById(core, productId);
      return row ? similarProducts(core, resolveCtx(ctx), row, { limit }) : [];
    },
    compareProducts: (ids, ctx) => compareProducts(core, ids, ctx),
    compareStores: (productId, shopIds, ctx) => compareStores(core, productId, shopIds, ctx),
    registeredPrice: (productId, shopId) => registeredPrice(core, productId, shopId),
    getShop: (id, ctx) => getShop(core, id, ctx),
    getShopLite: (id, ctx) => getShopLite(core, id, ctx),
    getShopHours: (id) => getShopHours(core, id),
    getShopProducts: (id, opts, ctx) => getShopProducts(core, id, opts, ctx),
    openStatus: (shopId, at) => openStatus(core, shopId, at),
    findShops: (q, limit) => findShops(core, q, limit),
    getMall: (slugOrId, ctx) => getMall(core, slugOrId, ctx),
    getAreas: (productId, ctx) => getAreas(core, productId, ctx),
    nearestMetro: (p, limit = 3) => core.metro.nearest(p, limit),
    alternatives: (req) => alternatives(core, req),
    plan: async (req, ctx) => plan(core, req, ctx),
    places: (q, limit) => places(core, q, limit),
    reversePlace: (p) => reversePlace(core, p),
    getStoresForNeed: (need, ctx, opts) => getStoresForNeed(core, need, ctx, opts),
    budgetReality: (q) => budgetReality(core, q),
    insights: (input) => insights(input),
    dataQuality: () => dataQuality(core),
  };
}
