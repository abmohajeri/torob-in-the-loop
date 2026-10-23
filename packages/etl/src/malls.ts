/**
 * Mall / passage clustering (docs/ARCHITECTURE.md §4 rule 12).
 *
 * Shops mentioning a mall are grouped when their normalized names agree AND they are close:
 *  1. exact skeleton key (ا/و/space-insensitive, sorted tokens, digits kept: «علاءالدین ۲» ≠ «علاءالدین»)
 *     + each shop within 250 m of the running cluster centroid;
 *  2. merge pass between clusters whose centroids are ≤ 250 m apart and whose keys are
 *     (a) one edit apart (skeleton length ≥ 5, same digits) — «علائدین» ≈ «علاالدین», «آلومنیوم» ≈ «آلومینیوم», or
 *     (b) the same name plus a locality qualifier — «تجارت جهانی فردوسی» ≈ «تجارت جهانی», «۱۱۰ فردوسی» ≈ «۱۱۰».
 *  3. 1–2-shop satellites within 1.2 km of a ≥5-shop cluster with the same name join it (mis-placed pins).
 * Display name = most frequent original spelling; kind = most frequent kind; centroid = median lat/lng.
 */
import type { MallKind } from '@titl/shared';
import { haversineKm, normalizeForSearch, slugifyFa } from '@titl/shared';
import type { MallMention } from './address.js';
import { levenshtein, median, mostFrequent } from './util.js';

export const MALL_RADIUS_KM = 0.25;
/** Tiny same-name clusters (≤ 2 shops) within this distance of a big one (≥ 5 shops) are merged into it. */
const SATELLITE_MAX = 2;
const CORE_MIN = 5;
const SATELLITE_RADIUS_KM = 1.2;

export interface MallMember {
  /** index of the shop in the caller's array */
  idx: number;
  lat: number;
  lng: number;
  area: string | null;
  mention: MallMention;
  floorNum: number | null;
  floorLabel: string | null;
}

export interface MallCluster {
  id: number;
  slug: string;
  name: string;
  nameNorm: string;
  kind: MallKind;
  area: string | null;
  lat: number;
  lng: number;
  members: number[];
  floors: { num: number | null; label: string; count: number }[];
  /** All distinct spellings seen (for search aliases). */
  spellings: string[];
}

/** Sorted-token skeleton used for clustering (word order and ا/و/space variance ignored). */
export function clusterKey(m: MallMention): string {
  return m.key
    .split(' ')
    .filter(Boolean)
    .sort()
    .map((w) => w.replace(/^چهار/, 'چار').replace(/[اوآ]/g, ''))
    .join('');
}

const digitsOf = (s: string) => (s.match(/\d+/g) ?? []).join(',');

/** Words that may be appended to a mall name without making it a different place. */
const BASE_QUALIFIERS = ['لاله زار', 'سعدی', 'جمهوری', 'حافظ', 'منوچهری', 'باربد', 'بزرگ', 'مرکزی', 'تهران', 'اصلی', 'فردوسی'];

interface Work {
  key: string;
  tokens: Set<string>;
  digits: string;
  lats: number[];
  lngs: number[];
  members: MallMember[];
  alive: boolean;
}

function centroid(w: Work): { lat: number; lng: number } {
  return { lat: median(w.lats) ?? 0, lng: median(w.lngs) ?? 0 };
}

function tokensOf(m: MallMention): Set<string> {
  return new Set(m.key.split(' ').filter(Boolean));
}

export function clusterMalls(members: readonly MallMember[], areaNames: readonly string[] = []): MallCluster[] {
  const qualifiers = new Set<string>();
  for (const q of [...BASE_QUALIFIERS, ...areaNames]) for (const t of normalizeForSearch(q).split(' ')) if (t) qualifiers.add(t);

  // 1) exact key + proximity
  const byKey = new Map<string, Work[]>();
  const works: Work[] = [];
  for (const m of members) {
    const key = clusterKey(m.mention);
    if (!key) continue;
    let list = byKey.get(key);
    if (!list) byKey.set(key, (list = []));
    let target: Work | null = null;
    let best = Infinity;
    for (const w of list) {
      const d = haversineKm(centroid(w), m);
      if (d <= MALL_RADIUS_KM && d < best) {
        best = d;
        target = w;
      }
    }
    if (!target) {
      target = { key, tokens: tokensOf(m.mention), digits: digitsOf(m.mention.key), lats: [], lngs: [], members: [], alive: true };
      list.push(target);
      works.push(target);
    }
    target.lats.push(m.lat);
    target.lngs.push(m.lng);
    target.members.push(m);
  }

  // 2) merge near-duplicates (biggest clusters absorb smaller ones)
  works.sort((a, b) => b.members.length - a.members.length || a.key.localeCompare(b.key));
  const similar = (a: Work, b: Work): boolean => {
    if (a.digits !== b.digits) return false;
    const longer = Math.max(a.key.length, b.key.length);
    if (longer >= 5 && levenshtein(a.key, b.key, 1) <= 1) return true;
    // qualifier extension: tokens(small) ⊂ tokens(big) and the extra tokens are locality words
    const [small, big] = a.tokens.size <= b.tokens.size ? [a, b] : [b, a];
    if (small.tokens.size === 0 || small.tokens.size === big.tokens.size) return false;
    for (const t of small.tokens) if (!big.tokens.has(t)) return false;
    for (const t of big.tokens) if (!small.tokens.has(t) && !qualifiers.has(t)) return false;
    // the smaller name must still be distinctive (not just «بزرگ» or a lone short word)
    const smallText = [...small.tokens].join('');
    return smallText.length >= 3 || /\d/.test(smallText);
  };
  for (let i = 0; i < works.length; i++) {
    const a = works[i]!;
    if (!a.alive) continue;
    for (let j = i + 1; j < works.length; j++) {
      const b = works[j]!;
      if (!b.alive) continue;
      if (haversineKm(centroid(a), centroid(b)) > MALL_RADIUS_KM) continue;
      if (!similar(a, b)) continue;
      a.lats.push(...b.lats);
      a.lngs.push(...b.lngs);
      a.members.push(...b.members);
      b.alive = false;
    }
  }

  // 3) satellites: 1–2 shops whose pin is up to 1.2 km away from a big same-name cluster are almost always
  //    mis-placed pins (seller-entered coordinates), not a second passage with the same name.
  const aliveNow = works.filter((w) => w.alive);
  for (const s of aliveNow) {
    if (s.members.length > SATELLITE_MAX) continue;
    let target: Work | null = null;
    let best = Infinity;
    for (const c of aliveNow) {
      if (c === s || !c.alive || c.members.length < CORE_MIN) continue;
      if (c.key !== s.key && !similar(c, s)) continue;
      const d = haversineKm(centroid(c), centroid(s));
      if (d <= SATELLITE_RADIUS_KM && d < best) {
        best = d;
        target = c;
      }
    }
    if (target) {
      target.lats.push(...s.lats);
      target.lngs.push(...s.lngs);
      target.members.push(...s.members);
      s.alive = false;
    }
  }

  // 4) materialize (deterministic order: biggest first, then name)
  const alive = works.filter((w) => w.alive);
  const built = alive.map((w) => {
    const names = w.members.map((m) => m.mention.name);
    const name = mostFrequentStable(names);
    const kind = mostFrequentStable(w.members.map((m) => m.mention.kind)) as MallKind;
    const areas = w.members.map((m) => m.area).filter((a): a is string => !!a);
    const c = centroid(w);
    const floorMap = new Map<string, { num: number | null; label: string; count: number }>();
    for (const m of w.members) {
      if (!m.floorLabel) continue;
      const k = `${m.floorNum ?? 'x'}|${m.floorLabel}`;
      const f = floorMap.get(k);
      if (f) f.count++;
      else floorMap.set(k, { num: m.floorNum, label: m.floorLabel, count: 1 });
    }
    const floors = [...floorMap.values()].sort((a, b) => (a.num ?? 999) - (b.num ?? 999) || a.label.localeCompare(b.label));
    return {
      name,
      kind,
      area: areas.length ? (mostFrequent(areas) ?? null) : null,
      lat: round6(c.lat),
      lng: round6(c.lng),
      members: w.members.map((m) => m.idx).sort((a, b) => a - b),
      floors,
      spellings: [...new Set(names)],
    };
  });
  built.sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name) || a.lat - b.lat);
  return built.map((b, i) => ({
    id: i + 1,
    slug: `${slugifyFa(b.name)}-${i + 1}`,
    nameNorm: normalizeForSearch(b.name),
    ...b,
  }));
}

/** Most frequent value; ties broken by first lexicographic value (deterministic). */
function mostFrequentStable<T extends string>(values: readonly T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0]!;
  let bestN = -1;
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && v.localeCompare(best) < 0)) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
