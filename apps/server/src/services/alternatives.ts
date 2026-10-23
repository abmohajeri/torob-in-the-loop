/**
 * Alternatives when a visit/inquiry fails (closed, no answer, out of stock, too expensive…):
 * (1) the same product at other shops, (2) shops of the same category in the same mall/area,
 * (3) similar products with sellers nearby.
 */
import type { AlternativesRequest, AlternativesResponse, CandidateShop, ProductSummary, Reason, StoreOffer } from '@titl/shared';
import { ALT_REASON_META, formatClock, formatNumber, formatTomanShort, haversineKm } from '@titl/shared';
import { isOpenState } from '../domain/hours.js';
import { walkMinutes } from '../domain/travel.js';
import type { Core, ShopRec } from './core.js';
import { resolveCtx, shopState, toShopLite, type ReqCtx } from './context.js';
import { productRowById, similarProducts } from './products.js';
import { buildStoreOffers, categoryOnlyShops, type FilterKey } from './stores.js';

/** SV10: constraints relaxed one at a time (least important first) when nothing passes all filters. */
const RELAX_ORDER: { key: FilterKey; label: string }[] = [
  { key: 'open', label: 'بدون شرط «باز در زمان مراجعه»' },
  { key: 'distance', label: 'خارج از محدودهٔ انتخابی' },
  { key: 'fast', label: 'بدون شرط ارسال فوری' },
  { key: 'warranty', label: 'بدون شرط گارانتی' },
  { key: 'budget', label: 'کمی بالاتر از بودجه' },
  { key: 'payment', label: 'بدون شرط روش پرداخت' },
];

/** SV10 relative chips: same mall / floor, price difference, open until. */
export function relativeChips(core: Core, rc: ReqCtx, failed: ShopRec | undefined, failedPrice: number | null, s: StoreOffer): Reason[] {
  const out: Reason[] = [];
  const rec = core.shopsById.get(s.shop.id);
  if (failed && rec) {
    const km = haversineKm(failed, rec);
    const walk = Math.max(1, walkMinutes(km));
    if (failed.mallId !== null && rec.mallId === failed.mallId) {
      const floor = rec.floorNum !== null ? (rec.floorNum === 0 ? '، همکف' : rec.floorNum < 0 ? '، زیرزمین' : `، طبقهٔ ${formatNumber(rec.floorNum)}`) : '';
      out.push({ code: 'same_mall', label: `همان پاساژ${floor} — ${formatNumber(walk)} دقیقه پیاده`, tone: 'good' });
    } else if (km <= 0.7) {
      out.push({ code: 'walkable', label: `${formatNumber(walk)} دقیقه پیاده از فروشگاه قبلی`, tone: 'good' });
    }
  }
  const p = s.verified?.price ?? s.price.price;
  if (failedPrice !== null && p !== null && p !== failedPrice) {
    const d = failedPrice - p;
    out.push({ code: d > 0 ? 'cheaper' : 'pricier', label: `${formatTomanShort(Math.abs(d))} ${d > 0 ? 'ارزان‌تر' : 'گران‌تر'}`, tone: d > 0 ? 'good' : 'info' });
  }
  const st = s.shop.openStatus;
  if ((st.state === 'open' || st.state === 'closing_soon') && st.closesAt) out.push({ code: 'open_until', label: `تا ${formatClock(st.closesAt)} باز است`, tone: 'good' });
  return out.slice(0, 3);
}

const SAME_LIMIT = 5;

export function alternatives(core: Core, req: AlternativesRequest): AlternativesResponse {
  const ctx = req.context ?? {};
  const rc = resolveCtx(ctx);
  const reason = req.reason;
  const failed: ShopRec | undefined = req.shopId ? core.shopsById.get(req.shopId) : undefined;
  const row = req.productId ? productRowById(core, req.productId) : undefined;
  const exclude = new Set<string>(failed ? [failed.id] : []);
  const ref = req.origin ?? (failed ? { lat: failed.lat, lng: failed.lng } : rc.location);

  let sameProduct: StoreOffer[] = [];
  let failedPrice: number | null = null;
  let relaxed: AlternativesResponse['relaxed'] = null;
  if (row) {
    const ignore = new Set<FilterKey>();
    // the failure itself defines what to relax: an installment miss ignores named providers, a budget miss is the point
    if (reason === 'no_installment') ignore.add('payment');
    let built = buildStoreOffers(core, rc, row, { excludeShops: exclude, ignore });
    if (!built.stores.length) {
      for (const r of RELAX_ORDER) {
        if (ignore.has(r.key) || !(built.excludedBy.get(r.key) ?? 0)) continue;
        const trial = buildStoreOffers(core, rc, row, { excludeShops: exclude, ignore: new Set([...ignore, r.key]) });
        if (trial.stores.length) {
          built = trial;
          relaxed = { constraint: r.key, label: r.label };
          break;
        }
      }
    }
    if (failed) {
      const fb = buildStoreOffers(core, rc, row, { filter: false, onlyShops: new Set([failed.id]) });
      failedPrice = fb.stores[0]?.price.price ?? null;
    }
    let list = built.stores;
    if (reason === 'closed' || reason === 'no_answer' || reason === 'unreachable') {
      list = list.filter((s) => {
        const rec = core.shopsById.get(s.shop.id);
        return rec ? isOpenState(shopState(rc, rec).state) : false;
      });
    }
    if (reason === 'no_installment') {
      list = list.filter((s) => {
        const t = core.shopsById.get(s.shop.id)?.installmentTier;
        return t === 'in_person' || t === 'declared_unknown_channel' || t === 'seller_text';
      });
    }
    if (reason === 'too_expensive' || reason === 'over_budget') {
      const cap = reason === 'over_budget' && ctx.budgetMax !== undefined ? ctx.budgetMax : failedPrice ?? row.price_median;
      list = list.filter((s) => s.price.price !== null && (cap === null || s.price.price < cap));
      list.sort((a, b) => a.price.price! - b.price.price! || b.score - a.score);
    } else {
      const dist = (s: StoreOffer) => (ref ? haversineKm(ref, s.shop) : null);
      list.sort((a, b) => {
        const am = failed?.mallId != null && a.shop.location.mall?.id === failed.mallId ? 0 : 1;
        const bm = failed?.mallId != null && b.shop.location.mall?.id === failed.mallId ? 0 : 1;
        if (am !== bm) return am - bm;
        const da = dist(a);
        const db = dist(b);
        if (da !== null && db !== null && Math.abs(da - db) > 0.05) return da - db;
        return b.score - a.score;
      });
    }
    sameProduct = list.slice(0, SAME_LIMIT).map((s, i) => ({ ...s, rank: i + 1 }));
  }
  const chips: Record<string, Reason[]> = {};
  for (const s of sameProduct) {
    const c = relativeChips(core, rc, failed, failedPrice, s);
    if (c.length) chips[s.shop.id] = c;
  }

  // category-only shops in the same mall (or area)
  let samePassage: CandidateShop[] = [];
  const catIds: number[] = [];
  if (row) catIds.push(row.category_id);
  else if (failed) for (const name of failed.categories) {
    const c = core.categoriesByName.get(name);
    if (c) catIds.push(c.id);
  }
  if (failed && catIds.length) {
    const ex = new Set([...exclude, ...sameProduct.map((s) => s.shop.id)]);
    if (row) for (const id of buildStoreOffers(core, rc, row, { filter: false }).allShopIds) ex.add(id);
    const seen = new Set<string>();
    for (const cid of catIds.slice(0, 3)) {
      const list = categoryOnlyShops(core, rc, cid, ex, {
        limit: 6,
        near: { lat: failed.lat, lng: failed.lng },
        mallId: failed.mallId,
        area: failed.mallId === null ? failed.area : null,
      });
      for (const c of list) if (!seen.has(c.shop.id)) (seen.add(c.shop.id), samePassage.push(c));
    }
    samePassage = samePassage.slice(0, 6);
  }

  // similar products
  let similar: ProductSummary[] = [];
  if (row) {
    const cheaper =
      reason === 'too_expensive' ? failedPrice ?? row.price_median : reason === 'over_budget' ? ctx.budgetMax ?? failedPrice ?? row.price_median : null;
    similar = similarProducts(core, rc, row, { limit: 6, requireNearby: true, cheaperThan: cheaper });
    if (!similar.length) similar = similarProducts(core, rc, row, { limit: 6, cheaperThan: cheaper });
  }

  // «اگر هیچ‌کدام نشد»: tier-B shops (categories only) in the same mall
  const fallbackTierB: CandidateShop[] = [];
  if (failed?.mallId != null) {
    const seen = new Set([...exclude, ...sameProduct.map((s) => s.shop.id), ...samePassage.map((c) => c.shop.id)]);
    for (const s of core.mallShops.get(failed.mallId) ?? []) {
      if (s.tier !== 'B' || seen.has(s.id)) continue;
      fallbackTierB.push({ shop: toShopLite(core, rc, s), matchedCategory: s.categories[0] ?? '', note: 'فقط دستهٔ فعالیت اعلام شده؛ کالایی ثبت نکرده' });
      if (fallbackTierB.length >= 5) break;
    }
  }

  const res: AlternativesResponse = {
    reason,
    headline: headlineOf(reason, sameProduct.length, rc.visitIsNow, !!row),
    sameProduct,
    samePassage,
    similarProducts: similar,
    relaxed,
    relativeChips: chips,
  };
  if (fallbackTierB.length) res.fallbackTierB = fallbackTierB;
  return res;
}

function headlineOf(reason: AlternativesRequest['reason'], n: number, now: boolean, hasProduct: boolean): string {
  if (!hasProduct || n === 0) return ALT_REASON_META[reason].headline;
  const cnt = formatNumber(n);
  if (n === 1) {
    switch (reason) {
      case 'closed':
        return `فروشگاه بسته بود؟ این فروشگاه ${now ? 'همین الان' : 'در زمان مراجعه'} باز است و همین کالا را دارد`;
      case 'too_expensive':
        return 'گران‌تر از انتظار بود؟ این فروشگاه قیمت کمتری ثبت کرده است';
      case 'over_budget':
        return 'بالاتر از بودجه بود؟ این فروشگاه قیمت داخل بودجهٔ شما ثبت کرده است';
      case 'no_installment':
        return 'قسطی نداشت؟ این فروشگاه اقساط اعلام کرده است';
      case 'out_of_stock':
        return 'تمام شده بود؟ این فروشگاه هم همین کالا را ثبت کرده است';
      default:
        return 'این فروشگاه هم همین کالا را ثبت کرده و در دسترس است';
    }
  }
  switch (reason) {
    case 'closed':
      return `فروشگاه بسته بود؟ این ${cnt} فروشگاه ${now ? 'همین الان' : 'در زمان مراجعه'} باز هستند و همین کالا را دارند`;
    case 'no_answer':
    case 'unreachable':
      return `فروشنده در دسترس نبود؛ ${cnt} فروشگاه باز دیگر همین کالا را ثبت کرده‌اند`;
    case 'out_of_stock':
      return `تمام شده بود؟ ${cnt} فروشگاه دیگر همین کالا را ثبت کرده‌اند`;
    case 'too_expensive':
      return `گران‌تر از انتظار بود؟ ${cnt} فروشگاه قیمت کمتری ثبت کرده‌اند`;
    case 'over_budget':
      return `بالاتر از بودجه بود؟ ${cnt} فروشگاه قیمت داخل بودجهٔ شما ثبت کرده‌اند`;
    case 'no_installment':
      return `قسطی نداشت؟ ${cnt} فروشگاه اقساط اعلام کرده‌اند`;
    default:
      return `${cnt} فروشگاه دیگر نزدیک شما همین کالا را دارند`;
  }
}
