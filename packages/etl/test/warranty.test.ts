import { describe, expect, it } from 'vitest';
import { monthsFromText, parseWarranty } from '../src/warranty.js';

const w = (provider: string | null, period_months: number | null = null, description: string | null = null) => ({ description, period_months, provider });

// Shapes and strings below are the most frequent real values of offers.warranty.
describe('parseWarranty', () => {
  it('returns null for null / empty / «None»', () => {
    expect(parseWarranty(null)).toBeNull();
    expect(parseWarranty(w(null))).toBeNull();
    expect(parseWarranty(w(null, null, 'None'))).toBeNull();
  });

  it('maps provider kinds', () => {
    expect(parseWarranty(w('بدون گارانتی'))).toEqual({ kind: 'none', months: null, provider: null, label: 'بدون گارانتی' });
    expect(parseWarranty(w('تست و تحویل در حضور مشتری'))?.kind).toBe('test_delivery');
    expect(parseWarranty(w('شرکتی', 18))).toEqual({ kind: 'company', months: 18, provider: null, label: '۱۸ ماه گارانتی شرکتی' });
  });

  it('classifies description-only warranties', () => {
    expect(parseWarranty(w(null, null, 'گارانتی اصالت و سلامت فیزیکی کالا'))).toEqual({
      kind: 'authenticity',
      months: null,
      provider: null,
      label: 'ضمانت اصالت و سلامت کالا',
    });
    expect(parseWarranty(w(null, null, 'ضمانت اصالت کالا'))?.label).toBe('ضمانت اصالت کالا');
    expect(parseWarranty(w(null, null, '2 سال'))).toMatchObject({ kind: 'company', months: 24, label: '۲۴ ماه گارانتی' });
    expect(parseWarranty(w(null, null, '18 ماهه دیباکام پردازش سدرا'))).toMatchObject({ kind: 'company', months: 18 });
    expect(parseWarranty(w(null, null, 'ضمانت تعویض کالا تا 7 روز'))).toMatchObject({ kind: 'exchange', label: '۷ روز ضمانت تعویض کالا' });
    expect(parseWarranty(w(null, null, 'ضمانت بازگشت کالا'))).toMatchObject({ kind: 'exchange', label: 'ضمانت بازگشت کالا' });
    expect(parseWarranty(w(null, null, '7 روز مهلت تست و 6 ماه گارانتی'))).toMatchObject({ kind: 'company', months: 6 });
    expect(parseWarranty(w(null, null, 'ندارد'))?.kind).toBe('none');
    expect(parseWarranty(w(null, null, 'ضمانت 7 روزه'))).toMatchObject({ kind: 'other', label: 'ضمانت ۷ روزه' });
  });
});

describe('monthsFromText', () => {
  it('reads months and years in digits and words', () => {
    expect(monthsFromText('۱۸ ماه')).toBe(18);
    expect(monthsFromText('دو ساله')).toBe(24);
    expect(monthsFromText('یکساله')).toBe(12);
    expect(monthsFromText('7 روز')).toBeNull();
    expect(monthsFromText('500 سال')).toBeNull();
  });
});
