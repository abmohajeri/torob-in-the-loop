import { describe, expect, it } from 'vitest';
import { bestSellerTitle, chooseTitle, extractTitleEn, isRedacted, REDACTED_TITLE } from '../src/titles.js';

describe('titles', () => {
  it('detects the redaction placeholder (also with Arabic letters / no ZWNJ)', () => {
    expect(isRedacted('عنوان حذف‌شده برای انتشار')).toBe(true);
    expect(isRedacted('عنوان حذف شده براي انتشار')).toBe(true);
    expect(isRedacted('گوشی موبایل سامسونگ')).toBe(false);
  });

  it('falls back from a redacted catalog title to the most frequent seller title', () => {
    const r = chooseTitle(REDACTED_TITLE, [REDACTED_TITLE, 'توپی سر کمک ال ۹۰', 'توپی سر کمک ال ۹۰', 'توپی سرکمک L90'], 'توپی سر کمک خودرو', null);
    expect(r).toEqual({ title: 'توپی سر کمک ال ۹۰', source: 'seller' });
  });

  it('generates «category brand» when every title is redacted', () => {
    expect(chooseTitle(REDACTED_TITLE, [REDACTED_TITLE], 'ساعت مچی عقربه‌ ای و دیجیتالی', 'تیسوت')).toEqual({
      title: 'ساعت مچی عقربه‌ ای و دیجیتالی تیسوت',
      source: 'generated',
    });
    expect(chooseTitle(null, [], 'رله و بیمتال', null)).toEqual({ title: 'رله و بیمتال', source: 'generated' });
  });

  it('keeps usable catalog titles', () => {
    expect(chooseTitle('گوشی موبايل سامسونگ', ['x'], 'گوشی موبایل', null)).toEqual({ title: 'گوشی موبایل سامسونگ', source: 'catalog' });
  });

  it('bestSellerTitle ignores junk', () => {
    expect(bestSellerTitle([null, '', '---', REDACTED_TITLE])).toBeNull();
  });

  it('extracts an English title from spec «نام محصول» or the title', () => {
    expect(extractTitleEn('لنز سونی', 'Sony E 70-350mm f/4.5-6.3 G OSS')).toBe('Sony E 70-350mm f/4.5-6.3 G OSS');
    expect(extractTitleEn('گوشی موبایل سامسونگ مدل Galaxy A55 ظرفیت 256 گیگابایت', null)).toBe('Galaxy A55');
    expect(extractTitleEn('کابل افشان ۱۶×۵', 'سیم و کابل مشهد')).toBeNull();
  });
});
