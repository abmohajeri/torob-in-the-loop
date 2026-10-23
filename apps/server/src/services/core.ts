/**
 * Catalog core: everything that is small enough to keep in memory is loaded ONCE at startup
 * (shops with compiled hours & wayfinding guides, malls, categories, brands, areas, places, metro,
 * synonyms, NLU vocabulary) plus a compact product → shops offer index (two typed arrays) so that
 * "nearest seller", "sellers near me" and "near only" are pure in-memory work for any candidate set.
 */
import type {
  InstallmentTier,
  MallKind,
  ShopTier,
  MallRef,
  PaymentInfo,
  PaymentOption,
  Place,
  ProviderCode,
  WarrantyInfo,
  WeeklyHours,
} from '@titl/shared';
import { CATEGORY_GROUPS, TOROB_IMAGE_PREFIX, cleanFa, inTrafficZone, normalizeForSearch } from '@titl/shared';
import type { CatalogDb } from '../db/catalog.js';
import { json } from '../db/sqlite.js';
import type { ServiceDeps } from '../deps.js';
import { compileHours, type CompiledHours } from '../domain/hours.js';
import { setCatalogAsOf } from './context.js';
import { asMallKind, buildGuide, type Guide } from '../domain/mall.js';
import { buildVocab, type NluVocab } from '../domain/nlu.js';
import { MetroIndex, type MetroLine, type MetroStation } from '../domain/travel.js';

// ───────────────────────── Records ─────────────────────────

export interface ShopRec {
  rid: number;
  id: string;
  name: string;
  nameIsReal: boolean;
  address: string | null;
  area: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  phoneKind: 'mobile' | 'landline' | null;
  instagram: string | null;
  instagramUrl: string | null;
  website: string | null;
  categories: string[];
  offerCount: number;
  productCount: number;
  fastDelivery: boolean | null;
  payment: PaymentInfo;
  /** Provider codes declared (any channel). */
  providerCodes: Set<ProviderCode>;
  hours: WeeklyHours | null;
  compiled: CompiledHours | null;
  hoursDeclared: boolean;
  hoursSuspicious: boolean;
  mallId: number | null;
  floorNum: number | null;
  unit: string | null;
  plaque: string | null;
  locConfidence: 'high' | 'medium' | 'low';
  lastPriceChange: string | null;
  nameNorm: string;
  addressNorm: string;
  guide: Guide;
  inTrafficZone: boolean;
  /** (DT5) */
  tier: ShopTier;
  /** (SV4) share of valid prices ≤ 14 d old vs dataAsOf; null = no priced offers */
  updateDiscipline: number | null;
  /** (SV9) */
  installmentTier: InstallmentTier;
}

export interface MallRec extends MallRef {
  nameNorm: string;
  area: string | null;
  lat: number;
  lng: number;
  shopCount: number;
  floors: { num: number | null; label: string; count: number }[];
}

export interface CategoryRec {
  id: number;
  name: string;
  nameNorm: string;
  groupId: string;
  productCount: number;
  offerCount: number;
  shopCount: number;
  declaredShopCount: number;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface AreaRec {
  name: string;
  lat: number;
  lng: number;
  shopCount: number;
  shopsWithOffers: number;
  inTrafficZone: boolean;
}

export interface GroupRec {
  id: string;
  name: string;
  icon: string;
  sort: number;
  productCount: number;
}

export interface PlaceRec extends Place {
  nameNorm: string;
  weight: number;
}

/** Product → distinct shop rids, CSR layout (offsets indexed by product rid). */
export interface OfferIndex {
  offsets: Int32Array;
  shops: Int32Array;
  maxRid: number;
}

export interface Core {
  deps: ServiceDeps;
  db: CatalogDb;
  shops: (ShopRec | undefined)[];
  shopsById: Map<string, ShopRec>;
  shopsWithOffers: ShopRec[];
  malls: Map<number, MallRec>;
  mallsBySlug: Map<string, MallRec>;
  mallShops: Map<number, ShopRec[]>;
  categories: Map<number, CategoryRec>;
  categoriesByName: Map<string, CategoryRec>;
  groups: Map<string, GroupRec>;
  areas: Map<string, AreaRec>;
  places: PlaceRec[];
  metro: MetroIndex;
  vocab: NluVocab;
  synonyms: Map<string, string[]>;
  offerIndex: OfferIndex;
  dataAsOf: string | null;
  builtAt: string | null;
  counts: Record<string, number>;
}

// ───────────────────────── Parsing helpers ─────────────────────────

const PROVIDER_CODES: ProviderCode[] = ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other'];
const INSTALLMENT_CODES = new Set<ProviderCode>(['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam']);

function asProvider(v: unknown): ProviderCode {
  return typeof v === 'string' && (PROVIDER_CODES as string[]).includes(v) ? (v as ProviderCode) : 'other';
}

export function parsePaymentOptions(raw: unknown): PaymentOption[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentOption[] = [];
  for (const o of raw) {
    if (!o || typeof o !== 'object') continue;
    const r = o as Record<string, unknown>;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    out.push({
      provider: asProvider(r.provider),
      label: cleanFa(typeof r.label === 'string' ? r.label : '') || 'نامشخص',
      channel: r.channel === 'in_person' ? 'in_person' : 'unknown',
      minPrice: num(r.minPrice),
      maxPrice: num(r.maxPrice),
    });
  }
  return out;
}

const HINTS = new Set(['installment', 'fast_delivery', 'cheque', 'pay_on_delivery']);

export function parseWarranty(v: unknown): WarrantyInfo | null {
  const w = json<WarrantyInfo | null>(v as string, null);
  if (!w || typeof w !== 'object' || typeof w.label !== 'string') return null;
  return w;
}

/** Catalog stores Torob CDN images as «~/<path>» (size); expand to an absolute URL. */
function expandImage(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  if (x.startsWith('~/')) return TOROB_IMAGE_PREFIX + x.slice(2);
  return x.startsWith('http') ? x : null;
}

export function firstImage(images: unknown): string | null {
  for (const x of json<unknown[]>(images as string, [])) {
    const u = expandImage(x);
    if (u) return u;
  }
  return null;
}

export function imagesOf(images: unknown): string[] {
  return json<unknown[]>(images as string, []).map(expandImage).filter((x): x is string => x !== null);
}

const INSTALLMENT_TIERS: InstallmentTier[] = ['in_person', 'declared_unknown_channel', 'seller_text', 'none_recorded'];

// ───────────────────────── Loader ─────────────────────────

interface ShopRow {
  rid: number;
  id: string;
  name: string;
  name_is_real: number;
  address: string | null;
  area: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  phone_kind: string | null;
  instagram: string | null;
  website: string | null;
  categories: string;
  offer_count: number;
  product_count: number;
  fast_delivery: number | null;
  payment: string;
  installment: number;
  torobpay_in_person: number;
  text_hints: string;
  hours: string | null;
  hours_declared: number;
  hours_suspicious: number;
  mall_id: number | null;
  floor_label: string | null;
  floor_num: number | null;
  unit: string | null;
  plaque: string | null;
  wing: string | null;
  landmark: string | null;
  loc_confidence: string;
  last_price_change: string | null;
  name_norm?: string | null;
  address_norm?: string | null;
  instagram_url?: string | null;
  tier?: string | null;
  update_discipline?: number | null;
  installment_tier?: string | null;
}

function columnsOf(db: CatalogDb, table: string): Set<string> {
  return new Set(db.all<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((r) => r.name));
}

export function loadCore(deps: ServiceDeps): Core {
  const db = deps.catalog;
  const t0 = performance.now();

  // ── malls
  const malls = new Map<number, MallRec>();
  const mallsBySlug = new Map<string, MallRec>();
  for (const m of db.all<{
    id: number;
    slug: string;
    name: string;
    name_norm: string;
    kind: string;
    area: string | null;
    lat: number;
    lng: number;
    shop_count: number;
    floors: string;
  }>('SELECT id, slug, name, name_norm, kind, area, lat, lng, shop_count, floors FROM malls')) {
    const rec: MallRec = {
      id: m.id,
      slug: m.slug,
      name: cleanFa(m.name),
      kind: asMallKind(m.kind) as MallKind,
      nameNorm: m.name_norm,
      area: m.area,
      lat: m.lat,
      lng: m.lng,
      shopCount: m.shop_count,
      floors: json<MallRec['floors']>(m.floors, []),
    };
    malls.set(rec.id, rec);
    mallsBySlug.set(rec.slug, rec);
  }

  // ── shops
  const shopCols = columnsOf(db, 'shops');
  const opt = (c: string) => (shopCols.has(c) ? c : `NULL AS ${c}`);
  const shopRows = db.all<ShopRow>(
    `SELECT rid, id, name, name_is_real, address, area, lat, lng, phone, phone_kind, instagram, website, categories,
            offer_count, product_count, fast_delivery, payment, installment, torobpay_in_person, text_hints, hours,
            hours_declared, hours_suspicious, mall_id, floor_label, floor_num, unit, plaque, wing, landmark,
            loc_confidence, last_price_change, ${opt('name_norm')}, ${opt('address_norm')}, ${opt('instagram_url')},
            ${opt('tier')}, ${opt('update_discipline')}, ${opt('installment_tier')}
     FROM shops`,
  );
  const shops: (ShopRec | undefined)[] = [];
  const shopsById = new Map<string, ShopRec>();
  const mallShops = new Map<number, ShopRec[]>();
  for (const r of shopRows) {
    const options = parsePaymentOptions(json(r.payment, []));
    const providerCodes = new Set(options.map((o) => o.provider));
    const hours = json<WeeklyHours | null>(r.hours, null);
    const mall = r.mall_id !== null ? malls.get(r.mall_id) ?? null : null;
    const mallRef: MallRef | null = mall ? { id: mall.id, slug: mall.slug, name: mall.name, kind: mall.kind } : null;
    const textHints = json<string[]>(r.text_hints, []).filter((h) => HINTS.has(h)) as PaymentInfo['textHints'];
    const rec: ShopRec = {
      rid: r.rid,
      id: r.id,
      name: cleanFa(r.name),
      nameIsReal: r.name_is_real === 1,
      address: r.address ? cleanFa(r.address) : null,
      area: r.area,
      lat: r.lat,
      lng: r.lng,
      phone: r.phone,
      phoneKind: r.phone_kind === 'mobile' || r.phone_kind === 'landline' ? r.phone_kind : null,
      instagram: r.instagram,
      instagramUrl: r.instagram_url ?? null,
      website: r.website,
      categories: json<string[]>(r.categories, []),
      offerCount: r.offer_count,
      productCount: r.product_count,
      fastDelivery: r.fast_delivery === null ? null : r.fast_delivery === 1,
      payment: {
        options,
        installment: r.installment === 1 || options.some((o) => INSTALLMENT_CODES.has(o.provider)),
        torobPayInPerson: r.torobpay_in_person === 1,
        textHints,
        kalabarg: null,
        fastDelivery: r.fast_delivery === null ? null : r.fast_delivery === 1,
      },
      providerCodes,
      hours,
      compiled: compileHours(hours),
      hoursDeclared: r.hours_declared === 1,
      hoursSuspicious: r.hours_suspicious === 1,
      mallId: mall ? mall.id : null,
      floorNum: r.floor_num,
      unit: r.unit,
      plaque: r.plaque,
      locConfidence: r.loc_confidence === 'high' || r.loc_confidence === 'medium' ? r.loc_confidence : 'low',
      lastPriceChange: r.last_price_change,
      nameNorm: r.name_norm || normalizeForSearch(r.name),
      addressNorm: r.address_norm || normalizeForSearch(`${r.address ?? ''} ${r.area ?? ''} ${mall?.name ?? ''}`),
      guide: buildGuide({
        mall: mallRef,
        floorLabel: r.floor_label,
        floorNum: r.floor_num,
        unit: r.unit,
        plaque: r.plaque,
        wing: r.wing,
        landmark: r.landmark,
        confidence: r.loc_confidence,
      }),
      inTrafficZone: inTrafficZone({ lat: r.lat, lng: r.lng }),
      tier: r.tier === 'A' || r.tier === 'B' || r.tier === 'C' ? r.tier : r.offer_count > 0 ? 'A' : json<string[]>(r.categories, []).length ? 'B' : 'C',
      updateDiscipline: r.update_discipline ?? null,
      installmentTier: (INSTALLMENT_TIERS as string[]).includes(r.installment_tier ?? '')
        ? (r.installment_tier as InstallmentTier)
        : options.some((o) => o.channel === 'in_person' && INSTALLMENT_CODES.has(o.provider))
          ? 'in_person'
          : options.some((o) => INSTALLMENT_CODES.has(o.provider))
            ? 'declared_unknown_channel'
            : textHints.includes('installment')
              ? 'seller_text'
              : 'none_recorded',
    };
    shops[r.rid] = rec;
    shopsById.set(rec.id, rec);
    if (rec.mallId !== null) {
      const l = mallShops.get(rec.mallId) ?? [];
      l.push(rec);
      mallShops.set(rec.mallId, l);
    }
  }
  const shopsWithOffers = [...shopsById.values()].filter((s) => s.offerCount > 0);

  // ── categories & groups
  const categories = new Map<number, CategoryRec>();
  const categoriesByName = new Map<string, CategoryRec>();
  const catRows = db.all<{
    id: number;
    name: string;
    name_norm: string;
    group_id: string;
    aliases: string;
    product_count: number;
    offer_count: number;
    shop_count: number;
    declared_shop_count: number;
    price_p25: number | null;
    price_p50: number | null;
    price_p75: number | null;
    price_p90: number | null;
  }>(
    `SELECT id, name, name_norm, group_id, aliases, product_count, offer_count, shop_count, declared_shop_count,
            price_p25, price_p50, price_p75, price_p90 FROM categories`,
  );
  for (const c of catRows) {
    const rec: CategoryRec = {
      id: c.id,
      name: c.name,
      nameNorm: c.name_norm,
      groupId: c.group_id,
      productCount: c.product_count,
      offerCount: c.offer_count,
      shopCount: c.shop_count,
      declaredShopCount: c.declared_shop_count,
      p25: c.price_p25,
      p50: c.price_p50,
      p75: c.price_p75,
      p90: c.price_p90,
    };
    categories.set(rec.id, rec);
    categoriesByName.set(rec.name, rec);
  }
  const groups = new Map<string, GroupRec>();
  for (const g of db.all<{ id: string; name: string; icon: string; sort: number; product_count: number }>(
    'SELECT id, name, icon, sort, product_count FROM category_groups ORDER BY sort',
  )) {
    groups.set(g.id, { id: g.id, name: g.name, icon: g.icon, sort: g.sort, productCount: g.product_count });
  }
  CATEGORY_GROUPS.forEach((g, i) => {
    if (!groups.has(g.id)) groups.set(g.id, { ...g, sort: 100 + i, productCount: 0 });
  });

  // ── areas
  const areas = new Map<string, AreaRec>();
  for (const a of db.all<{ name: string; lat: number; lng: number; shop_count: number; shops_with_offers: number; in_traffic_zone: number }>(
    'SELECT name, lat, lng, shop_count, shops_with_offers, in_traffic_zone FROM areas',
  )) {
    areas.set(a.name, {
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      shopCount: a.shop_count,
      shopsWithOffers: a.shops_with_offers,
      inTrafficZone: a.in_traffic_zone === 1,
    });
  }

  // ── places
  const places: PlaceRec[] = db
    .all<{ id: string; name: string; name_norm: string; kind: string; lat: number; lng: number; subtitle: string | null; weight: number }>(
      'SELECT id, name, name_norm, kind, lat, lng, subtitle, weight FROM places',
    )
    .map((p) => {
      const kind = (['area', 'landmark', 'metro', 'mall'] as const).find((k) => k === p.kind) ?? 'landmark';
      const rec: PlaceRec = { id: p.id, name: cleanFa(p.name), kind, lat: p.lat, lng: p.lng, nameNorm: p.name_norm || normalizeForSearch(p.name), weight: p.weight };
      if (p.subtitle) rec.subtitle = cleanFa(p.subtitle);
      return rec;
    })
    .sort((a, b) => b.weight - a.weight);

  // ── metro
  const stations: MetroStation[] = db
    .all<{ id: number; name: string; name_en: string | null; lat: number; lng: number; lines: string }>(
      'SELECT id, name, name_en, lat, lng, lines FROM metro_stations',
    )
    .map((s) => ({ id: s.id, name: cleanFa(s.name), nameEn: s.name_en, lat: s.lat, lng: s.lng, lines: json<MetroLine[]>(s.lines, []) }));
  const metro = new MetroIndex(stations);

  // ── brands, synonyms → NLU vocabulary
  const brands = db.all<{ name: string; name_en: string | null; aliases: string; product_count: number }>(
    'SELECT name, name_en, aliases, product_count FROM brands',
  );
  const synRows = db.all<{ term: string; expansions: string }>('SELECT term, expansions FROM synonyms');
  const synPairs: [string, string[]][] = synRows.map((s) => [s.term, json<string[]>(s.expansions, [])]);
  const vocab = buildVocab({
    categories: catRows.map((c) => ({
      id: c.id,
      name: c.name,
      groupId: c.group_id,
      aliases: json<string[]>(c.aliases, []),
      productCount: c.product_count,
      p50: c.price_p50,
    })),
    brands: brands.map((b) => ({ name: b.name, nameEn: b.name_en, aliases: json<string[]>(b.aliases, []), productCount: b.product_count })),
    places: places.map((p) => ({ id: p.id, name: p.name, kind: p.kind, lat: p.lat, lng: p.lng, weight: p.weight, subtitle: p.subtitle ?? null })),
    synonyms: synPairs,
  });

  // ── offer index (distinct shops per product)
  const offerIndex = buildOfferIndex(db);

  const counts = json<Record<string, number>>(db.metaValue('counts'), {});
  const core: Core = {
    deps,
    db,
    shops,
    shopsById,
    shopsWithOffers,
    malls,
    mallsBySlug,
    mallShops,
    categories,
    categoriesByName,
    groups,
    areas,
    places,
    metro,
    vocab,
    synonyms: vocab.synonyms,
    offerIndex,
    dataAsOf: isoZ(db.metaValue('data_as_of')),
    builtAt: db.metaValue('built_at'),
    counts,
  };
  setCatalogAsOf(core.dataAsOf);
  deps.log.info('catalog core loaded', {
    ms: Math.round(performance.now() - t0),
    shops: shopsById.size,
    malls: malls.size,
    categories: categories.size,
    places: places.length,
    metro: stations.length,
  });
  return core;
}

/** «2026-10-13T00:02:35.297834+00:00» → «2026-10-13T00:02:35.297Z». */
function isoZ(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function buildOfferIndex(db: CatalogDb): OfferIndex {
  const maxRid = db.get<{ m: number | null }>('SELECT max(rid) AS m FROM products')?.m ?? 0;
  const pairs = db.all<{ p: number; s: number }>('SELECT DISTINCT product_rid AS p, shop_rid AS s FROM offers ORDER BY product_rid, shop_rid');
  const offsets = new Int32Array(maxRid + 2);
  const shops = new Int32Array(pairs.length);
  for (const { p } of pairs) if (p <= maxRid) offsets[p + 1]!++;
  for (let i = 1; i < offsets.length; i++) offsets[i]! += offsets[i - 1]!;
  const cursor = offsets.slice(0, maxRid + 1);
  for (const { p, s } of pairs) {
    if (p > maxRid) continue;
    shops[cursor[p]!++] = s;
  }
  return { offsets, shops, maxRid };
}

/** Distinct shop rids that carry a product. */
export function shopRidsOf(core: Core, productRid: number): Int32Array {
  const { offsets, shops, maxRid } = core.offerIndex;
  if (productRid < 0 || productRid > maxRid) return new Int32Array(0);
  return shops.subarray(offsets[productRid]!, offsets[productRid + 1]!);
}

export function mallRefOf(core: Core, mallId: number | null): MallRef | null {
  if (mallId === null) return null;
  const m = core.malls.get(mallId);
  return m ? { id: m.id, slug: m.slug, name: m.name, kind: m.kind } : null;
}

export function groupName(core: Core, id: string): string {
  return core.groups.get(id)?.name ?? CATEGORY_GROUPS.find((g) => g.id === id)?.name ?? 'سایر';
}
