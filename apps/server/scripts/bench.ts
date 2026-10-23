/**
 * Catalog services benchmark + relevance eyeballing on the real catalog.
 * Run from the repo root:  npx tsx apps/server/scripts/bench.ts [catalogPath]
 */
import type { UserContext } from '@titl/shared';
import { formatTomanShort } from '@titl/shared';
import { loadConfig } from '../src/config.js';
import { CatalogDb } from '../src/db/catalog.js';
import { noopReports, noopVerification } from '../src/deps.js';
import { createLogger } from '../src/logger.js';
import { createServices } from '../src/services/index.js';

const config = loadConfig();
const path = process.argv[2] ?? config.catalogPath;
const log = createLogger('warn');
const t0 = performance.now();
const catalog = new CatalogDb(path);
const services = createServices({ catalog, config, log, providers: { verification: noopVerification, reports: noopReports } });
console.log(`catalog: ${path}  startup ${Math.round(performance.now() - t0)} ms`);

const VANAK: UserContext = { location: { lat: 35.7575, lng: 51.4098, label: 'ونک', source: 'place' } };
const QUIET = process.env.QUIET === '1';

function time<T>(label: string, fn: () => T, runs = 7): { res: T; p50: number; p95: number } {
  const ts: number[] = [];
  let res!: T;
  for (let i = 0; i < runs; i++) {
    const s = performance.now();
    res = fn();
    ts.push(performance.now() - s);
  }
  ts.sort((a, b) => a - b);
  const p50 = ts[Math.floor(ts.length / 2)]!;
  const p95 = ts[Math.min(ts.length - 1, Math.ceil(ts.length * 0.95) - 1)]!;
  return { res, p50, p95 };
}

const rows: { what: string; p50: number; p95: number; target: number }[] = [];
function rec(what: string, t: { p50: number; p95: number }, target: number) {
  rows.push({ what, p50: t.p50, p95: t.p95, target });
}

const QUERIES = [
  'کتونی',
  'کتونی نایک مردانه',
  'گوشی سامسونگ قسطی زیر ۲۵ میلیون',
  'هدفون بلوتوث تا ۳ میلیون',
  'دوربین مداربسته',
  'لوستر',
  'ساعت مچی مردانه',
  'iphone 16',
  'کابل افشان',
  'یخچال ساید بای ساید نزدیک ونک',
  'لپ تاپ ایسوس حدود ۴۰ میلیون',
];

let bestProduct: string | null = null;
for (const q of QUERIES) {
  const t = time(`search ${q}`, () => services.search({ q }, VANAK));
  rec(`search «${q}»`, t, 150);
  const r = t.res;
  if (!QUIET) {
    const p = r.parsed;
    console.log(`\n■ «${q}» total=${r.total} via chips=[${p.chips.map((c) => `${c.key}:${c.label}`).join(' | ')}] kw=[${p.keywords.join(',')}]`);
    if (r.notices?.length) console.log('  notices:', r.notices.map((n) => n.label).join(' / '));
    if (r.didYouMean) console.log('  didYouMean:', r.didYouMean);
    for (const it of r.items.slice(0, 6)) {
      console.log(`  - ${it.title.slice(0, 70)} | ${it.category} | ${it.brand ?? '-'} | ${it.priceMin ? formatTomanShort(it.priceMin) : '?'} | ${it.sellerCount} sellers | ${it.reasons.map((x) => x.label).join('، ')}`);
    }
  }
}

const disc = time('discover', () => services.discover({ q: 'کتونی' }, VANAK));
rec('discover «کتونی»', disc, 100);
if (!QUIET) {
  console.log(`\n■ discovery: ${disc.res.intro}`);
  for (const q of disc.res.questions) console.log(`  ? ${q.title}  → ${q.options.map((o) => `${o.label}(${o.count})`).join(' · ')}`);
}

// products with many sellers
const many = catalog.all<{ id: string; title: string; shop_count: number }>('SELECT id, title, shop_count FROM products ORDER BY shop_count DESC LIMIT 3');
for (const p of many) {
  bestProduct ??= p.id;
  rec(`product ${p.shop_count} sellers`, time('product', () => services.getProduct(p.id, VANAK)), 100);
  const st = time('stores', () => services.getStores(p.id, VANAK));
  rec(`stores ${p.shop_count} sellers`, st, 100);
  if (!QUIET) {
    console.log(`\n■ stores for «${p.title.slice(0, 60)}» (${p.shop_count})`);
    for (const s of st.res!.stores.slice(0, 4)) {
      console.log(`  #${s.rank} ${s.shop.name} | ${s.score} | ${s.price.price ? formatTomanShort(s.price.price) : '?'} | ${s.shop.distanceKm ?? '?'} km | ${s.shop.openStatus.label} | ${s.reasons.map((r) => r.label).join('، ')}`);
    }
    console.log(`  areas: ${st.res!.areas.slice(0, 3).map((a) => `${a.area}(${a.storeCount})`).join(' · ')}  categoryOnly: ${st.res!.categoryOnly.length}`);
  }
  rec('similar', time('similar', () => services.getSimilar(p.id, VANAK)), 100);
  rec('areas', time('areas', () => services.getAreas(p.id, VANAK)), 100);
}

const top = many[0]!;
const stores = services.getStores(top.id, VANAK)!;
const shopIds = stores.stores.slice(0, 3).map((s) => s.shop.id);
const cs = time('compareStores', () => services.compareStores(top.id, shopIds, VANAK));
rec('compare stores ×3', cs, 100);
if (!QUIET) console.log(`\n■ compare stores: ${cs.res!.summary}`);
const sr = services.search({ q: 'گوشی سامسونگ' }, VANAK);
const cp = time('compareProducts', () => services.compareProducts(sr.items.slice(0, 3).map((i) => i.id), VANAK));
rec('compare products ×3', cp, 100);
if (!QUIET) console.log(`■ compare products: ${cp.res.summary} (rows ${cp.res.rows.length})`);

const alt = time('alternatives', () => services.alternatives({ productId: top.id, shopId: shopIds[0]!, reason: 'closed', context: VANAK }));
rec('alternatives closed', alt, 100);
if (!QUIET) console.log(`■ alternatives: ${alt.res.headline} same=${alt.res.sameProduct.length} passage=${alt.res.samePassage.length} similar=${alt.res.similarProducts.length}`);

const planStops = stores.stores.slice(0, 5).map((s) => ({ shopId: s.shop.id, productId: top.id }));
const planT = { p50: 0, p95: 0 };
const ts: number[] = [];
let lastPlan: Awaited<ReturnType<typeof services.plan>> | null = null;
for (let i = 0; i < 7; i++) {
  const s = performance.now();
  lastPlan = await services.plan({ stops: planStops, mode: 'metro' }, VANAK);
  ts.push(performance.now() - s);
}
ts.sort((a, b) => a - b);
planT.p50 = ts[3]!;
planT.p95 = ts[6]!;
rec('plan 5 stops (metro)', planT, 100);
if (!QUIET && lastPlan) {
  console.log(`■ plan: ${lastPlan.totalMinutes} min, ${lastPlan.totalDistanceKm} km, leaveBy=${lastPlan.leaveBy}`);
  for (const s of lastPlan.stops) console.log(`  ${s.order}. ${s.shop.name} | leg ${s.legFromPrev?.minutes ?? 0}m ${s.legFromPrev?.mode ?? ''} | ${s.openAtArrival.label} | ${s.warnings.map((w) => w.label).join('، ')}`);
  console.log(`  warnings: ${lastPlan.warnings.map((w) => w.label).join(' / ')}  tips: ${lastPlan.tips.join(' / ')}`);
}

const mall = catalog.get<{ slug: string; name: string }>('SELECT slug, name FROM malls ORDER BY shop_count DESC LIMIT 1');
if (mall) {
  const m = time('mall', () => services.getMall(mall.slug, VANAK));
  rec(`mall «${mall.name}»`, m, 100);
  if (!QUIET) console.log(`■ mall ${mall.name}: floors=${m.res!.floors.length} tips=${m.res!.tips.join(' / ')}`);
}
rec('places «ونک»', time('places', () => services.places('ونک')), 100);
rec('places «تجریش»', time('places', () => services.places('تجر')), 100);
rec('reversePlace', time('rev', () => services.reversePlace({ lat: 35.7, lng: 51.42 })), 100);
rec('suggest «گوش»', time('suggest', () => services.suggest('گوش')), 100);
rec('meta', time('meta', () => services.meta()), 100);
rec('findShops «موبایل»', time('findShops', () => services.findShops('موبایل')), 100);

console.log('\n──────── timings (ms) ────────');
for (const r of rows) {
  const flag = r.p95 > r.target ? '  ✗ over target' : '';
  console.log(`${r.what.padEnd(48)} p50 ${r.p50.toFixed(1).padStart(7)}  p95 ${r.p95.toFixed(1).padStart(7)}  (target ${r.target})${flag}`);
}
catalog.close();
