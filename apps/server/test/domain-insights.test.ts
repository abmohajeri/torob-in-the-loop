import { describe, expect, it } from 'vitest';
import type { RegisteredPrice, ShopLite, StoreOffer } from '@titl/shared';
import { freshnessOf } from '@titl/shared';
import { insights } from '../src/domain/insights.js';
import { freshMedianOf, isLikelyOutdated, priceNoteOf } from '../src/domain/price.js';
import { priceFactor, scoreStore, STALE_PRICE_CAP } from '../src/domain/ranking.js';

const asOf = new Date('2026-10-13T00:00:00Z');
const daysAgo = (d: number) => new Date(asOf.getTime() - d * 86_400_000).toISOString();

const price = (p: number | null, age = 1): RegisteredPrice => ({
  price: p,
  rawPrice: p,
  status: p === null ? 'missing' : 'ok',
  changedAt: daysAgo(age),
  ageDays: age,
  freshness: freshnessOf(daysAgo(age), asOf),
});

const shop = (id: string, o: Partial<ShopLite> = {}): ShopLite =>
  ({
    id,
    name: `فروشگاه ${id}`,
    nameIsReal: false,
    area: null,
    address: null,
    lat: 35.7,
    lng: 51.4,
    distanceKm: 1,
    etaMin: 10,
    location: { mall: null, floorLabel: null, floorNum: null, unit: null, plaque: null, wing: null, landmark: null, guide: [], confidence: 'low' },
    openStatus: { state: 'open', label: 'باز است', at: asOf.toISOString() },
    payment: { options: [], installment: false, torobPayInPerson: false, textHints: [], kalabarg: null, fastDelivery: null },
    hasOffers: true,
    ...o,
  }) as ShopLite;

const store = (id: string, p: RegisteredPrice, s: Partial<ShopLite> = {}): StoreOffer => ({
  shop: shop(id, s),
  offerIds: [],
  sellerTitles: [],
  price: p,
  priceMax: null,
  warranty: null,
  description: null,
  verified: null,
  score: 50,
  reasons: [],
  rank: 0,
});

describe('freshness anchored to the snapshot (D2/SV4)', () => {
  it('buckets: ≤14 fresh · ≤60 recent · ≤180 stale · older very_stale', () => {
    expect(freshnessOf(daysAgo(9), asOf)).toBe('fresh');
    expect(freshnessOf(daysAgo(30), asOf)).toBe('recent');
    expect(freshnessOf(daysAgo(90), asOf)).toBe('stale');
    expect(freshnessOf(daysAgo(200), asOf)).toBe('very_stale');
    expect(freshnessOf(null, asOf)).toBe('unknown');
  });
  it('freshMedian needs ≥ 3 fresh prices; likely outdated = > 30 d and < 0.8 × fresh median', () => {
    const row = (p: number, d: number) => ({ price: p, raw_price: p, price_status: 'ok', price_changed_at: daysAgo(d) });
    expect(freshMedianOf([row(100, 1), row(110, 2)], asOf)).toBeNull();
    expect(freshMedianOf([row(100, 1), row(110, 2), row(120, 3), row(10, 90)], asOf)).toBe(110);
    expect(isLikelyOutdated(price(70, 45), 110)).toBe(true);
    expect(isLikelyOutdated(price(70, 10), 110)).toBe(false);
    expect(isLikelyOutdated(price(100, 45), 110)).toBe(false);
  });
  it('price sub-score is capped for prices older than 60 d', () => {
    expect(priceFactor(price(100, 90), { min: 100, max: 200, count: 2 })).toBe(STALE_PRICE_CAP);
    expect(priceFactor(price(100, 10), { min: 100, max: 200, count: 2 })).toBe(1);
  });
  it('DT2 notes', () => {
    expect(priceNoteOf('missing', 'missing')).toBe('قیمت اعلام نشده — بپرسید');
    expect(priceNoteOf('suspicious', 'too_low')).toBe('قیمت نامعتبر (احتمالاً تماسی)');
    expect(priceNoteOf('suspicious', 'model_outlier')).toContain('مدل‌های هم‌نام');
    expect(priceNoteOf('ok', null)).toBeNull();
  });
  it('update discipline badge / caveat', () => {
    const base = {
      price: price(100), priceRange: { min: 100, max: 200, count: 3 }, distanceKm: 1, openState: 'open' as const, openLabel: 'باز است',
      visitIsNow: true, warrantyKind: null, hoursDeclared: true, locConfidence: 'low' as const, paymentMatch: null, verified: null,
      recentReports: [], kalabargWanted: false, now: asOf,
    };
    const good = scoreStore({ ...base, updateDiscipline: 0.92 });
    const bad = scoreStore({ ...base, updateDiscipline: 0.05 });
    expect(good.score).toBeGreaterThan(bad.score);
    expect(bad.reasons.some((r) => r.code === 'stale_shop')).toBe(true);
  });
});

describe('insights (SV11)', () => {
  it('trade-off, stale and closing insights come from the data', () => {
    const stores = [
      store('a', price(1_000_000, 90), { etaMin: 5 }),
      store('b', price(900_000, 2), { etaMin: 30 }),
      store('c', price(1_200_000, 100), { openStatus: { state: 'closing_soon', label: '۲۰ دقیقه تا بسته شدن', at: asOf.toISOString() } }),
    ];
    const out = insights({ ctx: {}, stores, at: new Date('2026-10-20T08:00:00Z') });
    const codes = out.map((i) => i.code);
    expect(codes).toContain('tradeoff');
    expect(codes).toContain('stale_price');
    expect(codes).toContain('closing_before_arrival');
    const t = out.find((i) => i.code === 'tradeoff')!;
    expect(t.text).toContain('ارزان‌تر');
  });
  it('weekend warning on Friday, replica chip with action', () => {
    const fri = new Date('2026-10-23T08:00:00Z');
    const out = insights({ ctx: {}, stores: [], at: fri, hiddenReplicas: 12 });
    expect(out.some((i) => i.code === 'weekend')).toBe(true);
    const rep = out.find((i) => i.code === 'replicas_hidden')!;
    expect(rep.action?.contextPatch).toEqual({ showReplicas: true });
  });
  it('installment channel unknown only when installment is asked', () => {
    const stores = [store('a', price(1), { installmentTier: 'declared_unknown_channel' })];
    expect(insights({ ctx: {}, stores, at: asOf }).some((i) => i.code === 'installment_channel_unknown')).toBe(false);
    expect(insights({ ctx: { installment: true }, stores, at: asOf }).some((i) => i.code === 'installment_channel_unknown')).toBe(true);
  });
});
