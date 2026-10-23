/**
 * Regenerates packages/etl/data/brands.json.
 *
 *  1. Every dataset brand_name with ≥ MIN products (default 3).
 *  2. English name, in priority order:
 *       a. brand-manual.ts (hand-curated),
 *       b. the most common Latin value of the spec keys «شرکت سازنده/برند/سازنده» in that brand's products,
 *          accepted only when its consonant skeleton sounds like the Persian name (soundsAlike),
 *       c. the recurring Latin word(s) in the brand's titles (brand-evidence.ts autoAccept),
 *       d. otherwise null (unknown stays unknown).
 *  3. Aliases: the Persian name, a joined spelling for multi-word names, the lower-cased English name
 *     (+ joined form), and the hand-curated aliases.
 *  4. Curated-only brands from brand-manual.ts that the dataset never uses as brand_name are appended.
 *
 * Usage (from repo root): npx tsx packages/etl/scripts/curation/build-brands.ts [--min=3] [--dry]
 */
import { join } from 'node:path';
import { normalizeForSearch } from '@titl/shared';
import { BRAND_MANUAL } from './brand-manual.js';
import { brandEvidence, soundsAlike } from './brand-evidence.js';
import { datasetDir, forEachRow, loadProducts, writeDataJson } from './dataset.js';

const MIN = Number(process.argv.find((a) => a.startsWith('--min='))?.slice(6) ?? 3);
const DRY = process.argv.includes('--dry');
const SPEC_KEYS = new Set(['شرکت سازنده', 'برند', 'سازنده', 'نام تجاری', 'برند سازنده']);
const LATIN = /^[A-Za-z][A-Za-z0-9&'.+\- ]{1,30}$/;

interface Entry {
  name: string;
  en: string | null;
  aliases: string[];
}

const products = await loadProducts();
const counts = new Map<string, number>();
for (const p of products) if (p.brand?.trim()) counts.set(p.brand.trim(), (counts.get(p.brand.trim()) ?? 0) + 1);

// spec evidence: brand → latin value → count
const spec = new Map<string, Map<string, number>>();
await forEachRow(join(datasetDir(), 'products.csv'), (r) => {
  const b = r.brand_name?.trim();
  if (!b || b === 'null' || (counts.get(b) ?? 0) < MIN || !r.specs) return;
  let list: unknown;
  try {
    list = JSON.parse(r.specs);
  } catch {
    return;
  }
  if (!Array.isArray(list)) return;
  for (const e of list as { key?: string; value?: string }[]) {
    if (!e?.key || !SPEC_KEYS.has(e.key)) continue;
    const v = (e.value ?? '').trim();
    if (!LATIN.test(v)) continue;
    let m = spec.get(b);
    if (!m) spec.set(b, (m = new Map()));
    m.set(v, (m.get(v) ?? 0) + 1);
  }
});

function specEnglish(brand: string): string | null {
  const m = spec.get(brand);
  if (!m) return null;
  // fold case variants, keep the most frequent spelling
  const folded = new Map<string, { n: number; best: string; bestN: number }>();
  for (const [v, n] of m) {
    const k = v.toLowerCase();
    const f = folded.get(k) ?? { n: 0, best: v, bestN: 0 };
    f.n += n;
    if (n > f.bestN) [f.best, f.bestN] = [v, n];
    folded.set(k, f);
  }
  const ranked = [...folded.values()].sort((a, b) => b.n - a.n);
  for (const c of ranked.slice(0, 3)) {
    if (c.n < 2) break;
    if (!soundsAlike(brand, c.best)) continue;
    const s = c.best;
    return s.length > 4 && s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
  }
  return null;
}

const evidence = new Map(brandEvidence(products, MIN).map((e) => [e.brand, e]));
const manualByNorm = new Map(Object.entries(BRAND_MANUAL).map(([k, v]) => [normalizeForSearch(k), { key: k, v }]));
const usedManual = new Set<string>();

function makeAliases(name: string, en: string | null, extra: readonly string[]): string[] {
  const out = [name];
  if (/[\s‌]/.test(name.trim())) out.push(name.replace(/[\s‌]+/g, ''));
  if (en) {
    out.push(en.toLowerCase());
    if (/\s/.test(en)) out.push(en.toLowerCase().replace(/\s+/g, ''));
  }
  out.push(...extra);
  const seen = new Set<string>();
  return out.filter((a) => {
    const k = normalizeForSearch(a);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const brands: Entry[] = [];
const via = { manual: 0, spec: 0, title: 0, none: 0 };
const names = [...counts.entries()].filter(([, n]) => n >= MIN).sort((a, b) => b[1] - a[1]);
for (const [name] of names) {
  const man = manualByNorm.get(normalizeForSearch(name));
  let en: string | null = null;
  let extra: string[] = [];
  if (man) {
    usedManual.add(man.key);
    [en, ...extra] = man.v;
  }
  if (en) via.manual++;
  else if ((en = specEnglish(name))) via.spec++;
  else if ((en = evidence.get(name)?.en ?? null)) via.title++;
  else via.none++;
  brands.push({ name, en, aliases: makeAliases(name, en, extra) });
}
let curatedOnly = 0;
for (const [key, [en, ...extra]] of Object.entries(BRAND_MANUAL)) {
  if (usedManual.has(key)) continue;
  if ((counts.get(key) ?? 0) > 0 && (counts.get(key) ?? 0) < MIN) {
    // dataset brand below threshold: still worth keeping since it was curated by hand
  }
  brands.push({ name: key, en, aliases: makeAliases(key, en, extra) });
  curatedOnly++;
}

// alias collisions across brands (should be none)
const owner = new Map<string, string>();
const collisions: string[] = [];
for (const b of brands) {
  for (const a of b.aliases) {
    const k = normalizeForSearch(a);
    const o = owner.get(k);
    if (o && o !== b.name) collisions.push(`${a}: ${o} / ${b.name}`);
    else owner.set(k, b.name);
  }
}

console.log(`dataset brands ≥${MIN}: ${names.length} (en via manual ${via.manual}, spec ${via.spec}, title ${via.title}, unknown ${via.none})`);
console.log(`curated-only brands: ${curatedOnly}; total ${brands.length}`);
if (collisions.length) console.log(`alias collisions:\n  ${collisions.join('\n  ')}`);
if (!DRY) {
  writeDataJson('brands.json', { version: 1, brands });
  console.log('wrote packages/etl/data/brands.json');
}
