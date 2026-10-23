import { describe, expect, it } from 'vitest';
import { mineTextHints, parsePayments, providerCode, unionHints } from '../src/payments.js';

const opt = (provider_name: string, channel = 'unknown', min: number | null = null, max: number | null = null) => ({
  category_names: [],
  channel,
  max_price_toman: max,
  min_price_toman: min,
  provider_name,
});

describe('providerCode', () => {
  it('maps registered spellings', () => {
    expect(providerCode('ترب‌پی')).toBe('torobpay');
    expect(providerCode('ترب پی')).toBe('torobpay');
    expect(providerCode('اسنپ‌پی')).toBe('snapppay');
    expect(providerCode('دیجی پی')).toBe('digipay');
    expect(providerCode('تارا')).toBe('tara');
    expect(providerCode('ازکی‌وام')).toBe('azkivam');
  });
  it('maps junk names (shop names typed as provider) to other', () => {
    expect(providerCode('تجهیزات آشپزخانه حلما')).toBe('other');
    expect(providerCode('جیتکس مارکت')).toBe('other');
    expect(providerCode('')).toBe('other');
    expect(providerCode(null)).toBe('other');
  });
});

describe('parsePayments', () => {
  it('parses real payment_options and derives installment / torobpay in person', () => {
    const r = parsePayments([opt('اسنپ‌پی', 'in_person'), opt('ترب‌پی', 'in_person', 0, 0)]);
    expect(r.installment).toBe(true);
    expect(r.torobPayInPerson).toBe(true);
    expect(r.options[0]).toEqual({ provider: 'torobpay', label: 'ترب‌پی', channel: 'in_person', minPrice: null, maxPrice: null });
    expect(r.options.map((o) => o.provider)).toEqual(['torobpay', 'snapppay']);
  });

  it('keeps channel unknown and does not count torobpay(unknown) as in person', () => {
    const r = parsePayments([opt('ترب‌پی')]);
    expect(r.torobPayInPerson).toBe(false);
    expect(r.options[0]!.channel).toBe('unknown');
  });

  it('keeps junk provider labels as other (no installment) and de-duplicates', () => {
    const r = parsePayments([opt('دکان ابزار'), opt('دکان ابزار'), opt('تارا', 'unknown', 1_000_000, 50_000_000)]);
    expect(r.options).toHaveLength(2);
    expect(r.unknownNames).toEqual(['دکان ابزار', 'دکان ابزار']);
    const other = r.options.find((o) => o.provider === 'other')!;
    expect(other.label).toBe('دکان ابزار');
    const tara = r.options.find((o) => o.provider === 'tara')!;
    expect([tara.minPrice, tara.maxPrice]).toEqual([1_000_000, 50_000_000]);
    expect(parsePayments([opt('دکان ابزار')]).installment).toBe(false);
  });

  it('tolerates non-array input', () => {
    expect(parsePayments(null).options).toEqual([]);
    expect(parsePayments('x').installment).toBe(false);
  });
});

describe('text hints', () => {
  it('mines hints from seller descriptions', () => {
    expect(mineTextHints('فروش اقساطی با چک صیادی')).toEqual(['installment', 'cheque']);
    expect(mineTextHints('ارسال فوری در تهران', 'پرداخت درب محل')).toEqual(['fast_delivery', 'pay_on_delivery']);
  });
  it('does not match «چک» inside other words', () => {
    expect(mineTextHints('سایز کوچک، چکش و چکمه')).toEqual([]);
    expect(mineTextHints(null, undefined, '')).toEqual([]);
  });
  it('unions hint lists in canonical order', () => {
    expect(unionHints([['cheque'], ['installment', 'cheque']])).toEqual(['installment', 'cheque']);
  });
});
