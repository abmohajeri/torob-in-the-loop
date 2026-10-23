import { describe, expect, it } from 'vitest';
import type { RegisteredPrice } from '@titl/shared';
import { STORE_WEIGHTS, distanceFactor, priceFactor, scoreStore, type StoreScoreInput } from '../src/domain/ranking.js';

const now = new Date('2026-10-24T12:00:00+03:30');
const price = (p: number | null, freshness: RegisteredPrice['freshness'] = 'fresh'): RegisteredPrice => ({
  price: p, rawPrice: p, status: p === null ? 'missing' : 'ok', changedAt: now.toISOString(), ageDays: 1, freshness,
} as RegisteredPrice);
const base = (o: Partial<StoreScoreInput> = {}): StoreScoreInput => ({
  price: price(100), priceRange: { min: 100, max: 200, count: 3 }, distanceKm: 1, openState: 'open', openLabel: 'باز است',
  visitIsNow: true, warrantyKind: null, hoursDeclared: true, locConfidence: 'high', paymentMatch: null, verified: null,
  recentReports: [], kalabargWanted: false, now, ...o,
});

describe('ranking', () => {
  it('weights sum to 1', () => {
    expect(Object.values(STORE_WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });
  it('price and distance factors', () => {
    expect(priceFactor(price(100), { min: 100, max: 200, count: 2 })).toBe(1);
    expect(priceFactor(price(200), { min: 100, max: 200, count: 2 })).toBe(0);
    expect(priceFactor(price(null), null)).toBe(0.3);
    expect(distanceFactor(0)).toBe(1);
    expect(distanceFactor(null)).toBe(0.5);
  });
  it('cheaper + nearer + open ranks above expensive + far + closed', () => {
    const a = scoreStore(base());
    const b = scoreStore(base({ price: price(200), distanceKm: 10, openState: 'closed' }));
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.reasons.length).toBeGreaterThan(0);
  });
  it('verified in-stock bonus and out-of-stock penalty', () => {
    const v = (stock: 'in_stock' | 'out_of_stock') => ({ inquiryId: 'i', source: 'simulated_call' as const, at: now.toISOString(), stock, price: null, priceDeltaPct: null, holdUntil: null });
    const plain = scoreStore(base({ price: price(150) })).score;
    const inS = scoreStore(base({ price: price(150), verified: v('in_stock') }));
    expect(inS.score).toBeGreaterThan(plain);
    expect(inS.reasons.some((r) => r.code === 'verified_stock')).toBe(true);
    expect(scoreStore(base({ price: price(150), verified: v('out_of_stock') })).score).toBeLessThan(plain - 30);
  });
  it('recent closed report penalizes', () => {
    expect(scoreStore(base({ recentReports: ['closed'] })).score).toBeLessThan(scoreStore(base()).score);
  });
  it('score bounded 0..100', () => {
    const s = scoreStore(base({ verified: { inquiryId: 'i', source: 'bale', at: now.toISOString(), stock: 'in_stock', price: null, priceDeltaPct: null, holdUntil: null } }));
    expect(s.score).toBeLessThanOrEqual(100);
  });
});
