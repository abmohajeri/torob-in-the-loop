import { describe, expect, it } from 'vitest';
import { hasFixture, testCatalog } from './helpers/catalog.js';

const M = 1_000_000;
const d = hasFixture ? describe : describe.skip;

d('parseQuery (Persian NLU over fixture vocab)', () => {
  const p = (q: string) => testCatalog().services.parseQuery(q, {});

  it('«زیر ۲۰ میلیون» → budgetMax', () => {
    const r = p('گوشی سامسونگ زیر ۲۰ میلیون');
    expect(r.budgetMax).toBe(20 * M);
    expect(r.brand).toBe('سامسونگ');
    expect(r.category).toBe('گوشی موبایل');
  });
  it('«بین ۵ تا ۸ میلیون» → range', () => {
    const r = p('هدفون بین ۵ تا ۸ میلیون');
    expect(r.budgetMin).toBe(5 * M);
    expect(r.budgetMax).toBe(8 * M);
  });
  it('«تا ۵۰۰ هزار»', () => {
    expect(p('هندزفری تا ۵۰۰ هزار').budgetMax).toBe(500_000);
  });
  it('colloquial «حدود ۳ تومن» = ~3 million', () => {
    const r = p('گوشی حدود ۳ تومن');
    expect(r.budgetMin).toBeLessThan(3 * M);
    expect(r.budgetMax).toBeGreaterThan(3 * M);
    expect(r.budgetMax).toBeLessThan(4 * M);
  });
  it('decimal «۲.۵ میلیون» and Latin digits', () => {
    expect(p('هدفون زیر ۲.۵ میلیون').budgetMax).toBe(2.5 * M);
    expect(p('هدفون زیر 2.5 میلیون').budgetMax).toBe(2.5 * M);
  });
  it('Persian number words «زیر بیست میلیون»', () => {
    expect(p('گوشی زیر بیست میلیون').budgetMax).toBe(20 * M);
  });
  it('installment + provider', () => {
    const r = p('گوشی قسطی با اسنپ پی');
    expect(r.installment).toBe(true);
    expect(r.providers).toContain('snapppay');
  });
  it('open now', () => {
    expect(p('کتونی الان باز').openNow).toBe(true);
  });
  it('audience + colloquial category «کتونی»', () => {
    const r = p('کتونی مردانه');
    expect(r.audience).toBe('men');
    expect(r.category).toBe('کتانی و کفش اسپرت');
    expect(r.keywords).toEqual([]);
  });
  it('chips are produced for each extracted part', () => {
    const r = p('گوشی سامسونگ قسطی زیر ۲۵ میلیون');
    const kinds = r.chips.map((c) => c.key);
    expect(kinds).toEqual(expect.arrayContaining(['category', 'brand', 'budget', 'installment']));
  });
  it('plain keywords survive', () => {
    const r = p('iphone 16');
    expect(r.keywords.join(' ')).toContain('16');
  });
  it('empty / garbage input does not throw', () => {
    expect(() => p('')).not.toThrow();
    expect(() => p('؟؟؟ !!!')).not.toThrow();
  });
});
