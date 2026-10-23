/**
 * Tiny read-only dataset loader for the curation scripts (taxonomy / brands / places checks).
 * Streams the raw Torob CSVs with csv-parse and caches the small derived summaries in the OS temp
 * directory (keyed by file size + mtime) so repeated runs are fast. Never writes next to the dataset.
 */
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse';

const HERE = dirname(fileURLToPath(import.meta.url));
/** packages/etl/data — where the curated JSON files live. */
export const DATA_DIR = resolve(HERE, '../../data');
/** Repo root (torob-in-the-loop/). */
export const REPO_ROOT = resolve(HERE, '../../../..');

/** Dataset directory: $DATASET_DIR, else ../dataset next to the repo root (same default as the ETL). */
export function datasetDir(): string {
  const env = process.env.DATASET_DIR;
  return env ? resolve(env) : resolve(REPO_ROOT, '../dataset');
}

export function hasDataset(): boolean {
  const dir = datasetDir();
  return ['products.csv', 'shops.csv', 'offers.csv'].every((f) => existsSync(join(dir, f)));
}

type Row = Record<string, string>;

/** Stream a CSV file row by row (RFC4180, multiline quoted fields, relaxed quotes). */
export async function forEachRow(file: string, onRow: (row: Row) => void): Promise<number> {
  const parser = createReadStream(file).pipe(
    parse({ columns: true, relax_quotes: true, relax_column_count: true, skip_empty_lines: true, bom: true }),
  );
  let n = 0;
  for await (const row of parser as AsyncIterable<Row>) {
    onRow(row);
    n++;
  }
  return n;
}

const nullish = (v: string | undefined): string | null => (v == null || v === '' || v === 'null' ? null : v);

function cachePath(name: string, sourceFile: string): string {
  const st = statSync(sourceFile);
  const dir = join(tmpdir(), 'torob-in-the-loop-curation-cache');
  mkdirSync(dir, { recursive: true });
  return join(dir, `${name}-${st.size}-${Math.round(st.mtimeMs)}.json`);
}

async function cached<T>(name: string, sourceFile: string, build: () => Promise<T>): Promise<T> {
  const p = cachePath(name, sourceFile);
  if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf8')) as T;
  const value = await build();
  writeFileSync(p, JSON.stringify(value));
  return value;
}

export interface ProductLite {
  id: string;
  category: string;
  brand: string | null;
  title: string;
}

/** Every product's id, leaf category, dataset brand and Persian title. */
export async function loadProducts(): Promise<ProductLite[]> {
  const file = join(datasetDir(), 'products.csv');
  return cached('products-lite', file, async () => {
    const out: ProductLite[] = [];
    await forEachRow(file, (r) => {
      out.push({
        id: r.product_id ?? '',
        category: r.category_name ?? '',
        brand: nullish(r.brand_name),
        title: r.persian_title ?? '',
      });
    });
    return out;
  });
}

/** Leaf category → product count (all categories present in products.csv). */
export async function loadCategoryCounts(): Promise<Map<string, number>> {
  const products = await loadProducts();
  const m = new Map<string, number>();
  for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + 1);
  return m;
}

export interface ShopLite {
  id: string;
  lat: number;
  lng: number;
  area: string | null;
  address: string | null;
  categories: string[];
}

export async function loadShops(): Promise<ShopLite[]> {
  const file = join(datasetDir(), 'shops.csv');
  return cached('shops-lite', file, async () => {
    const out: ShopLite[] = [];
    await forEachRow(file, (r) => {
      let cats: string[] = [];
      const raw = nullish(r.category_names);
      if (raw) {
        try {
          const v = JSON.parse(raw) as unknown;
          if (Array.isArray(v)) cats = v.filter((x): x is string => typeof x === 'string');
        } catch {
          /* ignore malformed */
        }
      }
      out.push({
        id: r.shop_id ?? '',
        lat: Number(r.lat),
        lng: Number(r.lon),
        area: nullish(r.location_label),
        address: nullish(r.address),
        categories: cats,
      });
    });
    return out;
  });
}

/** (product id, shop id) pairs from offers.csv (deduplicated per pair). */
export async function loadOfferPairs(): Promise<[string, string][]> {
  const file = join(datasetDir(), 'offers.csv');
  return cached('offer-pairs', file, async () => {
    const seen = new Set<string>();
    const out: [string, string][] = [];
    await forEachRow(file, (r) => {
      const pid = r.product_id ?? '';
      const sid = r.shop_id ?? '';
      const k = `${pid}|${sid}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push([pid, sid]);
    });
    return out;
  });
}

export function readDataJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T;
}

export function writeDataJson(file: string, value: unknown): void {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(value, null, 2) + '\n');
}
