/**
 * Shop details, products of a shop, shop lookup.
 */
import type { OpenStatus, ShopDetail, ShopLite, ShopProductsResponse, UserContext, WeeklyHours } from '@titl/shared';
import { normalizeForSearch, tehranParts } from '@titl/shared';
import { normalizeHours, statusFromParts } from '../domain/hours.js';
import { bestOfferIndex, registeredPriceOf, type OfferPriceRow } from '../domain/price.js';
import { parseWarranty, type Core, type ShopRec } from './core.js';
import { resolveCtx, toShopLite } from './context.js';
import { basicReasons, PRODUCT_COLS, sellerGeo, summarize, type ProductRow } from './products.js';

export function shopByIdOrRid(core: Core, id: string): ShopRec | undefined {
  return core.shopsById.get(id);
}

export function getShopLite(core: Core, id: string, ctx: UserContext): ShopLite | null {
  const s = shopByIdOrRid(core, id);
  return s ? toShopLite(core, resolveCtx(ctx), s) : null;
}

export function getShopHours(core: Core, id: string): WeeklyHours | null {
  const s = shopByIdOrRid(core, id);
  return s ? normalizeHours(s.hours) : null;
}

export function openStatus(core: Core, shopId: string, at: Date = new Date()): OpenStatus {
  const s = shopByIdOrRid(core, shopId);
  const iso = at.toISOString();
  if (!s) return { state: 'unknown', label: 'ساعت کاری ثبت نشده', at: iso };
  return statusFromParts(s.compiled, tehranParts(at), iso);
}

export function getShop(core: Core, id: string, ctx: UserContext): ShopDetail | null {
  const s = shopByIdOrRid(core, id);
  if (!s) return null;
  const rc = resolveCtx(ctx);
  const lite = toShopLite(core, rc, s);
  return {
    ...lite,
    phone: s.phone,
    phoneKind: s.phoneKind,
    phoneIsFake: true,
    instagram: s.instagram,
    website: s.website,
    categories: s.categories,
    hours: normalizeHours(s.hours),
    stats: { offerCount: s.offerCount, productCount: s.productCount, lastPriceChange: s.lastPriceChange },
    reports: core.deps.providers.reports.forShop(s.id, 10),
    nearbyMetro: core.metro.nearest(s, 3, 2.5),
    inTrafficZone: s.inTrafficZone,
  };
}

interface ShopOfferRow extends OfferPriceRow {
  product_rid: number;
  seller_title: string | null;
  warranty: string | null;
}

export function getShopProducts(
  core: Core,
  id: string,
  opts: { q?: string; page?: number; limit?: number },
  ctx: UserContext,
): ShopProductsResponse {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(60, Math.max(1, opts.limit ?? 24));
  const s = shopByIdOrRid(core, id);
  if (!s) return { items: [], total: 0, page, limit };
  const rc = resolveCtx(ctx);
  const offers = core.db.all<ShopOfferRow>(
    'SELECT product_rid, seller_title, warranty, price, raw_price, price_status, price_changed_at, price_rule FROM offers WHERE shop_rid = ?',
    s.rid,
  );
  const byProduct = new Map<number, ShopOfferRow[]>();
  for (const o of offers) {
    const l = byProduct.get(o.product_rid) ?? [];
    l.push(o);
    byProduct.set(o.product_rid, l);
  }
  const rows = core.db.all<ProductRow>(
    `SELECT ${PRODUCT_COLS} FROM products WHERE rid IN (SELECT DISTINCT product_rid FROM offers WHERE shop_rid = ?)`,
    s.rid,
  );
  const tokens = normalizeForSearch(opts.q ?? '')
    .split(' ')
    .filter(Boolean);
  const matches = (r: ProductRow, offs: ShopOfferRow[]) => {
    if (!tokens.length) return true;
    const hay = normalizeForSearch(`${r.title} ${r.brand ?? ''} ${r.title_en ?? ''} ${offs.map((o) => o.seller_title ?? '').join(' ')}`);
    return tokens.every((t) => hay.includes(t));
  };
  const list = rows
    .map((r) => ({ r, offs: byProduct.get(r.rid) ?? [] }))
    .filter(({ r, offs }) => matches(r, offs))
    .sort((a, b) => b.r.popularity - a.r.popularity || a.r.title.localeCompare(b.r.title, 'fa'));
  const items = list.slice((page - 1) * limit, page * limit).map(({ r, offs }) => {
    const best = offs[bestOfferIndex(offs)];
    const geo = sellerGeo(core, rc, r.rid);
    return {
      product: summarize(core, rc, r, basicReasons(r, geo, rc), geo),
      price: best ? registeredPriceOf(best, rc.asOf) : registeredPriceOf({ price: null, raw_price: null, price_status: 'missing', price_changed_at: null }, rc.asOf),
      sellerTitle: best?.seller_title?.trim() || null,
      warranty: best ? parseWarranty(best.warranty) : null,
    };
  });
  return { items, total: list.length, page, limit };
}

/** Free-text shop lookup over name, address, area and mall name (shops with offers first). */
export function findShops(core: Core, q: string, limit = 20): ShopLite[] {
  const rc = resolveCtx({});
  const n = Math.min(100, Math.max(1, limit));
  const tokens = normalizeForSearch(q).split(' ').filter(Boolean);
  const all = [...core.shopsById.values()];
  let hits: { s: ShopRec; score: number }[];
  if (!tokens.length) {
    hits = all.map((s) => ({ s, score: Math.log1p(s.offerCount) }));
  } else {
    const idTok = q.trim();
    hits = [];
    for (const s of all) {
      if (s.id === idTok) {
        hits.push({ s, score: 100 });
        continue;
      }
      let score = 0;
      let ok = true;
      for (const t of tokens) {
        if (s.nameNorm.includes(t)) score += s.nameNorm.startsWith(t) ? 3 : 2;
        else if (s.addressNorm.includes(t)) score += 1;
        else {
          ok = false;
          break;
        }
      }
      if (ok) hits.push({ s, score: score + Math.log1p(s.offerCount) * 0.3 });
    }
  }
  hits.sort((a, b) => b.score - a.score || b.s.offerCount - a.s.offerCount);
  return hits.slice(0, n).map(({ s }) => toShopLite(core, rc, s));
}
