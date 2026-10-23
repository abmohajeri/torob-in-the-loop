/**
 * `npm run data:fixtures` — samples a small REAL subset of the dataset into packages/etl/fixtures/*.csv
 * and builds data/fixture.db with the same pipeline as the full catalog.
 *
 * Selection is deterministic (hash-ordered) and covers the edge cases server/web tests need:
 * big passages with floors/units, hours edge cases, payment providers (incl. in-person ترب‌پی),
 * fast-delivery tri-state, category-only shops, instagram/website shops, products with 5+ sellers,
 * sneakers, mobile phones, redacted titles, zero/outlier prices.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildCatalog } from './catalog.js';
import { readCsv, readCsvHeader, writeCsv, type CsvRecord } from './csv.js';
import { info } from './log.js';
import { FIXTURES_DIR, FIXTURE_DB_PATH, curationDir, datasetDir } from './paths.js';
import { REDACTED_TITLE } from './titles.js';
import { hash32 } from './util.js';

const MAX_SHOPS = 300;
const MAX_PRODUCTS = 3000;
const MAX_OFFERS_PER_SHOP = 24;

const byHash = (a: string, b: string): number => hash32(a) - hash32(b);

async function main(): Promise<void> {
  const src = datasetDir();
  const files = { shops: join(src, 'shops.csv'), products: join(src, 'products.csv'), offers: join(src, 'offers.csv') };

  const shops: CsvRecord[] = [];
  for await (const r of readCsv(files.shops)) shops.push(r);
  const offers: CsvRecord[] = [];
  const offersByShop = new Map<string, CsvRecord[]>();
  const sellersByProduct = new Map<string, Set<string>>();
  for await (const r of readCsv(files.offers)) {
    offers.push(r);
    const s = r.shop_id ?? '';
    const p = r.product_id ?? '';
    let l = offersByShop.get(s);
    if (!l) offersByShop.set(s, (l = []));
    l.push(r);
    let ss = sellersByProduct.get(p);
    if (!ss) sellersByProduct.set(p, (ss = new Set()));
    ss.add(s);
  }

  // product facts needed for selection (category, redacted) — one streaming pass
  const productCat = new Map<string, string>();
  const redacted = new Set<string>();
  for await (const r of readCsv(files.products)) {
    const id = r.product_id ?? '';
    productCat.set(id, r.category_name ?? '');
    if ((r.persian_title ?? '').includes(REDACTED_TITLE)) redacted.add(id);
  }

  const chosenShops = new Set<string>();
  const chosenProducts = new Set<string>();
  const sortedShops = [...shops].sort((a, b) => byHash(a.shop_id ?? '', b.shop_id ?? ''));
  const take = (pred: (r: CsvRecord) => boolean, n: number): void => {
    let k = 0;
    for (const r of sortedShops) {
      if (k >= n || chosenShops.size >= MAX_SHOPS) break;
      const id = r.shop_id ?? '';
      if (chosenShops.has(id) || !pred(r)) continue;
      chosenShops.add(id);
      k++;
    }
  };

  // 1. hub products (many sellers): phones + sneakers + generic — add their sellers so 5+ sellers survive
  const multi = [...sellersByProduct.entries()].filter(([, s]) => s.size >= 5).sort((a, b) => byHash(a[0], b[0]));
  const hubs: string[] = [];
  const pickHubs = (pred: (cat: string) => boolean, n: number) => {
    let k = 0;
    for (const [pid] of multi) {
      if (k >= n) break;
      if (hubs.includes(pid) || !pred(productCat.get(pid) ?? '')) continue;
      hubs.push(pid);
      k++;
    }
  };
  pickHubs((c) => c.includes('گوشی موبایل'), 4);
  pickHubs((c) => c.includes('کتانی') || c.includes('کفش اسپرت'), 3);
  pickHubs(() => true, 3);
  for (const pid of hubs) {
    chosenProducts.add(pid);
    const sellers = [...(sellersByProduct.get(pid) ?? [])].sort(byHash).slice(0, 7);
    for (const s of sellers) if (chosenShops.size < MAX_SHOPS) chosenShops.add(s);
  }

  // 2. edge-case shop buckets
  const has = (field: string, re: RegExp) => (r: CsvRecord) => re.test(r[field] ?? '');
  const hasOffers = (r: CsvRecord) => offersByShop.has(r.shop_id ?? '');
  take((r) => /پاساژ|مرکز خرید|مجتمع/.test(r.address ?? '') && /طبقه|طیقه/.test(r.address ?? '') && /واحد|پلاک|غرفه/.test(r.address ?? '') && hasOffers(r), 80);
  take((r) => /علا\S*الدین|علالدین|چارسو|بوشهری|تندیس/.test(r.address ?? ''), 25);
  take((r) => /منفی|آخر|طیقه|لاین|راهرو|روبرو|بخش/.test(r.address ?? ''), 20);
  take(has('weekly_hours', /"closed"/), 15);
  take(has('weekly_hours', /"unsupported"/), 8);
  take(has('weekly_hours', /"0[0-3]:\d\d:00","start_time":"0[0-3]/), 8);
  take(has('payment_options', /"in_person"[^}]*ترب/), 15);
  take(has('payment_options', /ترب|اسنپ/), 15);
  take(has('supports_fast_delivery', /^true$/), 15);
  take(has('supports_fast_delivery', /^false$/), 15);
  take(has('supports_fast_delivery', /^null$/), 10);
  take((r) => !hasOffers(r) && (r.category_names ?? '').length > 4, 25);
  take((r) => !/^(null)?$/.test(r.instagram ?? ''), 15);
  take((r) => !/^(null)?$/.test(r.website_url ?? ''), 15);
  take(() => true, MAX_SHOPS);

  // 3. products: special ones first, then fill from chosen shops' offers
  const candidates: { pid: string; prio: number }[] = [];
  for (const s of chosenShops) {
    for (const o of offersByShop.get(s) ?? []) {
      const pid = o.product_id ?? '';
      const price = Number(o.price_toman);
      const cat = productCat.get(pid) ?? '';
      let prio = 3;
      if (redacted.has(pid) || (o.seller_title ?? '').includes(REDACTED_TITLE)) prio = 0;
      else if (price === 0 || price > 1e10) prio = 0;
      else if (cat.includes('گوشی موبایل') || cat.includes('کتانی')) prio = 1;
      else if ((sellersByProduct.get(pid)?.size ?? 0) >= 3) prio = 2;
      candidates.push({ pid, prio });
    }
  }
  candidates.sort((a, b) => a.prio - b.prio || byHash(a.pid, b.pid));
  const perShop = new Map<string, number>();
  for (const { pid } of candidates) {
    if (chosenProducts.size >= MAX_PRODUCTS) break;
    chosenProducts.add(pid);
  }
  // keep shops' offer lists modest so the CSV stays small, but always keep hub/special products
  const outOffers = offers.filter((o) => {
    const s = o.shop_id ?? '';
    const p = o.product_id ?? '';
    if (!chosenShops.has(s) || !chosenProducts.has(p)) return false;
    const n = perShop.get(s) ?? 0;
    if (n >= MAX_OFFERS_PER_SHOP && !hubs.includes(p)) return false;
    perShop.set(s, n + 1);
    return true;
  });
  const usedProducts = new Set(outOffers.map((o) => o.product_id ?? ''));

  const outProducts: CsvRecord[] = [];
  for await (const r of readCsv(files.products)) if (usedProducts.has(r.product_id ?? '')) outProducts.push(r);
  const outShops = shops.filter((r) => chosenShops.has(r.shop_id ?? ''));

  mkdirSync(FIXTURES_DIR, { recursive: true });
  const ns = await writeCsv(join(FIXTURES_DIR, 'shops.csv'), await readCsvHeader(files.shops), outShops);
  const np = await writeCsv(join(FIXTURES_DIR, 'products.csv'), await readCsvHeader(files.products), outProducts);
  const no = await writeCsv(join(FIXTURES_DIR, 'offers.csv'), await readCsvHeader(files.offers), outOffers);
  info(`fixtures: ${ns} shops, ${np} products, ${no} offers → ${FIXTURES_DIR}`);

  await buildCatalog({ datasetDir: FIXTURES_DIR, out: FIXTURE_DB_PATH, curationDir: curationDir() });
  info(`fixture db → ${FIXTURE_DB_PATH}`);
}

main().catch((e: unknown) => {
  process.stderr.write(`[etl] fixtures failed: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
