/**
 * Catalog builder (docs/ARCHITECTURE.md §4): dataset CSVs + curated JSON → read-only SQLite catalog.
 *
 *  1. curated inputs (taxonomy, synonyms, brands, places, OSM) — all optional, defaults + warnings
 *  2. shops.csv  → parsed shops (contacts, payments, hours, in-mall address)
 *  3. offers.csv → kept in memory, grouped per product (331k rows)
 *  4. products.csv pass 1 (streamed): categories, dataset brand statistics, spec-facet planning
 *  5. products.csv pass 2 (streamed): titles, brands, audience, specs, prices, warranty, hints, FTS → insert
 *  6. shops / malls / areas / categories / brands / metro / places / synonyms / meta
 *  7. FTS optimize, ANALYZE, journal_mode=DELETE, VACUUM → atomic rename onto the output path
 */
import { existsSync, mkdirSync, renameSync, rmSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync as DatabaseSyncT } from 'node:sqlite';
import {
  CATEGORY_GROUPS,
  TOROB_IMAGE_PREFIX,
  cleanFa,
  freshnessOf,
  inTrafficZone,
  normalizeForSearch,
} from '@titl/shared';
import type { Freshness } from '@titl/shared';
import { parseAddress } from './address.js';
import type { ParsedAddress } from './address.js';
import { detectAudience } from './audience.js';
import { isReplicaTitle, modelKey, offerAttrs, specBrand } from './attrs.js';
import { addBrandObservation, buildBrandIndex, newBrandStats } from './brands.js';
import type { BrandRecord } from './brands.js';
import { loadCuration } from './curation.js';
import { nul, numField, parseJsonField, readCsv } from './csv.js';
import { buildFtsRow } from './fts.js';
import { parseWeeklyHours } from './hours.js';
import type { ParsedHours } from './hours.js';
import { info, warn, collectedWarnings, resetWarnings } from './log.js';
import { clusterMalls } from './malls.js';
import type { MallMember } from './malls.js';
import { buildMetro } from './metro.js';
import { mineTextHints, parsePayments, unionHints } from './payments.js';
import type { ParsedPayments, TextHint } from './payments.js';
import { buildPlaces } from './places.js';
import { classifyProductPrices, parseRawPrice, priceStats } from './prices.js';
import { newReportStats } from './report.js';
import type { ReportStats } from './report.js';
import { SCHEMA_PATH } from './paths.js';
import {
  parseCategoryNames,
  parseContacts,
  parseInstagram,
  parseTriState,
  parseWebsite,
  shopName,
} from './shops.js';
import { FacetPlanner, compactSpecs, productFacetRows } from './specs.js';
import { createTaxonomy, GROUP_NAME, inferGroupsByCooccurrence } from './taxonomy.js';
import { chooseTitle, extractTitleEn, isRedacted } from './titles.js';
import { countInto, median, quantileSorted, round } from './util.js';
import { parseWarranty } from './warranty.js';

export const SCHEMA_VERSION = '1';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');

export interface BuildOptions {
  datasetDir: string;
  out: string;
  curationDir: string;
}

export interface BuildResult {
  out: string;
  stats: ReportStats;
  warnings: readonly string[];
}

interface ShopRec {
  rid: number;
  id: string;
  name: string;
  nameIsReal: boolean;
  address: string | null;
  area: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  phoneKind: string | null;
  instagram: string | null;
  instagramUrl: string | null;
  website: string | null;
  categories: string[];
  fastDelivery: 0 | 1 | null;
  pay: ParsedPayments;
  hours: ParsedHours;
  addr: ParsedAddress;
  mallId: number | null;
  mallName: string | null;
  // aggregated from offers
  offerCount: number;
  productCount: number;
  lastPriceChange: string | null;
  hints: Set<TextHint>;
  offerCategories: Set<number>;
  /** valid-priced offers / of which changed ≤ 14 d before data_as_of (SV4 update discipline) */
  pricedOffers: number;
  freshOffers: number;
}

interface RawOffer {
  id: string;
  shopId: string;
  sellerTitle: string | null;
  description: string | null;
  price: string | null;
  changedAt: string | null;
  warranty: string | null;
}

interface CatRec {
  id: number;
  name: string;
  groupId: string;
  groupSource: string;
  aliases: string[];
  productCount: number;
  offerCount: number;
  shops: Set<number>;
  declaredShops: number;
  medians: number[];
}

/** Description display text: per-line cleanFa, blank lines collapsed, capped. */
function cleanDescription(v: string | null): string | null {
  if (!v) return null;
  const s = v
    .split(/\r?\n/)
    .map((l) => cleanFa(l))
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  return s || null;
}

function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : v.trim();
}

const maxIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b);
const minIso = (a: string | null, b: string | null) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

const FRESH_BONUS: Record<Freshness, number> = { fresh: 0.25, recent: 0.15, stale: 0.05, very_stale: 0, unknown: 0 };

export function popularity(p: {
  shopCount: number;
  hasImages: boolean;
  specCount: number;
  validPriceCount: number;
  freshness: Freshness;
}): number {
  return round(
    Math.log1p(p.shopCount) +
      (p.hasImages ? 0.3 : 0) +
      (p.specCount > 3 ? 0.15 : 0) +
      (p.validPriceCount > 0 ? 0.3 : 0) +
      FRESH_BONUS[p.freshness],
    4,
  );
}

export async function buildCatalog(opts: BuildOptions): Promise<BuildResult> {
  const t0 = performance.now();
  resetWarnings();
  const stats = newReportStats();
  const shopsCsv = join(opts.datasetDir, 'shops.csv');
  const productsCsv = join(opts.datasetDir, 'products.csv');
  const offersCsv = join(opts.datasetDir, 'offers.csv');
  for (const f of [shopsCsv, productsCsv, offersCsv]) if (!existsSync(f)) throw new Error(`dataset file not found: ${f}`);

  // ── 1. curated inputs ──
  const cur = loadCuration(opts.curationDir);
  stats.curationFiles = cur.files;
  const taxonomy = createTaxonomy(cur.taxonomy);

  // ── 2. shops ──
  let tStep = performance.now();
  const shops: ShopRec[] = [];
  const shopById = new Map<string, ShopRec>();
  for await (const r of readCsv(shopsCsv)) {
    const id = nul(r.shop_id);
    if (!id || shopById.has(id)) {
      if (id) warn(`duplicate shop id ${id} — skipped`);
      continue;
    }
    const lat = numField(r.lat);
    const lng = numField(r.lon);
    if (lat === null || lng === null) {
      warn(`shop ${id} has no coordinates — skipped`);
      stats.shopsSkipped++;
      continue;
    }
    const contact = parseContacts(r.contacts);
    const ig = parseInstagram(r.instagram);
    const website = parseWebsite(r.website_url);
    const address = nul(r.address) ? cleanFa(r.address) : null;
    const rec: ShopRec = {
      rid: shops.length + 1,
      id,
      name: shopName(r.name),
      nameIsReal: !!(ig.handle || ig.url || website),
      address,
      area: nul(r.location_label) ? cleanFa(r.location_label) : null,
      lat,
      lng,
      phone: contact.phone,
      phoneKind: contact.phoneKind,
      instagram: ig.handle,
      instagramUrl: ig.url,
      website,
      categories: parseCategoryNames(r.category_names),
      fastDelivery: parseTriState(r.supports_fast_delivery),
      pay: parsePayments(parseJsonField<unknown>(r.payment_options, [])),
      hours: parseWeeklyHours(parseJsonField<unknown>(r.weekly_hours, {})),
      addr: parseAddress(address),
      mallId: null,
      mallName: null,
      offerCount: 0,
      productCount: 0,
      lastPriceChange: null,
      hints: new Set(),
      offerCategories: new Set(),
      pricedOffers: 0,
      freshOffers: 0,
    };
    shops.push(rec);
    shopById.set(id, rec);
  }
  info(`shops: ${shops.length} parsed (${secs(tStep)})`);

  // ── 3. offers (grouped per product) ──
  tStep = performance.now();
  const offersByProduct = new Map<string, RawOffer[]>();
  let dataAsOf: string | null = null;
  let offerRows = 0;
  const seenOfferIds = new Set<string>();
  for await (const r of readCsv(offersCsv)) {
    const id = nul(r.offer_id);
    const pid = nul(r.product_id);
    const sid = nul(r.shop_id);
    if (!id || !pid || !sid) {
      stats.offersSkipped++;
      continue;
    }
    if (seenOfferIds.has(id)) {
      stats.offersSkipped++;
      warn(`duplicate offer id ${id} — skipped`);
      continue;
    }
    if (!shopById.has(sid)) {
      stats.offersSkipped++;
      continue;
    }
    seenOfferIds.add(id);
    const changedAt = isoOrNull(nul(r.last_price_changed_at));
    dataAsOf = maxIso(dataAsOf, changedAt);
    let list = offersByProduct.get(pid);
    if (!list) offersByProduct.set(pid, (list = []));
    list.push({
      id,
      shopId: sid,
      sellerTitle: nul(r.seller_title),
      description: nul(r.description),
      price: nul(r.price_toman),
      changedAt,
      warranty: nul(r.warranty),
    });
    offerRows++;
  }
  seenOfferIds.clear();
  const asOfDate = dataAsOf ? new Date(dataAsOf) : new Date();
  info(`offers: ${offerRows} loaded for ${offersByProduct.size} products (${secs(tStep)})`);

  // ── 4. products pass 1: categories, brand statistics, facet planning ──
  tStep = performance.now();
  const productCats = new Map<string, number>();
  const brandStats = newBrandStats();
  const facetPlanner = new FacetPlanner();
  for await (const r of readCsv(productsCsv)) {
    const cat = (nul(r.category_name) ?? '').trim() || 'سایر';
    countInto(productCats, cat);
    const g = taxonomy.group(cat).id;
    const brand = nul(r.brand_name);
    if (brand) addBrandObservation(brandStats, brand, cat, g);
    const { specs } = compactSpecs(parseJsonField<unknown>(r.specs, []));
    facetPlanner.addProduct(cat, specs);
  }
  const facetKeys = facetPlanner.plan();
  const brandIndex = buildBrandIndex(cur.brands, brandStats);
  info(`products pass 1: ${productCats.size} categories, ${brandStats.counts.size} brand spellings, facets for ${facetKeys.size} categories (${secs(tStep)})`);

  // categories: product categories + shop-declared-only categories (group inferred by co-occurrence)
  const unmapped = [...productCats.keys()].filter((c) => !taxonomy.has(c));
  stats.unmappedCategories = unmapped.length;
  stats.unmappedProducts = unmapped.reduce((s, c) => s + (productCats.get(c) ?? 0), 0);
  if (unmapped.length) warn(`taxonomy: ${unmapped.length} product categories unmapped → 'other' (e.g. ${unmapped.slice(0, 5).join(' | ')})`);
  const declaredOnly = new Set<string>();
  for (const s of shops) for (const c of s.categories) if (!productCats.has(c)) declaredOnly.add(c);
  const inferred = inferGroupsByCooccurrence(
    shops.map((s) => s.categories),
    (name) => (declaredOnly.has(name) && !taxonomy.has(name) ? null : taxonomy.group(name).id),
  );
  for (const [name, g] of inferred) taxonomy.setInferred(name, g);
  const allCatNames = [...new Set([...productCats.keys(), ...declaredOnly])].sort();
  const cats = new Map<string, CatRec>();
  allCatNames.forEach((name, i) => {
    const g = taxonomy.group(name);
    cats.set(name, {
      id: i + 1,
      name,
      groupId: g.id,
      groupSource: g.source,
      aliases: taxonomy.aliases(name),
      productCount: 0,
      offerCount: 0,
      shops: new Set(),
      declaredShops: 0,
      medians: [],
    });
  });
  stats.declaredOnlyCategories = declaredOnly.size;
  stats.declaredOnlyInferred = [...declaredOnly].filter((c) => !taxonomy.has(c) && inferred.has(c)).length;

  // ── database ──
  mkdirSync(dirname(opts.out), { recursive: true });
  const tmp = `${opts.out}.tmp-${process.pid}`;
  rmSync(tmp, { force: true });
  const db: DatabaseSyncT = new DatabaseSync(tmp);
  db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -200000;');
  db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
  db.exec('BEGIN');

  const insProduct = db.prepare(
    `INSERT INTO products (rid, id, title, title_source, title_norm, title_en, brand, brand_inferred, model, category_id, group_id,
       audience, images, specs, spec_count, offer_count, shop_count, valid_price_count, price_min, price_max, price_median,
       last_price_change, oldest_price_change, installment_shop_count, popularity, brand_source, model_key, is_replica)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insOffer = db.prepare(
    `INSERT INTO offers (rid, id, product_rid, shop_rid, seller_title, description, price, raw_price, price_status, price_changed_at,
       warranty, warranty_kind, hints, raw_price_text, price_rule, attrs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insFacet = db.prepare('INSERT OR IGNORE INTO product_facets (key, value, product_rid) VALUES (?,?,?)');
  const insFts = db.prepare('INSERT INTO products_fts (rowid, title, brand, category, extra) VALUES (?,?,?,?,?)');

  // ── 5. products pass 2 ──
  tStep = performance.now();
  let productRid = 0;
  let offerRid = 0;
  const brandProductCount = new Map<BrandRecord, number>();
  const sellerTitlesBuf: (string | null)[] = [];
  for await (const r of readCsv(productsCsv)) {
    const pid = nul(r.product_id);
    if (!pid) continue;
    const offers = offersByProduct.get(pid) ?? [];
    offersByProduct.delete(pid);
    const rid = ++productRid;
    const catName = (nul(r.category_name) ?? '').trim() || 'سایر';
    const cat = cats.get(catName)!;
    const groupName = GROUP_NAME.get(cat.groupId) ?? 'سایر';

    // brand
    const datasetBrand = nul(r.brand_name);
    let brandRec: BrandRecord | null = null;
    let brandInferred = 0;
    sellerTitlesBuf.length = 0;
    for (const o of offers) sellerTitlesBuf.push(o.sellerTitle);
    const catalogTitle = nul(r.persian_title);
    if (catalogTitle && isRedacted(catalogTitle)) stats.redactedCatalogTitles++;
    let brandSource: 'dataset' | 'spec' | 'title' | null = null;
    if (datasetBrand && cleanFa(datasetBrand)) {
      brandRec = brandIndex.canonical(datasetBrand);
      brandSource = 'dataset';
      stats.brandDataset++;
    }
    const { specs, productName } = compactSpecs(parseJsonField<unknown>(r.specs, []));
    // DT3: dataset brand → spec «برند»/«شرکت سازنده» → title alias → null
    if (!brandRec) {
      const sb = specBrand(specs);
      const rec = sb ? brandIndex.fromSpec(sb) : null;
      if (rec) {
        brandRec = rec;
        brandSource = 'spec';
        brandInferred = 1;
        countInto(stats.rules, 'brand_from_spec');
      }
    }
    // title (brand of the generated fallback is the dataset brand when known)
    let chosen = chooseTitle(catalogTitle, sellerTitlesBuf, catName, brandRec?.name ?? null);
    if (!brandRec) {
      const inferredBrand = brandIndex.infer(normalizeForSearch(chosen.title), catName, cat.groupId);
      if (inferredBrand) {
        brandRec = inferredBrand;
        brandInferred = 1;
        brandSource = 'title';
        stats.brandInferred++;
        countInto(stats.rules, 'brand_from_title');
        if (chosen.source === 'generated') chosen = chooseTitle(catalogTitle, sellerTitlesBuf, catName, brandRec.name);
      }
    }
    if (!brandRec) countInto(stats.rules, 'brand_unknown');
    stats.titleSource[chosen.source]++;
    if (brandRec) brandProductCount.set(brandRec, (brandProductCount.get(brandRec) ?? 0) + 1);
    const title = chosen.title;
    const titleNorm = normalizeForSearch(title);
    const titleEn = extractTitleEn(title, productName);
    const model = nul(r.model) ? cleanFa(r.model) || null : null;
    const audience = detectAudience(cat.groupId, title, catName);
    if (audience) countInto(stats.audience, audience);
    const images = parseJsonField<unknown>(r.image_urls, []);
    const imageList = Array.isArray(images) ? images.filter((u): u is string => typeof u === 'string' && /^https?:\/\//.test(u)) : [];
    // size: keep ≤ 6 images, Torob CDN prefix stored as «~/» (expanded by the server)
    const imagesCompact = imageList.slice(0, 4).map((u) => (u.startsWith(TOROB_IMAGE_PREFIX) ? `~/${u.slice(TOROB_IMAGE_PREFIX.length)}` : u));
    const replica = catalogTitle ? isReplicaTitle(catalogTitle) : false;
    if (replica) countInto(stats.rules, 'product_is_replica');
    const mKey = modelKey(brandRec?.nameNorm ?? null, brandRec?.aliases ?? [], cat.id, model, title);

    // prices & offers
    const raws = offers.map((o) => parseRawPrice(o.price));
    const { verdicts } = classifyProductPrices(raws.map((x) => x.raw));
    const ps = priceStats(verdicts);
    const shopSet = new Set<number>();
    const installmentShops = new Set<number>();
    let last: string | null = null;
    let oldest: string | null = null;
    for (let k = 0; k < offers.length; k++) {
      const o = offers[k]!;
      const v = verdicts[k]!;
      const raw = raws[k]!;
      const shop = shopById.get(o.shopId)!;
      const desc = cleanDescription(o.description);
      const wRaw = parseJsonField<unknown>(o.warranty, null);
      const warranty = parseWarranty(wRaw);
      const wDesc = wRaw && typeof wRaw === 'object' ? (wRaw as Record<string, unknown>).description : null;
      const hints = mineTextHints(desc, typeof wDesc === 'string' ? wDesc : null);
      for (const h of hints) shop.hints.add(h);
      for (const h of hints) countInto(stats.rules, `offer_hint_${h}`);
      const attrs = offerAttrs(o.sellerTitle, desc);
      if (attrs) {
        if (attrs.condition) countInto(stats.rules, `attr_condition_${attrs.condition}`);
        if (attrs.authenticity) countInto(stats.rules, `attr_authenticity_${attrs.authenticity}`);
        if (attrs.registry) countInto(stats.rules, `attr_registry_${attrs.registry}`);
        if (attrs.bundle) countInto(stats.rules, `attr_bundle_${attrs.bundle}`);
      }
      if (v.status === 'ok') {
        shop.pricedOffers++;
        if (freshnessOf(o.changedAt, asOfDate) === 'fresh') shop.freshOffers++;
      }
      countInto(stats.priceStatus, v.status);
      if (v.rule) countInto(stats.priceRule, v.rule);
      if (raw.rawText) stats.priceClamped++;
      if (warranty) countInto(stats.warrantyKind, warranty.kind);
      else stats.warrantyNone++;
      countInto(stats.freshness, freshnessOf(o.changedAt, asOfDate));
      if (!o.changedAt) {
        stats.priceChangedNull++;
        countInto(stats.rules, 'price_changed_at_null');
      }
      insOffer.run(
        ++offerRid,
        o.id,
        rid,
        shop.rid,
        // size: a seller title identical to the display title adds nothing → NULL
        o.sellerTitle && cleanFa(o.sellerTitle) !== title ? cleanFa(o.sellerTitle) || null : null,
        desc,
        v.price,
        raw.raw,
        v.status,
        o.changedAt,
        warranty ? JSON.stringify(warranty) : null,
        warranty ? warranty.kind : null,
        hints.length ? JSON.stringify(hints) : null,
        raw.rawText,
        v.rule,
        attrs ? JSON.stringify(attrs) : null,
      );
      if (!shopSet.has(shop.rid)) {
        shopSet.add(shop.rid);
        shop.productCount++;
        if (shop.pay.installment) installmentShops.add(shop.rid);
      }
      shop.offerCount++;
      shop.offerCategories.add(cat.id);
      shop.lastPriceChange = maxIso(shop.lastPriceChange, o.changedAt);
      cat.shops.add(shop.rid);
      last = maxIso(last, o.changedAt);
      oldest = minIso(oldest, o.changedAt);
    }
    // duplicate (shop, product) variants
    if (offers.length > shopSet.size) stats.duplicateShopProductOffers += offers.length - shopSet.size;

    cat.productCount++;
    cat.offerCount += offers.length;
    if (ps.median !== null) cat.medians.push(ps.median);
    const fresh = freshnessOf(last, asOfDate);
    const pop = popularity({
      shopCount: shopSet.size,
      hasImages: imageList.length > 0,
      specCount: specs.length,
      validPriceCount: ps.validCount,
      freshness: fresh,
    });
    insProduct.run(
      rid,
      pid,
      title,
      chosen.source,
      titleNorm,
      titleEn,
      brandRec ? brandRec.name : null,
      brandInferred,
      model,
      cat.id,
      cat.groupId,
      audience,
      JSON.stringify(imagesCompact),
      specs.length ? JSON.stringify(specs) : null,
      specs.length,
      offers.length,
      shopSet.size,
      ps.validCount,
      ps.min,
      ps.max,
      ps.median,
      last,
      oldest,
      installmentShops.size,
      pop,
      brandSource,
      mKey,
      replica ? 1 : 0,
    );
    if (imageList.length) stats.productsWithImages++;
    if (specs.length) stats.productsWithSpecs++;
    if (ps.validCount > 0) stats.productsWithValidPrice++;
    if (shopSet.size >= 5) stats.productsWith5PlusShops++;
    if (titleEn) stats.productsWithTitleEn++;
    for (const [key, value] of productFacetRows(specs, facetKeys.get(catName))) {
      insFacet.run(key, value, rid);
      stats.facetRows++;
    }
    const fts = buildFtsRow({
      title,
      brandName: brandRec ? brandRec.name : null,
      brandEn: brandRec ? brandRec.nameEn : null,
      brandAliases: brandRec ? brandRec.aliases : [],
      categoryName: catName,
      groupName,
      categoryAliases: cat.aliases,
      model,
      titleEn,
      sellerTitles: sellerTitlesBuf,
      specs,
    });
    insFts.run(rid, fts.title, fts.brand, fts.category, fts.extra);
  }
  if (offersByProduct.size) {
    let orphan = 0;
    for (const l of offersByProduct.values()) orphan += l.length;
    stats.offersSkipped += orphan;
    warn(`${orphan} offers reference ${offersByProduct.size} unknown products — skipped`);
  }
  offersByProduct.clear();
  info(`products pass 2: ${productRid} products, ${offerRid} offers inserted (${secs(tStep)})`);

  // ── 5b. price post-rules (DT2) + variant keys (DT8) — need whole-catalog context ──
  tStep = performance.now();
  applyPriceRules(db, stats);
  info(`price post-rules (${secs(tStep)})`);

  // ── 6a. malls ──
  tStep = performance.now();
  const areaNames = [...new Set(shops.map((s) => s.area).filter((a): a is string => !!a))];
  const members: MallMember[] = [];
  shops.forEach((s, idx) => {
    if (!s.addr.mall) return;
    members.push({ idx, lat: s.lat, lng: s.lng, area: s.area, mention: s.addr.mall, floorNum: s.addr.floorNum, floorLabel: s.addr.floorLabel });
  });
  const malls = clusterMalls(members, areaNames);
  const insMall = db.prepare(
    'INSERT INTO malls (id, slug, name, name_norm, kind, area, lat, lng, shop_count, floors, aliases) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const m of malls) {
    const aliases = new Set<string>();
    for (const sp of m.spellings) {
      const n = normalizeForSearch(sp);
      if (n && n !== m.nameNorm) aliases.add(n);
    }
    for (const idx of m.members) {
      const s = shops[idx]!;
      s.mallId = m.id;
      s.mallName = m.name;
      const key = s.addr.mall?.key;
      if (key && key !== m.nameNorm) aliases.add(key);
    }
    insMall.run(m.id, m.slug, m.name, m.nameNorm, m.kind, m.area, m.lat, m.lng, m.members.length, JSON.stringify(m.floors), JSON.stringify([...aliases]));
  }
  info(`malls: ${malls.length} clusters (${secs(tStep)})`);

  // ── 6b. shops + shop_categories ──
  const insShop = db.prepare(
    `INSERT INTO shops (rid, id, name, name_is_real, address, area, lat, lng, phone, phone_kind, instagram, website, categories,
       offer_count, product_count, fast_delivery, payment, installment, torobpay_in_person, text_hints, hours, hours_declared,
       hours_suspicious, mall_id, floor_label, floor_num, unit, plaque, wing, landmark, loc_confidence, last_price_change,
       name_norm, address_norm, instagram_url, tier, update_discipline, installment_tier)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const insShopCat = db.prepare('INSERT OR IGNORE INTO shop_categories (category_id, shop_rid, has_offers) VALUES (?,?,?)');
  for (const s of shops) {
    const a = s.addr;
    insShop.run(
      s.rid,
      s.id,
      s.name,
      s.nameIsReal ? 1 : 0,
      s.address,
      s.area,
      s.lat,
      s.lng,
      s.phone,
      s.phoneKind,
      s.instagram,
      s.website,
      JSON.stringify(s.categories),
      s.offerCount,
      s.productCount,
      s.fastDelivery,
      JSON.stringify(s.pay.options),
      s.pay.installment ? 1 : 0,
      s.pay.torobPayInPerson ? 1 : 0,
      JSON.stringify(unionHints([[...s.hints]])),
      s.hours.hours ? JSON.stringify(s.hours.hours) : null,
      s.hours.declared ? 1 : 0,
      s.hours.suspicious ? 1 : 0,
      s.mallId,
      a.floorLabel,
      a.floorNum,
      a.unit,
      a.plaque,
      a.wing,
      a.landmark,
      a.confidence,
      s.lastPriceChange,
      normalizeForSearch(s.name),
      normalizeForSearch([s.address ?? '', s.area ?? '', s.mallName ?? ''].join(' ')),
      s.instagramUrl,
      shopTier(s),
      s.pricedOffers ? round(s.freshOffers / s.pricedOffers, 3) : null,
      installmentTier(s),
    );
    countInto(stats.rules, `shop_tier_${shopTier(s)}`);
    countInto(stats.rules, `shop_installment_${installmentTier(s)}`);
    const declared = new Set<number>();
    for (const c of s.categories) {
      const cr = cats.get(c);
      if (!cr) continue;
      declared.add(cr.id);
      cr.declaredShops++;
      insShopCat.run(cr.id, s.rid, s.offerCategories.has(cr.id) ? 1 : 0);
    }
    for (const cid of s.offerCategories) if (!declared.has(cid)) insShopCat.run(cid, s.rid, 1);
    collectShopStats(stats, s);
  }

  // ── 6c. categories & groups ──
  const insCat = db.prepare(
    `INSERT INTO categories (id, name, name_norm, group_id, aliases, product_count, offer_count, shop_count, declared_shop_count,
       price_p25, price_p50, price_p75, price_p90, group_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  const groupCounts = new Map<string, number>();
  for (const c of cats.values()) {
    const sorted = c.medians.sort((x, y) => x - y);
    const q = (p: number) => {
      const v = quantileSorted(sorted, p);
      return v === null ? null : Math.round(v);
    };
    insCat.run(
      c.id,
      c.name,
      normalizeForSearch(c.name),
      c.groupId,
      JSON.stringify(c.aliases),
      c.productCount,
      c.offerCount,
      c.shops.size,
      c.declaredShops,
      q(0.25),
      q(0.5),
      q(0.75),
      q(0.9),
      c.groupSource,
    );
    countInto(groupCounts, c.groupId, c.productCount);
    countInto(stats.categoryGroupSource, c.groupSource);
    if (c.aliases.length) stats.categoriesWithAliases++;
  }
  const insGroup = db.prepare('INSERT INTO category_groups (id, name, icon, sort, product_count) VALUES (?,?,?,?,?)');
  CATEGORY_GROUPS.forEach((g, i) => insGroup.run(g.id, g.name, g.icon, i, groupCounts.get(g.id) ?? 0));
  stats.groupProducts = Object.fromEntries(CATEGORY_GROUPS.map((g) => [g.id, groupCounts.get(g.id) ?? 0]));

  // ── 6d. brands ──
  const insBrand = db.prepare('INSERT INTO brands (id, name, name_en, name_norm, aliases, product_count) VALUES (?,?,?,?,?,?)');
  const brandRows = brandIndex.records().filter((b) => (brandProductCount.get(b) ?? 0) > 0);
  const seenBrandNames = new Set<string>();
  let brandId = 0;
  for (const b of brandRows) {
    if (seenBrandNames.has(b.name)) continue;
    seenBrandNames.add(b.name);
    insBrand.run(++brandId, b.name, b.nameEn, b.nameNorm, JSON.stringify(b.aliases), brandProductCount.get(b) ?? 0);
    if (b.curated) stats.brandsCurated++;
  }
  stats.brands = brandId;

  // ── 6e. areas ──
  const areaAgg = new Map<string, { lats: number[]; lngs: number[]; n: number; withOffers: number }>();
  for (const s of shops) {
    if (!s.area) continue;
    let a = areaAgg.get(s.area);
    if (!a) areaAgg.set(s.area, (a = { lats: [], lngs: [], n: 0, withOffers: 0 }));
    a.lats.push(s.lat);
    a.lngs.push(s.lng);
    a.n++;
    if (s.offerCount > 0) a.withOffers++;
  }
  const insArea = db.prepare('INSERT INTO areas (name, lat, lng, shop_count, shops_with_offers, in_traffic_zone) VALUES (?,?,?,?,?,?)');
  const areaRows: { name: string; lat: number; lng: number; shopCount: number }[] = [];
  for (const [name, a] of [...areaAgg.entries()].sort((x, y) => y[1].n - x[1].n || x[0].localeCompare(y[0]))) {
    const lat = round(median(a.lats) ?? 0, 6);
    const lng = round(median(a.lngs) ?? 0, 6);
    insArea.run(name, lat, lng, a.n, a.withOffers, inTrafficZone({ lat, lng }) ? 1 : 0);
    areaRows.push({ name, lat, lng, shopCount: a.n });
  }
  stats.areas = areaRows.length;

  // ── 6f. metro, places, synonyms ──
  const metro = buildMetro(cur.osm.stations, cur.osm.routes, cur.osm.routeNodes);
  if (!metro.length) warn('metro: no stations built (OSM files missing or empty)');
  const insMetro = db.prepare('INSERT INTO metro_stations (id, name, name_en, lat, lng, lines) VALUES (?,?,?,?,?,?)');
  for (const m of metro) insMetro.run(m.id, m.name, m.nameEn, m.lat, m.lng, JSON.stringify(m.lines));
  stats.metroStations = metro.length;
  stats.metroStationsWithLines = metro.filter((m) => m.lines.length > 0).length;

  const places = buildPlaces({
    areas: areaRows,
    metro,
    malls: malls.map((m) => ({ slug: m.slug, name: m.name, kind: m.kind, area: m.area, lat: m.lat, lng: m.lng, shopCount: m.members.length })),
    curated: cur.places,
  });
  const insPlace = db.prepare('INSERT OR IGNORE INTO places (id, name, name_norm, kind, lat, lng, subtitle, weight) VALUES (?,?,?,?,?,?,?,?)');
  for (const p of places) {
    insPlace.run(p.id, p.name, p.nameNorm, p.kind, p.lat, p.lng, p.subtitle, p.weight);
    countInto(stats.places, p.kind);
  }

  const synonyms = new Map<string, Set<string>>();
  for (const [term, exps] of Object.entries(cur.synonyms)) {
    const t = normalizeForSearch(term);
    if (!t) continue;
    let set = synonyms.get(t);
    if (!set) synonyms.set(t, (set = new Set()));
    for (const e of exps) {
      const n = normalizeForSearch(e);
      if (n && n !== t) set.add(n);
    }
  }
  const insSyn = db.prepare('INSERT INTO synonyms (term, expansions) VALUES (?,?)');
  for (const [t, set] of [...synonyms.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (set.size) insSyn.run(t, JSON.stringify([...set]));
  }
  stats.synonyms = [...synonyms.values()].filter((s) => s.size > 0).length;

  // ── 6g. counts / meta ──
  stats.products = productRid;
  stats.offers = offerRid;
  stats.shops = shops.length;
  stats.shopsWithOffers = shops.filter((s) => s.offerCount > 0).length;
  stats.categories = cats.size;
  stats.malls = malls.length;
  stats.mallsWith5Plus = malls.filter((m) => m.members.length >= 5).length;
  stats.shopsInMalls = shops.filter((s) => s.mallId !== null).length;
  stats.topMalls = malls.slice(0, 15).map((m) => ({ name: m.name, shops: m.members.length, kind: m.kind, area: m.area }));
  stats.dataAsOf = dataAsOf;

  const counts = {
    products: stats.products,
    offers: stats.offers,
    shops: stats.shops,
    shopsWithOffers: stats.shopsWithOffers,
    malls: stats.malls,
    mallsWith5Plus: stats.mallsWith5Plus,
    categories: stats.categories,
    brands: stats.brands,
    areas: stats.areas,
    metroStations: stats.metroStations,
    places: places.length,
    synonyms: stats.synonyms,
  };
  const insMeta = db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)');
  const builtAt = new Date().toISOString();
  stats.builtAt = builtAt;
  insMeta.run('schema_version', SCHEMA_VERSION);
  insMeta.run('built_at', builtAt);
  insMeta.run('data_as_of', dataAsOf ?? builtAt);
  insMeta.run('counts', JSON.stringify(counts));
  insMeta.run(
    'source',
    JSON.stringify({
      dataset: 'Torob in-person shopping challenge dataset (shops.csv, products.csv, offers.csv)',
      osm: '© OpenStreetMap contributors, ODbL — metro stations and lines',
      curation: cur.files,
    }),
  );
  insMeta.run('quality', JSON.stringify(qualityJson(stats)));
  db.exec('COMMIT');

  // ── 7. finalize ──
  tStep = performance.now();
  db.exec("INSERT INTO products_fts(products_fts) VALUES('optimize')");
  db.exec('ANALYZE');
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec('VACUUM');
  checkIntegrity(db);
  db.close();
  renameSync(tmp, opts.out);
  info(`finalize (fts optimize, analyze, vacuum) ${secs(tStep)}`);

  stats.buildSeconds = round((performance.now() - t0) / 1000, 1);
  stats.dbBytes = statSync(opts.out).size;
  info(`done → ${opts.out} (${(stats.dbBytes / 1048576).toFixed(1)} MB, ${stats.buildSeconds} s)`);
  return { out: opts.out, stats, warnings: [...collectedWarnings()] };
}

function secs(t: number): string {
  return `${((performance.now() - t) / 1000).toFixed(1)} s`;
}

function collectShopStats(stats: ReportStats, s: ShopRec): void {
  const a = s.addr;
  if (a.mall) stats.addr.mall++;
  if (a.floorLabel) stats.addr.floor++;
  if (a.floorNum !== null) stats.addr.floorNum++;
  if (a.unit) stats.addr.unit++;
  if (a.plaque) stats.addr.plaque++;
  if (a.wing) stats.addr.wing++;
  if (a.landmark) stats.addr.landmark++;
  countInto(stats.addr.confidence, a.confidence);
  if (s.hours.declared) stats.hours.declared++;
  else countInto(stats.rules, 'hours_unknown');
  if (s.hours.stats.placeholderShifts) countInto(stats.rules, 'hours_placeholder_shifts_dropped', s.hours.stats.placeholderShifts);
  if (s.hours.stats.mergedShifts) countInto(stats.rules, 'hours_shifts_merged', s.hours.stats.mergedShifts);
  if (s.hours.stats.overnightShifts) countInto(stats.rules, 'hours_overnight_shifts', s.hours.stats.overnightShifts);
  if (s.hours.flags.includes('second_shift_early')) countInto(stats.rules, 'hours_second_shift_early');
  if (s.hours.suspicious) stats.hours.suspicious++;
  for (const f of s.hours.flags) countInto(stats.hours.flags, f);
  if (s.hours.stats.noOpenDay) stats.hours.noOpenDay++;
  stats.hours.placeholderShifts += s.hours.stats.placeholderShifts;
  stats.hours.overnightShifts += s.hours.stats.overnightShifts;
  if (s.pay.options.length) stats.pay.withOptions++;
  if (s.pay.installment) stats.pay.installment++;
  if (s.pay.torobPayInPerson) stats.pay.torobPayInPerson++;
  for (const o of s.pay.options) countInto(stats.pay.providers, `${o.provider}/${o.channel}`);
  for (const n of s.pay.unknownNames) countInto(stats.pay.unknownNames, n);
  for (const h of s.hints) countInto(stats.shopHints, h);
  countInto(stats.fastDelivery, s.fastDelivery === null ? 'null' : s.fastDelivery ? 'true' : 'false');
  if (s.nameIsReal) stats.nameIsReal++;
  if (s.instagram) stats.instagram++;
  if (s.website) stats.website++;
  if (s.phoneKind) countInto(stats.phoneKind, s.phoneKind);
  if (s.offerCount === 0 && s.categories.length > 0) stats.categoryOnlyShops++;
}

function qualityJson(s: ReportStats): Record<string, unknown> {
  const p = (n: number, d: number) => (d ? round(n / d, 4) : 0);
  return {
    shops: {
      total: s.shops,
      withOffers: s.shopsWithOffers,
      categoryOnly: s.categoryOnlyShops,
      inMall: p(s.shopsInMalls, s.shops),
      floor: p(s.addr.floor, s.shops),
      unitOrPlaque: p(s.addr.unit + s.addr.plaque, s.shops),
      locConfidence: s.addr.confidence,
      hoursDeclared: p(s.hours.declared, s.shops),
      hoursSuspicious: s.hours.suspicious,
      paymentOptions: p(s.pay.withOptions, s.shops),
      installment: s.pay.installment,
      torobPayInPerson: s.pay.torobPayInPerson,
      fastDelivery: s.fastDelivery,
      nameIsReal: s.nameIsReal,
    },
    offers: {
      total: s.offers,
      priceStatus: s.priceStatus,
      priceRule: s.priceRule,
      rules: Object.fromEntries([...s.rules.entries()].sort((x, y) => x[0].localeCompare(y[0]))),
      priceChangedNull: s.priceChangedNull,
      freshness: s.freshness,
      duplicateShopProduct: s.duplicateShopProductOffers,
      warrantyKind: s.warrantyKind,
    },
    products: {
      total: s.products,
      titleSource: s.titleSource,
      brandDataset: s.brandDataset,
      brandInferred: s.brandInferred,
      withValidPrice: p(s.productsWithValidPrice, s.products),
      withImages: p(s.productsWithImages, s.products),
      withSpecs: p(s.productsWithSpecs, s.products),
      audience: s.audience,
    },
    taxonomy: {
      unmappedCategories: s.unmappedCategories,
      unmappedProducts: s.unmappedProducts,
      groupSource: s.categoryGroupSource,
    },
  };
}

function checkIntegrity(db: DatabaseSyncT): void {
  const one = (sql: string) => (db.prepare(sql).get() as Record<string, number>)['n'] ?? 0;
  const bad = [
    ['offers → products', 'SELECT count(*) n FROM offers o LEFT JOIN products p ON p.rid = o.product_rid WHERE p.rid IS NULL'],
    ['offers → shops', 'SELECT count(*) n FROM offers o LEFT JOIN shops s ON s.rid = o.shop_rid WHERE s.rid IS NULL'],
    ['products → categories', 'SELECT count(*) n FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE c.id IS NULL'],
    ['shops → malls', 'SELECT count(*) n FROM shops s LEFT JOIN malls m ON m.id = s.mall_id WHERE s.mall_id IS NOT NULL AND m.id IS NULL'],
  ] as const;
  for (const [label, sql] of bad) {
    const n = one(sql);
    if (n) throw new Error(`integrity check failed: ${label} (${n} dangling rows)`);
  }
}


/** (DT5) A has offers · B declared categories only · C neither. */
function shopTier(s: ShopRec): 'A' | 'B' | 'C' {
  if (s.offerCount > 0) return 'A';
  return s.categories.length > 0 ? 'B' : 'C';
}

/** (SV9) Strongest installment information: in-person provider › provider with unknown channel › seller text › none. */
function installmentTier(s: ShopRec): 'in_person' | 'declared_unknown_channel' | 'seller_text' | 'none_recorded' {
  const inst = s.pay.options.filter((o) => o.provider !== 'other');
  if (inst.some((o) => o.channel === 'in_person')) return 'in_person';
  if (inst.length) return 'declared_unknown_channel';
  if (s.hints.has('installment')) return 'seller_text';
  return 'none_recorded';
}

/** Model-key groups bigger than this are too generic to be "one model" (e.g. «کفش زنانه»). */
export const MODEL_KEY_MAX_GROUP = 40;
/** DT2: price < this × model-family median → «قیمت خیلی پایین‌تر از مدل‌های هم‌نام». */
export const MODEL_OUTLIER_FACTOR = 0.35;
/** DT2: 1–2-offer products: suspicious when < category p1 or > p99 × this. */
export const CATEGORY_HIGH_FACTOR = 3;
/** Groups where «same brand + model» really is one product family (spec-numbered industrial parts are not). */
export const MODEL_OUTLIER_GROUPS = ['mobile', 'computer', 'audio_video', 'appliances', 'watch_jewelry'];
const CATEGORY_MIN_PRICES = 30;

/**
 * Whole-catalog price rules (DT2) that need category / model-family context, applied after all
 * offers are inserted; re-derives product price stats for every product it touches.
 */
export function applyPriceRules(db: DatabaseSyncT, stats: ReportStats): void {
  const bump = (m: Map<string, number>, k: string, d: number) => m.set(k, (m.get(k) ?? 0) + d);
  // DT8: drop generic keys, count groups
  const dropped = db
    .prepare(
      `UPDATE products SET model_key = NULL WHERE model_key IN
         (SELECT model_key FROM products WHERE model_key IS NOT NULL GROUP BY model_key HAVING count(*) > ?)`,
    )
    .run(MODEL_KEY_MAX_GROUP);
  stats.rules.set('model_key_generic_dropped', Number(dropped.changes));
  const mk = db
    .prepare(
      `SELECT count(*) n, coalesce(sum(c), 0) inMulti, count(CASE WHEN c > 1 THEN 1 END) groups
         FROM (SELECT model_key, count(*) c FROM products WHERE model_key IS NOT NULL GROUP BY model_key)`,
    )
    .get() as { n: number; inMulti: number; groups: number };
  stats.rules.set('model_key_assigned', Number((db.prepare('SELECT count(*) n FROM products WHERE model_key IS NOT NULL').get() as { n: number }).n));
  stats.rules.set('model_key_multi_variant_groups', Number(mk.groups));

  const touched = new Set<number>();
  const setStatus = db.prepare('UPDATE offers SET price = ?, price_status = ?, price_rule = ? WHERE rid = ?');

  // category medians (of product medians) and p1 / p99 of valid offer prices
  const catMed = new Map<number, number>();
  {
    const per = new Map<number, number[]>();
    for (const r of db.prepare('SELECT category_id c, price_median m FROM products WHERE price_median IS NOT NULL').all() as { c: number; m: number }[]) {
      let l = per.get(r.c);
      if (!l) per.set(r.c, (l = []));
      l.push(r.m);
    }
    for (const [c, l] of per) catMed.set(c, median(l) ?? 0);
  }
  // >1e10 is only suspicious when the category median is below 1e9 (DT2)
  let kept = 0;
  for (const r of db
    .prepare(
      `SELECT o.rid, o.raw_price raw, p.category_id c, o.product_rid pr FROM offers o JOIN products p ON p.rid = o.product_rid
        WHERE o.price_rule = 'too_high' AND o.raw_price_text IS NULL`,
    )
    .all() as { rid: number; raw: number; c: number; pr: number }[]) {
    if ((catMed.get(r.c) ?? 0) >= 1e9) {
      setStatus.run(r.raw, 'ok', null, r.rid);
      touched.add(r.pr);
      kept++;
      bump(stats.priceRule, 'too_high', -1);
      bump(stats.priceStatus, 'suspicious', -1);
      bump(stats.priceStatus, 'ok', 1);
    }
  }
  stats.rules.set('price_above_1e10_kept_high_category', kept);

  const catPrices = new Map<number, number[]>();
  for (const r of db
    .prepare(`SELECT p.category_id c, o.price v FROM offers o JOIN products p ON p.rid = o.product_rid WHERE o.price_status = 'ok'`)
    .all() as { c: number; v: number }[]) {
    let l = catPrices.get(r.c);
    if (!l) catPrices.set(r.c, (l = []));
    l.push(r.v);
  }
  const catQ = new Map<number, { p1: number; p99: number }>();
  for (const [c, l] of catPrices) {
    if (l.length < CATEGORY_MIN_PRICES) continue;
    l.sort((a, b) => a - b);
    catQ.set(c, { p1: quantileSorted(l, 0.01)!, p99: quantileSorted(l, 0.99)! });
  }
  catPrices.clear();
  const flag = (rid: number, pr: number, rule: string) => {
    setStatus.run(null, 'suspicious', rule, rid);
    touched.add(pr);
    countInto(stats.priceRule, rule);
    bump(stats.priceStatus, 'ok', -1);
    bump(stats.priceStatus, 'suspicious', 1);
  };
  // 1–2-offer products vs category p1 / p99 × 3
  for (const r of db
    .prepare(
      `SELECT o.rid, o.price v, p.category_id c, p.rid pr FROM offers o JOIN products p ON p.rid = o.product_rid
        WHERE o.price_status = 'ok' AND p.offer_count <= 2`,
    )
    .all() as { rid: number; v: number; c: number; pr: number }[]) {
    const q = catQ.get(r.c);
    if (!q) continue;
    if (r.v < q.p1) flag(r.rid, r.pr, 'category_low');
    else if (r.v > q.p99 * CATEGORY_HIGH_FACTOR) flag(r.rid, r.pr, 'category_high');
  }
  // model family: < 0.35 × median of the same brand + model key
  const fam = new Map<string, { rid: number; v: number; pr: number }[]>();
  for (const r of db
    .prepare(
      `SELECT o.rid, o.price v, p.rid pr, p.model_key k FROM offers o JOIN products p ON p.rid = o.product_rid
        WHERE o.price_status = 'ok' AND p.model_key IS NOT NULL AND p.group_id IN (${MODEL_OUTLIER_GROUPS.map((g) => `'${g}'`).join(',')})`,
    )
    .all() as { rid: number; v: number; pr: number; k: string }[]) {
    if (!/\d/.test(r.k.split('|')[2] ?? '')) continue;
    let l = fam.get(r.k);
    if (!l) fam.set(r.k, (l = []));
    l.push(r);
  }
  for (const l of fam.values()) {
    if (l.length < 3) continue;
    const m = median(l.map((x) => x.v));
    if (m === null) continue;
    for (const x of l) if (x.v < m * MODEL_OUTLIER_FACTOR) flag(x.rid, x.pr, 'model_outlier');
  }
  fam.clear();

  // re-derive product price stats
  const okPrices = db.prepare(`SELECT price FROM offers WHERE product_rid = ? AND price_status = 'ok' ORDER BY price`);
  const upd = db.prepare('UPDATE products SET price_min = ?, price_max = ?, price_median = ?, valid_price_count = ? WHERE rid = ?');
  for (const pr of touched) {
    const v = (okPrices.all(pr) as { price: number }[]).map((x) => x.price);
    const med = median(v);
    upd.run(v[0] ?? null, v[v.length - 1] ?? null, med === null ? null : Math.round(med), v.length, pr);
  }
  stats.rules.set('price_products_restated', touched.size);
  for (const [k, v] of stats.priceRule) stats.rules.set(`price_rule_${k}`, v);
}
