/**
 * Persian text utilities. The SAME normalizer must be used when building the search
 * index (ETL) and when parsing queries (server) — otherwise matches silently fail.
 */

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert Persian/Arabic-Indic digits to ASCII digits. */
export function toLatinDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p >= 0) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    out += a >= 0 ? String(a) : ch;
  }
  return out;
}

/** Convert ASCII digits to Persian digits (display only). */
export function toPersianDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]!);
}

/**
 * Light normalization for DISPLAY: unify Arabic letter variants, strip tatweel/diacritics,
 * collapse whitespace. Keeps digits, ZWNJ and punctuation as written.
 */
export function cleanFa(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[ً-ٰٟ]/g, '')
    .replace(/[‎‏﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Aggressive normalization for SEARCH/MATCHING (index + query):
 *  - NFKC (folds Arabic presentation forms), Arabic→Persian letters, hamza/alef variants folded
 *  - diacritics, tatweel, ZWNJ/ZWJ/bidi marks removed (ZWNJ → space)
 *  - Persian/Arabic digits → ASCII; Latin lowercased
 *  - digit↔letter boundaries split ("a52" → "a 52", "128gb" → "128 gb")
 *  - any non letter/number → single space
 */
export function normalizeForSearch(input: string | null | undefined): string {
  if (!input) return '';
  let s = input.normalize('NFKC');
  s = s
    .replace(/[يىئ]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/[أإٱآ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    .replace(/ـ/g, '')
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/[‌‍]/g, ' ')
    .replace(/[‎‏﻿]/g, '');
  s = toLatinDigits(s).toLowerCase();
  s = s.replace(/(\d)(\p{L})/gu, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2');
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}

/** Tokenize normalized search text. */
export function tokenize(input: string): string[] {
  const n = normalizeForSearch(input);
  return n ? n.split(' ') : [];
}

/** Very small Persian stop-word list for query parsing (not used at index time). */
export const FA_STOPWORDS = new Set([
  'و',
  'یا',
  'با',
  'به',
  'از',
  'در',
  'تو',
  'برای',
  'برا',
  'که',
  'این',
  'اون',
  'آن',
  'یه',
  'یک',
  'رو',
  'را',
  'هم',
  'من',
  'میخوام',
  'می',
  'خوام',
  'میخواهم',
  'خواهم',
  'لطفا',
  'لطفاً',
  'دنبال',
  'هستم',
  'میگردم',
  'بگرد',
  'پیدا',
  'کن',
  'کنید',
  'بده',
  'نشون',
  'نشان',
  'چی',
  'چه',
  'کدوم',
  'کدام',
  'مدل',
  'خوب',
  'خرید',
  'بخرم',
  'میخرم',
  'یک',
  'ای',
  'ی',
  'است',
  'هست',
  'باشه',
  'باشد',
]);

/** Remove a few common Persian plural/ezafe suffixes for lenient query matching. */
export function lightStem(token: string): string {
  if (token.length <= 3) return token;
  for (const suf of ['های', 'ها', 'هایی', 'ات']) {
    if (token.endsWith(suf) && token.length - suf.length >= 3) return token.slice(0, -suf.length);
  }
  return token;
}

/** Slugify a Persian/Latin name for URLs (keeps Persian letters). */
export function slugifyFa(input: string): string {
  return normalizeForSearch(input).replace(/\s+/g, '-').slice(0, 80) || 'x';
}
