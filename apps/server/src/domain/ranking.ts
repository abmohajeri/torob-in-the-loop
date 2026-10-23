/**
 * Smart store ranking (pure). See docs/ARCHITECTURE.md §6:
 *   score = 100 × (0.35·price + 0.25·distance + 0.15·open + 0.15·freshness + 0.10·extras)
 *   + verified in-stock (≤ 24 h) +15 · verified out-of-stock −40 · crowd report closed/out-of-stock (≤ 12 h) −15
 * Every score is explained by reason chips: the top 3 contributing factors plus caveats.
 */
import type { CrowdReport, Freshness, OpenState, Reason, RegisteredPrice, VerifiedInfo, WarrantyInfo } from '@titl/shared';
import { formatDistance, formatNumber, formatRelative } from '@titl/shared';

export const STORE_WEIGHTS = { price: 0.35, distance: 0.25, open: 0.15, freshness: 0.15, extras: 0.1 } as const;

export const OPEN_FACTOR: Record<OpenState, number> = {
  open: 1,
  closing_soon: 0.5,
  opens_later_today: 0.6,
  unknown: 0.55,
  closed: 0.1,
};

/** D2 buckets vs the data snapshot: fresh ≤14 d · recent 15–60 d · stale 61–180 d · very_stale > 180 d. */
export const FRESHNESS_FACTOR: Record<Freshness, number> = {
  fresh: 1,
  recent: 0.7,
  stale: 0.35,
  very_stale: 0.1,
  unknown: 0.3,
};

/** SV4: price sub-score cap for prices older than 60 d (a cheap stale price must not win alone). */
export const STALE_PRICE_CAP = 0.6;
export const STALE_PRICE_CAP_DAYS = 60;
/** SV4: update discipline ≥ this → +0.1 extras and the «فروشندهٔ به‌روز» badge; < LOW → caveat. */
export const DISCIPLINE_GOOD = 0.5;
export const DISCIPLINE_BADGE = 0.8;
export const DISCIPLINE_LOW = 0.2;

export const EXTRA_POINTS = { companyWarranty: 0.3, hoursDeclared: 0.2, preciseLocation: 0.2, paymentMatch: 0.3, updateDiscipline: 0.1 } as const;
export const VERIFIED_IN_STOCK_BONUS = 15;
export const VERIFIED_LIMITED_BONUS = 8;
export const VERIFIED_OUT_OF_STOCK_PENALTY = 40;
export const REPORT_PENALTY = 15;
const VERIFIED_MAX_AGE_MS = 24 * 3600_000;

export interface StoreScoreInput {
  price: RegisteredPrice;
  /** Valid registered price range among the candidate stores (null when < 1 valid price). */
  priceRange: { min: number; max: number; count: number } | null;
  distanceKm: number | null;
  /** Label of the location the distance refers to (for «نزدیک ونک»); null = the user. */
  distanceFromLabel?: string | null;
  openState: OpenState;
  openLabel: string;
  minutesToClose?: number;
  /** Visit time is (about) now → «الان باز است»; otherwise «در زمان مراجعه باز است». */
  visitIsNow: boolean;
  warrantyKind: WarrantyInfo['kind'] | null;
  hoursDeclared: boolean;
  locConfidence: 'high' | 'medium' | 'low';
  /** null when the context doesn't ask about payment; otherwise whether the shop satisfies it (+ label). */
  paymentMatch: { matched: boolean; label: string } | null;
  verified: VerifiedInfo | null;
  recentReports: CrowdReport['type'][];
  kalabargWanted: boolean;
  now: Date;
  /** (SV4) share of the shop's prices updated ≤ 14 d before the snapshot; null/undefined = unknown. */
  updateDiscipline?: number | null;
  /** (SV4) fresh median of the product (≥ 3 fresh prices), for «احتمالاً قیمت قدیمی». */
  freshMedian?: number | null;
}

export interface StoreScore {
  score: number;
  factors: { price: number; distance: number; open: number; freshness: number; extras: number };
  reasons: Reason[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function priceFactor(price: RegisteredPrice, range: StoreScoreInput['priceRange']): number {
  if (price.price === null) return 0.3;
  const f = !range || range.max <= range.min ? 1 : clamp01(1 - (price.price - range.min) / (range.max - range.min));
  return price.ageDays !== null && price.ageDays > STALE_PRICE_CAP_DAYS ? Math.min(f, STALE_PRICE_CAP) : f;
}

export function distanceFactor(km: number | null): number {
  return km === null || !Number.isFinite(km) ? 0.5 : Math.exp(-km / 4);
}

export function extrasFactor(
  i: Pick<StoreScoreInput, 'warrantyKind' | 'hoursDeclared' | 'locConfidence' | 'paymentMatch'> & { updateDiscipline?: number | null },
): number {
  let e = 0;
  if ((i.updateDiscipline ?? 0) >= DISCIPLINE_GOOD) e += EXTRA_POINTS.updateDiscipline;
  if (i.warrantyKind === 'company') e += EXTRA_POINTS.companyWarranty;
  if (i.hoursDeclared) e += EXTRA_POINTS.hoursDeclared;
  if (i.locConfidence === 'high') e += EXTRA_POINTS.preciseLocation;
  if (i.paymentMatch?.matched) e += EXTRA_POINTS.paymentMatch;
  return clamp01(e);
}

function verifiedFresh(v: VerifiedInfo | null, now: Date): VerifiedInfo | null {
  if (!v) return null;
  const t = new Date(v.at).getTime();
  if (!Number.isFinite(t) || now.getTime() - t > VERIFIED_MAX_AGE_MS) return null;
  return v;
}

export function scoreStore(i: StoreScoreInput): StoreScore {
  const factors = {
    price: priceFactor(i.price, i.priceRange),
    distance: distanceFactor(i.distanceKm),
    open: OPEN_FACTOR[i.openState],
    freshness: FRESHNESS_FACTOR[i.price.freshness],
    extras: extrasFactor(i),
  };
  let score =
    100 *
    (STORE_WEIGHTS.price * factors.price +
      STORE_WEIGHTS.distance * factors.distance +
      STORE_WEIGHTS.open * factors.open +
      STORE_WEIGHTS.freshness * factors.freshness +
      STORE_WEIGHTS.extras * factors.extras);
  const v = verifiedFresh(i.verified, i.now);
  if (v?.stock === 'in_stock') score += VERIFIED_IN_STOCK_BONUS;
  else if (v?.stock === 'limited') score += VERIFIED_LIMITED_BONUS;
  else if (v?.stock === 'out_of_stock') score -= VERIFIED_OUT_OF_STOCK_PENALTY;
  const badReport = i.recentReports.find((t) => t === 'closed' || t === 'out_of_stock');
  if (badReport) score -= REPORT_PENALTY;
  score = Math.round(Math.min(100, Math.max(0, score)));
  return { score, factors, reasons: storeReasons(i, factors, v, badReport ?? null) };
}

function storeReasons(
  i: StoreScoreInput,
  f: StoreScore['factors'],
  v: VerifiedInfo | null,
  badReport: CrowdReport['type'] | null,
): Reason[] {
  const positives: (Reason & { w: number })[] = [];
  if (v && (v.stock === 'in_stock' || v.stock === 'limited')) {
    positives.push({
      code: 'verified_stock',
      label: `${v.stock === 'limited' ? 'موجودی محدود' : 'موجودی'} تأیید شد · ${formatRelative(v.at, i.now)}`,
      tone: 'good',
      w: 10,
    });
  }
  if (i.price.price !== null && i.priceRange && i.priceRange.count > 1) {
    if (i.price.price <= i.priceRange.min) {
      positives.push({ code: 'cheapest', label: 'ارزان‌ترین قیمت ثبت‌شده', tone: 'good', w: STORE_WEIGHTS.price * f.price + 0.05 });
    } else if (f.price >= 0.66) {
      positives.push({ code: 'good_price', label: 'قیمت ثبت‌شده پایین‌تر از بیشتر فروشنده‌ها', tone: 'good', w: STORE_WEIGHTS.price * f.price });
    }
  }
  if (i.distanceKm !== null && i.distanceKm <= 3) {
    const where = i.distanceFromLabel ? `نزدیک ${i.distanceFromLabel}` : 'نزدیک شما';
    positives.push({
      code: 'near',
      label: `${where} · ${formatDistance(i.distanceKm)}`,
      tone: i.distanceKm <= 1.5 ? 'good' : 'info',
      w: STORE_WEIGHTS.distance * f.distance,
    });
  }
  if (i.openState === 'open') {
    positives.push({
      code: 'open',
      label: i.visitIsNow ? 'الان باز است' : 'در زمان مراجعه باز است',
      tone: 'good',
      w: STORE_WEIGHTS.open * f.open * 0.9,
    });
  }
  if (i.price.price !== null && i.price.freshness === 'fresh') {
    positives.push({
      code: 'fresh',
      label: 'قیمت تازه (۲ هفتهٔ اخیر)',
      tone: 'good',
      w: STORE_WEIGHTS.freshness * f.freshness * 0.8,
    });
  }
  if (i.updateDiscipline != null && i.updateDiscipline >= DISCIPLINE_BADGE) {
    positives.push({
      code: 'update_discipline',
      label: `فروشندهٔ به‌روز — ${formatNumber(Math.round(i.updateDiscipline * 100))}٪ قیمت‌ها در ۲ هفتهٔ اخیر`,
      tone: 'good',
      w: 0.03,
    });
  }
  if (i.paymentMatch?.matched) {
    positives.push({ code: 'payment', label: i.paymentMatch.label, tone: 'good', w: 0.3 });
  }
  if (i.warrantyKind === 'company') {
    positives.push({ code: 'warranty', label: 'گارانتی شرکتی', tone: 'info', w: STORE_WEIGHTS.extras * EXTRA_POINTS.companyWarranty });
  } else if (i.warrantyKind === 'test_delivery') {
    positives.push({ code: 'warranty', label: 'تست و تحویل حضوری', tone: 'info', w: 0.02 });
  }
  if (i.locConfidence === 'high') {
    positives.push({ code: 'location', label: 'نشانی دقیق داخل پاساژ', tone: 'info', w: 0.015 });
  }
  positives.sort((a, b) => b.w - a.w);
  const reasons: Reason[] = positives.slice(0, 3).map(({ w: _w, ...r }) => r);

  // caveats
  const caveats: Reason[] = [];
  if (v?.stock === 'out_of_stock') caveats.push({ code: 'verified_out', label: 'طبق استعلام: ناموجود', tone: 'bad' });
  if (badReport === 'closed') caveats.push({ code: 'reported', label: 'گزارش کاربران: اخیراً بسته بوده', tone: 'warn' });
  if (badReport === 'out_of_stock') caveats.push({ code: 'reported', label: 'گزارش کاربران: موجود نبوده', tone: 'warn' });
  if (i.openState === 'closed') caveats.push({ code: 'closed', label: i.openLabel, tone: 'bad' });
  else if (i.openState === 'closing_soon' && i.minutesToClose !== undefined)
    caveats.push({ code: 'closing_soon', label: `فقط ${formatNumber(i.minutesToClose)} دقیقه تا بسته شدن`, tone: 'warn' });
  else if (i.openState === 'opens_later_today') caveats.push({ code: 'opens_later', label: i.openLabel, tone: 'info' });
  else if (i.openState === 'unknown') caveats.push({ code: 'hours_unknown', label: 'ساعت کاری ثبت نشده — بپرسید', tone: 'info' });
  if (i.price.status === 'missing') caveats.push({ code: 'no_price', label: i.price.note ?? 'قیمت اعلام نشده — بپرسید', tone: 'warn' });
  else if (i.price.status === 'suspicious') caveats.push({ code: 'suspicious_price', label: i.price.note ?? 'قیمت ثبت‌شده غیرعادی است', tone: 'warn' });
  else if (i.price.likelyOutdated) {
    caveats.push({ code: 'likely_outdated', label: 'احتمالاً قیمت قدیمی — قبل از رفتن بپرسید', tone: 'warn' });
  } else if (i.price.freshness === 'stale' || i.price.freshness === 'very_stale') {
    const days = Math.round(i.price.ageDays ?? 0);
    caveats.push({
      code: 'stale_price',
      label: `قیمت ${formatNumber(days)} روز پیش ثبت شده — استعلام کنید`,
      tone: i.price.freshness === 'very_stale' ? 'bad' : 'warn',
    });
  } else if (i.price.freshness === 'unknown') {
    caveats.push({ code: 'stale_price', label: 'زمان ثبت قیمت نامشخص — استعلام کنید', tone: 'warn' });
  }
  if (i.paymentMatch && !i.paymentMatch.matched) caveats.push({ code: 'payment_missing', label: 'اقساط ثبت نشده', tone: 'warn' });
  if (i.updateDiscipline != null && i.updateDiscipline < DISCIPLINE_LOW) {
    caveats.push({ code: 'stale_shop', label: 'بیشتر قیمت‌های این فروشگاه قدیمی است', tone: 'info' });
  }
  if (i.kalabargWanted) caveats.push({ code: 'kalabarg', label: 'کالابرگ ثبت نشده — بپرسید', tone: 'info' });
  return [...reasons, ...caveats.slice(0, 3)];
}
