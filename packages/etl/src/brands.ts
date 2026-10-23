/**
 * Brand canonicalization & inference (docs/ARCHITECTURE.md §4 rule 6).
 *
 *  - dataset `brand_name` is authoritative; spellings that normalize identically are merged
 *    (display = most frequent spelling) and linked to curated entries (data/brands.json) for the
 *    English name and aliases;
 *  - products without a brand: the title is scanned (token n-grams, word boundaries, longest match)
 *    for aliases of known brands → `brand_inferred = 1`. Precision guards:
 *      · a dataset brand is only inferred in a category/group where the dataset itself uses it
 *        (stops «کاور گوشی سامسونگ» from becoming a Samsung product when no cover is branded Samsung),
 *      · aliases must be ≥ 3 characters (≥ 2 for Latin) and not generic words,
 *      · curated-only brands (absent from the dataset) are inferred in brand-centric groups only.
 */
import { cleanFa, normalizeForSearch } from '@titl/shared';
import type { BrandEntry } from './curation.js';

export interface BrandRecord {
  /** Display name (dataset spelling when known). */
  name: string;
  nameEn: string | null;
  nameNorm: string;
  /** Normalized aliases (fa + en), including nameNorm. */
  aliases: string[];
  /** Products with this brand in the dataset (filled by the build). */
  datasetCount: number;
  curated: boolean;
}

/** Brand-centric groups where curated-only brands may be inferred anywhere. */
const CURATED_ONLY_GROUPS = new Set(['fashion', 'shoes_bags', 'watch_jewelry', 'beauty', 'sports_toys', 'mobile', 'computer', 'audio_video', 'appliances']);

/** Words that are brand names in the dataset but far too generic to infer from a title. */
const GENERIC = new Set(
  [
    'ایران',
    'پارس',
    'تهران',
    'اصل',
    'اورجینال',
    'طرح',
    'مدل',
    'جدید',
    'ساده',
    'فلزی',
    'چوبی',
    'برقی',
    'دیجیتال',
    'صنعتی',
    'خانگی',
    'ایرانی',
    'خارجی',
    'چینی',
    'ترک',
    'ترکیه',
    'آلمان',
    'ژاپن',
    'کره',
    'ایتالیا',
    'نور',
    'مهر',
    'آسیا',
    'آریا',
    'سپهر',
    'کیان',
    'برتر',
    'ستاره',
    'طلایی',
    'سفید',
    'مشکی',
    'متفرقه',
    'سایر',
    'نامشخص',
    'بدون برند',
    'no brand',
    'other',
    'oem',
    'های کپی',
    'کپی',
    'لیو',
    'نووا',
    'دلتا',
    'آلفا',
    'پرو',
    'پلاس',
    'مکس',
    'مینی',
    'لایت',
    'اسپرت',
    'کلاسیک',
    'رویال',
    'گلد',
    'سیلور',
    'استار',
    'بست',
    'تک',
    'فول',
    'اکو',
    'ویژه',
    'پاور',
    'اسمارت',
    'هوم',
    'کیدز',
  ].map((w) => normalizeForSearch(w)),
);

const MAX_NGRAM = 4;

export interface BrandIndex {
  /** Canonical record for a dataset brand name (creates one when unseen). */
  canonical(datasetName: string): BrandRecord;
  /** (DT3) Brand declared in specs: known alias → its record, otherwise a new record (explicit data). */
  fromSpec(value: string): BrandRecord | null;
  /** Infer a brand from a product title. Returns the canonical record or null. */
  infer(titleNorm: string, categoryName: string, groupId: string): BrandRecord | null;
  /** All records that are used (dataset or inferred), for the brands table. */
  records(): BrandRecord[];
}

export interface DatasetBrandStats {
  /** dataset brand spelling → total products */
  counts: Map<string, number>;
  /** normalized brand → category name → products */
  byCategory: Map<string, Map<string, number>>;
  /** normalized brand → group id → products */
  byGroup: Map<string, Map<string, number>>;
}

export function newBrandStats(): DatasetBrandStats {
  return { counts: new Map(), byCategory: new Map(), byGroup: new Map() };
}

export function addBrandObservation(stats: DatasetBrandStats, brand: string, category: string, groupId: string): void {
  const disp = cleanFa(brand);
  if (!disp) return;
  stats.counts.set(disp, (stats.counts.get(disp) ?? 0) + 1);
  const n = normalizeForSearch(disp);
  let c = stats.byCategory.get(n);
  if (!c) stats.byCategory.set(n, (c = new Map()));
  c.set(category, (c.get(category) ?? 0) + 1);
  let g = stats.byGroup.get(n);
  if (!g) stats.byGroup.set(n, (g = new Map()));
  g.set(groupId, (g.get(groupId) ?? 0) + 1);
}

export function buildBrandIndex(curated: readonly BrandEntry[], stats: DatasetBrandStats): BrandIndex {
  const byNorm = new Map<string, BrandRecord>();

  // dataset spellings, most frequent first → display spelling per normalized name
  const spellings = [...stats.counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [disp, n] of spellings) {
    const norm = normalizeForSearch(disp);
    if (!norm) continue;
    const r = byNorm.get(norm);
    if (r) r.datasetCount += n;
    else byNorm.set(norm, { name: disp, nameEn: null, nameNorm: norm, aliases: [norm], datasetCount: n, curated: false });
  }

  // curated entries: link to dataset records via any alias; otherwise create curated-only records
  const aliasOwner = new Map<string, BrandRecord>();
  for (const e of curated) {
    const names = [e.name, e.en ?? '', ...(e.aliases ?? [])].map((a) => normalizeForSearch(a)).filter(Boolean);
    let rec: BrandRecord | undefined;
    for (const a of names) {
      rec = byNorm.get(a);
      if (rec) break;
    }
    if (!rec) {
      const norm = normalizeForSearch(e.name);
      if (!norm) continue;
      rec = { name: cleanFa(e.name), nameEn: null, nameNorm: norm, aliases: [norm], datasetCount: 0, curated: true };
      byNorm.set(norm, rec);
    }
    rec.curated = true;
    if (e.en && !rec.nameEn) rec.nameEn = cleanFa(e.en);
    for (const a of names) if (!rec.aliases.includes(a)) rec.aliases.push(a);
  }

  // alias → record (longer / more frequent brand wins on collisions)
  for (const rec of byNorm.values()) {
    for (const a of rec.aliases) {
      const prev = aliasOwner.get(a);
      if (!prev || rec.datasetCount > prev.datasetCount) aliasOwner.set(a, rec);
    }
  }

  const eligibleAlias = (a: string): boolean => {
    if (GENERIC.has(a)) return false;
    if (/^[\d\s]+$/.test(a)) return false;
    const latin = /^[a-z0-9\s\-]+$/.test(a);
    return latin ? a.replace(/\s/g, '').length >= 2 : a.replace(/\s/g, '').length >= 3;
  };

  const used = new Set<BrandRecord>();

  return {
    canonical(datasetName: string): BrandRecord {
      const norm = normalizeForSearch(datasetName);
      let rec = byNorm.get(norm);
      if (!rec) {
        rec = { name: cleanFa(datasetName), nameEn: null, nameNorm: norm, aliases: [norm], datasetCount: 0, curated: false };
        byNorm.set(norm, rec);
      }
      used.add(rec);
      return rec;
    },
    fromSpec(value: string): BrandRecord | null {
      const norm = normalizeForSearch(value);
      if (!norm || GENERIC.has(norm)) return null;
      const rec = aliasOwner.get(norm) ?? byNorm.get(norm);
      if (rec) {
        used.add(rec);
        return rec;
      }
      return this.canonical(value);
    },
    infer(titleNorm: string, categoryName: string, groupId: string): BrandRecord | null {
      if (!titleNorm) return null;
      const toks = titleNorm.split(' ');
      let best: BrandRecord | null = null;
      let bestLen = 0;
      for (let i = 0; i < toks.length; i++) {
        let gram = '';
        for (let k = 0; k < MAX_NGRAM && i + k < toks.length; k++) {
          gram = k === 0 ? toks[i]! : `${gram} ${toks[i + k]}`;
          const rec = aliasOwner.get(gram);
          if (!rec || !eligibleAlias(gram)) continue;
          // category / group compatibility guard
          const inCat = stats.byCategory.get(rec.nameNorm)?.get(categoryName) ?? 0;
          const inGroup = stats.byGroup.get(rec.nameNorm)?.get(groupId) ?? 0;
          const ok = inCat >= 1 || inGroup >= 3 || (rec.datasetCount === 0 && rec.curated && CURATED_ONLY_GROUPS.has(groupId));
          if (!ok) continue;
          const len = gram.length;
          if (len > bestLen || (len === bestLen && best && rec.datasetCount > best.datasetCount)) {
            best = rec;
            bestLen = len;
          }
        }
      }
      if (best) used.add(best);
      return best;
    },
    records(): BrandRecord[] {
      return [...used].sort((a, b) => a.name.localeCompare(b.name));
    },
  };
}
