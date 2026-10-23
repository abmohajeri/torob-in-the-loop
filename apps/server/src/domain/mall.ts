/**
 * In-passage wayfinding (pure): turns the address fields parsed by the ETL
 * (mall, floor, unit/plaque, wing, landmark) into Persian guide steps, plus clearly-labeled
 * heuristic hints («برداشت از نشانی») that help the user find a shop inside a passage.
 */
import type { InMallLocation, MallKind, MallRef } from '@titl/shared';
import { cleanFa, toLatinDigits, toPersianDigits } from '@titl/shared';

const ORDINALS = ['', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];

export function ordinalFa(n: number): string {
  return ORDINALS[n] ?? `${toPersianDigits(n)}م`;
}

/** 0 → «همکف», −1 → «زیرزمین اول», 6 → «طبقه ششم». */
export function floorLabelOf(num: number): string {
  if (num === 0) return 'همکف';
  if (num < 0) return `زیرزمین ${ordinalFa(-num)}`;
  return `طبقه ${ordinalFa(num)}`;
}

export const MALL_KIND_LABEL: Record<MallKind, string> = {
  passage: 'پاساژ',
  complex: 'مجتمع تجاری',
  mall: 'مرکز خرید',
  bazaar: 'بازار',
  sara: 'سرا',
  building: 'ساختمان',
  tower: 'برج',
};

export function asMallKind(s: string | null | undefined): MallKind {
  const k = (s ?? '') as MallKind;
  return k in MALL_KIND_LABEL ? k : 'passage';
}

export interface GuideInput {
  mall: MallRef | null;
  floorLabel: string | null;
  floorNum: number | null;
  unit: string | null;
  plaque: string | null;
  wing: string | null;
  landmark: string | null;
  confidence: string | null;
}

export interface Guide extends InMallLocation {
  hints: string[];
}

function faDigits(s: string): string {
  return toPersianDigits(toLatinDigits(s));
}

/** Leading digits of a unit code («622» → "622", «B12» → null, «۴/۱۶۵» → "4"). */
function unitDigits(unit: string): string | null {
  const m = /^(\d+)/.exec(toLatinDigits(unit).trim());
  return m ? m[1]! : null;
}

export function asConfidence(s: string | null | undefined): InMallLocation['confidence'] {
  return s === 'high' || s === 'medium' ? s : 'low';
}

export function buildGuide(input: GuideInput): Guide {
  const steps: string[] = [];
  const hints: string[] = [];
  const floorLabel = input.floorLabel ? cleanFa(input.floorLabel) : input.floorNum !== null ? floorLabelOf(input.floorNum) : null;
  const landmark = input.landmark ? cleanFa(input.landmark) : null;
  const wing = input.wing ? cleanFa(input.wing) : null;
  const unit = input.unit ? cleanFa(input.unit) : null;
  const plaque = input.plaque ? cleanFa(input.plaque) : null;

  if (input.mall && landmark) steps.push(`نشانه: ${faDigits(landmark)}`);
  if (input.mall) steps.push(faDigits(input.mall.name));
  if (wing) steps.push(faDigits(wing));
  if (floorLabel) steps.push(faDigits(floorLabel));
  if (unit) steps.push(`واحد ${faDigits(unit)}`);
  else if (plaque) steps.push(`پلاک ${faDigits(plaque)}`);
  if (!input.mall && landmark) steps.push(`نشانه: ${faDigits(landmark)}`);

  const code = unit ?? (input.mall ? plaque : null);
  if (code && input.floorNum !== null && input.floorNum >= 1) {
    const d = unitDigits(code);
    if (d && d.length >= 2 && d.startsWith(String(input.floorNum))) {
      hints.push(`شماره واحدهای این طبقه معمولاً با ${toPersianDigits(input.floorNum)} شروع می‌شود (برداشت از نشانی)`);
    }
  }
  if (input.floorNum !== null && input.floorNum >= 3) {
    hints.push('طبقه بالاست؛ اگر آسانسور یا پله‌برقی دارد، از آن استفاده کنید (پیشنهاد عمومی)');
  } else if (input.floorNum !== null && input.floorNum < 0) {
    hints.push('فروشگاه در طبقه زیرین است؛ به پله‌های رو به پایین دقت کنید (پیشنهاد عمومی)');
  }
  if (input.mall && !floorLabel && !unit && !plaque) {
    hints.push('طبقه و واحد ثبت نشده؛ پیش از رفتن از فروشنده بپرسید یا از نگهبانی پاساژ سراغ بگیرید');
  } else if (asConfidence(input.confidence) === 'low' && input.mall) {
    hints.push('نشانی داخل پاساژ کامل ثبت نشده؛ برای اطمینان از فروشنده بپرسید');
  }

  return {
    mall: input.mall,
    floorLabel,
    floorNum: input.floorNum,
    unit,
    plaque,
    wing,
    landmark,
    guide: steps,
    confidence: asConfidence(input.confidence),
    hints,
  };
}

/** One-line guide «پاساژ علاءالدین ۲ ← طبقه ششم ← واحد ۶۲۲». */
export function guideLine(loc: Pick<InMallLocation, 'guide'>): string {
  return loc.guide.filter((s) => !s.startsWith('نشانه:')).join(' ← ');
}

/** Sort key for shops inside a mall: floor ascending (unknown last), then unit/plaque number. */
export function floorSortKey(floorNum: number | null): number {
  return floorNum === null ? 999 : floorNum;
}

export function unitSortKey(unit: string | null, plaque: string | null): number {
  const d = unitDigits(unit ?? plaque ?? '');
  return d ? Number(d) : Number.MAX_SAFE_INTEGER;
}
