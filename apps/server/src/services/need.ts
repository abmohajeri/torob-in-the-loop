/**
 * Need-level store finder (SV1), availability ladder (SV2) and budget reality check (SV8).
 *
 * «کتونی می‌خوام، مدلش رو نمی‌دونم»: 856 of 865 sneakers have ONE seller, so the useful answer is
 * not a product but a STORE with assortment: which nearby shops registered many matching models,
 * in budget, open when you arrive, with fresh prices.
 *
 *   score = 100 × (0.35·log-matches + 0.25·budget fit + 0.2·distance + 0.1·open at arrival + 0.1·update discipline)
 */
import type {
  AssortmentSample,
  AssortmentStore,
  Availability,
  BudgetReality,
  NeedSpec,
  NeedStoresResponse,
  Reason,
  UserContext,
} from '@titl/shared';
import { AVAILABILITY_LABELS, formatDistance, formatNumber, formatTomanShort, freshnessOf, normalizeForSearch } from '@titl/shared';
import { isOpenState } from '../domain/hours.js';
import { insights } from '../domain/insights.js';
import { budgetLabel, niceRound, quantileSorted } from '../domain/price.js';
import { firstImage, type CategoryRec, type Core, type ShopRec } from './core.js';
import { clusterStores, nearestClusterNotice, nextGoodWindow, soonestOpening, type ClusterItem } from './clusters.js';
import { inRange, paymentMatch, resolveCtx, shopState, toShopLite, type ReqCtx } from './context.js';
import { productRowById } from './products.js';
import { AUD_OK, retrieve } from './search.js';
import { appliedFilterChips } from './stores.js';

export const NEED_WEIGHTS = { matches: 0.35, budget: 0.25, distance: 0.2, open: 0.1, discipline: 0.1 } as const;
const PRODUCT_CAP = 5000;
const DEFAULT_LIMIT = 30;
const SAMPLE_N = 4;

interface Cand {
  rid: number;
  id: string;
  title: string;
  images: string;
  brand: string | null;
  category_id: number;
  model_key: string | null;
  price_min: number | null;
  price_max: number | null;
  is_replica: number;
  popularity: number;
}

const CAND_COLS = 'p.rid, p.id, p.title, p.images, p.brand, p.category_id, p.model_key, p.price_min, p.price_max, p.is_replica, p.popularity';

interface OfferLite {
  product_rid: number;
  shop_rid: number;
  price: number | null;
  price_status: string;
  price_changed_at: string | null;
}

interface Agg {
  shop: ShopRec;
  rids: Set<number>;
  exactRids: Set<number>;
  variantRids: Set<number>;
  prices: number[];
  inBudget: number;
  priced: number;
  fresh: number;
}

function resolveCategory(core: Core, v: string | undefined): CategoryRec | null {
  if (!v) return null;
  const byName = core.categoriesByName.get(v);
  if (byName) return byName;
  const n = Number(v);
  return Number.isInteger(n) ? core.categories.get(n) ?? null : null;
}

const SIZE_KEYS = ['سایز', 'سایز بندی', 'سایزبندی', 'سایز‌بندی'];

function sizeRids(core: Core, size: string): Set<number> {
  const v = size.trim();
  return new Set(
    core.db
      .all<{ r: number }>(
        `SELECT product_rid AS r FROM product_facets WHERE key IN (SELECT value FROM json_each(?)) AND value = ?`,
        JSON.stringify(SIZE_KEYS),
        v,
      )
      .map((x) => x.r),
  );
}

function offersOf(core: Core, rids: number[]): OfferLite[] {
  const out: OfferLite[] = [];
  for (let i = 0; i < rids.length; i += 2000) {
    out.push(
      ...core.db.all<OfferLite>(
        `SELECT product_rid, shop_rid, price, price_status, price_changed_at FROM offers WHERE product_rid IN (SELECT value FROM json_each(?))`,
        JSON.stringify(rids.slice(i, i + 2000)),
      ),
    );
  }
  return out;
}

/** Candidate products for the need (+ the target product's model family when a single product is given). */
function candidates(core: Core, need: NeedSpec, ctx: UserContext, cat: CategoryRec | null): { cands: Cand[]; target: Cand | null; hiddenReplicas: number } {
  let target: Cand | null = null;
  let cands: Cand[] = [];
  const byRids = (rids: number[]) =>
    rids.length ? core.db.all<Cand>(`SELECT ${CAND_COLS} FROM products p WHERE p.rid IN (SELECT value FROM json_each(?))`, JSON.stringify(rids)) : [];
  if (need.productIds?.length) {
    const rows = need.productIds.map((id) => productRowById(core, id)).filter((r): r is NonNullable<typeof r> => !!r);
    cands = byRids(rows.map((r) => r.rid));
    if (cands.length === 1) {
      target = cands[0]!;
      // ladder: siblings of the same model (variant) + same-category models (similar)
      const sib = target.model_key
        ? core.db.all<Cand>(`SELECT ${CAND_COLS} FROM products p WHERE p.model_key = ? AND p.rid != ?`, target.model_key, target.rid)
        : [];
      const brandSql = target.brand && !need.categoryId ? ' AND p.brand = ?' : '';
      const params: (string | number)[] = [target.category_id, target.rid];
      if (brandSql) params.push(target.brand!);
      const sim = core.db.all<Cand>(
        `SELECT ${CAND_COLS} FROM products p WHERE p.category_id = ? AND p.rid != ? AND p.shop_count > 0${brandSql} ORDER BY p.popularity DESC LIMIT ${PRODUCT_CAP}`,
        ...params,
      );
      const seen = new Set<number>([target.rid]);
      for (const c of [...sib, ...sim]) if (!seen.has(c.rid)) (seen.add(c.rid), cands.push(c));
    }
  } else {
    const restrict = cat ? { categoryId: cat.id } : need.group ? { groupId: need.group } : {};
    if (need.keywords?.length) {
      const kws = need.keywords.map((k) => normalizeForSearch(k)).filter(Boolean);
      const rids = retrieve(core, kws, need.brand ? { ...restrict, brand: need.brand } : restrict).cands.map((c) => c.rid);
      cands = byRids(rids.slice(0, PRODUCT_CAP));
    } else if (cat || need.group || need.brand) {
      const where: string[] = ['p.shop_count > 0'];
      const params: (string | number)[] = [];
      if (cat) (where.push('p.category_id = ?'), params.push(cat.id));
      else if (need.group) (where.push('p.group_id = ?'), params.push(need.group));
      if (need.brand) (where.push('p.brand = ?'), params.push(need.brand));
      cands = core.db.all<Cand>(`SELECT ${CAND_COLS} FROM products p WHERE ${where.join(' AND ')} ORDER BY p.popularity DESC LIMIT ${PRODUCT_CAP}`, ...params);
    }
    if (cat) cands = cands.filter((c) => c.category_id === cat.id);
    if (need.brand) cands = cands.filter((c) => c.brand === need.brand);
  }
  // audience / size / budget (product-level overlap) / replicas
  if (need.audience) {
    const ok = new Set<string>(AUD_OK[need.audience]);
    const aud = new Map(
      core.db
        .all<{ rid: number; audience: string | null }>(`SELECT rid, audience FROM products WHERE rid IN (SELECT value FROM json_each(?))`, JSON.stringify(cands.map((c) => c.rid)))
        .map((r) => [r.rid, r.audience]),
    );
    cands = cands.filter((c) => c === target || (aud.get(c.rid) != null && ok.has(aud.get(c.rid)!)));
  }
  if (need.size) {
    const rids = sizeRids(core, need.size);
    cands = cands.filter((c) => c === target || rids.has(c.rid));
  }
  const bMin = need.budgetMin ?? ctx.budgetMin;
  const bMax = need.budgetMax ?? ctx.budgetMax;
  if (bMin !== undefined || bMax !== undefined) {
    cands = cands.filter(
      (c) => c === target || c.price_min === null || ((bMax === undefined || c.price_min <= bMax) && (bMin === undefined || (c.price_max ?? c.price_min) >= bMin)),
    );
  }
  let hiddenReplicas = 0;
  if (!ctx.showReplicas && !target?.is_replica) {
    const before = cands.length;
    cands = cands.filter((c) => c === target || c.is_replica !== 1);
    hiddenReplicas = before - cands.length;
  }
  return { cands, target, hiddenReplicas };
}

function availabilityLabel(a: Availability, n: number, needMode: boolean): string {
  if (needMode && a === 'similar') return `${formatNumber(n)} مدل مطابق نیاز شما ثبت کرده`;
  return AVAILABILITY_LABELS[a].replace('{n}', formatNumber(n));
}

export function getStoresForNeed(core: Core, need: NeedSpec, ctx: UserContext, opts: { limit?: number } = {}): NeedStoresResponse {
  const rc = resolveCtx(ctx);
  const cat = resolveCategory(core, need.categoryId);
  const { cands, target, hiddenReplicas } = candidates(core, need, ctx, cat);
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const needMode = !target;
  const shortlist = need.productIds && need.productIds.length > 1 ? new Set(need.productIds) : null;
  const byRid = new Map(cands.map((c) => [c.rid, c]));
  const bMin = need.budgetMin ?? ctx.budgetMin;
  const bMax = need.budgetMax ?? ctx.budgetMax;

  // aggregate offers per shop
  const aggs = new Map<number, Agg>();
  for (const o of offersOf(core, cands.map((c) => c.rid))) {
    const shop = core.shops[o.shop_rid];
    if (!shop) continue;
    let a = aggs.get(o.shop_rid);
    if (!a) aggs.set(o.shop_rid, (a = { shop, rids: new Set(), exactRids: new Set(), variantRids: new Set(), prices: [], inBudget: 0, priced: 0, fresh: 0 }));
    const c = byRid.get(o.product_rid)!;
    a.rids.add(o.product_rid);
    if (target && o.product_rid === target.rid) a.exactRids.add(o.product_rid);
    else if (target?.model_key && c.model_key === target.model_key) a.variantRids.add(o.product_rid);
    if (shortlist?.has(c.id)) a.exactRids.add(o.product_rid);
    if (o.price_status === 'ok' && o.price !== null && o.price > 0) {
      a.prices.push(o.price);
      a.priced++;
      if ((bMax === undefined || o.price <= bMax) && (bMin === undefined || o.price >= bMin)) a.inBudget++;
      if (freshnessOf(o.price_changed_at, rc.asOf) === 'fresh') a.fresh++;
    }
  }

  // shop filters (arrival-time open, range, named providers, fast delivery)
  let excluded = 0;
  const outsideRange: ClusterItem[] = [];
  const kept: Agg[] = [];
  for (const a of aggs.values()) {
    const why = shopFails(rc, a.shop);
    if (why) {
      excluded++;
      if (why === 'distance') outsideRange.push({ shop: a.shop, price: a.prices.length ? Math.min(...a.prices) : null });
      continue;
    }
    kept.push(a);
  }

  const maxMatches = Math.max(1, ...kept.map((a) => a.rids.size));
  const stores: AssortmentStore[] = kept.map((a) => scoreAgg(core, rc, a, maxMatches, byRid, { bMin, bMax, needMode, target, catName: cat?.name ?? null }));
  stores.sort((x, y) => availRank(x.availability) - availRank(y.availability) || y.score - x.score);
  if (shortlist) for (const s of stores) s.coverage = [...(aggs.get(core.shopsById.get(s.shop.id)!.rid)?.exactRids ?? [])].map((r) => byRid.get(r)!.id);

  // category-only rung (tier B, and tier A shops declaring the category without a match)
  const catId = cat?.id ?? target?.category_id ?? null;
  const catOnly: AssortmentStore[] = [];
  if (catId !== null) {
    const rows = core.db.all<{ shop_rid: number }>('SELECT shop_rid FROM shop_categories WHERE category_id = ?', catId);
    for (const r of rows) {
      if (aggs.has(r.shop_rid)) continue;
      const shop = core.shops[r.shop_rid];
      if (!shop || shop.tier === 'C' || shopFails(rc, shop)) continue;
      const lite = toShopLite(core, rc, shop);
      const reasons: Reason[] = [{ code: 'category_only', label: 'موجودی نامشخص — بپرسید', tone: 'info' }];
      catOnly.push({
        shop: lite,
        availability: 'category_only',
        availabilityLabel: AVAILABILITY_LABELS.category_only,
        matchCount: 0,
        samples: [],
        priceMin: null,
        priceMax: null,
        brands: [],
        sizes: [],
        freshShare: null,
        score: Math.round(20 * Math.exp(-(lite.distanceKm ?? 4) / 4)),
        reasons,
      });
    }
    catOnly.sort((a, b) => b.score - a.score);
  }

  const top = [...stores.slice(0, limit), ...catOnly.slice(0, Math.max(3, limit - stores.length)).slice(0, 8)];
  fillSamples(core, rc, top, aggs, byRid);
  const sizesBy = sizesOf(core, top, aggs);
  for (const s of top) s.sizes = sizesBy.get(s.shop.id) ?? [];

  const clusterItems: ClusterItem[] = kept.map((a) => ({ shop: a.shop, price: a.prices.length ? Math.min(...a.prices) : null }));
  const clusters = clusterStores(core, rc, clusterItems).slice(0, 5);
  const res: NeedStoresResponse = {
    need,
    stores: top,
    clusters,
    excludedByFilters: excluded,
    totalMatchingProducts: cands.length,
    appliedFilters: appliedFilterChips(ctx, rc),
  };
  if (!kept.length && outsideRange.length) res.nearestCluster = nearestClusterNotice(core, rc, outsideRange);
  if (bMax !== undefined) {
    res.budgetReality = budgetReality(core, { categoryId: catId, group: need.group ?? null, brand: need.brand ?? target?.brand ?? null, budgetMax: bMax });
  }
  const shopsForTime = kept.map((a) => a.shop);
  if (shopsForTime.length && !shopsForTime.some((s) => isOpenState(shopState(rc, s).state))) res.soonestOpening = soonestOpening(core, rc, shopsForTime);
  res.nextGoodWindow = nextGoodWindow(rc, shopsForTime);
  const ins = insights({ ctx, stores: [], clusters, at: rc.at, hiddenReplicas: need.brand ? hiddenReplicas : 0 });
  if (res.budgetReality) ins.unshift({ code: 'budget_reality', tone: 'warn', text: res.budgetReality.text });
  res.insights = ins;
  return res;
}

function availRank(a: Availability): number {
  return a === 'exact' ? 0 : a === 'variant' ? 1 : a === 'similar' ? 2 : 3;
}

type NeedFail = 'payment' | 'open' | 'distance' | 'fast';

function shopFails(rc: ReqCtx, s: ShopRec): NeedFail | null {
  const ctx = rc.ctx;
  if (ctx.providers?.length) {
    const pm = paymentMatch(ctx, s);
    if (pm && !pm.matched) return 'payment';
  }
  if (ctx.openNow && !isOpenState(shopState(rc, s).state)) return 'open';
  if (rc.range && !inRange(rc, s)) return 'distance';
  if (ctx.fastDelivery && s.fastDelivery !== true) return 'fast';
  return null;
}

function scoreAgg(
  core: Core,
  rc: ReqCtx,
  a: Agg,
  maxMatches: number,
  byRid: Map<number, Cand>,
  o: { bMin: number | undefined; bMax: number | undefined; needMode: boolean; target: Cand | null; catName: string | null },
): AssortmentStore {
  const lite = toShopLite(core, rc, a.shop);
  const n = a.rids.size;
  const availability: Availability = a.exactRids.size ? 'exact' : a.variantRids.size ? 'variant' : 'similar';
  const fMatches = Math.log1p(n) / Math.log1p(maxMatches);
  const hasBudget = o.bMin !== undefined || o.bMax !== undefined;
  const fBudget = !hasBudget ? 1 : a.priced ? a.inBudget / a.priced : 0.5;
  const fDist = lite.distanceKm === null ? 0.5 : Math.exp(-lite.distanceKm / 4);
  const st = lite.openStatus.state;
  const fOpen = st === 'open' ? 1 : st === 'closing_soon' ? 0.5 : st === 'unknown' ? 0.55 : st === 'opens_later_today' ? 0.4 : 0;
  const fDisc = a.shop.updateDiscipline ?? 0.3;
  let score =
    100 * (NEED_WEIGHTS.matches * fMatches + NEED_WEIGHTS.budget * fBudget + NEED_WEIGHTS.distance * fDist + NEED_WEIGHTS.open * fOpen + NEED_WEIGHTS.discipline * fDisc);
  if (availability === 'exact') score += 10;
  else if (availability === 'variant') score += 5;
  a.prices.sort((x, y) => x - y);
  const brands = [...new Set([...a.rids].map((r) => byRid.get(r)?.brand).filter((b): b is string => !!b))].slice(0, 6);
  const reasons: Reason[] = [];
  if (availability === 'similar' || o.needMode) {
    reasons.push({ code: 'assortment', label: `${formatNumber(n)} مدل${o.catName ? ` ${o.catName}` : ''} ثبت کرده`, tone: n >= 5 ? 'good' : 'info' });
  }
  if (a.prices.length) {
    const lo = a.prices[0]!;
    const hi = a.prices[a.prices.length - 1]!;
    reasons.push({ code: 'price_range', label: lo === hi ? formatTomanShort(lo) : `از ${formatTomanShort(lo)} تا ${formatTomanShort(hi)}`, tone: 'info' });
  }
  if (hasBudget && a.priced) {
    reasons.push({
      code: 'budget_fit',
      label: a.inBudget ? `${formatNumber(a.inBudget)} قیمت در بودجهٔ ${budgetLabel(o.bMin ?? null, o.bMax ?? null)}` : 'قیمتی در بودجهٔ شما ثبت نکرده',
      tone: a.inBudget ? 'good' : 'warn',
    });
  }
  if (lite.distanceKm !== null && lite.distanceKm <= 3) {
    reasons.push({ code: 'near', label: `${rc.locationLabel ? `نزدیک ${rc.locationLabel}` : 'نزدیک شما'} · ${formatDistance(lite.distanceKm)}`, tone: 'good' });
  }
  if (st === 'open') reasons.push({ code: 'open', label: rc.visitIsNow ? 'در زمان رسیدن باز است' : 'در زمان مراجعه باز است', tone: 'good' });
  else if (st !== 'unknown') reasons.push({ code: st, label: lite.openStatus.label, tone: st === 'closed' ? 'bad' : 'warn' });
  else reasons.push({ code: 'hours_unknown', label: 'ساعت کاری ثبت نشده — بپرسید', tone: 'info' });
  const freshShare = a.priced ? a.fresh / a.priced : null;
  if (freshShare !== null && freshShare >= 0.6) reasons.push({ code: 'fresh', label: `${formatNumber(Math.round(freshShare * 100))}٪ قیمت‌ها تازه`, tone: 'good' });
  else if (freshShare !== null && freshShare < 0.2) reasons.push({ code: 'stale_prices', label: 'بیشتر قیمت‌ها قدیمی است — بپرسید', tone: 'warn' });
  if (a.shop.locConfidence === 'high' && lite.location.mall) reasons.push({ code: 'location', label: lite.location.guide.join('، '), tone: 'info' });
  return {
    shop: lite,
    availability,
    availabilityLabel: availabilityLabel(availability, n, o.needMode),
    matchCount: n,
    samples: [],
    priceMin: a.prices.length ? a.prices[0]! : null,
    priceMax: a.prices.length ? a.prices[a.prices.length - 1]! : null,
    brands,
    sizes: [],
    freshShare: freshShare === null ? null : Math.round(freshShare * 100) / 100,
    score: Math.round(Math.min(100, Math.max(0, score))),
    reasons: reasons.slice(0, 5),
  };
}

function fillSamples(core: Core, rc: ReqCtx, stores: AssortmentStore[], aggs: Map<number, Agg>, byRid: Map<number, Cand>): void {
  const wanted = new Map<string, number[]>();
  for (const s of stores) {
    const rec = core.shopsById.get(s.shop.id);
    const a = rec ? aggs.get(rec.rid) : undefined;
    if (!a) continue;
    const ordered = [...a.exactRids, ...a.variantRids, ...[...a.rids].sort((x, y) => (byRid.get(y)?.popularity ?? 0) - (byRid.get(x)?.popularity ?? 0))];
    wanted.set(s.shop.id, [...new Set(ordered)].slice(0, SAMPLE_N));
  }
  const allRids = [...new Set([...wanted.values()].flat())];
  if (!allRids.length) return;
  const rows = core.db.all<{ product_rid: number; shop_rid: number; price: number | null; price_status: string; price_changed_at: string | null }>(
    `SELECT product_rid, shop_rid, price, price_status, price_changed_at FROM offers WHERE product_rid IN (SELECT value FROM json_each(?))`,
    JSON.stringify(allRids),
  );
  const best = new Map<string, { price: number | null; at: string | null }>();
  for (const r of rows) {
    const k = `${r.shop_rid}:${r.product_rid}`;
    const p = r.price_status === 'ok' && r.price && r.price > 0 ? r.price : null;
    const cur = best.get(k);
    if (!cur || (p !== null && (cur.price === null || p < cur.price))) best.set(k, { price: p, at: r.price_changed_at });
  }
  for (const s of stores) {
    const rec = core.shopsById.get(s.shop.id);
    const rids = wanted.get(s.shop.id);
    if (!rec || !rids) continue;
    s.samples = rids.map((rid): AssortmentSample => {
      const c = byRid.get(rid)!;
      const b = best.get(`${rec.rid}:${rid}`);
      return { productId: c.id, title: c.title, image: firstImage(c.images), price: b?.price ?? null, freshness: freshnessOf(b?.at ?? null, rc.asOf) };
    });
  }
}

function sizesOf(core: Core, stores: AssortmentStore[], aggs: Map<number, Agg>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const all = new Set<number>();
  for (const s of stores) {
    const rec = core.shopsById.get(s.shop.id);
    const a = rec ? aggs.get(rec.rid) : undefined;
    if (a) for (const r of a.rids) all.add(r);
  }
  if (!all.size) return out;
  const rows = core.db.all<{ product_rid: number; value: string }>(
    `SELECT product_rid, value FROM product_facets WHERE key IN (SELECT value FROM json_each(?)) AND product_rid IN (SELECT value FROM json_each(?))`,
    JSON.stringify(SIZE_KEYS),
    JSON.stringify([...all]),
  );
  const byRid = new Map<number, string[]>();
  for (const r of rows) (byRid.get(r.product_rid) ?? byRid.set(r.product_rid, []).get(r.product_rid)!).push(r.value);
  for (const s of stores) {
    const rec = core.shopsById.get(s.shop.id);
    const a = rec ? aggs.get(rec.rid) : undefined;
    if (!a) continue;
    const set = new Set<string>();
    for (const r of a.rids) for (const v of byRid.get(r) ?? []) set.add(v);
    out.set(
      s.shop.id,
      [...set].sort((x, y) => {
        const nx = Number(x);
        const ny = Number(y);
        return Number.isFinite(nx) && Number.isFinite(ny) ? nx - ny : x.localeCompare(y);
      }).slice(0, 16),
    );
  }
  return out;
}

// ───────────────────────── Budget reality (SV8) ─────────────────────────

const PHONE_CATEGORY = 'گوشی موبایل';

/** Feature («ساده») phone: memory only in MB. */
export function isBasicPhoneTitle(title: string): boolean {
  return /مگابایت/.test(title) && !/گیگ/.test(title);
}

export function budgetReality(
  core: Core,
  q: { categoryId: number | null; group: string | null; brand: string | null; budgetMax: number },
): BudgetReality | null {
  if (q.categoryId === null && !q.group && !q.brand) return null;
  const where: string[] = ['price_min IS NOT NULL', 'shop_count > 0'];
  const params: (string | number)[] = [];
  if (q.categoryId !== null) (where.push('category_id = ?'), params.push(q.categoryId));
  else if (q.group) (where.push('group_id = ?'), params.push(q.group));
  if (q.brand) (where.push('brand = ?'), params.push(q.brand));
  const rows = core.db.all<{ id: string; title: string; price_min: number; price_median: number | null; shop_count: number; is_replica: number; category_id: number }>(
    `SELECT id, title, price_min, price_median, shop_count, is_replica, category_id FROM products WHERE ${where.join(' AND ')}`,
    ...params,
  );
  if (rows.length < 5) return null;
  const isPhone = (c: number) => core.categories.get(c)?.name === PHONE_CATEGORY;
  const weak = (r: (typeof rows)[number]) => r.is_replica === 1 || (isPhone(r.category_id) && isBasicPhoneTitle(r.title));
  const credible = rows.filter((r) => !weak(r)).map((r) => r.price_median ?? r.price_min).sort((a, b) => a - b);
  if (!credible.length) return null;
  const p10 = quantileSorted(credible, 0.1)!;
  const inBudget = rows.filter((r) => r.price_min <= q.budgetMax);
  const weakIn = inBudget.filter(weak);
  const credibleIn = inBudget.length - weakIn.length;
  // only when nothing credible fits: the budget is under p10, or ≥ 70 % of what fits is basic / replica
  const trigger = credibleIn === 0 && (q.budgetMax < p10 || (inBudget.length > 0 && weakIn.length / inBudget.length >= 0.7));
  if (!trigger) return null;
  const pick = (minShops: number) =>
    rows.filter((r) => !weak(r) && r.shop_count >= minShops && r.price_min > q.budgetMax).sort((a, b) => a.price_min - b.price_min)[0];
  const cheapest = pick(3) ?? pick(1) ?? null;
  const cat = q.categoryId !== null ? core.categories.get(q.categoryId) ?? null : null;
  const phone = cat?.name === PHONE_CATEGORY;
  const thing = phone ? 'گوشی' : cat?.name ?? 'کالا';
  const brandPart = q.brand ? ` ${q.brand}` : '';
  const found = weakIn.length
    ? `فقط ${phone ? 'گوشی‌های ساده' : 'کالاهای ساده'} یا طرح${brandPart} پیدا شد`
    : `${thing}${brandPart} اصلی پیدا نشد`;
  const cheapestText = cheapest
    ? ` ارزان‌ترین ${phone ? 'گوشی هوشمند' : thing}${brandPart} اصل: ${cheapest.title.split('|')[0]!.trim()} از ${formatTomanShort(cheapest.price_min)} در ${formatNumber(cheapest.shop_count)} فروشگاه.`
    : '';
  const up = cheapest ? niceRound(cheapest.price_min * 1.05) : niceRound(p10);
  const actions: BudgetReality['actions'] = [
    { id: 'budget_up', label: `بودجه تا ${formatTomanShort(up)}`, contextPatch: { budgetMax: up } },
    { id: 'accept_basic', label: phone ? 'گوشی ساده هم خوبه' : 'کالای ساده هم خوبه' },
  ];
  if (q.brand) actions.push({ id: 'other_brands', label: `برندهای دیگر زیر ${formatTomanShort(q.budgetMax)}`, searchPatch: { priceMax: q.budgetMax } });
  actions.push({ id: 'show_replicas', label: 'کالاهای «طرح» را هم نشان بده', contextPatch: { showReplicas: true } });
  return {
    text: `با ${formatTomanShort(q.budgetMax)} ${found}.${cheapestText}`,
    cheapestCredible: cheapest ? { productId: cheapest.id, title: cheapest.title, price: cheapest.price_min, sellerCount: cheapest.shop_count } : null,
    actions,
  };
}
