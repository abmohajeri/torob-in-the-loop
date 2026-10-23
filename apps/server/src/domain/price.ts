/**
 * Price helpers (pure). Registered prices are NEVER presented as confirmed: they carry their
 * status (ok / missing / suspicious), change date and freshness.
 */
import type { Freshness, PriceStats, PriceStatus, PriceTier, RegisteredPrice } from '@titl/shared';
import { ageDays, formatTomanShort, freshnessOf } from '@titl/shared';

export interface OfferPriceRow {
  price: number | null;
  raw_price: number | null;
  price_status: string;
  price_changed_at: string | null;
  /** (DT2) why not ok, when selected */
  price_rule?: string | null;
}

/** (DT2) Persian explanation of a non-ok registered price. */
export const PRICE_RULE_NOTE: Record<string, string> = {
  missing: 'قیمت اعلام نشده — بپرسید',
  too_low: 'قیمت نامعتبر (احتمالاً تماسی)',
  too_high: 'قیمت ثبت‌شده غیرعادی است (بیش از ۱۰ میلیارد تومان)',
  outlier_high: 'قیمت ثبت‌شده خیلی بالاتر از سایر فروشنده‌هاست',
  outlier_low: 'قیمت ثبت‌شده خیلی پایین‌تر از سایر فروشنده‌هاست',
  category_low: 'قیمت ثبت‌شده برای این دسته غیرعادی پایین است',
  category_high: 'قیمت ثبت‌شده برای این دسته غیرعادی بالاست',
  model_outlier: 'قیمت خیلی پایین‌تر از مدل‌های هم‌نام — احتمالاً طرح یا خطای ثبت',
};

export function priceNoteOf(status: PriceStatus, rule: string | null | undefined): string | null {
  if (status === 'ok') return null;
  if (status === 'missing') return PRICE_RULE_NOTE.missing!;
  return (rule && PRICE_RULE_NOTE[rule]) || 'قیمت ثبت‌شده غیرعادی است';
}

/** SV4: «احتمالاً قیمت قدیمی» — older than 30 d and below 0.8 × the fresh median. */
export const OUTDATED_MIN_AGE_DAYS = 30;
export const OUTDATED_FACTOR = 0.8;
export const FRESH_MEDIAN_MIN = 3;

export function isLikelyOutdated(p: RegisteredPrice, freshMedian: number | null | undefined): boolean {
  return (
    p.price !== null &&
    freshMedian != null &&
    p.ageDays !== null &&
    p.ageDays > OUTDATED_MIN_AGE_DAYS &&
    p.price < OUTDATED_FACTOR * freshMedian
  );
}

/** Median of valid prices ≤ 14 d old (vs the snapshot), only with ≥ 3 such prices (SV4). */
export function freshMedianOf(rows: OfferPriceRow[], asOf: Date): number | null {
  const v: number[] = [];
  for (const r of rows) {
    if (r.price_status !== 'ok' || r.price === null || r.price <= 0) continue;
    if (freshnessOf(r.price_changed_at, asOf) === 'fresh') v.push(r.price);
  }
  if (v.length < FRESH_MEDIAN_MIN) return null;
  v.sort((a, b) => a - b);
  return Math.round(quantileSorted(v, 0.5)!);
}

export function asPriceStatus(s: string | null | undefined): PriceStatus {
  return s === 'ok' || s === 'missing' || s === 'suspicious' ? s : 'missing';
}

export function registeredPriceOf(row: OfferPriceRow, now: Date): RegisteredPrice {
  const status = asPriceStatus(row.price_status);
  const age = ageDays(row.price_changed_at, now);
  const eff: PriceStatus = status === 'ok' && (row.price === null || row.price <= 0) ? 'missing' : status;
  return {
    price: status === 'ok' && row.price !== null && row.price > 0 ? row.price : null,
    rawPrice: row.raw_price ?? null,
    status: eff,
    note: priceNoteOf(eff, row.price_rule),
    changedAt: row.price_changed_at ?? null,
    ageDays: age === null ? null : Math.round(age * 10) / 10,
    freshness: freshnessOf(row.price_changed_at, now),
  };
}

/** Pick the representative offer of a shop: lowest valid price; otherwise newest; otherwise first. */
export function bestOfferIndex(rows: OfferPriceRow[]): number {
  let best = -1;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (r.price_status !== 'ok' || r.price === null || r.price <= 0) continue;
    if (best < 0 || r.price < rows[best]!.price!) best = i;
  }
  if (best >= 0) return best;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    if (best < 0 || (r.price_changed_at ?? '') > (rows[best]!.price_changed_at ?? '')) best = i;
  }
  return Math.max(0, best);
}

/** Linear-interpolated quantile of a SORTED ascending array. */
export function quantileSorted(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0]!;
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo]!;
  const b = sorted[hi]!;
  return a + (b - a) * (pos - lo);
}

export function median(values: number[]): number | null {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return quantileSorted(s, 0.5);
}

/** Round a Toman amount to a "nice" number for chips (2 significant digits, ≥ 1000). */
export function niceRound(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n < 1000) return Math.round(n);
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  const step = mag >= 1000 ? mag : 1000;
  const r = Math.round(n / step) * step;
  // prefer half-steps for readability, e.g. 2_350_000 → 2_400_000, 12_700_000 → 13_000_000
  return Math.max(step, r);
}

export function priceStatsOf(rows: OfferPriceRow[], now: Date): PriceStats {
  const valid: number[] = [];
  let missing = 0;
  let suspicious = 0;
  const buckets: Record<Freshness, number> = { fresh: 0, recent: 0, stale: 0, very_stale: 0, unknown: 0 };
  let newest: string | null = null;
  let oldest: string | null = null;
  for (const r of rows) {
    const status = asPriceStatus(r.price_status);
    if (status === 'ok' && r.price !== null && r.price > 0) valid.push(r.price);
    else if (status === 'suspicious') suspicious++;
    else missing++;
    buckets[freshnessOf(r.price_changed_at, now)]++;
    if (r.price_changed_at) {
      if (!newest || r.price_changed_at > newest) newest = r.price_changed_at;
      if (!oldest || r.price_changed_at < oldest) oldest = r.price_changed_at;
    }
  }
  valid.sort((a, b) => a - b);
  return {
    min: valid.length ? valid[0]! : null,
    median: valid.length ? Math.round(quantileSorted(valid, 0.5)!) : null,
    max: valid.length ? valid[valid.length - 1]! : null,
    validCount: valid.length,
    missingCount: missing,
    suspiciousCount: suspicious,
    freshnessBuckets: buckets,
    newest,
    oldest,
    freshMedian: freshMedianOf(rows, now),
  };
}

const TIER_LABEL: Record<PriceTier['id'], string> = {
  budget: 'اقتصادی',
  mid: 'میان‌رده',
  premium: 'بالارده',
  luxury: 'لوکس',
};

/**
 * Price tiers from quantiles of candidate (median) prices:
 * budget ≤ p25 < mid ≤ p75 < premium ≤ p90 < luxury. Boundaries are rounded to nice numbers.
 */
export function priceTiersOf(values: number[]): PriceTier[] {
  const s = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (s.length < 4) return [];
  const p25 = niceRound(quantileSorted(s, 0.25)!);
  const p75 = niceRound(quantileSorted(s, 0.75)!);
  const p90 = niceRound(quantileSorted(s, 0.9)!);
  const bounds: { id: PriceTier['id']; min: number | null; max: number | null }[] = [
    { id: 'budget', min: null, max: p25 },
    { id: 'mid', min: p25, max: p75 },
    { id: 'premium', min: p75, max: p90 },
    { id: 'luxury', min: p90, max: null },
  ];
  const tiers: PriceTier[] = [];
  for (const b of bounds) {
    if (b.min !== null && b.max !== null && b.max <= b.min) continue;
    const count = s.filter((v) => (b.min === null || v > b.min) && (b.max === null || v <= b.max)).length;
    if (!count) continue;
    tiers.push({ id: b.id, label: `${TIER_LABEL[b.id]} · ${budgetLabel(b.min, b.max)}`, min: b.min, max: b.max, count });
  }
  return tiers;
}

/** «تا ۲۵ میلیون تومان», «بالای ۱۰ میلیون تومان», «۵ تا ۸ میلیون تومان». */
export function budgetLabel(min: number | null | undefined, max: number | null | undefined): string {
  const lo = min ?? null;
  const hi = max ?? null;
  if (lo !== null && hi !== null) {
    if (lo === hi) return formatTomanShort(lo);
    const sameUnit = (lo >= 1e6) === (hi >= 1e6) && (lo >= 1e9) === (hi >= 1e9);
    return sameUnit ? `${formatTomanShort(lo, false).replace(/ (میلیون|میلیارد|هزار)$/, '')} تا ${formatTomanShort(hi)}` : `${formatTomanShort(lo, false)} تا ${formatTomanShort(hi)}`;
  }
  if (hi !== null) return `تا ${formatTomanShort(hi)}`;
  if (lo !== null) return `بالای ${formatTomanShort(lo)}`;
  return 'بدون محدودیت';
}

/** Does [pMin, pMax] overlap the budget? Unknown price → null (caller decides). */
export function overlapsBudget(
  pMin: number | null,
  pMax: number | null,
  bMin: number | undefined,
  bMax: number | undefined,
): boolean | null {
  if (bMin === undefined && bMax === undefined) return true;
  if (pMin === null && pMax === null) return null;
  const lo = pMin ?? pMax!;
  const hi = pMax ?? pMin!;
  if (bMax !== undefined && lo > bMax) return false;
  if (bMin !== undefined && hi < bMin) return false;
  return true;
}

/** Percentage difference of `p` vs `ref` (positive = more expensive). */
export function pctDiff(p: number, ref: number): number {
  if (!ref) return 0;
  return Math.round(((p - ref) / ref) * 1000) / 10;
}
