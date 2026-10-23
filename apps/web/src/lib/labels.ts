/**
 * Pure label/tone logic for the transparency components (components/data/*). Kept free of React so it is unit-tested
 * and reusable by pages and the assistant blocks.
 */
import {
  formatClock,
  formatDistance,
  formatMinutes,
  formatNumber,
  formatPercent,
  formatTimeOfDay,
  formatTomanShort,
  type Freshness,
  type InMallLocation,
  type OpenState,
  type PaymentChannel,
  type ProductSummary,
  type Tone,
  type TravelMode,
  type VerifiedInfo,
  type WarrantyInfo,
} from '@titl/shared';
import type { BadgeTone } from '../components/ui/tone.js';

// ── Open status ───────────────────────────────────────────────────────────────

export const OPEN_STATE_TONE: Record<OpenState, BadgeTone> = {
  open: 'good',
  closing_soon: 'warn',
  opens_later_today: 'info',
  closed: 'bad',
  unknown: 'neutral',
};

// ── Verification (call / seller answers) ──────────────────────────────────────

export const VERIFIED_SOURCE_LABEL: Record<VerifiedInfo['source'], string> = {
  simulated_call: 'تماس شبیه‌سازی‌شده',
  seller_inbox: 'پاسخ مستقیم فروشنده',
  bale: 'پاسخ فروشنده در بله',
};

export const STOCK_META: Record<VerifiedInfo['stock'], { label: string; tone: BadgeTone }> = {
  in_stock: { label: 'موجود — تأیید شده', tone: 'good' },
  limited: { label: 'موجودی محدود — تأیید شده', tone: 'warn' },
  out_of_stock: { label: 'ناموجود — تأیید شده', tone: 'bad' },
  unknown: { label: 'موجودی تأیید نشده', tone: 'neutral' },
};

/** Default stock line when nobody has asked the store yet (never claim availability from a registered offer). */
export const STOCK_UNVERIFIED_LABEL = 'موجودی تأیید نشده';

/** «۶٪+ نسبت به قیمت ثبت‌شده» · «بدون تغییر» · null */
export function priceDeltaLabel(pct: number | null | undefined): string | null {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return null;
  if (Math.abs(pct) < 0.5) return 'بدون تغییر نسبت به قیمت ثبت‌شده';
  return `${formatPercent(Math.round(pct * 10) / 10)} نسبت به قیمت ثبت‌شده`;
}

export function priceDeltaTone(pct: number | null | undefined): Tone {
  if (pct === null || pct === undefined || Math.abs(pct) < 0.5) return 'good';
  return pct > 0 ? 'warn' : 'good';
}

// ── Freshness ─────────────────────────────────────────────────────────────────

export const FRESHNESS_TONE: Record<Freshness, BadgeTone> = {
  fresh: 'good',
  recent: 'info',
  stale: 'warn',
  very_stale: 'bad',
  unknown: 'neutral',
};

// ── Warranty ──────────────────────────────────────────────────────────────────

export const WARRANTY_TONE: Record<WarrantyInfo['kind'], BadgeTone> = {
  company: 'good',
  test_delivery: 'info',
  authenticity: 'info',
  exchange: 'info',
  none: 'warn',
  other: 'neutral',
};

// ── Payments ──────────────────────────────────────────────────────────────────

/** Short "information type" for a payment option (full sentence lives in PAYMENT_CHANNEL_LABEL). */
export const CHANNEL_SHORT: Record<PaymentChannel, string> = {
  in_person: 'پذیرش حضوری',
  unknown: 'نحوه پذیرش نامشخص',
};

export const TEXT_HINT_LABEL: Record<'installment' | 'fast_delivery' | 'cheque' | 'pay_on_delivery', string> = {
  installment: 'قسطی',
  fast_delivery: 'ارسال فوری',
  cheque: 'پرداخت با چک',
  pay_on_delivery: 'پرداخت در محل',
};

// ── In-mall location ──────────────────────────────────────────────────────────

export const CONFIDENCE_META: Record<InMallLocation['confidence'], { label: string; tone: BadgeTone; hint: string }> = {
  high: { label: 'نشانی دقیق', tone: 'good', hint: 'پاساژ، طبقه و واحد در نشانی فروشنده ثبت شده است.' },
  medium: { label: 'نشانی نسبتاً دقیق', tone: 'info', hint: 'بخشی از اطلاعات طبقه/واحد در نشانی فروشنده نیامده است.' },
  low: { label: 'نشانی تقریبی', tone: 'warn', hint: 'نشانی فروشنده جزئیات داخل پاساژ را ندارد؛ از فروشنده بپرسید.' },
};

/** «پاساژ علاءالدین · طبقه ۵ · واحد ۵۶۴» — compact one-line in-mall position, or null. */
export function inMallLine(loc: InMallLocation | null | undefined): string | null {
  if (!loc) return null;
  if (loc.guide.length) return loc.guide.join(' · ');
  const parts = [loc.mall?.name, loc.floorLabel ? `طبقه ${loc.floorLabel}` : null, loc.unit ? `واحد ${loc.unit}` : loc.plaque ? `پلاک ${loc.plaque}` : null];
  const s = parts.filter(Boolean).join(' · ');
  return s || null;
}

// ── Distance / ETA ────────────────────────────────────────────────────────────

export const TRAVEL_VERB: Record<TravelMode, string> = {
  walk: 'پیاده',
  metro: 'با مترو',
  taxi: 'با تاکسی',
  car: 'با خودرو',
};

/** «۱٫۲ کیلومتر · ۱۵ دقیقه پیاده» (ETA part omitted when unknown). null without distance. */
export function distanceEtaLabel(distanceKm: number | null | undefined, etaMin: number | null | undefined, mode: TravelMode = 'walk'): string | null {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) return null;
  const d = formatDistance(distanceKm);
  if (etaMin === null || etaMin === undefined || !Number.isFinite(etaMin)) return d;
  return `${d} · ${formatMinutes(etaMin)} ${TRAVEL_VERB[mode]}`;
}

// ── Products ──────────────────────────────────────────────────────────────────

/** «۸ فروشنده حضوری» / «فروشنده حضوری ثبت نشده». */
export function sellerCountLabel(n: number): string {
  return n > 0 ? `${formatNumber(n)} فروشنده حضوری` : 'فروشنده حضوری ثبت نشده';
}

/** Price range for cards: «۱٫۴ تا ۳٫۹ میلیون تومان», single price, or «قیمت ثبت نشده». */
export function productPriceLabel(p: Pick<ProductSummary, 'priceMin' | 'priceMax'>): { text: string; known: boolean; single: boolean } {
  const { priceMin: min, priceMax: max } = p;
  if (min === null && max === null) return { text: 'قیمت ثبت نشده', known: false, single: false };
  if (min === null || max === null || min === max) return { text: formatTomanShort(min ?? max), known: true, single: true };
  const sameScale = Math.floor(Math.log10(Math.max(1, min)) / 3) === Math.floor(Math.log10(Math.max(1, max)) / 3);
  const left = sameScale ? formatTomanShort(min, false).replace(/ (هزار|میلیون|میلیارد)$/, '') : formatTomanShort(min, false);
  return { text: `${left} تا ${formatTomanShort(max)}`, known: true, single: false };
}

/** Clock text for values that may be "HH:MM" (Tehran) or an ISO instant (contracts allow both for hold-until). */
export function formatClockish(value: string | null | undefined): string {
  if (!value) return 'نامشخص';
  if (/^\d{1,2}:\d{2}/.test(value)) return formatClock(value.padStart(5, '0'));
  return formatTimeOfDay(value);
}
