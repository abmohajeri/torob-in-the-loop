/**
 * Persian query understanding (pure). Turns free text such as
 *   «گوشی سامسونگ قسطی زیر ۲۵ میلیون نزدیک ونک»
 * into structured filters + removable chips. Used by search, discovery and the rules assistant.
 *
 * The catalog vocabulary (categories, brands, places, synonyms) is injected as an `NluVocab`
 * built once by `buildVocab()`, so this module stays free of I/O and is unit-testable.
 */
import type { Audience, ParsedQuery, Place, ProviderCode, QueryChip, SearchSort } from '@titl/shared';
import { PROVIDERS, formatTomanShort, normalizeForSearch, toLatinDigits, toPersianDigits, FA_STOPWORDS } from '@titl/shared';
import {
  AREA_TRIGGERS,
  AROUND_TRIGGERS,
  AUDIENCE_LABEL,
  AUDIENCE_WORDS,
  BRAND_STOPWORDS,
  BUDGET_WORDS,
  BUILTIN_SYNONYMS,
  EXTRA_CATEGORY_ALIASES,
  FILLER_WORDS,
  GENERIC_CATEGORY_TOKENS,
  GROUP_ALIASES,
  IMPLIED,
  INSTALLMENT_WORDS,
  MAX_TRIGGERS,
  MIN_TRIGGERS,
  MONEY_UNITS,
  NEAR_ME_PHRASES,
  NON_MONEY_UNITS,
  NUMBER_WORDS,
  OPEN_NOW_PHRASES,
  PLACE_KIND_WORDS,
  PROVIDER_PHRASES,
  SORT_LABEL,
  SORT_PHRASES,
  SUFFIX_FRAGMENTS,
} from './nlu-data.js';
import { budgetLabel } from './price.js';

// ───────────────────────── Vocabulary ─────────────────────────

export interface VocabCategoryInput {
  id: number;
  name: string;
  groupId: string;
  /** Aliases from the ETL taxonomy (any spelling; normalized here). */
  aliases: string[];
  productCount: number;
  /** Median of product median prices (for colloquial budget scaling), if known. */
  p50?: number | null;
}

export interface VocabBrandInput {
  name: string;
  nameEn?: string | null;
  aliases: string[];
  productCount: number;
}

export interface VocabPlaceInput {
  id: string;
  name: string;
  kind: Place['kind'];
  lat: number;
  lng: number;
  weight: number;
  subtitle?: string | null;
}

export interface CatRef {
  id: number;
  name: string;
  groupId: string;
  productCount: number;
  p50: number | null;
}

export interface BrandRef {
  name: string;
  productCount: number;
}

export interface PlaceRef extends VocabPlaceInput {}

interface CatEntry {
  cat: CatRef | null;
  group: string | null;
  trust: number;
}

export interface NluVocab {
  catAlias: Map<string, CatEntry>;
  maxCatLen: number;
  groupAlias: Map<string, string>;
  maxGroupLen: number;
  brandAlias: Map<string, BrandRef>;
  maxBrandLen: number;
  placeKey: Map<string, PlaceRef>;
  maxPlaceLen: number;
  categoriesByName: Map<string, CatRef>;
  categoriesById: Map<number, CatRef>;
  brandsByName: Map<string, BrandRef>;
  /** normalized term → normalized alternatives (FTS expansion). */
  synonyms: Map<string, string[]>;
}

const TRUST = { name: 5, curated: 4, etl: 3, derived: 1 } as const;

/** Brand names in the dataset that mean "no brand". */
const JUNK_BRANDS = new Set(
  ['متفرقه', 'نامشخص', 'سایر', 'غیره', 'بدون برند', 'برند', 'متفرقه برند ندارد', 'no brand', 'noname', 'generic', 'other', 'ندارد', 'چینی', 'ایرانی', 'اورجینال'].map(
    (s) => normalizeForSearch(s),
  ),
);

const PLACE_PREFIXES: Record<Place['kind'], string[][]> = {
  metro: [['ایستگاه', 'مترو'], ['ایستگاه'], ['مترو']],
  landmark: [['میدان'], ['میدون'], ['خیابان'], ['خیابون'], ['بزرگراه'], ['بلوار'], ['چهارراه'], ['پل']],
  mall: [['مجتمع', 'تجاری'], ['مرکز', 'خرید'], ['پاساژ'], ['مجتمع']],
  area: [['محله'], ['منطقه']],
};
const PLACE_STRIP_BLACKLIST = new Set(['تهران', 'بزرگ', 'مرکزی', 'شمالی', 'جنوبی', 'غربی', 'شرقی', 'اصلی', 'جدید', 'قدیم', 'شهر']);

const isLatin = (s: string) => /^[a-z0-9 ]+$/.test(s);

/** Alias phrases derived from a category's own name («کیف و کاور گوشی» → «کیف گوشی», «کاور گوشی», …). */
export function deriveCategoryPhrases(name: string): string[] {
  const toks = normalizeForSearch(name).split(' ').filter(Boolean);
  const parts: string[][] = [[]];
  for (const t of toks) {
    if (t === 'و') parts.push([]);
    else parts[parts.length - 1]!.push(t);
  }
  const out = new Set<string>();
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j <= p.length; j++) {
        const sub = p.slice(i, j);
        if (sub.every((t) => GENERIC_CATEGORY_TOKENS.has(t))) continue;
        if (sub.length === 1 && (sub[0]!.length < 3 || GENERIC_CATEGORY_TOKENS.has(sub[0]!))) continue;
        out.add(sub.join(' '));
      }
    }
  }
  // distribute the shared tail: «کیف و کاور گوشی» → «کیف گوشی»
  const last = parts[parts.length - 1]!;
  if (parts.length >= 2 && last.length >= 2) {
    const tail = last.slice(1);
    for (const p of parts.slice(0, -1)) {
      if (p.length !== 1) continue;
      for (let k = 1; k <= tail.length; k++) out.add([p[0]!, ...tail.slice(0, k)].join(' '));
    }
  }
  return [...out];
}

export function buildVocab(input: {
  categories: VocabCategoryInput[];
  brands: VocabBrandInput[];
  places: VocabPlaceInput[];
  synonyms?: Iterable<[string, string[]]>;
}): NluVocab {
  // ── categories
  const categoriesByName = new Map<string, CatRef>();
  const categoriesById = new Map<number, CatRef>();
  const raw = new Map<string, Map<number, { ref: CatRef; trust: number }>>();
  const add = (phrase: string, ref: CatRef, trust: number) => {
    const k = normalizeForSearch(phrase);
    if (!k) return;
    let m = raw.get(k);
    if (!m) raw.set(k, (m = new Map()));
    const cur = m.get(ref.id);
    if (!cur || cur.trust < trust) m.set(ref.id, { ref, trust });
  };
  for (const c of input.categories) {
    const ref: CatRef = { id: c.id, name: c.name, groupId: c.groupId, productCount: c.productCount, p50: c.p50 ?? null };
    categoriesByName.set(c.name, ref);
    categoriesById.set(c.id, ref);
  }
  for (const ref of categoriesById.values()) {
    add(ref.name, ref, TRUST.name);
    for (const d of deriveCategoryPhrases(ref.name)) add(d, ref, TRUST.derived);
  }
  for (const c of input.categories) {
    const ref = categoriesById.get(c.id)!;
    for (const a of c.aliases ?? []) add(a, ref, TRUST.etl);
  }
  for (const [name, aliases] of Object.entries(EXTRA_CATEGORY_ALIASES)) {
    const ref = categoriesByName.get(name);
    if (!ref) continue;
    for (const a of aliases) add(a, ref, TRUST.curated);
  }
  const catAlias = new Map<string, CatEntry>();
  let maxCatLen = 1;
  for (const [phrase, m] of raw) {
    const all = [...m.values()];
    const top = Math.max(...all.map((x) => x.trust));
    const list = all.filter((x) => x.trust === top).sort((a, b) => b.ref.productCount - a.ref.productCount);
    let entry: CatEntry | null = null;
    if (list.length === 1) entry = { cat: list[0]!.ref, group: list[0]!.ref.groupId, trust: top };
    else if (top >= TRUST.etl && list[0]!.ref.productCount >= 3 * list[1]!.ref.productCount) {
      entry = { cat: list[0]!.ref, group: list[0]!.ref.groupId, trust: top };
    } else if (top >= TRUST.etl && list.every((x) => x.ref.groupId === list[0]!.ref.groupId)) {
      entry = { cat: null, group: list[0]!.ref.groupId, trust: top };
    }
    if (!entry) continue;
    catAlias.set(phrase, entry);
    maxCatLen = Math.max(maxCatLen, phrase.split(' ').length);
  }

  // ── groups
  const groupAlias = new Map<string, string>();
  let maxGroupLen = 1;
  for (const [g, list] of Object.entries(GROUP_ALIASES)) {
    for (const a of list) {
      const k = normalizeForSearch(a);
      if (!k || catAlias.has(k)) continue;
      groupAlias.set(k, g);
      maxGroupLen = Math.max(maxGroupLen, k.split(' ').length);
    }
  }

  // ── brands
  const brandAlias = new Map<string, BrandRef>();
  const brandsByName = new Map<string, BrandRef>();
  let maxBrandLen = 1;
  for (const b of input.brands) {
    const nameKey = normalizeForSearch(b.name);
    if (!nameKey || JUNK_BRANDS.has(nameKey)) continue;
    const ref: BrandRef = { name: b.name, productCount: b.productCount };
    brandsByName.set(b.name, ref);
    const keys = new Set([nameKey, normalizeForSearch(b.nameEn ?? ''), ...(b.aliases ?? []).map((a) => normalizeForSearch(a))]);
    for (const k of keys) {
      if (!k || JUNK_BRANDS.has(k)) continue;
      const toks = k.split(' ');
      if (toks.length === 1) {
        if (BRAND_STOPWORDS.has(k) || FA_STOPWORDS.has(k) || FILLER_WORDS.has(k)) continue;
        if (isLatin(k) ? k.length < 2 || /^\d+$/.test(k) : k.length < 3) continue;
        if (catAlias.has(k) || AUDIENCE_WORDS[k] || INSTALLMENT_WORDS.has(k)) continue;
      } else if (toks.every((t) => BRAND_STOPWORDS.has(t) || FA_STOPWORDS.has(t))) continue;
      const cur = brandAlias.get(k);
      if (!cur || cur.productCount < ref.productCount) brandAlias.set(k, ref);
      maxBrandLen = Math.max(maxBrandLen, toks.length);
    }
  }

  // ── places
  const placeKey = new Map<string, PlaceRef & { prio: number }>();
  let maxPlaceLen = 1;
  const kindPrio: Record<Place['kind'], number> = { area: 3, mall: 2, landmark: 2, metro: 1 };
  const putPlace = (k: string, p: VocabPlaceInput, prio: number) => {
    if (!k) return;
    const cur = placeKey.get(k);
    if (!cur || cur.prio < prio || (cur.prio === prio && cur.weight < p.weight)) placeKey.set(k, { ...p, prio });
    maxPlaceLen = Math.max(maxPlaceLen, k.split(' ').length);
  };
  for (const p of input.places) {
    const k = normalizeForSearch(p.name);
    if (!k) continue;
    putPlace(k, p, 10 + kindPrio[p.kind]);
    const toks = k.split(' ');
    for (const pre of PLACE_PREFIXES[p.kind]) {
      if (toks.length > pre.length && pre.every((t, i) => toks[i] === t)) {
        const rest = toks.slice(pre.length).join(' ');
        if (rest.length >= 3 && !PLACE_STRIP_BLACKLIST.has(rest)) putPlace(rest, p, kindPrio[p.kind]);
        break;
      }
    }
  }

  // ── synonyms
  const synonyms = new Map<string, string[]>();
  const addSyn = (term: string, list: string[]) => {
    const k = normalizeForSearch(term);
    if (!k) return;
    const cur = new Set(synonyms.get(k) ?? []);
    for (const s of list) {
      const n = normalizeForSearch(s);
      if (n && n !== k) cur.add(n);
    }
    if (cur.size) synonyms.set(k, [...cur].slice(0, 8));
  };
  for (const [t, l] of Object.entries(BUILTIN_SYNONYMS)) addSyn(t, l);
  for (const [t, l] of input.synonyms ?? []) addSyn(t, l);

  return {
    catAlias,
    maxCatLen: Math.min(maxCatLen, 8),
    groupAlias,
    maxGroupLen,
    brandAlias,
    maxBrandLen: Math.min(maxBrandLen, 4),
    placeKey,
    maxPlaceLen: Math.min(maxPlaceLen, 6),
    categoriesByName,
    categoriesById,
    brandsByName,
    synonyms,
  };
}

// ───────────────────────── Tokenizer ─────────────────────────

export interface Tok {
  /** Normalized token (numbers keep a decimal point, e.g. "2.5"). */
  t: string;
  /** FTS form (normalizeForSearch); may contain a space for decimals («2 5»). */
  fts: string;
  /** Index of the whitespace-separated raw word this token came from. */
  w: number;
  num?: number;
}

/** Split into normalized tokens, keeping decimals («۲٫۵» → 2.5) and thousands separators («۲۵,۰۰۰,۰۰۰»). */
export function nluTokenize(q: string): { toks: Tok[]; words: string[] } {
  const words = q.trim().split(/\s+/).filter(Boolean);
  const toks: Tok[] = [];
  words.forEach((word, w) => {
    const lw = toLatinDigits(word.normalize('NFKC')).replace(/٫/g, '.').replace(/[٬،]/g, ',');
    const core = lw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    if (/^\d{1,3}(,\d{3})+$/.test(core)) {
      const n = Number(core.replace(/,/g, ''));
      toks.push({ t: String(n), fts: String(n), w, num: n });
      return;
    }
    if (/^\d+([./]\d+)?$/.test(core)) {
      const t = core.replace('/', '.');
      toks.push({ t, fts: normalizeForSearch(core), w, num: Number(t) });
      return;
    }
    const norm = normalizeForSearch(word);
    let first = true;
    for (const part of norm.split(' ')) {
      if (!part) continue;
      // plural / ezafe fragments split off by ZWNJ («کفش‌های») carry no meaning for search
      if (!first && SUFFIX_FRAGMENTS.has(part)) continue;
      if (first && (part === 'ها' || part === 'های' || part === 'هایی')) continue;
      first = false;
      toks.push({ t: part, fts: part, w, num: /^\d+$/.test(part) ? Number(part) : undefined });
    }
  });
  return { toks, words };
}

// ───────────────────────── Parser ─────────────────────────

type BudgetKind = 'max' | 'min' | 'range' | 'around';

interface RawAmount {
  /** Value in the unit `mul` (or already in Toman when mul = 1). */
  raw: number;
  mul: number | 'colloquial' | null;
  end: number;
}

interface PendingBudget {
  kind: BudgetKind;
  a: RawAmount;
  b?: RawAmount;
  span: number[];
}

export interface ParseResult {
  parsed: ParsedQuery;
  categoryId: number | null;
  /** Normalized phrase that denoted the category (e.g. «کتونی»), for alternative-category facets. */
  categoryPhrase: string | null;
  budgetKind: BudgetKind | null;
  place: PlaceRef | null;
  /** Words after «نزدیک/اطراف…» that matched no known place (consumed, not keywords). */
  unknownPlace: string | null;
  nearMe: boolean;
  sort: SearchSort | undefined;
}

const STRONG_AREA_TRIGGERS = new Set(['نزدیک', 'نزدیکی', 'نزدیکای', 'اطراف', 'حوالی', 'سمت', 'محدوده', 'محله']);

export interface ParseOptions {
  /** Visit time is "now" (chip wording «الان باز» vs «باز در زمان مراجعه»). Default true. */
  visitIsNow?: boolean;
}

const RANGE_CONNECTORS = new Set(['تا', 'الی']);
const TOMAN_WORDS = new Set(['تومان', 'تومن', 'تومانی', 'تومنی', 'toman']);
const sortedByLenDesc = <T extends { length: number }>(l: T[]) => [...l].sort((a, b) => b.length - a.length);
const MAX_T = sortedByLenDesc(MAX_TRIGGERS);
const MIN_T = sortedByLenDesc(MIN_TRIGGERS);
const AROUND_T = sortedByLenDesc(AROUND_TRIGGERS);
const OPEN_T = sortedByLenDesc(OPEN_NOW_PHRASES);
const NEAR_T = sortedByLenDesc(NEAR_ME_PHRASES);
const PROVIDER_T = [...PROVIDER_PHRASES].sort((a, b) => b.tokens.length - a.tokens.length);
const SORT_T = [...SORT_PHRASES].sort((a, b) => b.tokens.length - a.tokens.length);
const IMPLIED_T = [...IMPLIED].sort((a, b) => b.tokens.length - a.tokens.length);

/** Persian amount → Toman. Colloquial «۳ تومن» = 3 million; category median disambiguates small numbers. */
export function amountToToman(a: Pick<RawAmount, 'raw' | 'mul'>, categoryP50: number | null = null): number {
  if (typeof a.mul === 'number') return a.raw * a.mul;
  if (a.raw >= 1000) return a.raw;
  if (categoryP50 && categoryP50 > 0 && a.raw > 0) {
    const k = Math.abs(Math.log((a.raw * 1e3) / categoryP50));
    const m = Math.abs(Math.log((a.raw * 1e6) / categoryP50));
    return a.raw * (k < m ? 1e3 : 1e6);
  }
  if (a.mul === 'colloquial') return a.raw * (a.raw < 100 ? 1e6 : 1e3);
  return a.raw * 1e6;
}

/** Round to 3 significant digits so ±20 % bounds read nicely. */
function roundSig(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return n;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(n)) - 2);
  return Math.round(n / mag) * mag;
}

export function parseQueryWith(q: string, vocab: NluVocab, opts: ParseOptions = {}): ParseResult {
  const raw = q ?? '';
  const { toks: T, words } = nluTokenize(raw);
  const n = T.length;
  const used = new Array<boolean>(n).fill(false);
  const owner = new Array<string | null>(n).fill(null);
  const chipSpans = new Map<string, number[]>();
  const mark = (from: number, to: number, chipKey: string | null) => {
    for (let i = from; i < to; i++) {
      used[i] = true;
      if (chipKey) {
        owner[i] = chipKey;
        const s = chipSpans.get(chipKey) ?? [];
        s.push(i);
        chipSpans.set(chipKey, s);
      }
    }
  };
  const tk = (i: number) => (i >= 0 && i < n ? T[i]!.t : undefined);
  const matchAt = (i: number, phrase: readonly string[]) => {
    if (i + phrase.length > n) return false;
    for (let k = 0; k < phrase.length; k++) if (used[i + k] || T[i + k]!.t !== phrase[k]) return false;
    return true;
  };

  // ── budget ────────────────────────────────────────────
  const parseNumber = (i: number, wordsOk: boolean): { v: number; end: number; fromWords: boolean } | null => {
    if (i >= n || used[i]) return null;
    const t = T[i]!;
    if (t.num !== undefined && Number.isFinite(t.num)) {
      let v = t.num;
      let j = i + 1;
      if (tk(j) === 'و' && tk(j + 1) === 'نیم' && !used[j] && !used[j + 1]) {
        v += 0.5;
        j += 2;
      }
      return { v, end: j, fromWords: false };
    }
    if (!wordsOk || NUMBER_WORDS[t.t] === undefined) return null;
    let v = 0;
    let j = i;
    for (;;) {
      const w = tk(j);
      if (w === undefined || used[j] || NUMBER_WORDS[w] === undefined) break;
      v += NUMBER_WORDS[w]!;
      j++;
      if (tk(j) === 'و' && tk(j + 1) !== undefined && NUMBER_WORDS[tk(j + 1)!] !== undefined) {
        j++;
        continue;
      }
      break;
    }
    if (j === i) return null;
    return { v, end: j, fromWords: true };
  };

  const moneyUnit = (i: number) => {
    const w = tk(i);
    if (w === undefined || used[i]) return null;
    const u = MONEY_UNITS[w];
    if (!u) return null;
    return u;
  };

  /** Amount at i: number [unit] [تومان] [و (number unit | نیم)]. `strict` requires a money unit for word numbers. */
  const parseAmount = (i: number, requireUnitForWords: boolean): RawAmount | null => {
    const num = parseNumber(i, true);
    if (!num) return null;
    let j = num.end;
    let u = moneyUnit(j);
    // weak Latin units («20m», «500k») count only when glued to the number
    if (u?.weak && (num.fromWords || T[j]!.w !== T[num.end - 1]!.w)) u = null;
    if (num.fromWords && !u && requireUnitForWords) return null;
    // «یک گوشی» / «یه کتونی»: article, not a number
    if (num.fromWords && num.end - i === 1 && (tk(i) === 'یک' || tk(i) === 'یه') && !u) return null;
    if (!u) {
      if (tk(j) !== undefined && NON_MONEY_UNITS.has(tk(j)!)) return null;
      return { raw: num.v, mul: null, end: j };
    }
    j++;
    let rawV = num.v;
    let mul: number | 'colloquial' = u.mul;
    if (typeof mul === 'number' && tk(j) !== undefined && TOMAN_WORDS.has(tk(j)!) && !used[j]) j++;
    if (typeof mul === 'number' && tk(j) === 'و' && !used[j]) {
      if (tk(j + 1) === 'نیم') {
        rawV += 0.5;
        j += 2;
      } else {
        const n2 = parseNumber(j + 1, true);
        const u2 = n2 ? moneyUnit(n2.end) : null;
        if (n2 && u2 && typeof u2.mul === 'number' && u2.mul < mul) {
          rawV = rawV * mul + n2.v * u2.mul;
          mul = 1;
          j = n2.end + 1;
          if (tk(j) !== undefined && TOMAN_WORDS.has(tk(j)!) && !used[j]) j++;
        }
      }
    }
    if (tk(j) === 'و' && tk(j + 1) !== undefined && TOMAN_WORDS.has(tk(j + 1)!)) j += 2;
    return { raw: rawV, mul, end: j };
  };

  const pending: PendingBudget[] = [];
  const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k);
  const hasMoney = (a: RawAmount) => a.mul !== null || a.raw >= 1000;

  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const t = T[i]!.t;
    // «بین ۵ تا ۸ میلیون» / «از ۵۰۰ هزار تا ۲ میلیون»
    if (t === 'بین' || t === 'از') {
      const a = parseAmount(i + 1, false);
      if (a) {
        const c = tk(a.end);
        if (c !== undefined && (RANGE_CONNECTORS.has(c) || (t === 'بین' && c === 'و'))) {
          const b = parseAmount(a.end + 1, false);
          if (b && (t === 'بین' || hasMoney(a) || hasMoney(b))) {
            pending.push({ kind: 'range', a, b, span: range(i, b.end) });
            mark(i, b.end, 'budget');
            continue;
          }
        }
      }
    }
    // «۵ تا ۸ میلیون»
    if (T[i]!.num !== undefined) {
      const a = parseAmount(i, false);
      if (a && tk(a.end) !== undefined && RANGE_CONNECTORS.has(tk(a.end)!)) {
        const b = parseAmount(a.end + 1, false);
        if (b && b.mul !== null) {
          pending.push({ kind: 'range', a, b, span: range(i, b.end) });
          mark(i, b.end, 'budget');
          continue;
        }
      }
    }
    let matched = false;
    for (const [kind, list] of [
      ['max', MAX_T],
      ['min', MIN_T],
      ['around', AROUND_T],
    ] as const) {
      for (const trig of list) {
        if (!matchAt(i, trig)) continue;
        const a = parseAmount(i + trig.length, false);
        if (!a) continue;
        if (trig.length === 1 && trig[0] === 'تا') {
          // «۳ تا هدفون» is a count, «۲ تا ۵ میلیون» was handled above
          const prev = T[i - 1];
          if (prev && prev.num !== undefined) continue;
          if (!hasMoney(a)) {
            // «هدفون تا ۳»: a bare small number is a budget only when nothing product-like follows it
            const next = tk(a.end);
            if (next !== undefined && !FILLER_WORDS.has(next) && !FA_STOPWORDS.has(next) && !AREA_TRIGGERS.has(next) && !INSTALLMENT_WORDS.has(next)) continue;
          }
        }
        pending.push({ kind, a, span: range(i, a.end) });
        mark(i, a.end, 'budget');
        matched = true;
        break;
      }
      if (matched) break;
    }
    if (matched) continue;
    // «بودجه‌ام ۲۰ میلیونه» / «بودجه حدود ۳ میلیون»
    if (BUDGET_WORDS.has(t)) {
      let j = i + 1;
      while (j < n && ['ام', 'م', 'من', 'مون', 'ما', 'هم', 'رو', 'را', 'ی', 'هست', 'است', 'تقریبا'].includes(tk(j)!)) j++;
      let kind: BudgetKind = 'max';
      if (tk(j) === 'حدود' || tk(j) === 'حدودا') {
        kind = 'around';
        j++;
      } else if (tk(j) === 'تا' || tk(j) === 'زیر' || tk(j) === 'حداکثر') j++;
      const a = parseAmount(j, false);
      if (a) {
        pending.push({ kind, a, span: range(i, a.end) });
        mark(i, a.end, 'budget');
        continue;
      }
    }
    // bare «۲۰ میلیونی» / «۵۰۰ هزار تومن»
    if (T[i]!.num !== undefined || NUMBER_WORDS[t] !== undefined) {
      const a = parseAmount(i, true);
      if (a && a.mul !== null) {
        pending.push({ kind: 'around', a, span: range(i, a.end) });
        mark(i, a.end, 'budget');
        continue;
      }
    }
  }
  // budget words left alone («بودجه») are noise
  for (let i = 0; i < n; i++) if (!used[i] && BUDGET_WORDS.has(T[i]!.t)) mark(i, i + 1, null);

  // ── installment & providers ──────────────────────────
  const hasInstallmentWord = T.some((x) => INSTALLMENT_WORDS.has(x.t));
  const providers: ProviderCode[] = [];
  let installment = false;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    let hit = false;
    for (const p of PROVIDER_T) {
      if (!matchAt(i, p.tokens)) continue;
      if (p.ambiguous && !hasInstallmentWord && tk(i - 1) !== 'با') continue;
      if (!providers.includes(p.code)) providers.push(p.code);
      if (tk(i - 1) === 'با' && !used[i - 1]) mark(i - 1, i, `provider:${p.code}`);
      mark(i, i + p.tokens.length, `provider:${p.code}`);
      hit = true;
      break;
    }
    if (hit) continue;
    if (INSTALLMENT_WORDS.has(T[i]!.t)) {
      installment = true;
      mark(i, i + 1, 'installment');
      if (tk(i - 1) === 'خرید' && !used[i - 1]) mark(i - 1, i, 'installment');
    }
  }

  // ── open now / near me / sort ────────────────────────
  let openNow = false;
  let nearMe = false;
  let sort: SearchSort | undefined;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const o = OPEN_T.find((p) => matchAt(i, p));
    if (o) {
      openNow = true;
      mark(i, i + o.length, 'open');
      continue;
    }
    const nm = NEAR_T.find((p) => matchAt(i, p));
    if (nm) {
      nearMe = true;
      mark(i, i + nm.length, 'near');
      continue;
    }
    const s = SORT_T.find((p) => matchAt(i, p.tokens));
    if (s) {
      sort ??= s.sort;
      mark(i, i + s.tokens.length, 'sort');
    }
  }

  // ── area / place ─────────────────────────────────────
  let place: PlaceRef | null = null;
  const placeAt = (i: number, mustStartWithKind: boolean): { p: PlaceRef; end: number } | null => {
    for (let L = Math.min(vocab.maxPlaceLen, n - i); L >= 1; L--) {
      let ok = true;
      for (let k = 0; k < L; k++) if (used[i + k]) ok = false;
      if (!ok) continue;
      const key = T.slice(i, i + L)
        .map((x) => x.t)
        .join(' ');
      const p = vocab.placeKey.get(key);
      if (!p) continue;
      if (mustStartWithKind && !PLACE_KIND_WORDS.has(T[i]!.t) && !(L >= 2 && (p.kind === 'area' || p.kind === 'mall'))) continue;
      return { p, end: i + L };
    }
    return null;
  };
  for (let i = 0; i < n && !place; i++) {
    if (used[i] || !AREA_TRIGGERS.has(T[i]!.t)) continue;
    const hit = placeAt(i + 1, false);
    if (hit) {
      place = hit.p;
      mark(i, hit.end, 'area');
    }
  }
  for (let i = 0; i < n && !place; i++) {
    if (used[i]) continue;
    const hit = placeAt(i, true);
    if (hit) {
      place = hit.p;
      mark(i, hit.end, 'area');
    }
  }

  // unknown place after a strong proximity word («نزدیک ونک» with no such place in the gazetteer):
  // consume it so it never pollutes keywords; search reports it as a notice.
  let unknownPlace: string | null = null;
  if (!place) {
    for (let i = 0; i < n - 1; i++) {
      if (used[i] || !STRONG_AREA_TRIGGERS.has(T[i]!.t)) continue;
      let j = i + 1;
      if (j < n && !used[j] && PLACE_KIND_WORDS.has(T[j]!.t)) j++;
      if (j >= n || used[j] || /^\d/.test(T[j]!.t)) continue;
      const end = j + 1;
      unknownPlace = T.slice(i + 1, end)
        .map((x) => x.t)
        .join(' ');
      mark(i, end, 'area');
      break;
    }
  }

  // ── implied brand/category («آیفون ۱۶», «گلکسی واچ») ──
  let category: CatRef | null = null;
  let categoryGroup: string | null = null;
  let categoryPhrase: string | null = null;
  let brand: BrandRef | null = null;
  const findBrand = (names: string[]): BrandRef | null => {
    for (const nm of names) {
      const b = vocab.brandsByName.get(nm) ?? vocab.brandAlias.get(normalizeForSearch(nm));
      if (b) return b;
    }
    return null;
  };
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    for (const imp of IMPLIED_T) {
      if (!matchAt(i, imp.tokens)) continue;
      const next = tk(i + imp.tokens.length);
      if (imp.unlessNext && next !== undefined && imp.unlessNext.includes(next)) continue;
      const b = findBrand(imp.brand);
      if (b && !brand) brand = b;
      if (imp.category && !category) {
        const c = imp.category.map((nm) => vocab.categoriesByName.get(nm)).find(Boolean);
        if (c) {
          category = c;
          categoryGroup = c.groupId;
          categoryPhrase = imp.tokens.join(' ');
        }
      }
      if (imp.drop) mark(i, i + imp.tokens.length, b ? 'brand' : 'category');
      // the brand and category chips both stem from these words
      for (let k = i; k < i + imp.tokens.length; k++) {
        owner[k] = b ? 'brand' : 'category';
        for (const key of ['brand', 'category']) {
          const s = chipSpans.get(key) ?? [];
          if (!s.includes(k)) s.push(k);
          chipSpans.set(key, s);
        }
      }
      i += imp.tokens.length - 1;
      break;
    }
  }

  // ── category (longest phrase wins; trusted aliases beat derived ones) ──
  if (!category) {
    let best: { i: number; L: number; e: CatEntry } | null = null;
    for (let L = Math.min(vocab.maxCatLen, n); L >= 1 && !best; L--) {
      for (let i = 0; i + L <= n; i++) {
        let ok = true;
        for (let k = 0; k < L; k++) if (used[i + k] || owner[i + k]) ok = false;
        if (!ok) continue;
        const key = T.slice(i, i + L)
          .map((x) => x.t)
          .join(' ');
        const e = vocab.catAlias.get(key);
        if (!e) continue;
        if (!best || e.trust > best.e.trust) best = { i, L, e };
      }
    }
    if (best) {
      categoryPhrase = T.slice(best.i, best.i + best.L)
        .map((x) => x.t)
        .join(' ');
      if (best.e.cat) {
        category = best.e.cat;
        categoryGroup = best.e.cat.groupId;
        mark(best.i, best.i + best.L, 'category');
      } else if (best.e.group) {
        categoryGroup = best.e.group;
        mark(best.i, best.i + best.L, 'group');
      }
    }
  }
  if (!category && !categoryGroup) {
    for (let L = Math.min(vocab.maxGroupLen, n); L >= 1 && !categoryGroup; L--) {
      for (let i = 0; i + L <= n; i++) {
        let ok = true;
        for (let k = 0; k < L; k++) if (used[i + k]) ok = false;
        if (!ok) continue;
        const g = vocab.groupAlias.get(
          T.slice(i, i + L)
            .map((x) => x.t)
            .join(' '),
        );
        if (g) {
          categoryGroup = g;
          mark(i, i + L, 'group');
          break;
        }
      }
    }
  }

  // ── brand ────────────────────────────────────────────
  if (!brand) {
    outer: for (let L = Math.min(vocab.maxBrandLen, n); L >= 1; L--) {
      for (let i = 0; i + L <= n; i++) {
        let ok = true;
        for (let k = 0; k < L; k++) if (used[i + k]) ok = false;
        if (!ok) continue;
        const b = vocab.brandAlias.get(
          T.slice(i, i + L)
            .map((x) => x.t)
            .join(' '),
        );
        if (b) {
          brand = b;
          mark(i, i + L, 'brand');
          break outer;
        }
      }
    }
  }

  // ── audience ─────────────────────────────────────────
  let audience: Audience | undefined;
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const a = AUDIENCE_WORDS[T[i]!.t];
    if (!a) continue;
    // «مردانه و زنانه» → unisex
    if ((a === 'men' || a === 'women') && tk(i + 1) === 'و' && AUDIENCE_WORDS[tk(i + 2) ?? ''] && AUDIENCE_WORDS[tk(i + 2)!] !== a) {
      audience = 'unisex';
      mark(i, i + 3, 'audience');
      break;
    }
    audience = a;
    mark(i, i + 1, 'audience');
    break;
  }
  // «کتونی بچگانه» → the dedicated kids category when it exists
  if (category && audience) {
    const suffix = audience === 'kids' ? 'بچگانه' : audience === 'men' ? 'مردانه' : audience === 'women' ? 'زنانه' : null;
    const alt = suffix ? vocab.categoriesByName.get(`${category.name} ${suffix}`) : undefined;
    if (alt) {
      category = alt;
      categoryGroup = alt.groupId;
      for (const k of chipSpans.get('audience') ?? []) {
        owner[k] = 'category';
        chipSpans.get('category')?.push(k) ?? chipSpans.set('category', [k]);
      }
      chipSpans.delete('audience');
      audience = undefined;
    } else if (/مردانه|زنانه|بچگانه|کودک|نوزاد/.test(category.name)) {
      // the category itself already encodes the audience
      audience = audience === 'unisex' ? undefined : audience;
    }
  }

  // ── resolve budget (category median disambiguates «زیر ۵۰۰») ──
  let budgetMin: number | undefined;
  let budgetMax: number | undefined;
  let budgetKind: BudgetKind | null = null;
  let budgetChip: string | null = null;
  const p50 = category?.p50 ?? null;
  for (const b of pending) {
    const va = amountToToman(b.a, p50);
    if (b.kind === 'range' && b.b) {
      let a = b.a;
      if (a.mul === null && b.b.mul !== null) a = { ...a, mul: b.b.mul };
      const lo = amountToToman(a, p50);
      const hi = amountToToman(b.b, p50);
      budgetMin = Math.min(lo, hi);
      budgetMax = Math.max(lo, hi);
      budgetKind = 'range';
    } else if (b.kind === 'max') {
      budgetMax = va;
      budgetKind = budgetKind ?? 'max';
    } else if (b.kind === 'min') {
      budgetMin = va;
      budgetKind = budgetKind ?? 'min';
    } else if (budgetMin === undefined && budgetMax === undefined) {
      budgetMin = roundSig(va * 0.8);
      budgetMax = roundSig(va * 1.2);
      budgetKind = 'around';
      budgetChip = `حدود ${formatTomanShort(va)}`;
    }
  }
  const sane = (v: number | undefined) => (v !== undefined && Number.isFinite(v) && v >= 1000 && v <= 1e11 ? Math.round(v) : undefined);
  budgetMin = sane(budgetMin);
  budgetMax = sane(budgetMax);
  if (budgetMin !== undefined && budgetMax !== undefined && budgetMin > budgetMax) [budgetMin, budgetMax] = [budgetMax, budgetMin];
  if (budgetMin === undefined && budgetMax === undefined) budgetKind = null;
  if (budgetKind && budgetKind !== 'around') budgetChip = budgetLabel(budgetMin ?? null, budgetMax ?? null);

  // ── keywords (leftovers, glued per raw word: «a55» → "a 55") ──
  const keywords: string[] = [];
  for (let i = 0; i < n; ) {
    if (used[i]) {
      i++;
      continue;
    }
    const w = T[i]!.w;
    const group: string[] = [];
    let j = i;
    while (j < n && !used[j] && T[j]!.w === w) {
      group.push(T[j]!.fts);
      j++;
    }
    const meaningful = group.filter((g) => !FA_STOPWORDS.has(g) && !FILLER_WORDS.has(g) && g !== 'و' && NUMBER_WORDS[g] === undefined);
    if (group.length > 1 && meaningful.length === group.length) keywords.push(group.join(' '));
    else for (const g of meaningful) keywords.push(g);
    i = j;
  }
  const uniqKeywords = [...new Set(keywords)].slice(0, 8);

  // ── chips (each knows the query text without itself) ──
  const qWithout = (key: string) => {
    const spans = new Set(chipSpans.get(key) ?? []);
    const dropWords = new Set<number>();
    for (const k of spans) dropWords.add(T[k]!.w);
    return words
      .filter((_, wi) => !dropWords.has(wi))
      .join(' ')
      .trim();
  };
  const chips: QueryChip[] = [];
  const chip = (key: string, label: string) => {
    const c: QueryChip = { key, label, removable: true };
    const qw = qWithout(key);
    if (chipSpans.has(key)) c.qWithout = qw;
    chips.push(c);
  };
  if (category) chip('category', category.name);
  else if (categoryGroup && chipSpans.has('group')) chip('group', groupLabel(categoryGroup));
  if (brand) chip('brand', brand.name);
  if (budgetChip) chip('budget', budgetChip);
  if (place) chip('area', `${place.kind === 'mall' ? 'در' : 'نزدیک'} ${place.name}`);
  if (nearMe) chip('near', 'نزدیک من');
  if (installment) chip('installment', 'قسطی');
  for (const p of providers) chip(`provider:${p}`, PROVIDERS[p].label);
  if (openNow) chip('open', opts.visitIsNow === false ? 'باز در زمان مراجعه' : 'الان باز');
  if (audience) chip('audience', AUDIENCE_LABEL[audience]);
  if (sort && sort !== 'relevance') chip('sort', SORT_LABEL[sort as keyof typeof SORT_LABEL]);

  const parsed: ParsedQuery = {
    raw,
    text: uniqKeywords.map((k) => toPersianDigits(k)).join(' '),
    keywords: uniqKeywords,
    chips,
  };
  if (category) parsed.category = category.name;
  if (categoryGroup) parsed.categoryGroup = categoryGroup;
  if (brand) parsed.brand = brand.name;
  if (budgetMin !== undefined) parsed.budgetMin = budgetMin;
  if (budgetMax !== undefined) parsed.budgetMax = budgetMax;
  if (place) {
    parsed.areaLabel = place.name;
    parsed.location = { lat: place.lat, lng: place.lng };
  }
  if (installment) parsed.installment = true;
  if (providers.length) parsed.providers = providers;
  if (openNow) parsed.openNow = true;
  if (audience) parsed.audience = audience;
  if (sort) parsed.sort = sort;
  if (nearMe) parsed.nearMe = true;

  return {
    parsed,
    categoryId: category?.id ?? null,
    categoryPhrase,
    budgetKind,
    place,
    unknownPlace,
    nearMe,
    sort,
  };
}

const GROUP_LABELS: Record<string, string> = {
  mobile: 'موبایل و تبلت',
  computer: 'لپ‌تاپ و کامپیوتر',
  audio_video: 'صوتی و تصویری',
  appliances: 'لوازم خانگی برقی',
  lighting: 'روشنایی و لوستر',
  electrical: 'تجهیزات برقی',
  security: 'امنیتی و نظارتی',
  industrial: 'صنعتی و تأسیسات',
  tools: 'ابزار',
  fashion: 'مد و پوشاک',
  shoes_bags: 'کفش و کیف',
  watch_jewelry: 'ساعت و زیورآلات',
  beauty: 'آرایشی و بهداشتی',
  auto: 'خودرو',
  home_kitchen: 'خانه و آشپزخانه',
  medical: 'پزشکی و سلامت',
  sports_toys: 'ورزش و سرگرمی',
  office_books: 'کتاب و تحریر',
  food: 'خوراکی',
  other: 'سایر',
};

export function groupLabel(id: string): string {
  return GROUP_LABELS[id] ?? id;
}

/**
 * FTS5 MATCH expression for keywords: each keyword becomes `("kw" OR "syn" OR "stem")`, the last
 * one also as a prefix (`"kw"*`), groups ANDed. `mode: 'or'` joins groups with OR (recall fallback).
 */
export function ftsQuery(keywords: string[], synonyms: Map<string, string[]>, mode: 'and' | 'or' = 'and'): string | null {
  const groups: string[] = [];
  keywords.forEach((kw, idx) => {
    const k = kw.trim();
    if (!k) return;
    const alts = new Set<string>([k]);
    for (const s of synonyms.get(k) ?? []) alts.add(s);
    if (!k.includes(' ')) {
      const stem = lightStemFa(k);
      if (stem !== k && stem.length >= 2) alts.add(stem);
    }
    const parts: string[] = [];
    for (const a of alts) parts.push(`"${a.replace(/"/g, '')}"`);
    const isLast = idx === keywords.length - 1;
    if (isLast && !k.includes(' ') && !/^\d+$/.test(k) && k.length >= 2) parts.push(`"${k.replace(/"/g, '')}"*`);
    groups.push(parts.length === 1 ? parts[0]! : `(${parts.join(' OR ')})`);
  });
  if (!groups.length) return null;
  return groups.join(mode === 'and' ? ' AND ' : ' OR ');
}

/** Light Persian stemming for lenient matching («هدفون‌ها» → «هدفون», «بلوتوثی» → «بلوتوث»). */
export function lightStemFa(token: string): string {
  if (token.length <= 3 || /^[a-z0-9]+$/.test(token)) return token;
  for (const suf of ['هایی', 'های', 'ها', 'ات']) {
    if (token.endsWith(suf) && token.length - suf.length >= 3) return token.slice(0, -suf.length);
  }
  if (token.endsWith('ی') && token.length >= 5) return token.slice(0, -1);
  return token;
}
