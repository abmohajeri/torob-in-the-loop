/**
 * Evidence for English brand names: for every dataset brand, the Latin words / word pairs that recur in
 * that brand's own product titles (document frequency share), filtered by a rough Persian→Latin
 * consonant-skeleton check so «سامسونگ» only accepts candidates that sound like it (Samsung).
 *
 * Used by build-brands.ts (auto English names for the long tail) and printable for manual review:
 *   npx tsx packages/etl/scripts/curation/brand-evidence.ts [--min=3] [--top=400] > /tmp/brand-evidence.tsv
 */
import { normalizeForSearch } from '@titl/shared';
import type { ProductLite } from './dataset.js';

/** Latin words that are never a brand on their own (marketing / spec / generic product words). */
const LATIN_STOP = new Set(
  (
    'the and for with of in to by on new original orginal model series type size pro max mini plus lite ultra ' +
    'led lcd usb hdmi ac dc ip wifi wi fi lan bluetooth wireless smart digital electric electronic black white red blue ' +
    'green gold silver pink gray grey brown set kit pack pcs pc box case cover cable charger adapter power bank ' +
    'phone mobile tablet watch band strap glass screen protector edition version inch cm mm ml gr kg w v a mah gb tb ' +
    'men women man woman kids baby sport sports classic premium standard home office car auto motor bike ' +
    'eau de parfum toilette edp edt cologne perfume spray body cream gel oil shampoo hair face skin ' +
    'camera lens tv speaker headphone headset earbuds earphone mouse keyboard laptop notebook printer toner cartridge ' +
    'lamp light bulb switch socket relay sensor module board controller motor pump valve filter bearing ' +
    'professional industrial universal genuine high quality made china iran germany japan korea turkey italy usa uk ' +
    'x s m l xl xxl i ii iii iv one two'
  ).split(/\s+/),
);

/** Persian letter → Latin consonant skeleton (vowel-ish letters dropped). */
const FA_SKEL: Record<string, string> = {
  ب: 'b', پ: 'p', ت: 't', ط: 't', ث: 's', س: 's', ص: 's', ش: 'S', ج: 'j', چ: 'C', ح: 'h', ه: 'h', خ: 'x',
  د: 'd', ذ: 'z', ز: 'z', ض: 'z', ظ: 'z', ژ: 'j', ر: 'r', ف: 'f', ق: 'g', غ: 'g', ک: 'k', گ: 'g', ل: 'l',
  م: 'm', ن: 'n', و: '', ی: '', ا: '', ع: '', ء: '',
};

/** Consonant skeleton of a Persian brand name: «سامسونگ» → "smsng". Final silent «ه» dropped. */
export function faSkeleton(fa: string): string {
  const words = normalizeForSearch(fa).split(' ');
  let out = '';
  for (const w of words) {
    const chars = [...w];
    chars.forEach((c, i) => {
      if (c === 'ه' && i === chars.length - 1 && i > 0) return;
      // «و» / «ی» at word start are consonants (v / y)
      if (i === 0 && c === 'و') out += 'v';
      else if (i === 0 && c === 'ی') out += 'y';
      else out += FA_SKEL[c] ?? '';
    });
  }
  return out.replace(/(.)\1+/g, '$1');
}

/** Consonant skeleton of a Latin name, mapped to the same alphabet: "Samsung" → "smsng". */
export function enSkeleton(en: string): string {
  let s = en.toLowerCase().replace(/[^a-z]/g, '');
  s = s
    .replace(/sch/g, 'S')
    .replace(/sh/g, 'S')
    .replace(/ch/g, 'C')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/kh/g, 'x')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'kv')
    .replace(/c(?=[eiy])/g, 's')
    .replace(/c/g, 'k')
    .replace(/q/g, 'k')
    .replace(/x/g, 'ks')
    .replace(/w/g, 'v')
    .replace(/^y/, 'Y')
    .replace(/[aeiouy]/g, '')
    .replace(/Y/g, 'y');
  return s.replace(/(.)\1+/g, '$1');
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Loose equivalence classes so v/f, g/k, j/g, z/s, h/x compare as near-equal. */
const FOLD: Record<string, string> = { v: 'f', k: 'g', j: 'g', z: 's', x: 'h', C: 'S', p: 'b', t: 'd' };
const fold = (s: string) => [...s].map((c) => FOLD[c] ?? c).join('');

/** Similarity in [0,1] between a Persian brand and a Latin candidate, by consonant skeletons. */
export function skeletonSimilarity(fa: string, en: string): number {
  const a = fold(faSkeleton(fa));
  const b = fold(enSkeleton(en));
  if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

/** Persian name and Latin candidate plausibly spell the same brand. */
export function soundsAlike(fa: string, en: string): boolean {
  const a = faSkeleton(fa);
  const b = enSkeleton(en);
  if (a.length < 1 || b.length < 1) return false;
  const sim = skeletonSimilarity(fa, en);
  // short names need an exact skeleton; longer ones tolerate one or two edits
  return Math.max(a.length, b.length) <= 2 ? sim === 1 : sim >= 0.66;
}

/**
 * Strict acceptance for an automatic English name: recurring (≥ 25 % of the brand's titles), at least
 * three Latin letters, a near-identical consonant skeleton, and the same number of words as the
 * Persian name (stops "Infinix Hot" / "Thule foot" style trailing model words).
 */
export function autoAccept(fa: string, en: string, share: number): boolean {
  if (share < 0.25) return false;
  if (en.replace(/[^a-z]/gi, '').length < 3) return false;
  const faWords = normalizeForSearch(fa).split(' ').length;
  const enWords = en.trim().split(/\s+/).length;
  if (enWords > Math.max(1, faWords)) return false;
  const a = faSkeleton(fa);
  const b = enSkeleton(en);
  const sim = skeletonSimilarity(fa, en);
  return Math.max(a.length, b.length) <= 3 ? sim === 1 : sim >= 0.75;
}

export interface BrandEvidence {
  brand: string;
  products: number;
  /** Best Latin candidate (original casing of the most common spelling) or null. */
  en: string | null;
  /** Share of the brand's titles containing the candidate. */
  share: number;
  /** Top candidates for review: `word:share`. */
  candidates: string[];
}

const LATIN_WORD = /[A-Za-z][A-Za-z&'.+-]*[A-Za-z]|[A-Za-z]/g;

function titleCaseCandidate(spellings: Map<string, number>): string {
  let best = '';
  let bestN = -1;
  for (const [s, n] of spellings) if (n > bestN) [best, bestN] = [s, n];
  // ALLCAPS long words → Title Case unless short (acronyms such as LG, JBL, HP stay upper).
  if (best.length > 4 && best === best.toUpperCase()) {
    return best
      .toLowerCase()
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return best;
}

/** Compute evidence for every brand with ≥ minProducts products. */
export function brandEvidence(products: readonly ProductLite[], minProducts = 3): BrandEvidence[] {
  const byBrand = new Map<string, string[]>();
  for (const p of products) {
    if (!p.brand) continue;
    const b = p.brand.trim();
    if (!b) continue;
    let l = byBrand.get(b);
    if (!l) byBrand.set(b, (l = []));
    l.push(p.title);
  }
  const out: BrandEvidence[] = [];
  for (const [brand, titles] of byBrand) {
    if (titles.length < minProducts) continue;
    const df = new Map<string, number>();
    const spell = new Map<string, Map<string, number>>();
    for (const t of titles) {
      const words = (t.match(LATIN_WORD) ?? []).filter((w) => w.length >= 2 || /^[A-Z]$/.test(w));
      const seen = new Set<string>();
      const grams: string[] = [];
      for (let i = 0; i < words.length; i++) {
        grams.push(words[i]!);
        if (i + 1 < words.length) grams.push(`${words[i]} ${words[i + 1]}`);
      }
      for (const g of grams) {
        const key = g.toLowerCase();
        const parts = key.split(' ');
        if (parts.some((w) => LATIN_STOP.has(w))) continue;
        if (seen.has(key)) continue;
        seen.add(key);
        df.set(key, (df.get(key) ?? 0) + 1);
        let m = spell.get(key);
        if (!m) spell.set(key, (m = new Map()));
        m.set(g, (m.get(g) ?? 0) + 1);
      }
    }
    const ranked = [...df.entries()]
      .map(([k, n]) => ({ k, share: n / titles.length }))
      .filter((c) => c.share >= 0.15)
      .sort((a, b) => b.share - a.share || b.k.length - a.k.length);
    // Prefer the bigram when it is (almost) as frequent as its first word: "Western Digital" over "Western".
    let pick: { k: string; share: number } | null = null;
    for (const c of ranked) {
      if (!autoAccept(brand, c.k, c.share)) continue;
      pick = c;
      break;
    }
    out.push({
      brand,
      products: titles.length,
      en: pick ? titleCaseCandidate(spell.get(pick.k)!) : null,
      share: pick ? Math.round(pick.share * 100) / 100 : 0,
      candidates: ranked.slice(0, 5).map((c) => `${c.k}:${Math.round(c.share * 100)}`),
    });
  }
  return out.sort((a, b) => b.products - a.products || a.brand.localeCompare(b.brand, 'fa'));
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadProducts } = await import('./dataset.js');
  const min = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 3);
  const top = Number(process.argv.find((a) => a.startsWith('--top='))?.split('=')[1] ?? 100000);
  const ev = brandEvidence(await loadProducts(), min).slice(0, top);
  console.log('brand\tproducts\ten\tshare\tcandidates');
  for (const e of ev) console.log(`${e.brand}\t${e.products}\t${e.en ?? ''}\t${e.share}\t${e.candidates.join(' | ')}`);
}
