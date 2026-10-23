import { describe, expect, it } from 'vitest';
import { isReplicaTitle, modelKey, offerAttrs, specBrand } from '../src/attrs.js';
import { mineTextHints } from '../src/payments.js';
import { facetValues } from '../src/specs.js';

describe('offerAttrs (DT6)', () => {
  it('mines condition / authenticity / registry / bundle with word boundaries', () => {
    expect(offerAttrs('گوشی کارکرده در حد نو')).toMatchObject({ condition: 'used', source: 'seller_text' });
    expect(offerAttrs('آکبند با گارانتی')).toMatchObject({ condition: 'akband' });
    expect(offerAttrs('استوک اروپا')).toMatchObject({ condition: 'stock' });
    expect(offerAttrs('کتونی نایک های کپی')).toMatchObject({ authenticity: 'replica' });
    expect(offerAttrs('اورجینال')).toMatchObject({ authenticity: 'claims_original' });
    expect(offerAttrs('نات اکتیو')).toMatchObject({ registry: 'not_active' });
    expect(offerAttrs('رجیستر شده')).toMatchObject({ registry: 'registered' });
    expect(offerAttrs('بدون رجیستری')?.registry).toBeUndefined();
    expect(offerAttrs('همراه شارژر')).toMatchObject({ bundle: 'with_charger' });
  });
  it('returns null when nothing is mentioned and never matches inside words', () => {
    expect(offerAttrs('گوشی سامسونگ')).toBeNull();
    expect(offerAttrs(null, undefined)).toBeNull();
    expect(offerAttrs('اصلاح‌شده')).toBeNull();
  });
});

describe('cheque hint (DT6 fix)', () => {
  it('matches standalone چک only', () => {
    expect(mineTextHints('فروش چکی')).toContain('cheque');
    expect(mineTextHints('با چک صیادی')).toContain('cheque');
    expect(mineTextHints('سایز کوچک')).not.toContain('cheque');
    expect(mineTextHints('چکش و چکمه')).not.toContain('cheque');
  });
});

describe('isReplicaTitle', () => {
  it('flags «طرح <brand>» and explicit replica words', () => {
    expect(isReplicaTitle('گوشی طرح نوکیا 105 | حافظه 4 مگابایت')).toBe(true);
    expect(isReplicaTitle('گوشی طرح اپل iphone 16 pro max')).toBe(true);
    expect(isReplicaTitle('کفش نایک مستر کوالیتی')).toBe(true);
  });
  it('does not flag «طرح» meaning pattern', () => {
    expect(isReplicaTitle('قاب کروم طرح دستکش')).toBe(false);
    expect(isReplicaTitle('پاپ سوکت طرح LV')).toBe(false);
  });
});

describe('modelKey (DT8)', () => {
  it('groups storage / RAM / region variants', () => {
    const a = modelKey('سامسونگ', ['samsung'], 7, null, 'گوشی سامسونگ (چین) A07 4G | حافظه 64 رم 4 گیگابایت');
    const b = modelKey('سامسونگ', ['samsung'], 7, null, 'گوشی سامسونگ (ویتنام) A07 4G | حافظه 128 رم 6 گیگابایت');
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
  it('transliterates Persian model words', () => {
    const a = modelKey('سامسونگ', ['samsung'], 7, null, 'گوشی سامسونگ گلکسی S25 اولترا');
    const b = modelKey('سامسونگ', ['samsung'], 7, null, 'گوشی سامسونگ (ویتنام) S25 Ultra 5G | حافظه 256 رم 12 گیگابایت');
    expect(a).toBe('7|سامسونگ|s 25 ultra');
    expect(b).toBe('7|سامسونگ|s 25 ultra');
  });
  it('is null without a brand', () => {
    expect(modelKey(null, [], 7, null, 'گوشی A07')).toBeNull();
  });
});

describe('specBrand (DT3)', () => {
  it('reads برند / شرکت سازنده and drops junk', () => {
    expect(specBrand([['شرکت سازنده', 'Sony']])).toBe('Sony');
    expect(specBrand([['برند', 'متفرقه']])).toBeNull();
    expect(specBrand([['رنگ', 'مشکی']])).toBeNull();
  });
});

describe('facetValues list keys (DT7)', () => {
  it('splits sizes on separators/spaces and expands ranges', () => {
    expect(facetValues('41, 42 43/44', 'سایز')).toEqual(['41', '42', '43', '44']);
    expect(facetValues('۴۰ تا ۴۳', 'سایز')).toEqual(['40', '41', '42', '43']);
  });
  it('keeps two-word colours', () => {
    expect(facetValues('مشکی سرمه ای، سفید', 'رنگ')).toEqual(['مشکی', 'سرمه ای', 'سفید']);
  });
});
