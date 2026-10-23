import type { Freshness, Tone } from './types.js';
import { toPersianDigits } from './text.js';
import { TEHRAN_TZ } from './time.js';

const faNumber = new Intl.NumberFormat('fa-IR');
const faDecimal = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

/** 12500000 → «۱۲٬۵۰۰٬۰۰۰» */
export function formatNumber(n: number): string {
  return faNumber.format(n);
}

/** 12500000 → «۱۲٬۵۰۰٬۰۰۰ تومان» */
export function formatToman(n: number | null | undefined, unit = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'نامشخص';
  return unit ? `${faNumber.format(Math.round(n))} تومان` : faNumber.format(Math.round(n));
}

/** 12500000 → «۱۲٫۵ میلیون تومان»; 850000 → «۸۵۰ هزار تومان». */
export function formatTomanShort(n: number | null | undefined, unit = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'نامشخص';
  const suffix = unit ? ' تومان' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${faDecimal.format(n / 1e9)} میلیارد${suffix}`;
  if (abs >= 1e6) return `${faDecimal.format(n / 1e6)} میلیون${suffix}`;
  if (abs >= 1e3) return `${faNumber.format(Math.round(n / 1e3))} هزار${suffix}`;
  return `${faNumber.format(Math.round(n))}${suffix}`;
}

/** «۱۲٫۵ تا ۱۴ میلیون تومان» style range (falls back gracefully). */
export function formatPriceRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return 'قیمت ثبت نشده';
  if (min === null || max === null || min === max) return formatTomanShort(min ?? max);
  return `${formatTomanShort(min, false)} تا ${formatTomanShort(max)}`;
}

export function formatPercent(p: number, signed = true): string {
  const s = faDecimal.format(Math.abs(p));
  if (!signed || p === 0) return `${s}٪`;
  return p > 0 ? `${s}٪+` : `${s}٪−`;
}

/** 0.35 → «۳۵۰ متر»; 2.4 → «۲٫۴ کیلومتر». */
export function formatDistance(km: number | null | undefined): string {
  if (km === null || km === undefined || !Number.isFinite(km)) return 'نامشخص';
  if (km < 1) return `${faNumber.format(Math.max(10, Math.round((km * 1000) / 10) * 10))} متر`;
  return `${faDecimal.format(km)} کیلومتر`;
}

/** 75 → «۱ ساعت و ۱۵ دقیقه». */
export function formatMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined || !Number.isFinite(min)) return 'نامشخص';
  const m = Math.max(1, Math.round(min));
  if (m < 60) return `${faNumber.format(m)} دقیقه`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${faNumber.format(h)} ساعت و ${faNumber.format(r)} دقیقه` : `${faNumber.format(h)} ساعت`;
}

/** "19:30" → «۱۹:۳۰» */
export function formatClock(hhmm: string | null | undefined): string {
  if (!hhmm) return 'نامشخص';
  return toPersianDigits(hhmm.slice(0, 5));
}

const jalaliLong = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TEHRAN_TZ,
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const jalaliDayMonth = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: TEHRAN_TZ,
  day: 'numeric',
  month: 'long',
});
const jalaliTime = new Intl.DateTimeFormat('fa-IR', {
  timeZone: TEHRAN_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** ISO → «۲۲ مهر ۱۴۰۵» */
export function formatJalaliDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return 'نامشخص';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'نامشخص';
  return (withYear ? jalaliLong : jalaliDayMonth).format(d);
}

/** ISO → «۱۴:۳۵» (Tehran) */
export function formatTimeOfDay(iso: string | null | undefined): string {
  if (!iso) return 'نامشخص';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'نامشخص';
  return jalaliTime.format(d);
}

/** Human relative time in Persian: «همین الان», «۵ دقیقه پیش», «۳ روز پیش», «۲ ماه پیش». */
export function formatRelative(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return 'نامشخص';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return 'نامشخص';
  const diffSec = Math.round((now.getTime() - t) / 1000);
  const future = diffSec < 0;
  const s = Math.abs(diffSec);
  const tail = future ? ' دیگر' : ' پیش';
  if (s < 45) return future ? 'چند لحظه دیگر' : 'همین الان';
  const min = Math.round(s / 60);
  if (min < 60) return `${faNumber.format(min)} دقیقه${tail}`;
  const h = Math.round(min / 60);
  if (h < 24) return `${faNumber.format(h)} ساعت${tail}`;
  const d = Math.round(h / 24);
  if (d === 1) return future ? 'فردا' : 'دیروز';
  if (d < 14) return `${faNumber.format(d)} روز${tail}`;
  if (d < 60) return `${faNumber.format(Math.round(d / 7))} هفته${tail}`;
  if (d < 365) return `${faNumber.format(Math.round(d / 30))} ماه${tail}`;
  return future ? 'بیش از یک سال دیگر' : 'بیش از یک سال پیش';
}

export function ageDays(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now.getTime() - t) / 86_400_000);
}

/** D2 buckets (days, vs. the data snapshot `dataAsOf` — pass it as `now`): fresh ≤14 · recent ≤60 · stale ≤180 · very_stale. */
export const FRESHNESS_THRESHOLDS = { fresh: 14, recent: 60, stale: 180 } as const;

export function freshnessOf(iso: string | null | undefined, now: Date = new Date()): Freshness {
  const d = ageDays(iso, now);
  if (d === null) return 'unknown';
  if (d <= FRESHNESS_THRESHOLDS.fresh) return 'fresh';
  if (d <= FRESHNESS_THRESHOLDS.recent) return 'recent';
  if (d <= FRESHNESS_THRESHOLDS.stale) return 'stale';
  return 'very_stale';
}

export const FRESHNESS_META: Record<Freshness, { label: string; short: string; tone: Tone; hint: string }> = {
  fresh: {
    label: 'قیمت تازه',
    short: 'تازه',
    tone: 'good',
    hint: 'قیمت در ۲ هفتهٔ پیش از زمان تهیهٔ داده‌ها تغییر کرده است.',
  },
  recent: {
    label: 'قیمت معمولی',
    short: 'معمولی',
    tone: 'info',
    hint: 'آخرین تغییر قیمت بین ۲ هفته تا ۲ ماه پیش از زمان تهیهٔ داده‌ها بوده است.',
  },
  stale: {
    label: 'قیمت قدیمی',
    short: 'قدیمی',
    tone: 'warn',
    hint: 'بیش از ۲ ماه از آخرین تغییر قیمت گذشته؛ پیش از رفتن استعلام کنید.',
  },
  very_stale: {
    label: 'قیمت خیلی قدیمی',
    short: 'خیلی قدیمی',
    tone: 'bad',
    hint: 'بیش از ۶ ماه از آخرین تغییر قیمت گذشته؛ این قیمت احتمالاً معتبر نیست.',
  },
  unknown: {
    label: 'زمان تغییر قیمت نامشخص',
    short: 'نامشخص',
    tone: 'warn',
    hint: 'فروشنده زمان تغییر قیمت را ثبت نکرده است.',
  },
};
