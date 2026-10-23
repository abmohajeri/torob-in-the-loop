/**
 * Stores for a product (docs/ARCHITECTURE.md §6 getStores): offers aggregated per shop (best
 * valid price, variant titles), smart score with reasons, hard filters from the user context,
 * category-only candidates («ممکن است داشته باشند») and an areas summary.
 */
import type {
  AreaSummary,
  CandidateShop,
  InstallmentTier,
  OfferAttrs,
  Reason,
  RegisteredPrice,
  StoreOffer,
  StoreSort,
  StoresResponse,
  UserContext,
  WarrantyInfo,
} from '@titl/shared';
import { formatDistance, formatNumber, haversineKm, inTrafficZone, INSTALLMENT_TIER_LABELS, PROVIDERS } from '@titl/shared';
import { isOpenState } from '../domain/hours.js';
import { insights } from '../domain/insights.js';
import { bestOfferIndex, budgetLabel, freshMedianOf, isLikelyOutdated, registeredPriceOf, type OfferPriceRow } from '../domain/price.js';
import { clusterStores, nearestClusterNotice, nextGoodWindow, soonestOpening } from './clusters.js';
import { scoreStore } from '../domain/ranking.js';
import { quickEta, WALK_THRESHOLD_KM } from '../domain/travel.js';
import { parseWarranty, type Core, type ShopRec } from './core.js';
import { distanceTo, getCatalogAsOf, inRange, paymentMatch, rangeLabel, resolveCtx, round2, shopState, toShopLite, type ReqCtx } from './context.js';
import { productRowById, sellerGeo, summarize, basicReasons, type ProductRow } from './products.js';

interface OfferRow extends OfferPriceRow {
  id: string;
  shop_rid: number;
  seller_title: string | null;
  description: string | null;
  warranty: string | null;
  warranty_kind: string | null;
  attrs: string | null;
}

function parseAttrs(v: string | null): OfferAttrs | null {
  if (!v) return null;
  try {
    const a = JSON.parse(v) as OfferAttrs;
    return a && typeof a === 'object' ? a : null;
  } catch {
    return null;
  }
}

export interface ShopOffers {
  shop: ShopRec;
  rows: OfferRow[];
  best: OfferRow;
  price: RegisteredPrice;
  priceMax: number | null;
  warranty: WarrantyInfo | null;
  attrs: OfferAttrs | null;
}

export function offersByShop(core: Core, productRid: number, now: Date): ShopOffers[] {
  const rows = core.db.all<OfferRow>(
    `SELECT id, shop_rid, seller_title, description, price, raw_price, price_status, price_changed_at, price_rule, warranty, warranty_kind, attrs
     FROM offers WHERE product_rid = ? ORDER BY rid`,
    productRid,
  );
  const byShop = new Map<number, OfferRow[]>();
  for (const r of rows) {
    const l = byShop.get(r.shop_rid) ?? [];
    l.push(r);
    byShop.set(r.shop_rid, l);
  }
  const out: ShopOffers[] = [];
  for (const [rid, list] of byShop) {
    const shop = core.shops[rid];
    if (!shop) continue;
    const best = list[bestOfferIndex(list)]!;
    let priceMax: number | null = null;
    for (const r of list) if (r.price_status === 'ok' && r.price !== null && r.price > 0 && (priceMax === null || r.price > priceMax)) priceMax = r.price;
    const price = registeredPriceOf(best, now);
    const warranty = parseWarranty(best.warranty) ?? list.map((r) => parseWarranty(r.warranty)).find(Boolean) ?? null;
    const attrs = parseAttrs(best.attrs) ?? list.map((r) => parseAttrs(r.attrs)).find(Boolean) ?? null;
    out.push({ shop, rows: list, best, price, priceMax: priceMax !== null && price.price !== null && priceMax > price.price ? priceMax : null, warranty, attrs });
  }
  return out;
}

export type FilterKey = 'payment' | 'open' | 'distance' | 'warranty' | 'fast' | 'budget';

/**
 * Why a shop fails the context's hard filters (null = passes). Installment WITHOUT named providers is
 * never a hard filter (D6/SV9: tiers, never an empty list); named providers still are.
 * `ignore` relaxes individual filters (alternatives relax one constraint at a time, SV10).
 */
export function failsFilters(rc: ReqCtx, so: Pick<ShopOffers, 'shop' | 'price' | 'warranty'>, ignore?: ReadonlySet<FilterKey>): FilterKey | null {
  const ctx = rc.ctx;
  const on = (k: FilterKey) => !ignore?.has(k);
  if (on('payment') && ctx.providers?.length) {
    const pm = paymentMatch(ctx, so.shop);
    if (pm && !pm.matched) return 'payment';
  }
  if (on('open') && ctx.openNow && !isOpenState(shopState(rc, so.shop).state)) return 'open';
  if (on('distance') && rc.range && !inRange(rc, so.shop)) return 'distance';
  if (on('warranty') && ctx.warrantyOnly && !(so.warranty && (so.warranty.kind === 'company' || so.warranty.kind === 'test_delivery'))) return 'warranty';
  if (on('fast') && ctx.fastDelivery && so.shop.fastDelivery !== true) return 'fast';
  if (on('budget') && so.price.price !== null) {
    if (ctx.budgetMax !== undefined && so.price.price > ctx.budgetMax) return 'budget';
    if (ctx.budgetMin !== undefined && so.price.price < ctx.budgetMin) return 'budget';
  }
  return null;
}

export function appliedFilterChips(ctx: UserContext, rc: ReqCtx): Reason[] {
  const out: Reason[] = [];
  if (ctx.providers?.length) {
    out.push({ code: 'providers', label: `فقط ${ctx.providers.map((p) => PROVIDERS[p].label).join(' یا ')}`, tone: 'info' });
  } else if (ctx.installment) out.push({ code: 'installment', label: 'قسطی‌ها اول (بر اساس نوع اطلاعات)', tone: 'info' });
  if (ctx.openNow) out.push({ code: 'open', label: rc.visitIsNow ? 'فقط باز در این لحظه' : 'فقط باز در زمان مراجعه', tone: 'info' });
  if (rc.range && (rc.range.kind !== 'radius' || rc.location)) {
    out.push({ code: 'distance', label: rc.range.kind === 'radius' ? `حداکثر ${formatDistance(rc.range.km!)}` : rangeLabel(rc.range), tone: 'info' });
  }
  if (ctx.warrantyOnly) out.push({ code: 'warranty', label: 'فقط با گارانتی یا تست و تحویل', tone: 'info' });
  if (ctx.fastDelivery) out.push({ code: 'fast', label: 'فقط ارسال فوری', tone: 'info' });
  if (ctx.budgetMin !== undefined || ctx.budgetMax !== undefined) {
    out.push({ code: 'budget', label: `بودجه: ${budgetLabel(ctx.budgetMin ?? null, ctx.budgetMax ?? null)}`, tone: 'info' });
  }
  if (ctx.kalabarg) out.push({ code: 'kalabarg', label: 'کالابرگ ثبت نشده؛ فیلتر نمی‌شود — بپرسید', tone: 'warn' });
  return out;
}

export interface BuildOpts {
  /** Apply context hard filters (default true). */
  filter?: boolean;
  /** Only these shops (compare). */
  onlyShops?: Set<string>;
  /** Exclude these shops (alternatives). */
  excludeShops?: Set<string>;
  /** Relax these filters (alternatives, SV10). */
  ignore?: ReadonlySet<FilterKey>;
}

export interface BuiltStores {
  stores: StoreOffer[];
  excluded: number;
  excludedBy: Map<string, number>;
  offers: Map<string, ShopOffers>;
  /** Every shop that has an offer for the product (before filters). */
  allShopIds: Set<string>;
}

export function buildStoreOffers(core: Core, rc: ReqCtx, row: ProductRow, opts: BuildOpts = {}): BuiltStores {
  const all = offersByShop(core, row.rid, rc.asOf);
  const freshMedian = freshMedianOf(
    all.flatMap((x) => x.rows),
    rc.asOf,
  );
  for (const so of all) if (isLikelyOutdated(so.price, freshMedian)) so.price = { ...so.price, likelyOutdated: true };
  const filter = opts.filter !== false;
  const kept: ShopOffers[] = [];
  const excludedBy = new Map<string, number>();
  for (const so of all) {
    if (opts.onlyShops && !opts.onlyShops.has(so.shop.id)) continue;
    if (opts.excludeShops?.has(so.shop.id)) continue;
    const why = filter ? failsFilters(rc, so, opts.ignore) : null;
    if (why) {
      excludedBy.set(why, (excludedBy.get(why) ?? 0) + 1);
      continue;
    }
    kept.push(so);
  }
  const valid = kept.map((k) => k.price.price).filter((p): p is number => p !== null);
  const priceRange = valid.length ? { min: Math.min(...valid), max: Math.max(...valid), count: valid.length } : null;
  const ids = kept.map((k) => k.shop.id);
  const verified = ids.length ? core.deps.providers.verification.latestFor(row.id, ids) : new Map();
  const reports = ids.length ? core.deps.providers.reports.recentByShops(ids, 12) : new Map();
  const stores: StoreOffer[] = kept.map((so) => {
    const lite = toShopLite(core, rc, so.shop);
    const st = shopState(rc, so.shop);
    const v = verified.get(so.shop.id) ?? null;
    const sc = scoreStore({
      price: so.price,
      priceRange,
      distanceKm: lite.distanceKm,
      distanceFromLabel: rc.locationLabel,
      openState: lite.openStatus.state,
      openLabel: lite.openStatus.label,
      minutesToClose: st.minutesToClose,
      visitIsNow: rc.visitIsNow,
      warrantyKind: so.warranty?.kind ?? null,
      hoursDeclared: so.shop.hoursDeclared,
      locConfidence: so.shop.locConfidence,
      paymentMatch: paymentMatch(rc.ctx, so.shop),
      verified: v,
      recentReports: reports.get(so.shop.id) ?? [],
      kalabargWanted: !!rc.ctx.kalabarg,
      now: rc.now,
      updateDiscipline: so.shop.updateDiscipline,
      freshMedian,
    });
    const reasons = [...sc.reasons];
    if (so.price.price === null && (rc.ctx.budgetMax !== undefined || rc.ctx.budgetMin !== undefined)) {
      reasons.push({ code: 'budget_unknown', label: 'قیمت ثبت نشده؛ تطابق با بودجه نامشخص است', tone: 'warn' });
    }
    const titles = [...new Set(so.rows.map((r) => r.seller_title?.trim()).filter((t): t is string => !!t))].slice(0, 6);
    return {
      shop: lite,
      offerIds: so.rows.map((r) => r.id),
      sellerTitles: titles,
      price: so.price,
      ...(so.attrs ? { attrs: so.attrs } : {}),
      availability: 'exact' as const,
      priceMax: so.priceMax,
      warranty: so.warranty,
      description: so.best.description?.trim() || null,
      verified: v,
      score: sc.score,
      reasons,
      rank: 0,
    };
  });
  let excluded = 0;
  for (const n of excludedBy.values()) excluded += n;
  return { stores, excluded, excludedBy, offers: new Map(kept.map((k) => [k.shop.id, k])), allShopIds: new Set(all.map((s) => s.shop.id)) };
}

export function sortStores(stores: StoreOffer[], sort: StoreSort): StoreOffer[] {
  const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
  const effPrice = (s: StoreOffer) => (s.verified?.price ?? s.price.price);
  const out = [...stores];
  switch (sort) {
    case 'price':
      // SV4: «ارزان‌ترین با قیمت تازه» first, then «ارزان‌تر ولی قدیمی (نیاز به استعلام)», then no price
      out.sort((a, b) => priceGroupRank(a) - priceGroupRank(b) || nullsLast(effPrice(a), effPrice(b)) || b.score - a.score);
      break;
    case 'distance':
      out.sort((a, b) => nullsLast(a.shop.distanceKm, b.shop.distanceKm) || b.score - a.score);
      break;
    case 'freshness':
      out.sort((a, b) => (b.price.changedAt ?? '').localeCompare(a.price.changedAt ?? '') || b.score - a.score);
      break;
    default:
      out.sort((a, b) => b.score - a.score || nullsLast(a.price.price, b.price.price));
  }
  out.forEach((s, i) => (s.rank = i + 1));
  return out;
}

/** 0 fresh-enough (≤ 60 d, not likely outdated) · 1 stale / unknown age · 2 no valid price. Verified prices count as fresh. */
export function priceGroupRank(s: StoreOffer): number {
  if (s.verified?.price) return 0;
  if (s.price.price === null) return 2;
  return (s.price.freshness === 'fresh' || s.price.freshness === 'recent') && !s.price.likelyOutdated ? 0 : 1;
}

export function priceGroupsOf(stores: StoreOffer[]): NonNullable<StoresResponse['priceGroups']> {
  const fresh = stores.filter((s) => priceGroupRank(s) === 0).map((s) => s.shop.id);
  const stale = stores.filter((s) => priceGroupRank(s) === 1).map((s) => s.shop.id);
  const out: NonNullable<StoresResponse['priceGroups']> = [];
  if (fresh.length) out.push({ id: 'fresh', label: 'ارزان‌ترین با قیمت تازه', shopIds: fresh });
  if (stale.length) out.push({ id: 'stale', label: 'ارزان‌تر ولی قدیمی (نیاز به استعلام)', shopIds: stale });
  return out;
}

const TIER_ORDER: InstallmentTier[] = ['in_person', 'declared_unknown_channel', 'seller_text', 'none_recorded'];

/** SV9: group (not filter) by installment information tier, keeping the given order inside each tier. */
export function installmentGroupsOf(core: Core, stores: StoreOffer[]): NonNullable<StoresResponse['installmentGroups']> {
  const by = new Map<InstallmentTier, string[]>();
  for (const s of stores) {
    const t = core.shopsById.get(s.shop.id)?.installmentTier ?? 'none_recorded';
    const l = by.get(t) ?? [];
    l.push(s.shop.id);
    by.set(t, l);
  }
  return TIER_ORDER.filter((t) => by.has(t)).map((t) => ({ tier: t, label: INSTALLMENT_TIER_LABELS[t], shopIds: by.get(t)! }));
}

/** Stable re-order so installment tiers come first (SV9 grouping). */
export function orderByInstallmentTier(core: Core, stores: StoreOffer[]): StoreOffer[] {
  const rank = (s: StoreOffer) => TIER_ORDER.indexOf(core.shopsById.get(s.shop.id)?.installmentTier ?? 'none_recorded');
  const out = stores.map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map((x) => x.s);
  out.forEach((s, i) => (s.rank = i + 1));
  return out;
}

const NEED_MODE_GROUPS = new Set(['fashion', 'shoes_bags', 'watch_jewelry', 'lighting', 'home_kitchen']);

/** SV3: shops (tier A, in range) selling OTHER products of the same category nearby. */
export function similarStoreCount(core: Core, rc: ReqCtx, categoryId: number, exclude: Set<string>): number {
  const rows = core.db.all<{ shop_rid: number }>('SELECT shop_rid FROM shop_categories WHERE category_id = ? AND has_offers = 1', categoryId);
  let n = 0;
  for (const r of rows) {
    const s = core.shops[r.shop_rid];
    if (!s || exclude.has(s.id)) continue;
    if (rc.location && haversineKm(rc.location, s) > Math.max(rc.nearbyKm, rc.range?.kind === 'radius' ? rc.range.km ?? 0 : 0)) continue;
    n++;
  }
  return n;
}

export function needModeOf(core: Core, rc: ReqCtx, row: ProductRow, sellerCount: number, exclude: Set<string>): StoresResponse['needMode'] {
  const recommended = sellerCount < 3 || NEED_MODE_GROUPS.has(row.group_id);
  if (!recommended) return { recommended: false, text: '', similarStoreCount: 0 };
  const n = similarStoreCount(core, rc, row.category_id, exclude);
  const where = rc.location ? 'نزدیک' : 'دیگر';
  const text =
    sellerCount <= 1
      ? `این مدل فقط در ۱ فروشگاه ثبت شده — ${formatNumber(n)} فروشگاه ${where} مدل‌های مشابه دارند`
      : `این مدل در ${formatNumber(sellerCount)} فروشگاه ثبت شده — ${formatNumber(n)} فروشگاه ${where} مدل‌های مشابه دارند`;
  return { recommended: true, text, similarStoreCount: n };
}

// ───────────────────────── Category-only candidates ─────────────────────────

export function categoryOnlyShops(
  core: Core,
  rc: ReqCtx,
  categoryId: number,
  exclude: Set<string>,
  opts: { limit?: number; near?: { lat: number; lng: number } | null; mallId?: number | null; area?: string | null; filter?: boolean } = {},
): CandidateShop[] {
  const cat = core.categories.get(categoryId);
  if (!cat) return [];
  const rows = core.db.all<{ shop_rid: number; has_offers: number }>(
    'SELECT shop_rid, has_offers FROM shop_categories WHERE category_id = ?',
    categoryId,
  );
  const ref = opts.near ?? rc.location;
  const list: { shop: ShopRec; has: boolean; d: number | null }[] = [];
  for (const r of rows) {
    const shop = core.shops[r.shop_rid];
    if (!shop || exclude.has(shop.id)) continue;
    if (opts.mallId !== undefined && opts.mallId !== null && shop.mallId !== opts.mallId) continue;
    if (opts.area !== undefined && opts.area !== null && opts.mallId == null && shop.area !== opts.area) continue;
    if (opts.filter !== false) {
      const pm = paymentMatch(rc.ctx, shop);
      if (pm && !pm.matched) continue;
      if (rc.ctx.openNow && !isOpenState(shopState(rc, shop).state)) continue;
      if (!inRange(rc, shop)) continue;
    }
    list.push({ shop, has: r.has_offers === 1, d: ref ? haversineKm(ref, shop) : null });
  }
  list.sort((a, b) => {
    if (a.d !== null && b.d !== null && Math.abs(a.d - b.d) > 0.05) return a.d - b.d;
    if (a.has !== b.has) return a.has ? -1 : 1;
    return b.shop.offerCount - a.shop.offerCount;
  });
  return list.slice(0, opts.limit ?? 10).map(({ shop, has }) => ({
    shop: toShopLite(core, rc, shop),
    matchedCategory: cat.name,
    note: has
      ? 'کالاهای دیگری از همین دسته ثبت کرده، اما این مدل را نه — موجودی را بپرسید'
      : 'فقط دسته فعالیت اعلام‌شده؛ موجودی نامشخص — بپرسید',
  }));
}

// ───────────────────────── Areas ─────────────────────────

export function areasOf(core: Core, rc: ReqCtx, stores: StoreOffer[]): AreaSummary[] {
  const groups = new Map<string, StoreOffer[]>();
  for (const s of stores) {
    const a = s.shop.area ?? 'نامشخص';
    const l = groups.get(a) ?? [];
    l.push(s);
    groups.set(a, l);
  }
  const out: AreaSummary[] = [];
  for (const [name, list] of groups) {
    if (name === 'نامشخص') continue;
    const rec = core.areas.get(name);
    const lat = rec?.lat ?? list.reduce((s, x) => s + x.shop.lat, 0) / list.length;
    const lng = rec?.lng ?? list.reduce((s, x) => s + x.shop.lng, 0) / list.length;
    const prices = list.map((s) => s.price.price).filter((p): p is number => p !== null);
    const d = distanceTo(rc, { lat, lng });
    // walkable when every store is within ~600 m of the stores' own centroid
    const cLat = list.reduce((s, x) => s + x.shop.lat, 0) / list.length;
    const cLng = list.reduce((s, x) => s + x.shop.lng, 0) / list.length;
    const spread = Math.max(...list.map((s) => haversineKm({ lat: cLat, lng: cLng }, s.shop)));
    out.push({
      area: name,
      lat,
      lng,
      storeCount: list.length,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      distanceKm: d === null ? null : round2(d),
      etaMin: d === null ? null : quickEta(d, rc.mode, rc.rush),
      walkableCluster: list.length >= 2 && spread <= Math.max(0.6, WALK_THRESHOLD_KM),
      inTrafficZone: rec?.inTrafficZone ?? inTrafficZone({ lat, lng }),
      nearestMetro: core.metro.nearest({ lat, lng }, 1, 2)[0] ?? null,
    });
  }
  out.sort((a, b) => {
    if (a.distanceKm !== null && b.distanceKm !== null) {
      // prefer areas with several stores unless much farther
      const sa = a.distanceKm - Math.min(2, Math.log2(a.storeCount));
      const sb = b.distanceKm - Math.min(2, Math.log2(b.storeCount));
      return sa - sb;
    }
    return b.storeCount - a.storeCount;
  });
  return out;
}

// ───────────────────────── Service ─────────────────────────

export function getStores(core: Core, productId: string, ctx: UserContext, opts: { sort?: StoreSort; limit?: number } = {}): StoresResponse | null {
  const row = productRowById(core, productId);
  if (!row) return null;
  const rc = resolveCtx(ctx);
  const built = buildStoreOffers(core, rc, row);
  const sort = opts.sort ?? 'smart';
  const sorted = sortStores(built.stores, sort);
  const geo = sellerGeo(core, rc, row.rid);
  const product = summarize(core, rc, row, basicReasons(row, geo, rc), geo);
  // SV9: smart sort groups by installment tier; an explicit sort keeps its order (groups are returned separately)
  const ordered = ctx.installment && !ctx.providers?.length && sort === 'smart' ? orderByInstallmentTier(core, sorted) : sorted;
  const clusterItems = (list: StoreOffer[]) =>
    list.map((s) => ({ shop: core.shopsById.get(s.shop.id)!, price: s.price.price })).filter((x) => x.shop);
  const clusters = clusterStores(core, rc, clusterItems(ordered));
  const res: StoresResponse = {
    product,
    stores: opts.limit ? ordered.slice(0, opts.limit) : ordered,
    categoryOnly: categoryOnlyShops(core, rc, row.category_id, built.allShopIds, { limit: 10 }),
    areas: areasOf(core, rc, sorted),
    appliedFilters: appliedFilterChips(ctx, rc),
    excludedByFilters: built.excluded,
    sort,
    clusters: clusters.slice(0, 5),
    needMode: needModeOf(core, rc, row, built.allShopIds.size, built.allShopIds),
  };
  if (sort === 'price') res.priceGroups = priceGroupsOf(ordered);
  // SV6: never empty because of the range → nearest cluster outside it
  if (!ordered.length && (built.excludedBy.get('distance') ?? 0) > 0) {
    const relaxed = buildStoreOffers(core, rc, row, { ignore: new Set(['distance']) });
    res.nearestCluster = nearestClusterNotice(core, rc, clusterItems(relaxed.stores));
  }
  // SV9
  if (ctx.installment && !ctx.providers?.length) {
    res.installmentGroups = installmentGroupsOf(core, ordered);
    const strong = res.installmentGroups.filter((g) => g.tier === 'in_person' || g.tier === 'declared_unknown_channel').reduce((n, g) => n + g.shopIds.length, 0);
    if (strong < 3) {
      res.installmentActions = [
        { id: 'ask_installment', label: 'از ۳ فروشگاه برتر دربارهٔ اقساط بپرس' },
        { id: 'expand_range', label: 'محدوده را بزرگ‌تر کن', contextPatch: { maxDistanceKm: Math.max(10, (rc.range?.km ?? 5) * 2), range: { kind: 'radius', km: Math.max(10, (rc.range?.km ?? 5) * 2) } } },
        { id: 'drop_installment', label: 'نقدی هم بررسی کن', contextPatch: { installment: false } },
      ];
    }
  }
  // SV5: visit-time engine (arrival = visitAt + eta)
  const allShops = [...built.allShopIds].map((id) => core.shopsById.get(id)!).filter(Boolean);
  if (!ordered.some((s) => isOpenState(s.shop.openStatus.state))) {
    res.soonestOpening = soonestOpening(core, rc, ordered.length ? ordered.map((s) => core.shopsById.get(s.shop.id)!) : allShops);
  }
  res.nextGoodWindow = nextGoodWindow(rc, ordered.length ? ordered.map((s) => core.shopsById.get(s.shop.id)!) : allShops);
  res.insights = insights({ ctx, stores: ordered, clusters, at: rc.at });
  return res;
}

export function registeredPrice(core: Core, productId: string, shopId: string): RegisteredPrice | null {
  const row = productRowById(core, productId);
  const shop = core.shopsById.get(shopId);
  if (!row || !shop) return null;
  const list = core.db.all<OfferPriceRow>(
    'SELECT price, raw_price, price_status, price_changed_at, price_rule FROM offers WHERE product_rid = ? AND shop_rid = ?',
    row.rid,
    shop.rid,
  );
  if (!list.length) return null;
  return registeredPriceOf(list[bestOfferIndex(list)]!, getCatalogAsOf() ?? new Date());
}

/** «۸ فروشنده در شعاع ۵۰۰ متری» style one-liner for an area. */
export function areaLine(a: AreaSummary): string {
  return `${formatNumber(a.storeCount)} فروشنده در ${a.area}${a.walkableCluster ? ' — مقایسه حضوری آسان' : ''}`;
}
