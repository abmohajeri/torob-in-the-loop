/**
 * Product rows → ProductSummary / ProductDetail, and «similar products».
 */
import type { Audience, Freshness, ProductDetail, ProductSummary, Reason, SpecItem } from '@titl/shared';
import { formatNumber, formatTomanShort, freshnessOf, haversineKm } from '@titl/shared';
import { json } from '../db/sqlite.js';
import { priceStatsOf, type OfferPriceRow } from '../domain/price.js';
import { firstImage, groupName, imagesOf, shopRidsOf, type Core } from './core.js';
import { round2, shopOpenAtVisit, type ReqCtx } from './context.js';

export const PRODUCT_COLS = `rid, id, title, title_source, title_en, brand, brand_inferred, model, category_id, group_id, audience,
  images, specs, spec_count, offer_count, shop_count, valid_price_count, price_min, price_max, price_median,
  last_price_change, oldest_price_change, installment_shop_count, popularity, brand_source, model_key, is_replica`;

export interface ProductRow {
  rid: number;
  id: string;
  title: string;
  title_source: string;
  title_en: string | null;
  brand: string | null;
  brand_inferred: number;
  model: string | null;
  category_id: number;
  group_id: string;
  audience: string | null;
  images: string;
  specs: string | null;
  spec_count: number;
  offer_count: number;
  shop_count: number;
  valid_price_count: number;
  price_min: number | null;
  price_max: number | null;
  price_median: number | null;
  last_price_change: string | null;
  oldest_price_change: string | null;
  installment_shop_count: number;
  popularity: number;
  brand_source: string | null;
  model_key: string | null;
  is_replica: number;
}

const AUDIENCES: Audience[] = ['men', 'women', 'kids', 'unisex'];
export const asAudience = (s: string | null): Audience | null => (s && (AUDIENCES as string[]).includes(s) ? (s as Audience) : null);

export function productRowById(core: Core, id: string): ProductRow | undefined {
  return core.db.get<ProductRow>(`SELECT ${PRODUCT_COLS} FROM products WHERE id = ?`, id);
}

export function productRowByRid(core: Core, rid: number): ProductRow | undefined {
  return core.db.get<ProductRow>(`SELECT ${PRODUCT_COLS} FROM products WHERE rid = ?`, rid);
}

/** Rows for rids, returned in the same order as `rids`. */
export function productRowsByRids(core: Core, rids: number[]): ProductRow[] {
  if (!rids.length) return [];
  const rows = core.db.all<ProductRow>(`SELECT ${PRODUCT_COLS} FROM products WHERE rid IN (SELECT value FROM json_each(?))`, JSON.stringify(rids));
  const byRid = new Map(rows.map((r) => [r.rid, r]));
  return rids.map((r) => byRid.get(r)).filter((r): r is ProductRow => !!r);
}

export interface SellerGeo {
  nearest: { shopId: string; distanceKm: number } | null;
  nearby: number | null;
  /** Sellers open at the visit time. */
  openCount: number;
}

/** Nearest seller / sellers within the nearby radius, from the in-memory offer index. */
export function sellerGeo(core: Core, rc: ReqCtx, rid: number, radiusKm = rc.nearbyKm): SellerGeo {
  const shops = shopRidsOf(core, rid);
  let nearest: SellerGeo['nearest'] = null;
  let nearby = 0;
  let openCount = 0;
  for (const sr of shops) {
    const s = core.shops[sr];
    if (!s) continue;
    if (shopOpenAtVisit(rc, s)) openCount++;
    if (!rc.location) continue;
    const d = haversineKm(rc.location, s);
    if (d <= radiusKm) nearby++;
    if (!nearest || d < nearest.distanceKm) nearest = { shopId: s.id, distanceKm: d };
  }
  if (nearest) nearest = { shopId: nearest.shopId, distanceKm: round2(nearest.distanceKm) };
  return { nearest, nearby: rc.location ? nearby : null, openCount };
}

export function categoryName(core: Core, id: number): string {
  return core.categories.get(id)?.name ?? 'سایر';
}

export function freshnessOfRow(row: Pick<ProductRow, 'last_price_change'>, now: Date): Freshness {
  return freshnessOf(row.last_price_change, now);
}

export function summarize(core: Core, rc: ReqCtx, row: ProductRow, reasons: Reason[] = [], geo?: SellerGeo): ProductSummary {
  const g = geo ?? sellerGeo(core, rc, row.rid);
  return {
    id: row.id,
    title: row.title,
    titleSource: row.title_source === 'seller' || row.title_source === 'generated' ? row.title_source : 'catalog',
    brand: row.brand,
    brandInferred: row.brand_inferred === 1,
    category: categoryName(core, row.category_id),
    categoryGroup: row.group_id,
    image: firstImage(row.images),
    priceMin: row.price_min,
    priceMax: row.price_max,
    priceMedian: row.price_median,
    sellerCount: row.shop_count,
    validPriceCount: row.valid_price_count,
    lastPriceChange: row.last_price_change,
    freshness: freshnessOfRow(row, rc.asOf),
    nearest: g.nearest,
    sellersNearby: g.nearby,
    installmentSellers: row.installment_shop_count,
    audience: asAudience(row.audience),
    reasons,
    modelKey: row.model_key,
    isReplica: row.is_replica === 1,
    brandSource: row.brand_source === 'dataset' || row.brand_source === 'spec' || row.brand_source === 'title' ? row.brand_source : null,
  };
}

/** Generic product reasons (used outside search: similar, alternatives, shop products). */
export function basicReasons(row: ProductRow, geo: SellerGeo, rc: ReqCtx): Reason[] {
  const out: Reason[] = [];
  if (geo.nearby && geo.nearby > 0) {
    const where = rc.locationLabel ? `نزدیک ${rc.locationLabel}` : 'نزدیک شما';
    out.push({ code: 'near', label: `${formatNumber(geo.nearby)} فروشنده ${where}`, tone: 'good' });
  }
  if (row.shop_count >= 3) out.push({ code: 'sellers', label: `${formatNumber(row.shop_count)} فروشنده حضوری`, tone: 'info' });
  if (row.installment_shop_count > 0 && (rc.ctx.installment || rc.ctx.providers?.length)) {
    out.push({ code: 'installment', label: `قسطی در ${formatNumber(row.installment_shop_count)} فروشگاه`, tone: 'good' });
  }
  if (freshnessOf(row.last_price_change, rc.asOf) === 'fresh') out.push({ code: 'fresh', label: 'قیمت‌ها تازه', tone: 'good' });
  return out.slice(0, 3);
}

// ───────────────────────── Detail ─────────────────────────

export function specsOf(row: Pick<ProductRow, 'specs'>): SpecItem[] {
  const raw = json<unknown[]>(row.specs, []);
  const out: SpecItem[] = [];
  for (const it of raw) {
    if (Array.isArray(it) && typeof it[0] === 'string' && (typeof it[1] === 'string' || typeof it[1] === 'number')) {
      out.push({ key: it[0], value: String(it[1]) });
    } else if (it && typeof it === 'object' && 'key' in it && 'value' in it) {
      const o = it as { key: unknown; value: unknown };
      if (typeof o.key === 'string') out.push({ key: o.key, value: String(o.value) });
    }
  }
  return out;
}

export function offerPriceRows(core: Core, rid: number): OfferPriceRow[] {
  return core.db.all<OfferPriceRow>('SELECT price, raw_price, price_status, price_changed_at, price_rule FROM offers WHERE product_rid = ?', rid);
}

export function buildDetail(core: Core, rc: ReqCtx, row: ProductRow): ProductDetail {
  const geo = sellerGeo(core, rc, row.rid);
  const summary = summarize(core, rc, row, basicReasons(row, geo, rc), geo);
  const stats = priceStatsOf(offerPriceRows(core, row.rid), rc.asOf);
  const specs = specsOf(row);
  const notes: string[] = [];
  if (summary.titleSource === 'seller') {
    notes.push('عنوان اصلی این کالا در داده‌های منتشرشده حذف شده بود؛ عنوانی که یکی از فروشنده‌ها نوشته نمایش داده می‌شود.');
  } else if (summary.titleSource === 'generated') {
    notes.push('عنوان این کالا در داده‌ها موجود نبود؛ عنوان از روی دسته و برند ساخته شده است.');
  }
  if (summary.brandInferred && summary.brand) {
    notes.push(
      row.brand_source === 'spec'
        ? `برند «${summary.brand}» به‌صورت خودکار از مشخصات کالا تشخیص داده شد.`
        : `برند «${summary.brand}» به‌صورت خودکار از روی عنوان کالا تشخیص داده شد.`,
    );
  }
  if (row.is_replica === 1) notes.push('عنوان این کالا آن را «طرح/کپی» معرفی می‌کند؛ کالای اصل نیست.');
  if (!specs.length) notes.push('مشخصات فنی برای این کالا ثبت نشده است.');
  if (stats.suspiciousCount > 0) {
    notes.push(`${formatNumber(stats.suspiciousCount)} قیمت ثبت‌شده غیرعادی بود (احتمالاً خطای ثبت) و در آمار قیمت لحاظ نشد.`);
  }
  if (stats.missingCount > 0) notes.push(`${formatNumber(stats.missingCount)} فروشنده قیمتی ثبت نکرده‌اند؛ می‌توانید از آن‌ها بپرسید.`);
  const old = stats.freshnessBuckets.stale + stats.freshnessBuckets.very_stale;
  if (old > 0 && old >= stats.validCount / 2) notes.push('بیشتر قیمت‌ها بیش از دو ماه پیش از زمان تهیهٔ داده‌ها تغییر کرده‌اند؛ پیش از رفتن قیمت به‌روز را استعلام کنید.');
  if (row.shop_count === 0) notes.push('در حال حاضر فروشنده حضوری برای این کالا ثبت نشده است.');
  return {
    ...summary,
    titleEn: row.title_en,
    model: row.model,
    images: imagesOf(row.images),
    specs,
    priceStats: stats,
    notes,
  };
}

// ───────────────────────── Similar ─────────────────────────

/**
 * Similar products: same category (+ same brand bonus), price within ±35 % of the product median,
 * at least one seller; prefers products with sellers nearby (when the location is known).
 */
export function similarProducts(
  core: Core,
  rc: ReqCtx,
  row: ProductRow,
  opts: { limit?: number; cheaperThan?: number | null; requireNearby?: boolean; excludeRids?: Set<number>; maxPrice?: number | null } = {},
): ProductSummary[] {
  const limit = opts.limit ?? 8;
  const ref = row.price_median ?? row.price_min;
  const lo = ref ? Math.round(ref * 0.65) : null;
  const hi = ref ? Math.round(ref * 1.35) : null;
  const params: (number | string)[] = [row.category_id, row.rid];
  let where = 'category_id = ? AND rid != ? AND shop_count > 0';
  if (lo !== null && hi !== null) {
    where += ' AND price_median IS NOT NULL AND price_median BETWEEN ? AND ?';
    params.push(lo, hi);
  }
  if (opts.cheaperThan) {
    where += ' AND price_min IS NOT NULL AND price_min < ?';
    params.push(opts.cheaperThan);
  }
  // SV10: respect the budget (context budgetMax unless overridden)
  const maxPrice = opts.maxPrice !== undefined ? opts.maxPrice : rc.ctx.budgetMax ?? null;
  if (maxPrice) {
    where += ' AND price_min IS NOT NULL AND price_min <= ?';
    params.push(maxPrice);
  }
  if (!rc.ctx.showReplicas && row.is_replica !== 1) where += ' AND is_replica = 0';
  const rows = core.db.all<ProductRow>(`SELECT ${PRODUCT_COLS} FROM products WHERE ${where} ORDER BY popularity DESC LIMIT 300`, ...params);
  const scored: { row: ProductRow; geo: SellerGeo; score: number }[] = [];
  for (const r of rows) {
    if (opts.excludeRids?.has(r.rid)) continue;
    const geo = sellerGeo(core, rc, r.rid);
    if (opts.requireNearby && rc.location && !geo.nearby) continue;
    let score = r.popularity * 0.35;
    if (row.brand && r.brand === row.brand) score += 0.6;
    if (row.model_key && r.model_key === row.model_key) score += 0.5;
    if (ref && r.price_median) score += 0.5 * (1 - Math.min(1, Math.abs(r.price_median - ref) / ref / 0.35));
    if (geo.nearest) score += geo.nearest.distanceKm <= 2 ? 0.4 : geo.nearest.distanceKm <= 5 ? 0.2 : 0;
    if (geo.nearby) score += Math.min(0.3, geo.nearby * 0.1);
    if (opts.cheaperThan && r.price_min) score += 0.6 * (1 - r.price_min / opts.cheaperThan);
    scored.push({ row: r, geo, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ row: r, geo }) => {
    const reasons: Reason[] = [];
    if (row.model_key && r.model_key === row.model_key) reasons.push({ code: 'same_model', label: 'همان مدل، نسخهٔ دیگر', tone: 'info' });
    else if (row.brand && r.brand === row.brand) reasons.push({ code: 'same_brand', label: `همان برند (${r.brand})`, tone: 'info' });
    if (ref && r.price_median) {
      if (r.price_median < ref * 0.95) reasons.push({ code: 'cheaper', label: `حدود ${formatTomanShort(ref - r.price_median)} ارزان‌تر`, tone: 'good' });
      else if (r.price_median > ref * 1.05) reasons.push({ code: 'pricier', label: `حدود ${formatTomanShort(r.price_median - ref)} گران‌تر`, tone: 'info' });
      else reasons.push({ code: 'similar_price', label: 'در همین محدوده قیمت', tone: 'info' });
    }
    reasons.push(...basicReasons(r, geo, rc));
    return summarize(core, rc, r, reasons.slice(0, 3), geo);
  });
}

export function groupLabelOf(core: Core, id: string): string {
  return groupName(core, id);
}
