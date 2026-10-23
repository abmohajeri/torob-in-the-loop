/**
 * Shop address → in-mall location (docs/ARCHITECTURE.md §4 rule 11).
 *
 *   «خیابان جمهوری، نبش شیخ هادی، پاساژ علالدین 2، طبقه 6، واحد 622»
 *     → mall «پاساژ علالدین ۲» (passage) · floor 6 «طبقه ششم» · unit «۶۲۲» · landmark «نبش شیخ هادی»
 *
 * The parser is token based (not only comma based) because many addresses glue parts together
 * («ساختمان الومینیم طبقه نهم واحد۹۴۶», «پاساژنادری»). Each address is split on strong delimiters
 * («،» «,» «؛» «.» parentheses), then each segment is scanned token by token; markers open clauses:
 *   mall      پاساژ | مجتمع/مجموعه (تجاری/اداری) | مرکز خرید/تجاری/تجارت (glued too) | بازار(چه) | تیمچه | سرا(ی) | ساختمان | برج | «… مال/سنتر/پلازا»
 *   floor     طبقه/طیقه + expression | همکف | زیرهمکف | زیرزمین | بالای همکف
 *   unit      واحد | غرفه | مغازه | کانتر + code      plaque: پلاک + code
 *   wing      راهرو(ی) | لاین | بخش | بلوک | ضلع | سالن | ورودی | حیاط | ابتدا/انتها/اواسط + پاساژ/سالن/راهرو
 *   landmark  روبه‌روی | روبروی | مقابل | جنب | کنار | نبش | بعد از | قبل از | نرسیده | بالاتر/پایین‌تر از | پشت | بین
 * A mall mentioned right after a landmark word («روبروی پاساژ چارسو») is a landmark, NOT the shop's mall.
 */
import type { MallKind } from '@titl/shared';
import { cleanFa, normalizeForSearch, toLatinDigits, toPersianDigits } from '@titl/shared';
import { FA_ORDINALS } from './util.js';

export type LocConfidence = 'high' | 'medium' | 'low';

export interface MallMention {
  kind: MallKind;
  /** Display name as written (cleaned, Persian digits), e.g. «پاساژ علالدین ۲». */
  name: string;
  /** normalizeForSearch(name) minus kind words, e.g. «علالدین 2». */
  key: string;
  /** Spelling-variance-insensitive key (no ا / و / spaces), e.g. «علدین2». */
  skeleton: string;
}

export interface ParsedAddress {
  mall: MallMention | null;
  floorLabel: string | null;
  floorNum: number | null;
  unit: string | null;
  plaque: string | null;
  wing: string | null;
  landmark: string | null;
  confidence: LocConfidence;
}

// ───────────────────────── token helpers ─────────────────────────

interface Tok {
  /** Surface form for display (cleaned, original digits). */
  raw: string;
  /** Matching form: no ZWNJ, Latin digits, lowercase. */
  n: string;
}

const ZWNJ = '\u200c';

function tok(raw: string): Tok {
  const r = raw.replace(/^[\u200c_:«»"'،,]+|[\u200c«»"':،,]+$/g, '').replace(/^[–—]+/, '');
  return { raw: r, n: toLatinDigits(r.split(ZWNJ).join('')).toLowerCase() };
}

/** Phrase table entry: tokens in matching form. */
type Phrase = readonly string[];

function matchPhrase(toks: readonly Tok[], i: number, phrases: readonly Phrase[]): number {
  for (const p of phrases) {
    if (i + p.length > toks.length) continue;
    let ok = true;
    for (let k = 0; k < p.length; k++) {
      if (toks[i + k]!.n !== p[k]) {
        ok = false;
        break;
      }
    }
    if (ok) return p.length;
  }
  return 0;
}

const P = (...items: string[]): Phrase[] => items.map((s) => s.split(' ')).sort((a, b) => b.length - a.length);

const LANDMARK_PREFIX = P(
  'روبروی',
  'روبهروی',
  'روبه روی',
  'رو به روی',
  'روبرو',
  'روبهرو',
  'رو به رو',
  'رو بروی',
  'مقابل',
  'جنب',
  'کنار',
  'نبش',
  'بعد از',
  'بعداز',
  'قبل از',
  'قبلاز',
  'نرسیده به',
  'نرسیده',
  'بالاتر از',
  'بالاتراز',
  'پایینتر از',
  'پایین تر از',
  'پایینتراز',
  'پائینتر از',
  'پائین تر از',
  'پشت',
  'بین',
  'نزدیک',
);

/** Words that put the following mall mention INSIDE the mall (not a landmark). */
const INSIDE_PREFIX = P('داخل', 'درون', 'ابتدای', 'انتهای', 'اواسط', 'وسط', 'اول', 'آخر');

const MALL_PREFIX: { p: Phrase[]; kind: MallKind }[] = [
  { p: P('مرکز خرید', 'مرکز تجاری', 'مرکز تجارت', 'مرکزخرید', 'مرکزتجاری', 'مرکز کامپیوتر'), kind: 'mall' },
  { p: P('مجتمع', 'مجموعه'), kind: 'complex' },
  { p: P('پاساژ', 'پاسار'), kind: 'passage' },
  { p: P('بازارچه', 'بازار', 'تیمچه'), kind: 'bazaar' },
  { p: P('سرای', 'سرا'), kind: 'sara' },
  { p: P('ساختمان'), kind: 'building' },
  { p: P('برجهای', 'برج'), kind: 'tower' },
];
const MALL_SUFFIX = new Set(['مال', 'سنتر', 'پلازا']);
/** Words directly following «مجتمع» that are part of the kind phrase. */
const KIND_QUALIFIERS = new Set(['تجاری', 'اداری', 'و', 'مسکونی', 'تجاریاداری', 'خرید']);

const STREET_WORDS = new Set([
  'خیابان',
  'خ',
  'کوچه',
  'ک',
  'بلوار',
  'میدان',
  'بزرگراه',
  'اتوبان',
  'چهارراه',
  'تقاطع',
  'سهراه',
  'بنبست',
  'محله',
  'شهرک',
  'جاده',
  'پل',
  'ایستگاه',
  'کوی',
  'فاز',
  'گذر',
  'راسته',
]);

const FLOOR_WORDS = new Set(['طبقه', 'طیقه', 'طبقهی', 'طبقات']);
const UNIT_WORDS = new Set(['واحد', 'غرفه', 'مغازه', 'کانتر', 'واحدهای']);
const PLAQUE_WORDS = new Set(['پلاک', 'پلاك']);
const WING_WORDS = new Set(['راهرو', 'راهروی', 'لاین', 'بخش', 'بلوک', 'ضلع', 'سالن', 'ورودی', 'ورودیه', 'حیاط', 'حیات']);
const DIRECTION = new Set(['شمالی', 'جنوبی', 'شرقی', 'غربی', 'شمال', 'جنوب', 'شرق', 'غرب']);
const STANDALONE_FLOOR = P('زیر همکف', 'زیرهمکف', 'زیر زمین', 'زیرزمین', 'هم کف', 'همکف', 'بالای همکف', 'نیم طبقه', 'نیمطبقه');

const ORDINAL_WORDS: [string, number][] = [
  ['یکم', 1],
  ['اول', 1],
  ['نخست', 1],
  ['دوم', 2],
  ['سوم', 3],
  ['سون', 3],
  ['چهارم', 4],
  ['پنجم', 5],
  ['ششم', 6],
  ['هفتم', 7],
  ['هشتم', 8],
  ['نهم', 9],
  ['دهم', 10],
  ['یازدهم', 11],
  ['دوازدهم', 12],
  ['سیزدهم', 13],
  ['چهاردهم', 14],
  ['پانزدهم', 15],
];
const CARDINAL_WORDS: [string, number][] = [
  ['یک', 1],
  ['دو', 2],
  ['سه', 3],
  ['چهار', 4],
  ['پنج', 5],
  ['شش', 6],
  ['هفت', 7],
  ['هشت', 8],
  ['نه', 9],
  ['ده', 10],
  ['یازده', 11],
  ['دوازده', 12],
];

function wordNumber(n: string): number | null {
  for (const [w, v] of ORDINAL_WORDS) if (n === w) return v;
  for (const [w, v] of CARDINAL_WORDS) if (n === w) return v;
  // tolerate glued suffixes such as «اولریال», «دوم‌جنوبی»
  for (const [w, v] of ORDINAL_WORDS) if (w.length >= 3 && n.startsWith(w)) return v;
  return null;
}

// ───────────────────────── floors ─────────────────────────

export interface FloorParse {
  num: number | null;
  label: string;
  /** tokens consumed after the floor keyword */
  used: number;
}

/** Canonical Persian label for a floor number. */
export function floorLabelFor(num: number): string {
  if (num === 0) return 'همکف';
  if (num < 0) {
    const k = -num;
    return `زیرزمین ${FA_ORDINALS[k] ?? toPersianDigits(k)}`.replace('زیرزمین همکف', 'زیرزمین');
  }
  const ord = FA_ORDINALS[num];
  return ord ? `طبقه ${ord}` : `طبقه ${toPersianDigits(num)}`;
}

const NUM_CODE = /^([+\-−–]?)(\d{1,3})([+\-−–]?)$/;

/**
 * Parse a floor expression from tokens that FOLLOW a floor keyword («طبقه»), or that start with a
 * standalone floor word («همکف», «زیرزمین»). Returns null when nothing floor-like is found.
 */
export function parseFloorTokens(toks: readonly Tok[], start: number, standalone: boolean): FloorParse | null {
  let i = start;
  // skip ezafe / punctuation
  while (i < toks.length && (toks[i]!.n === 'ی' || toks[i]!.n === '' || toks[i]!.n === ':' || toks[i]!.n === '(')) i++;
  const t = toks[i];
  if (!t) return null;
  const n = t.n.replace(/[()]/g, '');
  const next = toks[i + 1]?.n ?? '';
  const next2 = toks[i + 2]?.n ?? '';

  // همکف / هم کف / بالای همکف / زیر همکف
  if (n.startsWith('همکف') || (n === 'هم' && next === 'کف')) {
    return { num: 0, label: 'همکف', used: i - start + (n === 'هم' ? 2 : 1) };
  }
  if ((n === 'بالای' || n === 'روی') && (next === 'همکف' || (next === 'هم' && next2 === 'کف'))) {
    return { num: 1, label: floorLabelFor(1), used: i - start + 2 };
  }
  if (n === 'زیرهمکف' || (n === 'زیر' && next === 'همکف')) {
    return { num: -1, label: floorLabelFor(-1), used: i - start + (n === 'زیر' ? 2 : 1) };
  }
  if (n === 'زیرزمین' || (n === 'زیر' && next === 'زمین')) {
    const after = i + (n === 'زیر' ? 2 : 1);
    const a = toks[after]?.n ?? '';
    let depth = 1;
    let used = after - start;
    const w = wordNumber(a);
    if (w !== null && w <= 5) {
      depth = w;
      used++;
    } else if (a === 'منفی') {
      const b = toks[after + 1]?.n ?? '';
      const v = /^\d$/.test(b) ? Number(b) : wordNumber(b);
      if (v !== null && v <= 5) {
        depth = v;
        used += 2;
      }
    }
    return { num: -depth, label: floorLabelFor(-depth), used };
  }
  if (n === 'زیرین') return { num: -1, label: floorLabelFor(-1), used: i - start + 1 };
  if (n === 'نیم' && next === 'طبقه') return { num: null, label: 'نیم‌طبقه', used: i - start + 2 };
  if (n === 'نیمطبقه') return { num: null, label: 'نیم‌طبقه', used: i - start + 1 };
  if (standalone) return null;

  // منفی یک / منفی ۱ / منفی1
  if (n === 'منفی' || n.startsWith('منفی')) {
    const rest = (n === 'منفی' ? next : n.slice(4)).replace(/[+\-−–]/g, '');
    const v = /^\d{1,2}$/.test(rest) ? Number(rest) : wordNumber(rest);
    if (v !== null && v > 0 && v <= 6) return { num: -v, label: floorLabelFor(-v), used: i - start + (n === 'منفی' ? 2 : 1) };
    if (rest === '' || rest === '(زیرزمین)' || next.includes('زیرزمین')) return { num: -1, label: floorLabelFor(-1), used: i - start + 1 };
    return null;
  }

  // B1 / b2 → basement
  const b = /^b(\d)$/.exec(n);
  if (b) return { num: -Number(b[1]), label: floorLabelFor(-Number(b[1])), used: i - start + 1 };
  // other lettered levels used by some malls (P1, G2, GB, M): keep the label, number unknown
  const lv = /^([a-z]{1,2}\d?)(?:[٫.,]\d+)?$/.exec(n);
  if (lv && n !== 'ی') return { num: null, label: `طبقه ${lv[1]!.toUpperCase()}`, used: i - start + 1 };

  // آخر / فوقانی
  if (n === 'آخر' || n === 'اخر') return { num: null, label: 'طبقه آخر', used: i - start + 1 };

  // digits: 3, -1, 1-, 1+, 3/1, 4.1, 3A
  let m = NUM_CODE.exec(n);
  if (m) {
    const v = Number(m[2]);
    const neg = /[\-−–]/.test(m[1]!) || /[\-−–]/.test(m[3]!);
    if (v > 60) return null;
    const num = neg ? -v : v;
    return { num, label: floorLabelFor(num), used: i - start + 1 };
  }
  // a lone minus sign token followed by digits: «- 1»
  if ((n === '-' || n === '−') && /^\d{1,2}$/.test(next)) {
    const v = -Number(next);
    return { num: v, label: floorLabelFor(v), used: i - start + 2 };
  }
  m = /^(\d{1,2})([\/.](\d{1,2}))$/.exec(n);
  if (m) {
    const v = Number(m[1]);
    return { num: v, label: `طبقه ${toPersianDigits(n)}`, used: i - start + 1 };
  }
  m = /^(\d{1,2})([a-z])$/.exec(n);
  if (m) {
    const v = Number(m[1]);
    return { num: v, label: `طبقه ${toPersianDigits(m[1]!)}${m[2]!.toUpperCase()}`, used: i - start + 1 };
  }
  // ordinal / cardinal words: اول, دوم, سون, چهار, ...
  const w = wordNumber(n);
  if (w !== null) {
    let used = i - start + 1;
    // «طبقه 9 نهم» / «طبقه اول ۱+» → swallow a redundant restatement
    if (/^\d{1,2}[+\-]?$/.test(next) || wordNumber(next) === w) used++;
    return { num: w, label: floorLabelFor(w), used };
  }
  return null;
}

// ───────────────────────── codes (unit / plaque) ─────────────────────────

const CODE_RE = /^(?:[a-z]{1,2}[\-]?\d{1,5}[a-z]?|\d{1,5}(?:[\/.\-]\d{1,4})?[a-z]?|[a-z]\d{0,3}|\d{1,5}[a-z]\d{0,3})$/;

/** Display form of a unit/plaque code: Persian digits for numeric codes, Latin for alphanumeric ones. */
export function displayCode(code: string): string {
  const c = code.replace(/[\-]$/, '');
  if (/[a-z]/i.test(c)) return c.toUpperCase();
  return toPersianDigits(c);
}

/** «کانتر 1» → «کانتر ۱»; «B12» → «B12»; «622» → «۶۲۲». */
function unitDisplay(code: string): string {
  const m = /^(کانتر|غرفه)\s(.+)$/.exec(code);
  return m ? `${m[1]} ${displayCode(m[2]!)}` : displayCode(code);
}

function parseCode(toks: readonly Tok[], start: number): { code: string; used: number } | null {
  let i = start;
  while (i < toks.length && (toks[i]!.n === ':' || toks[i]!.n === 'شماره' || toks[i]!.n === 'ی' || toks[i]!.n === '')) i++;
  const t = toks[i];
  if (!t) return null;
  const n = t.n.replace(/[()]/g, '').replace(/\.0$/, '').replace(/[.\-]$/, '');
  if (CODE_RE.test(n)) {
    // «B 12» / «4 / 165» split by spaces
    const nx = toks[i + 1]?.n ?? '';
    const nx2 = toks[i + 2]?.n ?? '';
    if (/^[a-z]$/.test(n) && /^\d{1,4}$/.test(nx)) return { code: n + nx, used: i - start + 2 };
    if (/^\d{1,4}$/.test(n) && nx === '/' && /^\d{1,4}$/.test(nx2)) return { code: `${n}/${nx2}`, used: i - start + 3 };
    return { code: n, used: i - start + 1 };
  }
  const w = wordNumber(n);
  if (w !== null) return { code: String(w), used: i - start + 1 };
  return null;
}

// ───────────────────────── mall names ─────────────────────────

const KIND_WORDS_NORM = new Set([
  'پاساژ',
  'پاسار',
  'مجتمع',
  'تجاری',
  'اداری',
  'مسکونی',
  'مرکز',
  'مرکزتجاری',
  'مرکزخرید',
  'مجموعه',
  'های',
  'خرید',
  'بازار',
  'بازارچه',
  'تیمچه',
  'سرای',
  'سرا',
  'ساختمان',
  'برج',
  'مال',
  'سنتر',
  'پلازا',
  'و',
]);

/** normalizeForSearch(name) without kind words, e.g. «پاساژ علاءالدین ۲» → «علاالدین 2». */
export function mallKey(name: string): string {
  const words = normalizeForSearch(name)
    .split(' ')
    .filter((w) => w && !KIND_WORDS_NORM.has(w))
    .map((w) => KEY_NUMBER_WORDS[w] ?? w);
  // «علاءالدین ۱» / «علاءالدین یک» is the original «علاءالدین»
  if (words.length > 1 && words[words.length - 1] === '1') words.pop();
  return words.join(' ');
}

const KEY_NUMBER_WORDS: Record<string, string> = { یک: '1', دو: '2', سه: '3', چهار: '4', پنج: '5' };

/** Spelling-variance-insensitive key: drops ا/و and spaces («علاءالدین» ≈ «علالدین», «کوروش» ≈ «کورش»). */
export function mallSkeleton(key: string): string {
  return key.replace(/[اوآ\s]/g, '');
}

function isBoundary(toks: readonly Tok[], i: number): boolean {
  const n = toks[i]!.n;
  return (
    FLOOR_WORDS.has(n) ||
    n.startsWith('طبقه') ||
    UNIT_WORDS.has(n) ||
    PLAQUE_WORDS.has(n) ||
    WING_WORDS.has(n) ||
    STREET_WORDS.has(n) ||
    matchPhrase(toks, i, LANDMARK_PREFIX) > 0 ||
    matchPhrase(toks, i, STANDALONE_FLOOR) > 0
  );
}

function displayName(raws: string[]): string {
  return cleanFa(toPersianDigits(raws.join(' ')))
    .replace(/[\s\-–_:.]+$/g, '')
    .replace(/^[\s\-–_:.]+/g, '')
    .replace(/\s*\(\s*/g, ' (')
    .replace(/\s+\)/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

// ───────────────────────── landmark display ─────────────────────────

const LANDMARK_CANON: [RegExp, string][] = [
  [/^(?:روبه\s*روی|رو\s*به\s*روی|روبروی|رو\s*بروی)\s*/, 'روبه‌روی '],
  [/^(?:روبه\s*رو|رو\s*به\s*رو|روبرو)\s+/, 'روبه‌روی '],
  [/^(?:پایین\s*تر|پائین\s*تر)\s*از\s*/, 'پایین‌تر از '],
  [/^بالاتر\s*از\s*/, 'بالاتر از '],
  [/^بعد\s*از\s*/, 'بعد از '],
  [/^قبل\s*از\s*/, 'قبل از '],
];

function landmarkDisplay(raws: string[]): string {
  let s = cleanFa(toPersianDigits(raws.join(' '))).replace(/\u200c/g, ' ').replace(/\s+/g, ' ');
  for (const [re, rep] of LANDMARK_CANON) {
    if (re.test(s)) {
      s = s.replace(re, rep);
      break;
    }
  }
  return s.replace(/[\s\-–_:.]+$/g, '').trim();
}

const NOTABLE_LANDMARK = /(پاساژ|مجتمع|بانک|هتل|کافه|مسجد|سینما|بیمارستان|درمانگاه|پارک|مترو|ایستگاه|آسانسور|پله|دفتر|مدیریت|ورودی|نگهبانی|سرویس|نمازخانه|رستوران|داروخانه|اداره|دانشگاه|مدرسه|کلانتری|پست|شهرداری|اتحادیه|بیمه|مخابرات|سفارت|موزه|تئاتر|بازار|مرکز)/;
const IN_MALL_LANDMARK = /(آسانسور|پله|دفتر|مدیریت|ورودی|نگهبانی|سرویس|نمازخانه|کافی\s?شاپ|فودکورت|رستوران|درب|راهرو|بالابر)/;

// ───────────────────────── segmentation ─────────────────────────

/** Pre-clean an address for tokenization (keeps original digits for display). */
export function preClean(address: string): string {
  let s = address.replace(/ـ(?=[0-9۰-۹])/g, '-'); // «طبقه ـ۱» (tatweel used as a minus sign)
  s = s.replace(/(?<=[0-9۰-۹٠-٩])٫(?=[0-9۰-۹٠-٩])/g, '/'); // Arabic decimal sign «۷۱٫۱» → sub-unit «۷۱/۱»
  // short codes in parentheses belong to the preceding keyword: «واحد (26A)», «(B۱)»
  s = s.replace(/\(\s*([A-Za-z0-9۰-۹٠-٩][A-Za-z0-9۰-۹٠-٩\/.\-]{0,7})\s*\)/g, ' $1 ');
  s = cleanFa(s);
  s = s.replace(/\u200c+/g, ZWNJ);
  // glued keywords: «طبقه۳», «واحد۹۴۶», «پلاک12», «طبقهB۱», «پاساژنادری», «طبقه‌دوم»
  s = s.replace(/(طبقه|طیقه|واحد|پلاک|پلاك|غرفه|مغازه|کانتر|منفی)(?=[0-9۰-۹٠-٩A-Za-z\-+−])/g, '$1 ');
  s = s.replace(/(طبقه|طیقه)\u200c(?!ی)/g, '$1 ');
  s = s.replace(/(طبقه|طیقه)\u200cی/g, '$1 ی');
  s = s.replace(/(پاساژ|مجتمع)(?=[آ-ی])/g, '$1 ').replace(/(پاساژ|مجتمع|ساختمان)\u200c/g, '$1 ');
  // «۱+» / «+۱» stay together; «2 -» separate. Split "word(" → "word (".
  s = s.replace(/([^\s(])\(/g, '$1 (');
  return s;
}

/** Split into segments on strong delimiters. Parenthesized text becomes its own segment. */
export function splitSegments(s: string): string[] {
  return s
    .replace(/[()]/g, '،')
    .split(/[،,؛;|٬]|\.(?![0-9۰-۹٠-٩])|\s[-–—]\s|\s\/\s/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// ───────────────────────── main parser ─────────────────────────

type ClauseType = 'mall' | 'floor' | 'unit' | 'plaque' | 'wing' | 'landmark' | 'street' | 'other';

interface Clause {
  type: ClauseType;
  toks: Tok[];
  /** global order (segment index * 1000 + token index) */
  order: number;
  mallKind?: MallKind;
  /** first token index (within toks) where the name starts (mall) */
  nameStart?: number;
  floor?: FloorParse;
  code?: string;
  /** landmark that directly governs a mall mention («روبروی پاساژ X») */
  governsMall?: boolean;
  /** «داخل/انتهای پاساژ X» */
  insideMall?: boolean;
  /** landmark: number of tokens of the prefix phrase («روبه روی» = 2) */
  prefixLen?: number;
}

function mallKindAt(toks: readonly Tok[], i: number): { kind: MallKind; len: number } | null {
  for (const { p, kind } of MALL_PREFIX) {
    const len = matchPhrase(toks, i, p);
    if (len) return { kind, len };
  }
  return null;
}

/** Find a «X مال / X سنتر / X پلازا» suffix-style mall inside tokens [from, to). */
function suffixMallEnd(toks: readonly Tok[], from: number): number {
  for (let j = from + 1; j < Math.min(toks.length, from + 4); j++) {
    if (MALL_SUFFIX.has(toks[j]!.n)) return j;
    if (isBoundary(toks, j)) return -1;
  }
  return -1;
}

function scanSegment(seg: string, segIndex: number, out: Clause[]): void {
  const toks = seg
    .split(/\s+/)
    .map(tok)
    .filter((t) => t.raw !== '' || t.n !== '');
  let cur: Clause | null = null;
  const push = (c: Clause) => {
    out.push(c);
    cur = c;
  };
  let i = 0;
  while (i < toks.length) {
    const t = toks[i]!;
    const order = segIndex * 1000 + i;
    const curType = (cur as Clause | null)?.type ?? null;

    // landmark prefix
    const lm = matchPhrase(toks, i, LANDMARK_PREFIX);
    if (lm) {
      const c: Clause = { type: 'landmark', toks: toks.slice(i, i + lm), order, prefixLen: lm };
      // a mall right after the landmark word belongs to the landmark
      const mk = mallKindAt(toks, i + lm);
      if (mk || suffixMallEnd(toks, i + lm - 1) === i + lm + 1) c.governsMall = true;
      push(c);
      i += lm;
      if (mk) {
        // swallow the governed mall phrase (kind + name) into the landmark
        let j = i + mk.len;
        while (j < toks.length && j < i + mk.len + 5 && !isBoundary(toks, j) && !mallKindAt(toks, j)) j++;
        c.toks.push(...toks.slice(i, j));
        i = j;
      }
      continue;
    }

    // inside-mall position words: «داخل پاساژ X», «انتهای پاساژ»
    const ins = matchPhrase(toks, i, INSIDE_PREFIX);
    if (ins && mallKindAt(toks, i + ins)) {
      const mk = mallKindAt(toks, i + ins)!;
      const nameStart = i + ins + mk.len;
      let j = nameStart;
      while (j < toks.length && j < nameStart + 5 && !isBoundary(toks, j)) j++;
      if (j > nameStart && !(j === nameStart + 1 && toks[nameStart]!.n === 'طبقه')) {
        push({ type: 'mall', toks: toks.slice(i + ins, j), order, mallKind: mk.kind, nameStart: mk.len, insideMall: true });
      } else {
        // unnamed: position inside the shop's mall («انتهای پاساژ»)
        push({ type: 'wing', toks: toks.slice(i, i + ins + mk.len), order });
      }
      i = j > nameStart ? j : i + ins + mk.len;
      continue;
    }
    if (ins && i + ins < toks.length && /^(سالن|راهرو|راهروی|طبقه|راه)$/.test(toks[i + ins]!.n) && toks[i]!.n !== 'اول' && toks[i]!.n !== 'آخر') {
      let j = i + ins + 1;
      if (toks[i + ins]!.n === 'راه' && toks[j]?.n === 'پله') j++;
      push({ type: 'wing', toks: toks.slice(i, j), order });
      i = j;
      continue;
    }

    // floor keyword
    if (FLOOR_WORDS.has(t.n)) {
      const fp = parseFloorTokens(toks, i + 1, false);
      const used = fp ? fp.used : 0;
      push({ type: 'floor', toks: toks.slice(i, i + 1 + used), order, ...(fp ? { floor: fp } : {}) });
      i += 1 + used;
      // trailing direction («طبقه اول جنوبی») → wing
      if (fp && i < toks.length && DIRECTION.has(toks[i]!.n)) {
        push({ type: 'wing', toks: [{ raw: 'سمت', n: 'سمت' }, toks[i]!], order: order + 1 });
        i++;
      }
      continue;
    }
    const sf = matchPhrase(toks, i, STANDALONE_FLOOR);
    if (sf) {
      const fp = parseFloorTokens(toks, i, true);
      if (fp) {
        push({ type: 'floor', toks: toks.slice(i, i + fp.used), order, floor: fp });
        i += Math.max(1, fp.used);
        continue;
      }
    }

    // unit / plaque
    if (UNIT_WORDS.has(t.n) || PLAQUE_WORDS.has(t.n)) {
      const isPlaque = PLAQUE_WORDS.has(t.n);
      // «واحد همکف» → floor, not unit
      const fp = parseFloorTokens(toks, i + 1, true);
      if (fp && !isPlaque) {
        push({ type: 'floor', toks: toks.slice(i, i + 1 + fp.used), order, floor: fp });
        i += 1 + fp.used;
        continue;
      }
      const code = parseCode(toks, i + 1);
      if (code) {
        const prefix = t.n === 'کانتر' || t.n === 'غرفه' ? `${t.raw} ` : '';
        push({ type: isPlaque ? 'plaque' : 'unit', toks: toks.slice(i, i + 1 + code.used), order, code: prefix + code.code });
        i += 1 + code.used;
      } else if (cur && curType === 'landmark') {
        // «روبروی پلاک سنگی» — part of the landmark phrase
        (cur as Clause).toks.push(t);
        i++;
      } else {
        push({ type: 'other', toks: [t], order });
        i++;
      }
      continue;
    }

    // wing
    if (WING_WORDS.has(t.n) && i + 1 < toks.length) {
      let j = i + 1;
      while (j < toks.length && j < i + 5 && !isBoundary(toks, j) && !mallKindAt(toks, j)) j++;
      push({ type: 'wing', toks: toks.slice(i, j), order });
      i = j;
      continue;
    }

    // mall (prefix kind word). Inside an open mall name, kind words are part of the name.
    const mk = mallKindAt(toks, i);
    if (mk && curType !== 'mall') {
      let nameStart = i + mk.len;
      if (mk.kind === 'complex') while (nameStart < toks.length && KIND_QUALIFIERS.has(toks[nameStart]!.n)) nameStart++;
      let j = nameStart;
      while (j < toks.length && j < nameStart + 5 && !isBoundary(toks, j)) j++;
      // suffix kind words inside the name («مجتمع کوروش مال») are fine.
      push({ type: 'mall', toks: toks.slice(i, j), order, mallKind: mk.kind, nameStart: nameStart - i });
      i = j;
      continue;
    }

    // suffix-style mall: «کوروش مال», «یاس سنتر»
    if (!STREET_WORDS.has(t.n) && curType !== 'mall') {
      const end = suffixMallEnd(toks, i);
      if (end > i) {
        push({ type: 'mall', toks: toks.slice(i, end + 1), order, mallKind: 'mall', nameStart: 0 });
        i = end + 1;
        continue;
      }
    }

    if (STREET_WORDS.has(t.n)) {
      if (cur && curType === 'landmark') {
        (cur as Clause).toks.push(t);
        i++;
        continue;
      }
      push({ type: 'street', toks: [t], order });
      i++;
      continue;
    }
    // plain word: extend the current clause (street names, landmark objects, mall names)
    if (cur && (curType === 'street' || curType === 'landmark' || curType === 'other' || curType === 'wing')) {
      (cur as Clause).toks.push(t);
    } else {
      push({ type: 'other', toks: [t], order });
    }
    i++;
  }
}

const KIND_SPECIFICITY: Record<MallKind, number> = {
  bazaar: 0,
  building: 1,
  tower: 2,
  complex: 3,
  mall: 3,
  sara: 3,
  passage: 3,
};

function mallFromClause(c: Clause): MallMention | null {
  const nameToks = c.toks.slice(c.nameStart ?? 0);
  const nameRaw = nameToks.map((t) => t.raw).filter(Boolean);
  if (!nameRaw.length) return null;
  const display = displayName(c.toks.map((t) => t.raw));
  const key = mallKey(display);
  if (!key || key.length < 2) return null;
  // a name that is only a number word or a direction is not a name («پاساژ اول», «ساختمان شمالی»)
  if (/^(\d+|شمالی|جنوبی|شرقی|غربی|اصلی|جدید|قدیم|بزرگ)$/.test(key) && c.mallKind !== 'passage') return null;
  return { kind: c.mallKind ?? 'passage', name: display, key, skeleton: mallSkeleton(key) };
}

function wingDisplay(c: Clause): string | null {
  const raws = c.toks.map((t) => t.raw).filter(Boolean);
  if (raws.length < 2) return null;
  let s = cleanFa(toPersianDigits(raws.join(' '))).replace(/\u200c/g, ' ');
  s = s.replace(/^راهرو\s/, 'راهروی ').replace(/^ورودیه\s/, 'ورودی ').replace(/^حیات\s/, 'حیاط ');
  return s.replace(/[\s\-–_:.]+$/g, '').trim() || null;
}

export function parseAddress(address: string | null | undefined): ParsedAddress {
  const empty: ParsedAddress = {
    mall: null,
    floorLabel: null,
    floorNum: null,
    unit: null,
    plaque: null,
    wing: null,
    landmark: null,
    confidence: 'low',
  };
  if (!address || !address.trim()) return empty;
  const clauses: Clause[] = [];
  splitSegments(preClean(address)).forEach((seg, k) => scanSegment(seg, k, clauses));

  // shop's mall: the most specific mall clause (landmark-governed mentions were folded into landmarks).
  // «بازار تجریش، پاساژ قائم» → پاساژ قائم; same specificity → the later (more specific) mention.
  let mall: MallMention | null = null;
  let mallOrder = -1;
  let mallRank = -1;
  for (const c of clauses) {
    if (c.type !== 'mall') continue;
    const m = mallFromClause(c);
    if (!m) continue;
    const rank = KIND_SPECIFICITY[m.kind];
    if (rank >= mallRank) {
      mall = m;
      mallOrder = c.order;
      mallRank = rank;
    }
  }

  let floor: FloorParse | null = null;
  let unit: string | null = null;
  let plaque: string | null = null;
  let wing: string | null = null;
  for (const c of clauses) {
    if (c.type === 'floor' && c.floor && !floor) floor = c.floor;
    else if (c.type === 'unit' && c.code && !unit) unit = unitDisplay(c.code);
    else if (c.type === 'plaque' && c.code && !plaque) plaque = displayCode(c.code);
  }
  const inBuilding = !!mall || !!floor;
  if (inBuilding) {
    for (const c of clauses) {
      if (c.type !== 'wing') continue;
      // street-level «ضلع شمالی میدان …» before the mall is not an in-mall wing
      const txt = c.toks.map((t) => t.n).join(' ');
      if (c.order < mallOrder && /(میدان|خیابان|پل|بزرگراه|کوچه|بلوار)/.test(txt)) continue;
      if (/^(ورودی|ورودیه)\s/.test(txt) && /(خیابان|کوچه|پارکینگ|بانک)/.test(txt)) continue;
      const w = wingDisplay(c);
      if (w) {
        wing = w;
        break;
      }
    }
  }

  // landmark: prefer one after the mall (in-mall), then one that names a notable place, then the last one
  const lms = clauses.filter((c) => c.type === 'landmark' && c.toks.length > (c.prefixLen ?? 1));
  let landmark: string | null = null;
  if (lms.length) {
    const after = mallOrder >= 0 ? lms.filter((c) => c.order > mallOrder) : [];
    const inMall = lms.filter((c) => IN_MALL_LANDMARK.test(c.toks.map((t) => t.n).join(' ')));
    const notable = lms.filter((c) => NOTABLE_LANDMARK.test(c.toks.map((t) => t.n).join(' ')));
    const pick = inMall[0] ?? after[0] ?? notable[notable.length - 1] ?? lms[lms.length - 1]!;
    // «بین X و Y» is a street description, only used when nothing better exists
    const best = pick.toks[0]!.n === 'بین' ? (lms.find((c) => c.toks[0]!.n !== 'بین') ?? pick) : pick;
    landmark = landmarkDisplay(best.toks.map((t) => t.raw));
    if (landmark.length > 70) landmark = landmark.slice(0, 70).replace(/\s+\S*$/, '') + '…';
  }

  const hasUnit = !!unit || !!plaque;
  const parts = [!!mall, !!floor, hasUnit].filter(Boolean).length;
  const confidence: LocConfidence = parts === 3 ? 'high' : parts === 2 ? 'medium' : 'low';
  return {
    mall,
    floorLabel: floor ? floor.label : null,
    floorNum: floor ? floor.num : null,
    unit,
    plaque,
    wing,
    landmark,
    confidence,
  };
}
