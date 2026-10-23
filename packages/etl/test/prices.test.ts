import { describe, expect, it } from 'vitest';
import { classifyProductPrices, parseRawPrice, priceStats } from '../src/prices.js';

describe('parseRawPrice', () => {
  it('reads registered values and NULL conventions', () => {
    expect(parseRawPrice('610000')).toEqual({ raw: 610000, rawText: null });
    expect(parseRawPrice('0')).toEqual({ raw: 0, rawText: null });
    expect(parseRawPrice('null')).toEqual({ raw: null, rawText: null });
    expect(parseRawPrice('')).toEqual({ raw: null, rawText: null });
    expect(parseRawPrice(null)).toEqual({ raw: null, rawText: null });
  });

  it('clamps absurd outliers beyond 2^53 and keeps the exact digits', () => {
    const r = parseRawPrice('700000000000000000');
    expect(r.raw).toBe(Number.MAX_SAFE_INTEGER);
    expect(r.rawText).toBe('700000000000000000');
  });
});

describe('classifyProductPrices', () => {
  it('flags 0 as missing and > 10B / < 1,000 as suspicious', () => {
    const { verdicts } = classifyProductPrices([0, null, 2e10, 500, 1_500_000]);
    expect(verdicts.map((v) => v.status)).toEqual(['missing', 'missing', 'suspicious', 'suspicious', 'ok']);
    expect(verdicts.map((v) => v.rule)).toEqual(['missing', 'missing', 'too_high', 'too_low', null]);
    expect(verdicts[4]!.price).toBe(1_500_000);
    expect(verdicts[2]!.price).toBeNull();
  });

  it('applies the 8× relative test only with ≥ 3 plausible prices', () => {
    const many = classifyProductPrices([1_000_000, 1_100_000, 1_200_000, 15_000_000, 100_000]);
    expect(many.verdicts.map((v) => v.rule)).toEqual([null, null, null, 'outlier_high', 'outlier_low']);
    const two = classifyProductPrices([1_000_000, 15_000_000]);
    expect(two.verdicts.every((v) => v.status === 'ok')).toBe(true);
  });

  it('computes stats over ok prices only', () => {
    const { verdicts } = classifyProductPrices([0, 1_000_000, 3_000_000, 2_000_000, 9e15]);
    expect(priceStats(verdicts)).toEqual({
      min: 1_000_000,
      max: 3_000_000,
      median: 2_000_000,
      validCount: 3,
      missingCount: 1,
      suspiciousCount: 1,
    });
  });
});
