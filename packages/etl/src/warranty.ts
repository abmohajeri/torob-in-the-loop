/**
 * Offer warranty → shared WarrantyInfo (docs/ARCHITECTURE.md §4 rule 15).
 *
 * Raw: `{"description": string|null, "period_months": number|null, "provider": string|null}` or `null`.
 *  - provider «بدون گارانتی» / description «ندارد», «فاقد گارانتی» → none
 *  - provider «تست و تحویل در حضور مشتری» → test_delivery
 *  - provider «شرکتی» / a warranty company / months (field or «۱۸ ماه», «۲ سال», «یکساله» in text) → company
 *  - description mentioning اصالت → authenticity · تعویض/بازگشت/مرجوع → exchange · anything else → other
 * Labels are Persian with Persian digits, e.g. «۱۸ ماه گارانتی شرکتی», «ضمانت اصالت کالا».
 */
import type { WarrantyInfo } from '@titl/shared';
import { cleanFa, toLatinDigits, toPersianDigits } from '@titl/shared';

export type WarrantyKind = WarrantyInfo['kind'];

const NONE_PROVIDER = /بدون\s*گارانتی/;
const TEST_DELIVERY = /تست\s*و\s*تحویل/;
const NONE_TEXT = /(^\s*(ندارد|ندارد\s*[-–].*|خیر|بدون|ندارد\.?)\s*$)|فاقد\s*(گارانتی|ضمانت)|بدون\s*(گارانتی|ضمانت)|گارانتی\s*ندارد/;

const NUM_WORDS: Record<string, number> = {
  یک: 1,
  یه: 1,
  دو: 2,
  سه: 3,
  چهار: 4,
  پنج: 5,
  شش: 6,
  هفت: 7,
  هشت: 8,
  نه: 9,
  ده: 10,
  دوازده: 12,
  هجده: 18,
  هیجده: 18,
  بیست: 20,
};

/** Months mentioned in free text: «18 ماه», «۲سال», «یکساله», «دو ساله», «24ماهه». Days/weeks are ignored. */
export function monthsFromText(text: string): number | null {
  const s = toLatinDigits(cleanFa(text)).replace(/\u200c/g, ' ');
  const re = /(\d{1,3}|یک|یه|دو|سه|چهار|پنج|شش|هفت|هشت|نه|ده|دوازده|هجده|هیجده|بیست)\s*(ماهه|ماه|ساله|سال)(?![\p{L}])/gu;
  let best: number | null = null;
  for (const m of s.matchAll(re)) {
    const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : (NUM_WORDS[m[1]!] ?? NaN);
    if (!Number.isFinite(n) || n <= 0) continue;
    const months = m[2]!.startsWith('سال') ? n * 12 : n;
    if (months > 120) continue;
    if (best === null || months > best) best = months;
  }
  return best;
}

function monthsLabel(months: number): string {
  return `${toPersianDigits(months)} ماه`;
}

function shortText(s: string, max = 60): string {
  const t = toPersianDigits(cleanFa(s)).replace(/[*()]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
}

export function parseWarranty(raw: unknown): WarrantyInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const providerRaw = typeof o.provider === 'string' ? cleanFa(o.provider) : '';
  const descRaw = typeof o.description === 'string' ? cleanFa(o.description) : '';
  const provider = providerRaw && providerRaw !== 'None' && providerRaw !== 'null' ? providerRaw : '';
  const desc = descRaw && descRaw !== 'None' && descRaw !== 'null' ? descRaw : '';
  const periodField = typeof o.period_months === 'number' && o.period_months > 0 ? Math.round(o.period_months) : null;
  if (!provider && !desc && periodField === null) return null;

  if (provider && NONE_PROVIDER.test(provider)) return { kind: 'none', months: null, provider: null, label: 'بدون گارانتی' };
  if (provider && TEST_DELIVERY.test(provider)) {
    return { kind: 'test_delivery', months: null, provider: null, label: 'تست و تحویل در حضور مشتری' };
  }
  if (provider) {
    const isGeneric = /^شرکتی$/.test(provider);
    const months = periodField ?? (desc ? monthsFromText(desc) : null);
    const who = isGeneric ? 'شرکتی' : provider;
    const label = months ? `${monthsLabel(months)} گارانتی ${who}` : `گارانتی ${who}`;
    return { kind: 'company', months, provider: isGeneric ? null : provider, label: shortText(label, 70) };
  }
  if (periodField !== null) {
    return { kind: 'company', months: periodField, provider: null, label: `${monthsLabel(periodField)} گارانتی` };
  }

  // description only
  if (NONE_TEXT.test(desc)) {
    const auth = /اصل|اصالت/.test(desc);
    return { kind: 'none', months: null, provider: null, label: auth ? 'بدون گارانتی (کالای اصل)' : 'بدون گارانتی' };
  }
  const months = monthsFromText(desc);
  if (months !== null) {
    const company = /شرکت/.test(desc);
    return { kind: 'company', months, provider: null, label: `${monthsLabel(months)} گارانتی${company ? ' شرکتی' : ''}` };
  }
  if (TEST_DELIVERY.test(desc)) {
    return { kind: 'test_delivery', months: null, provider: null, label: 'تست و تحویل در حضور مشتری' };
  }
  if (/اصالت|اصل\s*بودن|اورجینال/.test(desc)) {
    const health = /سلامت/.test(desc);
    return { kind: 'authenticity', months: null, provider: null, label: health ? 'ضمانت اصالت و سلامت کالا' : 'ضمانت اصالت کالا' };
  }
  if (/تعویض|بازگشت|مرجوع|عودت/.test(desc)) {
    const days = /(\d{1,2}|یک|دو|سه|هفت|ده)\s*روز/.exec(toLatinDigits(desc));
    const d = days ? (/^\d+$/.test(days[1]!) ? Number(days[1]) : NUM_WORDS[days[1]!]) : null;
    const what = /تعویض/.test(desc) ? 'تعویض' : 'بازگشت';
    return {
      kind: 'exchange',
      months: null,
      provider: null,
      label: d ? `${toPersianDigits(d)} روز ضمانت ${what} کالا` : `ضمانت ${what} کالا`,
    };
  }
  if (/^(دارد|بله|دارای گارانتی|گارانتی دارد)$/.test(desc)) {
    return { kind: 'other', months: null, provider: null, label: 'دارای گارانتی (جزئیات ثبت نشده)' };
  }
  return { kind: 'other', months: null, provider: null, label: shortText(desc) };
}
