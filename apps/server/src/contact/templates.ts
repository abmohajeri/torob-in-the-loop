/**
 * Persian copy for the contact module (docs/AGENT-DESIGN.md §C.2, DESIGN-REVIEW CT1–CT6).
 * Facts are decided first (simulator.ts); these functions only verbalize them.
 */
import type { InquiryResult } from '@titl/shared';
import { DAY_NAMES_FA, formatClock, formatNumber, formatTomanShort, tehranParts, minutesToHHMM, toPersianDigits } from '@titl/shared';

export const SIMULATED_LABEL = 'تماس شبیه‌سازی‌شده · نسخه نمایشی';
export const WHY_SIMULATED =
  'شماره‌های دیتاست ترب نمایشی است. در نسخه واقعی همین گفتگو با تماس خودکار یا پیام در بله انجام می‌شود و فروشنده‌ها از صفحه فروشنده هم جواب می‌دهند.';
export const PRIVACY_LINE = 'این سؤال‌ها را از طرف شما می‌پرسم؛ نام و شمارهٔ شما گفته نمی‌شود.';

const fa = (n: number) => formatNumber(n);

/** Short spoken product name: first ~6 words, without trailing parenthetical noise. */
export function spokenProduct(title: string | null | undefined): string {
  if (!title) return 'کالای مورد نظر';
  const clean = title
    .replace(/\s*\|.*$/, '')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = clean.split(/\s+/);
  return words.length > 7 ? words.slice(0, 7).join(' ') : clean;
}

/** Tehran wall clock of an instant, «۱۶:۴۲». */
export function clockOf(d: Date | string): string {
  return formatClock(minutesToHHMM(tehranParts(d).minutes));
}

/** «امروز ۱۶:۴۲» / «فردا ۱۰:۰۵» / «شنبه ۱۰:۰۵» relative to `now` (both in the shopper's clock). */
export function dayClock(at: Date, now: Date): string {
  const a = tehranParts(at);
  const n = tehranParts(now);
  const dayDiff = Math.round(
    (Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(n.year, n.month - 1, n.day)) / 86_400_000,
  );
  const clock = formatClock(minutesToHHMM(a.minutes));
  if (dayDiff === 0) return `ساعت ${clock}`;
  if (dayDiff === 1) return `فردا ${clock}`;
  return `${DAY_NAMES_FA[a.weekday]} ${clock}`;
}

export function deltaText(pct: number | null): string | null {
  if (pct === null) return null;
  const r = Math.round(Math.abs(pct));
  if (r === 0) return 'همان قیمت ثبت‌شده';
  return pct > 0 ? `${fa(r)}٪ گران‌تر از قیمت ثبت‌شده` : `${fa(r)}٪ ارزان‌تر از قیمت ثبت‌شده`;
}

export function stockText(stock: InquiryResult['stock']): string {
  switch (stock) {
    case 'in_stock':
      return 'موجود';
    case 'limited':
      return 'موجودی محدود';
    case 'out_of_stock':
      return 'تمام شده';
    default:
      return 'موجودی نامشخص';
  }
}

/** One-line result summary: «موجود · ۱۲٫۹ میلیون (۳٪ گران‌تر از قیمت ثبت‌شده) · تا ۲۰:۰۰ باز · تا ۱۸:۳۰ نگه می‌دارند». */
export function summarize(r: Omit<InquiryResult, 'summary'>): string {
  const parts: string[] = [stockText(r.stock)];
  if (r.variantAvailable === false) parts.push('سایز/مدل خواسته‌شده نیست');
  if (r.price !== null && r.stock !== 'out_of_stock') {
    const d = deltaText(r.priceDeltaPct);
    parts.push(d ? `${formatTomanShort(r.price)} (${d})` : formatTomanShort(r.price));
  }
  if (r.overBudget) parts.push('بیش از بودجهٔ شما');
  if (r.hoursToday) parts.push(`تا ${formatClock(r.hoursToday)} باز`);
  if (r.holdUntil && r.stock !== 'out_of_stock') parts.push(`تا ${formatClock(r.holdUntil)} نگه می‌دارند`);
  if (r.installment?.available) parts.push(r.installment.providers.length ? `قسطی با ${r.installment.providers.join('، ')}` : 'قسطی دارد');
  return parts.join(' · ');
}

export function minutesWord(min: number): string {
  if (min < 1) return 'کمتر از یک دقیقه';
  if (min < 60) return `${fa(Math.round(min))} دقیقه`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${fa(h)} ساعت و ${fa(m)} دقیقه` : `${fa(h)} ساعت`;
}

export const STATUS_TEXT = {
  queued: 'در صف تماس',
  calling: (shop: string) => `در حال شماره‌گیری ${shop}…`,
  ringing: 'بوق آزاد…',
  noAnswer: 'پاسخی دریافت نشد.',
  busy: 'خط اشغال است.',
  closedNoPickup: 'کسی گوشی را برنداشت؛ احتمالاً فروشگاه الان بسته است.',
  closedByHours: 'فروشگاه طبق ساعت کاری ثبت‌شده الان بسته است.',
  restart: 'تماس قبلی نیمه‌کاره ماند؛ دوباره تماس می‌گیرم.',
  cancelled: 'پیگیری لغو شد.',
} as const;

export function scheduledAtOpenNote(when: string): string {
  return `فروشگاه الان بسته است؛ تماس ${when} انجام می‌شود. پیامتان همین حالا در صندوق فروشنده ثبت شد.`;
}

export function retryNote(when: string): string {
  return `پاسخ نداد؛ ${when} دوباره تماس می‌گیرم.`;
}

export function callbackNote(promised: string, retryAt: string): string {
  return `فروشنده گفت ساعت ${promised} خبر می‌دهد؛ اگر خبری نشد خودم ${retryAt} دوباره تماس می‌گیرم.`;
}

export function unreachableNote(k: number): string {
  return k > 0
    ? `بعد از چند بار تماس در دسترس نبود؛ ${fa(k)} جایگزین پیدا شد. پیامتان در صندوق فروشنده می‌ماند.`
    : 'بعد از چند بار تماس در دسترس نبود. پیامتان در صندوق فروشنده می‌ماند.';
}

export { toPersianDigits };
