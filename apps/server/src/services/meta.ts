/**
 * App metadata (counts, data date, features, providers, groups, areas, map, examples).
 */
import type { AppMeta, DataQualityResponse, ProviderCode } from '@titl/shared';
import { APP_NAME, EXAMPLE_QUERIES, PROVIDERS, TEHRAN_CENTER, formatJalaliDate, formatNumber } from '@titl/shared';
import { json } from '../db/sqlite.js';
import type { Core } from './core.js';

let cached: { core: Core; meta: AppMeta } | null = null;

export function meta(core: Core): AppMeta {
  const m = baseMeta(core);
  // D3: server clock per request (contact/demo may pin it; not pinned here)
  return { ...m, clock: { now: new Date().toISOString(), demo: false } };
}

function baseMeta(core: Core): AppMeta {
  if (cached?.core === core) return cached.meta;
  const { db, config } = { db: core.db, config: core.deps.config };
  const count = (sql: string) => db.get<{ n: number }>(sql)?.n ?? 0;
  const c = core.counts;
  const num = (k: string, fallback: () => number) => (typeof c[k] === 'number' ? c[k]! : fallback());
  const topCats = new Map<string, string[]>();
  for (const cat of [...core.categories.values()].sort((a, b) => b.productCount - a.productCount)) {
    const l = topCats.get(cat.groupId) ?? [];
    if (l.length < 6) l.push(cat.name);
    topCats.set(cat.groupId, l);
  }
  const groups = [...core.groups.values()]
    .sort((a, b) => a.sort - b.sort)
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon, productCount: g.productCount, topCategories: topCats.get(g.id) ?? [] }))
    .filter((g) => g.productCount > 0 || g.topCategories.length > 0);
  const m: AppMeta = {
    name: APP_NAME,
    version: config.version,
    catalog: {
      products: num('products', () => count('SELECT count(*) AS n FROM products')),
      offers: num('offers', () => count('SELECT count(*) AS n FROM offers')),
      shops: num('shops', () => core.shopsById.size),
      shopsWithOffers: num('shopsWithOffers', () => core.shopsWithOffers.length),
      malls: num('malls', () => core.malls.size),
      builtAt: core.builtAt ?? new Date(0).toISOString(),
      dataAsOf: core.dataAsOf ?? core.builtAt ?? new Date(0).toISOString(),
    },
    features: {
      llm: config.llmEnabled,
      stt: config.llmEnabled,
      sellerInbox: true,
      bale: !!config.BALE_BOT_TOKEN,
      neshan: !!config.NESHAN_API_KEY,
    },
    providers: (Object.keys(PROVIDERS) as ProviderCode[])
      .filter((p) => p !== 'other')
      .map((code) => ({ code, label: PROVIDERS[code].label, description: PROVIDERS[code].description })),
    categoryGroups: groups,
    areas: [...core.areas.values()]
      .sort((a, b) => b.shopCount - a.shopCount)
      .map((a) => ({ name: a.name, lat: a.lat, lng: a.lng, shopCount: a.shopCount, inTrafficZone: a.inTrafficZone })),
    map: { tileUrl: config.MAP_TILE_URL, attribution: config.MAP_ATTRIBUTION, center: TEHRAN_CENTER, zoom: 15 },
    examples: EXAMPLE_QUERIES,
    dataAsOf: core.dataAsOf ?? core.builtAt ?? new Date(0).toISOString(),
  };
  cached = { core, meta: m };
  return m;
}

let dqCache: { core: Core; res: DataQualityResponse } | null = null;

/**
 * (DT15) GET /api/meta/data-quality — rule hit counts from the ETL run (meta.quality.offers.rules)
 * plus the /about «داده‌ها چقدر کامل است؟» lines. Every number comes from the built catalog.
 */
export function dataQuality(core: Core): DataQualityResponse {
  if (dqCache?.core === core) return dqCache.res;
  const q = json<Record<string, any>>(core.db.metaValue('quality'), {});
  const counts: Record<string, number> = { ...(q.offers?.rules ?? {}) };
  const one = (sql: string) => core.db.get<{ n: number }>(sql)?.n ?? 0;
  const products = one('SELECT count(*) AS n FROM products');
  const shops = core.shopsById.size;
  const noBrandRaw = (counts.brand_unknown ?? 0) + (counts.brand_from_spec ?? 0) + (counts.brand_from_title ?? 0);
  const tierB = counts.shop_tier_B ?? [...core.shopsById.values()].filter((s) => s.tier === 'B').length;
  const withPay = [...core.shopsById.values()].filter((s) => s.payment.options.length > 0).length;
  const suspicious = (counts.price_rule_too_high ?? 0) + (counts.price_rule_too_low ?? 0) + (counts.price_rule_outlier_high ?? 0) +
    (counts.price_rule_outlier_low ?? 0) + (counts.price_rule_category_low ?? 0) + (counts.price_rule_category_high ?? 0) + (counts.price_rule_model_outlier ?? 0);
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
  const lines: DataQualityResponse['lines'] = [];
  if (noBrandRaw) {
    lines.push({
      text: `${formatNumber(pct(noBrandRaw, products))}٪ محصولات برند ثبت‌شده ندارند؛ برند ${formatNumber((counts.brand_from_spec ?? 0) + (counts.brand_from_title ?? 0))} کالا را از مشخصات و عنوان حدس زده‌ایم`,
      share: noBrandRaw / products,
    });
  }
  if (core.dataAsOf) lines.push({ text: `قیمت‌ها تا ${formatJalaliDate(core.dataAsOf)}`, share: null });
  if (suspicious) lines.push({ text: `${formatNumber(suspicious)} قیمت غیرعادی کنار گذاشته شد`, share: null });
  if (counts.price_rule_missing) lines.push({ text: `${formatNumber(counts.price_rule_missing)} پیشنهاد بدون قیمت («قیمت اعلام نشده — بپرسید»)`, share: null });
  lines.push({ text: `${formatNumber(tierB)} فروشگاه فقط دستهٔ فعالیت دارند؛ کالایی ثبت نکرده‌اند`, share: tierB / shops });
  lines.push({ text: `فقط ${formatNumber(pct(withPay, shops))}٪ فروشگاه‌ها روش پرداخت ثبت کرده‌اند`, share: withPay / shops });
  if (counts.hours_unknown) lines.push({ text: `${formatNumber(counts.hours_unknown)} فروشگاه ساعت کاری ثبت نکرده‌اند`, share: counts.hours_unknown / shops });
  lines.push({ text: 'حدود ۱۰٪ فروشگاه‌های تهران، از مناطق منتخب', share: null });
  const res: DataQualityResponse = { dataAsOf: core.dataAsOf, builtAt: core.builtAt, counts, lines };
  dqCache = { core, res };
  return res;
}
