/**
 * Specs compaction & spec facets (docs/ARCHITECTURE.md §4 rule 9).
 *
 * Raw: `[{"key": "...", "section": "مشخصات کلی", "value": "..."}, …]`.
 * Compact: `[[key, value], …]` — trimmed, cleaned (Arabic letters → Persian), de-duplicated; the section
 * is appended as a 3rd element only when it is not the default «مشخصات کلی».
 *
 * Facets: per leaf category, keys present in ≥ 30 % of its products with 2–25 distinct normalized values
 * (values split on «،»/«,», units unified: «گیگابایت» → «GB» …). Free-text keys are never facets.
 */
import { cleanFa, toLatinDigits } from '@titl/shared';

export type SpecTuple = [string, string] | [string, string, string];

const DEFAULT_SECTION = 'مشخصات کلی';
const MAX_VALUE_LEN = 160;
const MAX_SPECS = 30;

export interface CompactSpecs {
  specs: SpecTuple[];
  /** value of «نام محصول» (used for title_en) */
  productName: string | null;
}

export function compactSpecs(raw: unknown): CompactSpecs {
  if (!Array.isArray(raw)) return { specs: [], productName: null };
  const seen = new Set<string>();
  const specs: SpecTuple[] = [];
  let productName: string | null = null;
  for (const item of raw) {
    if (specs.length >= MAX_SPECS) break;
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const key = typeof o.key === 'string' ? cleanFa(o.key).replace(/[:：]\s*$/, '') : '';
    let value = typeof o.value === 'string' ? cleanFa(o.value) : typeof o.value === 'number' ? String(o.value) : '';
    if (!key || !value || value === '-' || value === '—' || value === 'null' || value === 'None') continue;
    if (value.length > MAX_VALUE_LEN) value = value.slice(0, MAX_VALUE_LEN).replace(/\s+\S*$/, '') + '…';
    const dedupe = `${key}\u0000${value}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const section = typeof o.section === 'string' ? cleanFa(o.section) : '';
    specs.push(section && section !== DEFAULT_SECTION ? [key, value, section] : [key, value]);
    if (!productName && key === 'نام محصول') productName = value;
  }
  return { specs, productName };
}

// ───────────────────────── facets ─────────────────────────

/** Keys that are free text / identifiers / continuous measures — never facets. */
const NON_FACET_KEY =
  /(توضیح|ابعاد|وزن|نام محصول|تاریخ|سایر|ویژگی|امکانات|قابلیت های|محتویات|اقلام|همراه|مدل|کد|شناسه|لینک|آدرس|شماره|سریال|بارکد|نکته|نکات|هشدار|اطلاعات|شرح|ترکیبات|مواد تشکیل|طول|عرض|ارتفاع|قطر|اندازه دقیق|سازنده)/;

const UNIT_RULES: [RegExp, string][] = [
  [/(\d)\s*(?:گیگابایت|گیگ|gb)(?![\p{L}])/giu, '$1 GB'],
  [/(\d)\s*(?:مگابایت|mb)(?![\p{L}])/giu, '$1 MB'],
  [/(\d)\s*(?:ترابایت|tb)(?![\p{L}])/giu, '$1 TB'],
  [/(\d)\s*(?:مگاپیکسل|mp)(?![\p{L}])/giu, '$1 MP'],
  [/(\d)\s*(?:میلی\s*\u200c?\s*آمپر\s*\u200c?\s*ساعت|mah)(?![\p{L}])/giu, '$1 mAh'],
  [/(\d)\s*(?:گیگاهرتز|ghz)(?![\p{L}])/giu, '$1 GHz'],
  [/(\d)\s*(?:مگاهرتز|mhz)(?![\p{L}])/giu, '$1 MHz'],
];

/** Normalize a facet value for grouping & display (Latin digits, unified units, tidy spacing). */
export function normalizeFacetValue(value: string): string {
  let v = toLatinDigits(cleanFa(value));
  for (const [re, rep] of UNIT_RULES) v = v.replace(re, rep);
  v = v.replace(/\s+/g, ' ').replace(/^[\s\-–:]+|[\s\-–:.]+$/g, '').trim();
  // «دارد»/«بله» and «ندارد»/«خیر» are the same answers
  if (v === 'بله') v = 'دارد';
  if (v === 'خیر') v = 'ندارد';
  return v;
}

export function isFacetKey(key: string): boolean {
  return key.length <= 40 && !NON_FACET_KEY.test(key);
}

/** (DT7) List-valued keys: «سایز», «سایز بندی», «رنگ», «رنگ‌بندی» (ZWNJ/space-insensitive). */
export function isListKey(key: string): 'size' | 'color' | null {
  const k = key.replace(/[\u200c\s]/g, '');
  if (/^سایز(بندی)?$/.test(k)) return 'size';
  if (/^رنگ(بندی)?$/.test(k)) return 'color';
  return null;
}

/** Two-word colour names that must not be split on the space. */
const COLOR_SECOND_WORDS = /^(ای|‌ای|روشن|تیره|نفتی|کاربنی|یخی|سیر|کمرنگ|پررنگ|متالیک|براق|مات)$/;

/** Split a size value: «41, 42 43/44», «40 تا 45» (numeric range expanded), «سایز34» → «34». */
function splitSizes(value: string): string[] {
  const v = toLatinDigits(value).replace(/\([^)]*\)/g, ' ');
  const out: string[] = [];
  for (const m of v.matchAll(/(\d{2})\s*(?:تا|-|–)\s*(\d{2})/g)) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (b > a && b - a <= 15) for (let i = a; i <= b; i++) out.push(String(i));
  }
  const rest = v.replace(/(\d{2})\s*(?:تا|-|–)\s*(\d{2})/g, ' ');
  for (const t of rest.split(/[،,؛/\s]+/)) {
    const tok = t.replace(/^سایز/, '').trim();
    if (tok) out.push(tok);
  }
  return out;
}

/** Split a colour value on separators and spaces, keeping two-word colours («سرمه ای», «آبی روشن»). */
function splitColors(value: string): string[] {
  const out: string[] = [];
  for (const part of value.split(/[،,؛/\-]+/)) {
    const words = part.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const next = words[i + 1];
      if (next && COLOR_SECOND_WORDS.test(next)) {
        out.push(`${words[i]} ${next}`);
        i++;
      } else out.push(words[i]!);
    }
  }
  return out;
}

/** Facet values of one spec value (split on «،» / «,»; list keys also on spaces — DT7; each ≤ 40 chars). */
export function facetValues(value: string, key?: string): string[] {
  if (value.length > 160 || value.includes('\n')) return [];
  const list = key ? isListKey(key) : null;
  const raw = list === 'size' ? splitSizes(value) : list === 'color' ? splitColors(value) : value.split(/[،,؛]/);
  const parts = raw.map(normalizeFacetValue).filter((p) => p.length >= 1 && p.length <= 40);
  return [...new Set(parts)].slice(0, list ? 16 : 8);
}

export const FACET_MIN_COVERAGE = 0.3;
export const FACET_MIN_VALUES = 2;
export const FACET_MAX_VALUES = 25;
export const FACET_MIN_PRODUCTS = 8;
export const FACET_MAX_KEYS_PER_CATEGORY = 8;

interface KeyStat {
  products: number;
  values: Map<string, number>;
  overflow: boolean;
}

/** Per-category accumulator (pass 1) → facet keys per category (used in pass 2). */
export class FacetPlanner {
  private cats = new Map<string, { products: number; keys: Map<string, KeyStat> }>();

  addProduct(category: string, specs: readonly SpecTuple[]): void {
    let c = this.cats.get(category);
    if (!c) this.cats.set(category, (c = { products: 0, keys: new Map() }));
    c.products++;
    const seenKeys = new Set<string>();
    for (const [key, value] of specs) {
      if (seenKeys.has(key) || !isFacetKey(key)) continue;
      const vals = facetValues(value, key);
      if (!vals.length) continue;
      seenKeys.add(key);
      let ks = c.keys.get(key);
      if (!ks) c.keys.set(key, (ks = { products: 0, values: new Map(), overflow: false }));
      ks.products++;
      if (ks.overflow) continue;
      for (const v of vals) ks.values.set(v, (ks.values.get(v) ?? 0) + 1);
      if (ks.values.size > FACET_MAX_VALUES) {
        ks.overflow = true;
        ks.values.clear();
      }
    }
  }

  /** category → selected facet keys (ordered by coverage). */
  plan(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [cat, c] of this.cats) {
      if (c.products < FACET_MIN_PRODUCTS) continue;
      const keys = [...c.keys.entries()]
        .filter(([, ks]) => !ks.overflow && ks.products / c.products >= FACET_MIN_COVERAGE && ks.values.size >= FACET_MIN_VALUES)
        .sort((a, b) => b[1].products - a[1].products || a[0].localeCompare(b[0]))
        .slice(0, FACET_MAX_KEYS_PER_CATEGORY)
        .map(([k]) => k);
      if (keys.length) out.set(cat, keys);
    }
    return out;
  }
}

/** Facet rows of one product given its category's selected keys. */
export function productFacetRows(specs: readonly SpecTuple[], keys: readonly string[] | undefined): [string, string][] {
  if (!keys || !keys.length) return [];
  const want = new Set(keys);
  const out: [string, string][] = [];
  const seen = new Set<string>();
  for (const [key, value] of specs) {
    if (!want.has(key)) continue;
    for (const v of facetValues(value, key)) {
      const k = `${key}\u0000${v}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push([key, v]);
    }
  }
  return out;
}
