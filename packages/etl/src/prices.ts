/**
 * Registered-price validation (docs/ARCHITECTURE.md §4 rule 2).
 *
 *  - missing   : empty / `null` / 0
 *  - suspicious: > 10B Toman or < 1,000 Toman, or — when the product has ≥3 plausible prices —
 *                more than 8× above / below the product median
 *  - ok        : everything else (only these feed stats & ranking)
 *
 * The raw registered value is always preserved (`raw_price`) for transparency. Values beyond
 * JavaScript's safe-integer range (a handful of absurd entries up to 7e17) are clamped in
 * `raw_price` because node:sqlite refuses to read them back as numbers; the exact digits are kept
 * in `raw_price_text`.
 */
import type { PriceStatus } from '@titl/shared';
import { median } from './util.js';

export const PRICE_MAX_PLAUSIBLE = 1e10;
export const PRICE_MIN_PLAUSIBLE = 1_000;
export const PRICE_OUTLIER_FACTOR = 8;
export const PRICE_MIN_FOR_RELATIVE_TEST = 3;

export interface RawPrice {
  /** Registered value as a JS-safe integer (clamped), or null when not registered. */
  raw: number | null;
  /** Exact registered digits when the value had to be clamped, else null. */
  rawText: string | null;
}

export function parseRawPrice(v: string | null | undefined): RawPrice {
  if (v === null || v === undefined) return { raw: null, rawText: null };
  const s = v.trim();
  if (s === '' || s === 'null' || s === 'None') return { raw: null, rawText: null };
  const n = Number(s);
  if (!Number.isFinite(n)) return { raw: null, rawText: null };
  if (Math.abs(n) > Number.MAX_SAFE_INTEGER) {
    return { raw: Math.sign(n) * Number.MAX_SAFE_INTEGER, rawText: s };
  }
  return { raw: Math.round(n), rawText: null };
}

export interface PriceVerdict {
  status: PriceStatus;
  /** Valid price (status ok) or null. */
  price: number | null;
  /** Why it was flagged (for the data report). */
  rule: 'missing' | 'too_high' | 'too_low' | 'outlier_high' | 'outlier_low' | null;
}

function isPlausible(raw: number): boolean {
  return raw >= PRICE_MIN_PLAUSIBLE && raw <= PRICE_MAX_PLAUSIBLE;
}

/**
 * Classify all registered prices of ONE product together (the relative test needs the product median).
 * Returns verdicts in input order plus the median used for the relative test.
 */
export function classifyProductPrices(raws: readonly (number | null)[]): { verdicts: PriceVerdict[]; median: number | null } {
  const plausible = raws.filter((r): r is number => r !== null && r > 0 && isPlausible(r));
  const med = plausible.length >= PRICE_MIN_FOR_RELATIVE_TEST ? median(plausible) : null;
  const verdicts = raws.map((raw): PriceVerdict => {
    if (raw === null || raw <= 0) return { status: 'missing', price: null, rule: 'missing' };
    if (raw > PRICE_MAX_PLAUSIBLE) return { status: 'suspicious', price: null, rule: 'too_high' };
    if (raw < PRICE_MIN_PLAUSIBLE) return { status: 'suspicious', price: null, rule: 'too_low' };
    if (med !== null) {
      if (raw > med * PRICE_OUTLIER_FACTOR) return { status: 'suspicious', price: null, rule: 'outlier_high' };
      if (raw < med / PRICE_OUTLIER_FACTOR) return { status: 'suspicious', price: null, rule: 'outlier_low' };
    }
    return { status: 'ok', price: raw, rule: null };
  });
  return { verdicts, median: med };
}

export interface ProductPriceStats {
  min: number | null;
  max: number | null;
  median: number | null;
  validCount: number;
  missingCount: number;
  suspiciousCount: number;
}

export function priceStats(verdicts: readonly PriceVerdict[]): ProductPriceStats {
  const ok: number[] = [];
  let missing = 0;
  let suspicious = 0;
  for (const v of verdicts) {
    if (v.status === 'ok' && v.price !== null) ok.push(v.price);
    else if (v.status === 'missing') missing++;
    else suspicious++;
  }
  ok.sort((a, b) => a - b);
  const med = median(ok);
  return {
    min: ok.length ? ok[0]! : null,
    max: ok.length ? ok[ok.length - 1]! : null,
    median: med === null ? null : Math.round(med),
    validCount: ok.length,
    missingCount: missing,
    suspiciousCount: suspicious,
  };
}
