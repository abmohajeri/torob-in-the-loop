/**
 * Side-by-side comparison of products (specs + price/seller rows) and of stores for one product.
 * Summaries are deterministic Persian text built only from the compared data.
 */
import type {
  CompareProductsResponse,
  CompareRow,
  CompareStoresResponse,
  ProductDetail,
  Reason,
  StoreOffer,
  UserContext,
} from '@titl/shared';
import {
  FRESHNESS_META,
  formatDistance,
  formatJalaliDate,
  formatMinutes,
  formatNumber,
  formatRelative,
  formatToman,
  formatTomanShort,
} from '@titl/shared';
import { hoursTodayLabel } from '../domain/hours.js';
import type { Core } from './core.js';
import { resolveCtx } from './context.js';
import { buildDetail, productRowById, sellerGeo, summarize, basicReasons } from './products.js';
import { buildStoreOffers, sortStores } from './stores.js';

type Num = number | null;

/** Index of min/max among non-null numbers; null when < 2 comparable values or all equal. */
export function bestOf(values: Num[], dir: 'min' | 'max'): number | null {
  let best: number | null = null;
  let n = 0;
  values.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) return;
    n++;
    if (best === null || (dir === 'min' ? v < values[best]! : v > values[best]!)) best = i;
  });
  if (n < 2 || best === null) return null;
  const bv = values[best];
  if (values.every((v) => v === null || v === bv)) return null;
  return best;
}

function row(key: string, values: (string | null)[], bestIndex: number | null = null): CompareRow {
  const present = values.filter((v) => v !== null);
  const differs = new Set(values.map((v) => v ?? '—')).size > 1 && present.length > 0;
  return { key, values, differs, bestIndex };
}

function normVal(v: string): string {
  return v.replace(/\s+/g, ' ').trim();
}

// ───────────────────────── Products ─────────────────────────

export function compareProducts(core: Core, ids: string[], ctx: UserContext): CompareProductsResponse {
  const rc = resolveCtx(ctx);
  const uniq = [...new Set(ids)].slice(0, 4);
  const products: ProductDetail[] = [];
  for (const id of uniq) {
    const r = productRowById(core, id);
    if (r) products.push(buildDetail(core, rc, r));
  }
  const rows: CompareRow[] = [];
  const priceMin = products.map((p) => p.priceMin);
  const median = products.map((p) => p.priceMedian);
  const sellers = products.map((p) => p.sellerCount);
  rows.push(row('کمترین قیمت ثبت‌شده', priceMin.map((v) => (v === null ? null : formatToman(v))), bestOf(priceMin, 'min')));
  rows.push(row('قیمت میانه', median.map((v) => (v === null ? null : formatToman(v))), bestOf(median, 'min')));
  rows.push(row('تعداد فروشنده حضوری', sellers.map((v) => formatNumber(v)), bestOf(sellers, 'max')));
  if (rc.location) {
    const near = products.map((p) => p.nearest?.distanceKm ?? null);
    rows.push(row('نزدیک‌ترین فروشنده', near.map((v) => (v === null ? null : formatDistance(v))), bestOf(near, 'min')));
    const nearby = products.map((p) => p.sellersNearby);
    rows.push(row('فروشنده در نزدیکی شما', nearby.map((v) => (v === null ? null : formatNumber(v))), bestOf(nearby, 'max')));
  }
  const inst = products.map((p) => p.installmentSellers);
  rows.push(row('فروشنده با امکان اقساط', inst.map((v) => formatNumber(v)), bestOf(inst, 'max')));
  rows.push(row('تازگی قیمت‌ها', products.map((p) => FRESHNESS_META[p.freshness].label)));
  rows.push(row('برند', products.map((p) => p.brand)));
  rows.push(row('دسته', products.map((p) => p.category)));

  // spec rows: union of keys in first-seen order (keys present in ≥ 1 product)
  const keyOrder: string[] = [];
  const maps = products.map((p) => {
    const m = new Map<string, string>();
    for (const s of p.specs) {
      if (!m.has(s.key)) m.set(s.key, normVal(s.value));
      if (!keyOrder.includes(s.key)) keyOrder.push(s.key);
    }
    return m;
  });
  // keys shared by more products first, stable otherwise
  const coverage = (k: string) => maps.filter((m) => m.has(k)).length;
  const specKeys = keyOrder
    .map((k, i) => ({ k, i, c: coverage(k) }))
    .sort((a, b) => b.c - a.c || a.i - b.i)
    .slice(0, 40)
    .map((x) => x.k);
  const specStart = rows.length;
  for (const k of specKeys) rows.push(row(k, maps.map((m) => m.get(k) ?? null)));

  // highlights
  const highlights = products.map((p) => ({ productId: p.id, reasons: [] as Reason[] }));
  const add = (i: number | null, r: Reason) => {
    if (i !== null) highlights[i]!.reasons.push(r);
  };
  const cheapest = bestOf(priceMin, 'min');
  const most = bestOf(sellers, 'max');
  add(cheapest, { code: 'cheapest', label: 'ارزان‌ترین', tone: 'good' });
  add(most, { code: 'most_sellers', label: 'بیشترین فروشنده حضوری', tone: 'good' });
  if (rc.location) add(bestOf(products.map((p) => p.nearest?.distanceKm ?? null), 'min'), { code: 'nearest', label: 'نزدیک‌ترین فروشنده', tone: 'good' });
  const freshRank = products.map((p) => (p.lastPriceChange ? Date.parse(p.lastPriceChange) : null));
  add(bestOf(freshRank, 'max'), { code: 'freshest', label: 'تازه‌ترین قیمت', tone: 'info' });
  products.forEach((p, i) => {
    if (p.specs.length >= 5) highlights[i]!.reasons.push({ code: 'specs', label: 'مشخصات کامل', tone: 'info' });
    if (p.sellerCount === 0) highlights[i]!.reasons.push({ code: 'no_sellers', label: 'فروشنده حضوری ثبت نشده', tone: 'warn' });
  });

  return { products, rows, highlights, summary: productSummary(products, rows.slice(specStart), cheapest, most), summarySource: 'rules' };
}

function short(p: ProductDetail): string {
  const t = p.title.length > 42 ? `${p.title.slice(0, 40).trim()}…` : p.title;
  return `«${t}»`;
}

function productSummary(products: ProductDetail[], specRows: CompareRow[], cheapest: number | null, most: number | null): string {
  if (products.length < 2) return products.length ? 'برای مقایسه حداقل دو کالا انتخاب کنید.' : 'کالایی برای مقایسه پیدا نشد.';
  const parts: string[] = [];
  if (cheapest !== null) {
    const p = products[cheapest]!;
    const others = products.filter((_, i) => i !== cheapest).map((x) => x.priceMin).filter((v): v is number => v !== null);
    const gap = others.length && p.priceMin !== null ? Math.min(...others) - p.priceMin : 0;
    parts.push(`${short(p)} ارزان‌تر است${gap > 0 ? ` (حدود ${formatTomanShort(gap)} کمتر)` : ''}`);
  } else if (products.every((p) => p.priceMin === null)) {
    parts.push('برای این کالاها قیمت معتبری ثبت نشده است');
  }
  if (most !== null) parts.push(`${short(products[most]!)} با ${formatNumber(products[most]!.sellerCount)} فروشنده، راحت‌تر پیدا می‌شود`);
  const diffSpecs = specRows.filter((r) => r.differs && r.values.every((v) => v !== null));
  if (diffSpecs.length) {
    parts.push(`تفاوت اصلی در ${diffSpecs.slice(0, 3).map((r) => r.key).join('، ')} است`);
  } else if (!specRows.some((r) => r.values.every((v) => v !== null))) {
    parts.push('مشخصات فنی کامل برای مقایسه دقیق ثبت نشده است');
  }
  return `${parts.join('؛ ')}.`;
}

// ───────────────────────── Stores ─────────────────────────

export function compareStores(core: Core, productId: string, shopIds: string[], ctx: UserContext): CompareStoresResponse | null {
  const prow = productRowById(core, productId);
  if (!prow) return null;
  const rc = resolveCtx(ctx);
  const wanted = [...new Set(shopIds)].slice(0, 4);
  const built = buildStoreOffers(core, rc, prow, { filter: false, onlyShops: new Set(wanted) });
  sortStores(built.stores, 'smart'); // assigns ranks among the compared stores
  const byId = new Map(built.stores.map((s) => [s.shop.id, s]));
  const stores: StoreOffer[] = wanted.map((id) => byId.get(id)).filter((s): s is StoreOffer => !!s);
  const geo = sellerGeo(core, rc, prow.rid);
  const product = summarize(core, rc, prow, basicReasons(prow, geo, rc), geo);

  const price = stores.map((s) => s.verified?.price ?? s.price.price);
  const changed = stores.map((s) => (s.price.changedAt ? Date.parse(s.price.changedAt) : null));
  const km = stores.map((s) => s.shop.distanceKm);
  const eta = stores.map((s) => s.shop.etaMin);
  const rows: CompareRow[] = [
    row(
      'قیمت ثبت‌شده',
      stores.map((s) =>
        s.price.price !== null
          ? formatToman(s.price.price)
          : s.price.status === 'suspicious'
            ? 'قیمت نامعتبر ثبت شده'
            : 'ثبت نشده',
      ),
      bestOf(price, 'min'),
    ),
    row(
      'تاریخ ثبت قیمت',
      stores.map((s) => (s.price.changedAt ? `${formatJalaliDate(s.price.changedAt)} (${formatRelative(s.price.changedAt, rc.now)})` : 'نامشخص')),
      bestOf(changed, 'max'),
    ),
    row(
      'استعلام Torob in the Loop',
      stores.map((s) => {
        const v = s.verified;
        if (!v) return 'استعلام نشده';
        const stock = v.stock === 'in_stock' ? 'موجود' : v.stock === 'limited' ? 'موجودی محدود' : v.stock === 'out_of_stock' ? 'ناموجود' : 'نامشخص';
        return `${stock}${v.price ? ` · ${formatToman(v.price)}` : ''} (${formatRelative(v.at, rc.now)})`;
      }),
    ),
  ];
  if (rc.location) {
    rows.push(row('فاصله', km.map((v) => (v === null ? null : formatDistance(v))), bestOf(km, 'min')));
    rows.push(row('زمان رسیدن', eta.map((v) => (v === null ? null : formatMinutes(v))), bestOf(eta, 'min')));
  }
  rows.push(
    row('وضعیت در زمان مراجعه', stores.map((s) => s.shop.openStatus.label)),
    row('ساعت کاری امروز', stores.map((s) => hoursTodayLabel(core.shopsById.get(s.shop.id)?.hours ?? null, rc.at))),
    row('گارانتی', stores.map((s) => s.warranty?.label ?? 'ثبت نشده')),
    row(
      'روش‌های پرداخت',
      stores.map((s) => {
        const opts = s.shop.payment.options;
        if (!opts.length) return 'ثبت نشده';
        return opts.map((o) => `${o.label} (${o.channel === 'in_person' ? 'حضوری' : 'نحوه پذیرش نامشخص'})`).join('، ');
      }),
    ),
    row('ارسال فوری', stores.map((s) => (s.shop.payment.fastDelivery === null ? 'نامشخص' : s.shop.payment.fastDelivery ? 'دارد' : 'ندارد'))),
    row('کالابرگ', stores.map(() => 'ثبت نشده')),
    row('موقعیت در پاساژ', stores.map((s) => (s.shop.location.guide.length ? s.shop.location.guide.join('، ') : s.shop.address ?? 'نامشخص'))),
    row('امتیاز هوشمند', stores.map((s) => formatNumber(s.score)), bestOf(stores.map((s) => s.score), 'max')),
  );

  return { product, stores, rows, summary: storeSummary(stores, price) };
}

function storeSummary(stores: StoreOffer[], price: Num[]): string {
  if (stores.length < 2) return stores.length ? 'برای مقایسه حداقل دو فروشگاه انتخاب کنید.' : 'این فروشگاه‌ها پیشنهادی برای این کالا ثبت نکرده‌اند.';
  const parts: string[] = [];
  const ci = bestOf(price, 'min');
  if (ci !== null) parts.push(`«${stores[ci]!.shop.name}» قیمت کمتری ثبت کرده`);
  const ni = bestOf(stores.map((s) => s.shop.distanceKm), 'min');
  if (ni !== null) parts.push(`«${stores[ni]!.shop.name}» به شما نزدیک‌تر است`);
  const top = [...stores].sort((a, b) => b.score - a.score)[0]!;
  parts.push(`در مجموع «${top.shop.name}» بهترین انتخاب به نظر می‌رسد`);
  const closed = stores.filter((s) => s.shop.openStatus.state === 'closed');
  if (closed.length) parts.push(`${closed.map((s) => `«${s.shop.name}»`).join(' و ')} در زمان مراجعه بسته است`);
  if (stores.some((s) => s.price.freshness === 'stale' || s.price.freshness === 'very_stale')) parts.push('برخی قیمت‌ها قدیمی‌اند؛ پیش از رفتن استعلام کنید');
  return `${parts.join('؛ ')}.`;
}
