/**
 * Small, dependency-free helpers shared by the ETL modules.
 */
import { cleanFa, toLatinDigits, toPersianDigits } from '@titl/shared';

/** Convert every ASCII / Arabic-Indic digit to Persian digits (display strings such as unit codes). */
export function faDigits(input: string): string {
  return toPersianDigits(toLatinDigits(input));
}

/** cleanFa + Persian digits + ASCII punctuation tidy-up. Used for short display labels. */
export function displayFa(input: string | null | undefined): string {
  if (!input) return '';
  return faDigits(cleanFa(input))
    .replace(/\s*([،:])\s*/g, '$1 ')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Median of a numeric array (does not mutate). Returns null for empty input. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantileSorted(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

/** Levenshtein distance with an optional early-exit bound (returns bound+1 when exceeded). */
export function levenshtein(a: string, b: string, bound = Infinity): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > bound) return bound + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;
  let prev = new Array<number>(lb + 1);
  let cur = new Array<number>(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= lb; j++) {
      const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > bound) return bound + 1;
    [prev, cur] = [cur, prev];
  }
  return prev[lb]!;
}

/** Round to a fixed number of decimals. */
export function round(n: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Most frequent value (ties → first seen). */
export function mostFrequent<T>(values: Iterable<T>): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      best = v;
      bestN = n;
    }
  }
  return best;
}

/** Count occurrences into a Map. */
export function countInto<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

/** Percentage string with one decimal, for reports. */
export function pct(part: number, whole: number): string {
  if (!whole) return '0%';
  return `${round((part / whole) * 100, 1)}%`;
}

/** Persian ordinal words used for floors (1 → «اول» … 15 → «پانزدهم»). */
export const FA_ORDINALS: readonly string[] = [
  'همکف',
  'اول',
  'دوم',
  'سوم',
  'چهارم',
  'پنجم',
  'ششم',
  'هفتم',
  'هشتم',
  'نهم',
  'دهم',
  'یازدهم',
  'دوازدهم',
  'سیزدهم',
  'چهاردهم',
  'پانزدهم',
];

/** Persian number words → value (cardinals and ordinals, 1..15). Longest forms first for prefix matching. */
export const FA_NUMBER_WORDS: readonly [string, number][] = [
  ['دوازدهم', 12],
  ['سیزدهم', 13],
  ['چهاردهم', 14],
  ['پانزدهم', 15],
  ['یازدهم', 11],
  ['دوازده', 12],
  ['سیزده', 13],
  ['چهارده', 14],
  ['پانزده', 15],
  ['یازده', 11],
  ['چهارم', 4],
  ['پنجم', 5],
  ['ششم', 6],
  ['هفتم', 7],
  ['هشتم', 8],
  ['نهم', 9],
  ['دهم', 10],
  ['سوم', 3],
  ['دوم', 2],
  ['یکم', 1],
  ['اول', 1],
  ['نخست', 1],
  ['چهار', 4],
  ['پنج', 5],
  ['شش', 6],
  ['هفت', 7],
  ['هشت', 8],
  ['سون', 3],
  ['یک', 1],
  ['دو', 2],
  ['سه', 3],
  ['نه', 9],
  ['ده', 10],
];

/** Parse a whole-token Persian number word («دو», «سوم») → number, else null. */
export function faNumberWord(token: string): number | null {
  const t = token.trim();
  for (const [w, n] of FA_NUMBER_WORDS) if (t === w) return n;
  return null;
}

/** Stable 32-bit FNV-1a hash (deterministic sampling). */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
