/**
 * Agent-local need-level store finder (fallback until services expose SV1 `needStores`).
 * Aggregates the stores of the most-stocked matching products → shops that carry MANY models of the need.
 */
import {
  formatDistance,
  formatNumber,
  formatTomanShort,
  haversineKm,
  type AssortmentStore,
  type ClusterSummary,
  type NeedSpec,
  type NeedStoresResponse,
  type SearchRequest,
  type UserContext,
} from '@titl/shared';
import type { Services } from '../services/types.js';

export function needStoresFallback(s: Services, need: NeedSpec, q: string, ctx: UserContext): NeedStoresResponse {
  const req: SearchRequest = { sort: 'sellers', limit: 40 };
  if (need.categoryId) req.category = need.categoryId;
  else req.q = q;
  if (need.brand) req.brand = need.brand;
  if (need.audience) req.audience = need.audience;
  if (need.budgetMax) req.priceMax = need.budgetMax;
  if (need.budgetMin) req.priceMin = need.budgetMin;
  const res = s.search(req, ctx);

  const agg = new Map<string, AssortmentStore & { _fresh: number; _priced: number }>();
  let excluded = 0;
  for (const p of res.items) {
    const st = s.getStores(p.id, ctx, { limit: 40 });
    if (!st) continue;
    excluded = Math.max(excluded, st.excludedByFilters);
    for (const o of st.stores) {
      let a = agg.get(o.shop.id);
      if (!a) {
        a = {
          shop: o.shop,
          availability: 'similar',
          availabilityLabel: '',
          matchCount: 0,
          samples: [],
          priceMin: null,
          priceMax: null,
          brands: [],
          sizes: [],
          freshShare: null,
          score: 0,
          reasons: [],
          _fresh: 0,
          _priced: 0,
        };
        agg.set(o.shop.id, a);
      }
      a.matchCount++;
      if (a.samples.length < 3) a.samples.push({ productId: p.id, title: p.title, image: p.image, price: o.price.price, freshness: o.price.freshness });
      if (o.price.price != null) {
        a.priceMin = a.priceMin == null ? o.price.price : Math.min(a.priceMin, o.price.price);
        a.priceMax = a.priceMax == null ? o.price.price : Math.max(a.priceMax, o.price.price);
        a._priced++;
        if ((o.price.ageDays ?? 999) <= 14) a._fresh++;
      }
      if (p.brand && !a.brands.includes(p.brand) && a.brands.length < 5) a.brands.push(p.brand);
    }
  }
  const stores = [...agg.values()]
    .map(({ _fresh, _priced, ...a }) => {
      a.freshShare = _priced ? _fresh / _priced : null;
      a.availabilityLabel = `${formatNumber(a.matchCount)} مدل مطابق ثبت کرده`;
      const distPenalty = a.shop.distanceKm != null ? Math.min(30, a.shop.distanceKm * 3) : 10;
      const openBonus = a.shop.openStatus.state === 'open' ? 10 : a.shop.openStatus.state === 'closing_soon' ? 3 : 0;
      a.score = Math.max(0, Math.min(100, Math.round(a.matchCount * 12 + openBonus - distPenalty + 30)));
      a.reasons = [{ code: 'sellers', label: `${formatNumber(a.matchCount)} مدل`, tone: 'good' }];
      if (a.priceMin != null) a.reasons.push({ code: 'budget', label: `از ${formatTomanShort(a.priceMin)}`, tone: 'info' });
      if (a.shop.distanceKm != null) a.reasons.push({ code: 'distance', label: formatDistance(a.shop.distanceKm), tone: 'info' });
      return a;
    })
    .sort((x, y) => y.score - x.score || y.matchCount - x.matchCount)
    .slice(0, 20);

  return {
    need,
    stores,
    clusters: clusterize(stores),
    excludedByFilters: excluded,
    totalMatchingProducts: res.total,
    appliedFilters: [],
  };
}

/** Single-link walkable clusters (≤ 300 m) of the top stores. */
function clusterize(stores: AssortmentStore[]): ClusterSummary[] {
  const groups: AssortmentStore[][] = [];
  for (const st of stores) {
    const g = groups.find((gr) => gr.some((o) => haversineKm(o.shop, st.shop) <= 0.3));
    if (g) g.push(st);
    else groups.push([st]);
  }
  return groups
    .filter((g) => g.length >= 2)
    .sort((a, b) => b.reduce((n, x) => n + x.matchCount, 0) - a.reduce((n, x) => n + x.matchCount, 0))
    .slice(0, 3)
    .map((g, i) => {
      const lat = g.reduce((n, x) => n + x.shop.lat, 0) / g.length;
      const lng = g.reduce((n, x) => n + x.shop.lng, 0) / g.length;
      const label = g[0]!.shop.location.mall?.name ?? g[0]!.shop.area ?? 'یک محدوده';
      const prices = g.map((x) => x.priceMin).filter((x): x is number => x != null);
      const models = g.reduce((n, x) => n + x.matchCount, 0);
      const dist = g[0]!.shop.distanceKm;
      return {
        id: `c${i + 1}`,
        centroid: { lat, lng },
        label,
        storeCount: g.length,
        shopIds: g.map((x) => x.shop.id),
        priceMin: prices.length ? Math.min(...prices) : null,
        priceMax: null,
        openAtVisit: g.filter((x) => x.shop.openStatus.state === 'open' || x.shop.openStatus.state === 'closing_soon').length,
        etaFromUser: g[0]!.shop.etaMin,
        distanceKm: dist,
        text: `بهترین جا برای خرید حضوری: ${formatNumber(g.length)} فروشگاه در ${label} با روی‌هم ${formatNumber(models)} مدل${prices.length ? ` · از ${formatTomanShort(Math.min(...prices))}` : ''}${dist != null ? ` · ${formatDistance(dist)} از شما` : ''}`,
      };
    });
}
