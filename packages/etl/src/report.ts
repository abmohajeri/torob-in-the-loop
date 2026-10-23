/**
 * Build statistics and the data-quality report (docs/DATA-REPORT.md).
 */
import { pct } from './util.js';

export interface ReportStats {
  builtAt: string;
  dataAsOf: string | null;
  buildSeconds: number;
  dbBytes: number;
  curationFiles: Record<string, string>;
  // counts
  shops: number;
  shopsSkipped: number;
  shopsWithOffers: number;
  categoryOnlyShops: number;
  products: number;
  offers: number;
  offersSkipped: number;
  categories: number;
  brands: number;
  brandsCurated: number;
  malls: number;
  mallsWith5Plus: number;
  shopsInMalls: number;
  topMalls: { name: string; shops: number; kind: string; area: string | null }[];
  areas: number;
  metroStations: number;
  metroStationsWithLines: number;
  places: Map<string, number>;
  synonyms: number;
  // shops
  addr: {
    mall: number;
    floor: number;
    floorNum: number;
    unit: number;
    plaque: number;
    wing: number;
    landmark: number;
    confidence: Map<string, number>;
  };
  hours: {
    declared: number;
    suspicious: number;
    noOpenDay: number;
    placeholderShifts: number;
    overnightShifts: number;
    flags: Map<string, number>;
  };
  pay: {
    withOptions: number;
    installment: number;
    torobPayInPerson: number;
    providers: Map<string, number>;
    unknownNames: Map<string, number>;
  };
  shopHints: Map<string, number>;
  fastDelivery: Map<string, number>;
  nameIsReal: number;
  instagram: number;
  website: number;
  phoneKind: Map<string, number>;
  // offers
  priceStatus: Map<string, number>;
  priceRule: Map<string, number>;
  priceClamped: number;
  priceChangedNull: number;
  freshness: Map<string, number>;
  duplicateShopProductOffers: number;
  warrantyKind: Map<string, number>;
  warrantyNone: number;
  // products
  titleSource: { catalog: number; seller: number; generated: number };
  redactedCatalogTitles: number;
  brandDataset: number;
  brandInferred: number;
  audience: Map<string, number>;
  productsWithImages: number;
  productsWithSpecs: number;
  productsWithValidPrice: number;
  productsWith5PlusShops: number;
  productsWithTitleEn: number;
  facetRows: number;
  // taxonomy
  unmappedCategories: number;
  unmappedProducts: number;
  declaredOnlyCategories: number;
  declaredOnlyInferred: number;
  categoryGroupSource: Map<string, number>;
  categoriesWithAliases: number;
  groupProducts: Record<string, number>;
  /** (DT15) Hit count of every enrichment rule in this run (also in meta.quality.rules, /api/meta/data-quality). */
  rules: Map<string, number>;
}

export function newReportStats(): ReportStats {
  return {
    builtAt: '',
    dataAsOf: null,
    buildSeconds: 0,
    dbBytes: 0,
    curationFiles: {},
    shops: 0,
    shopsSkipped: 0,
    shopsWithOffers: 0,
    categoryOnlyShops: 0,
    products: 0,
    offers: 0,
    offersSkipped: 0,
    categories: 0,
    brands: 0,
    brandsCurated: 0,
    malls: 0,
    mallsWith5Plus: 0,
    shopsInMalls: 0,
    topMalls: [],
    areas: 0,
    metroStations: 0,
    metroStationsWithLines: 0,
    places: new Map(),
    synonyms: 0,
    addr: { mall: 0, floor: 0, floorNum: 0, unit: 0, plaque: 0, wing: 0, landmark: 0, confidence: new Map() },
    hours: { declared: 0, suspicious: 0, noOpenDay: 0, placeholderShifts: 0, overnightShifts: 0, flags: new Map() },
    pay: { withOptions: 0, installment: 0, torobPayInPerson: 0, providers: new Map(), unknownNames: new Map() },
    shopHints: new Map(),
    fastDelivery: new Map(),
    nameIsReal: 0,
    instagram: 0,
    website: 0,
    phoneKind: new Map(),
    priceStatus: new Map(),
    priceRule: new Map(),
    priceClamped: 0,
    priceChangedNull: 0,
    freshness: new Map(),
    duplicateShopProductOffers: 0,
    warrantyKind: new Map(),
    warrantyNone: 0,
    titleSource: { catalog: 0, seller: 0, generated: 0 },
    redactedCatalogTitles: 0,
    brandDataset: 0,
    brandInferred: 0,
    audience: new Map(),
    productsWithImages: 0,
    productsWithSpecs: 0,
    productsWithValidPrice: 0,
    productsWith5PlusShops: 0,
    productsWithTitleEn: 0,
    facetRows: 0,
    unmappedCategories: 0,
    unmappedProducts: 0,
    declaredOnlyCategories: 0,
    declaredOnlyInferred: 0,
    categoryGroupSource: new Map(),
    categoriesWithAliases: 0,
    groupProducts: {},
    rules: new Map(),
  };
}

const n = (v: number) => v.toLocaleString('en-US');

function mapTable(title: string, m: Map<string, number>, total: number, order?: string[], limit = 50): string {
  const rows = [...m.entries()];
  if (order) rows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  else rows.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const lines = [`| ${title} | count | share |`, '|---|---:|---:|'];
  for (const [k, v] of rows.slice(0, limit)) lines.push(`| ${k} | ${n(v)} | ${pct(v, total)} |`);
  return lines.join('\n');
}

/** Markdown data-quality report. `extra` is appended verbatim (hand-written caveats). */
export function renderReport(s: ReportStats, warnings: readonly string[], extra = ''): string {
  const L: string[] = [];
  const sh = s.shops;
  L.push('# Torob in the Loop — Data report');
  L.push('');
  L.push('> Generated by `npm run data:build` (packages/etl). Do not edit the generated sections by hand —');
  L.push('> re-run the build. Numbers describe the Torob challenge dataset after the enrichment rules in');
  L.push('> docs/ARCHITECTURE.md §4.');
  L.push('');
  L.push(`- Built at: ${s.builtAt}`);
  L.push(`- Data as of (newest price change): ${s.dataAsOf ?? 'unknown'}`);
  L.push(`- Build time: **${s.buildSeconds} s** · DB size: **${(s.dbBytes / 1048576).toFixed(1)} MB**`);
  L.push(`- Curated inputs: ${Object.entries(s.curationFiles).map(([k, v]) => `${k} (${v})`).join(', ')}`);
  L.push('');
  L.push('## 0. Rule hit counts (DESIGN-REVIEW §4, CI tolerance ±5 %)');
  L.push('');
  L.push('| rule | hits |');
  L.push('|---|---:|');
  for (const [k, v] of [...s.rules.entries()].sort((a, b) => a[0].localeCompare(b[0]))) L.push(`| \`${k}\` | ${n(v)} |`);
  L.push('');
  L.push('## 1. Counts');
  L.push('');
  L.push('| entity | rows | notes |');
  L.push('|---|---:|---|');
  L.push(`| shops | ${n(s.shops)} | ${n(s.shopsWithOffers)} with offers; ${n(s.categoryOnlyShops)} category-only (declared categories, no offers) |`);
  L.push(`| products | ${n(s.products)} | ${n(s.productsWith5PlusShops)} sold by ≥ 5 shops |`);
  L.push(`| offers | ${n(s.offers)} | ${n(s.offersSkipped)} skipped; ${n(s.duplicateShopProductOffers)} extra rows are same-(shop, product) variants (kept) |`);
  L.push(`| categories | ${n(s.categories)} | ${n(s.declaredOnlyCategories)} declared by shops only (no product) |`);
  L.push(`| brands | ${n(s.brands)} | ${n(s.brandsCurated)} linked to curated brands.json |`);
  L.push(`| malls / passages | ${n(s.malls)} | ${n(s.mallsWith5Plus)} with ≥ 5 shops; ${n(s.shopsInMalls)} shops (${pct(s.shopsInMalls, sh)}) inside one |`);
  L.push(`| areas | ${n(s.areas)} | dataset location_label centroids |`);
  L.push(`| metro stations | ${n(s.metroStations)} | ${n(s.metroStationsWithLines)} matched to ≥ 1 line (OSM) |`);
  L.push(`| places (gazetteer) | ${n([...s.places.values()].reduce((a, b) => a + b, 0))} | ${[...s.places.entries()].map(([k, v]) => `${k} ${n(v)}`).join(', ')} |`);
  L.push(`| synonyms | ${n(s.synonyms)} | normalized terms from synonyms.json |`);
  L.push(`| product facets | ${n(s.facetRows)} | (key, value, product) rows |`);
  L.push('');
  L.push('## 2. Shops');
  L.push('');
  L.push('### In-mall location (address parser)');
  L.push('');
  L.push('| field | shops | share |');
  L.push('|---|---:|---:|');
  for (const [k, v] of [
    ['mall / passage mentioned', s.addr.mall],
    ['clustered into a mall', s.shopsInMalls],
    ['floor label', s.addr.floor],
    ['floor number known', s.addr.floorNum],
    ['unit (واحد/غرفه/…)', s.addr.unit],
    ['plaque (پلاک)', s.addr.plaque],
    ['wing / corridor', s.addr.wing],
    ['landmark', s.addr.landmark],
  ] as const) {
    L.push(`| ${k} | ${n(v)} | ${pct(v, sh)} |`);
  }
  L.push('');
  L.push(mapTable('loc_confidence', s.addr.confidence, sh, ['high', 'medium', 'low']));
  L.push('');
  L.push('Largest malls / passages (by shops in the dataset):');
  L.push('');
  L.push('| mall | kind | area | shops |');
  L.push('|---|---|---|---:|');
  for (const m of s.topMalls) L.push(`| ${m.name} | ${m.kind} | ${m.area ?? '—'} | ${m.shops} |`);
  L.push('');
  L.push('### Opening hours');
  L.push('');
  L.push(`- Declared (≥ 1 open day with a real shift): **${n(s.hours.declared)}** (${pct(s.hours.declared, sh)})`);
  L.push(`- Suspicious (start < 06:00 or > 23:00, shift < 1 h, day > 18 h, 24 h): **${n(s.hours.suspicious)}** (${pct(s.hours.suspicious, s.hours.declared)} of declared)`);
  L.push(`- Schedules present but without any real shift (all placeholders / closed / unsupported): ${n(s.hours.noOpenDay)}`);
  L.push(`- Placeholder shifts dropped (00:00–00:00): ${n(s.hours.placeholderShifts)} · overnight shifts: ${n(s.hours.overnightShifts)}`);
  L.push('');
  L.push(mapTable('suspicious flag (shops)', s.hours.flags, s.hours.declared));
  L.push('');
  L.push('### Payments, delivery, identity');
  L.push('');
  L.push(`- Shops with ≥ 1 payment option: ${n(s.pay.withOptions)} (${pct(s.pay.withOptions, sh)}); any installment provider: ${n(s.pay.installment)}; ترب‌پی in person: ${n(s.pay.torobPayInPerson)}`);
  L.push(`- Real names (Instagram or website present): ${n(s.nameIsReal)} (Instagram ${n(s.instagram)}, website ${n(s.website)})`);
  L.push('');
  L.push(mapTable('provider/channel', s.pay.providers, sh));
  L.push('');
  if (s.pay.unknownNames.size) {
    L.push('Unrecognized provider names (mapped to `other`, label kept):');
    L.push('');
    L.push(mapTable('provider_name', s.pay.unknownNames, sh, undefined, 20));
    L.push('');
  }
  L.push(mapTable('supports_fast_delivery', s.fastDelivery, sh, ['true', 'false', 'null']));
  L.push('');
  L.push(mapTable('text hint (from offer descriptions)', s.shopHints, sh));
  L.push('');
  L.push(mapTable('phone kind', s.phoneKind, sh));
  L.push('');
  L.push('## 3. Offers & prices');
  L.push('');
  L.push(mapTable('price_status', s.priceStatus, s.offers, ['ok', 'missing', 'suspicious']));
  L.push('');
  L.push(mapTable('price_rule (not ok)', s.priceRule, s.offers));
  L.push('');
  L.push(`- Values beyond 2^53 clamped in \`raw_price\` (exact digits in \`raw_price_text\`): ${n(s.priceClamped)}`);
  L.push(`- \`price_changed_at\` missing: ${n(s.priceChangedNull)}`);
  L.push('');
  L.push('Freshness of offers relative to the dataset snapshot (`data_as_of`):');
  L.push('');
  L.push(mapTable('freshness', s.freshness, s.offers, ['fresh', 'recent', 'stale', 'very_stale', 'unknown']));
  L.push('');
  L.push(mapTable('warranty kind', s.warrantyKind, s.offers));
  L.push('');
  L.push(`- Offers without any warranty information: ${n(s.warrantyNone)} (${pct(s.warrantyNone, s.offers)})`);
  L.push('');
  L.push('## 4. Products');
  L.push('');
  L.push(`- Title source: catalog ${n(s.titleSource.catalog)} · seller ${n(s.titleSource.seller)} · generated ${n(s.titleSource.generated)} (redacted catalog titles: ${n(s.redactedCatalogTitles)})`);
  L.push(`- Brand: from dataset ${n(s.brandDataset)} (${pct(s.brandDataset, s.products)}) · inferred from title ${n(s.brandInferred)} (${pct(s.brandInferred, s.products)}) · unknown ${n(s.products - s.brandDataset - s.brandInferred)}`);
  L.push(`- With ≥ 1 valid price: ${pct(s.productsWithValidPrice, s.products)} · images: ${pct(s.productsWithImages, s.products)} · specs: ${pct(s.productsWithSpecs, s.products)} · English title: ${pct(s.productsWithTitleEn, s.products)}`);
  L.push('');
  L.push(mapTable('audience', s.audience, s.products));
  L.push('');
  L.push('## 5. Taxonomy');
  L.push('');
  L.push(`- Product categories missing from taxonomy.json: **${n(s.unmappedCategories)}** (${n(s.unmappedProducts)} products → group \`other\`)`);
  L.push(`- Shop-declared-only categories: ${n(s.declaredOnlyCategories)}, of which ${n(s.declaredOnlyInferred)} got a group by co-occurrence`);
  L.push(`- Categories with colloquial aliases: ${n(s.categoriesWithAliases)}`);
  L.push('');
  L.push(mapTable('group_source', s.categoryGroupSource, s.categories));
  L.push('');
  L.push('| group | products |');
  L.push('|---|---:|');
  for (const [g, v] of Object.entries(s.groupProducts)) L.push(`| ${g} | ${n(v)} |`);
  L.push('');
  if (warnings.length) {
    L.push('## 6. Build warnings');
    L.push('');
    for (const w of warnings.slice(0, 40)) L.push(`- ${w}`);
    if (warnings.length > 40) L.push(`- … ${warnings.length - 40} more`);
    L.push('');
  }
  if (extra) {
    L.push(extra.trim());
    L.push('');
  }
  return L.join('\n');
}
