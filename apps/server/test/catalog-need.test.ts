import { describe, expect, it } from 'vitest';
import { AVAILABILITY_LABELS, contextToParams, paramsToContext } from '@titl/shared';
import { inRange, rangeOf, resolveCtx } from '../src/services/context.js';
import { hasFixture, testCatalog } from './helpers/catalog.js';

const d = hasFixture ? describe : describe.skip;
const LOC = 'lat=35.6996&lng=51.4166&loc=x&locsrc=place';

describe('range (SV6)', () => {
  it('maxDistanceKm is a radius alias; explicit range wins', () => {
    expect(rangeOf({ maxDistanceKm: 2 })).toEqual({ kind: 'radius', km: 2 });
    expect(rangeOf({ maxDistanceKm: 2, range: { kind: 'areas', areas: ['شیخ هادی'] } })).toEqual({ kind: 'areas', areas: ['شیخ هادی'] });
    expect(rangeOf({})).toBeNull();
  });
  it('inRange per kind', () => {
    const loc = { lat: 35.7, lng: 51.4, label: 'x', source: 'place' as const };
    const near = { lat: 35.701, lng: 51.401, area: 'شیخ هادی' };
    const far = { lat: 35.8, lng: 51.4, area: 'تجریش' };
    expect(inRange(resolveCtx({ location: loc, maxDistanceKm: 1 }), near)).toBe(true);
    expect(inRange(resolveCtx({ location: loc, maxDistanceKm: 1 }), far)).toBe(false);
    expect(inRange(resolveCtx({ range: { kind: 'areas', areas: ['تجریش'] } }), far)).toBe(true);
    expect(inRange(resolveCtx({ location: loc, range: { kind: 'time', maxMinutes: 5 } }), far)).toBe(false);
    expect(inRange(resolveCtx({ location: loc, range: { kind: 'route', dest: { lat: 35.8, lng: 51.4 } } }), { lat: 35.75, lng: 51.401, area: null })).toBe(true);
  });
  it('round-trips through URL params', () => {
    const ctx = { range: { kind: 'areas' as const, areas: ['بهارستان', 'شیخ هادی'] }, priority: 'price' as const, showReplicas: true };
    expect(paramsToContext(contextToParams(ctx))).toMatchObject(ctx);
  });
});

d('need-level store finder + ladder (fixture.db)', () => {
  const { app, catalog, services } = testCatalog();
  const json = async <T = any>(p: string, init?: RequestInit) => {
    const r = await app.request(p, init);
    return { r, body: (await r.json()) as T };
  };

  it('GET /api/need/stores ranks shops by assortment with reasons and clusters', async () => {
    const { r, body } = await json(`/api/need/stores?category=${encodeURIComponent('کتانی و کفش اسپرت')}&${LOC}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(body.totalMatchingProducts).toBeGreaterThan(0);
    expect(body.stores.length).toBeGreaterThan(0);
    const first = body.stores[0];
    expect(first.matchCount).toBeGreaterThan(0);
    expect(first.reasons.length).toBeGreaterThan(0);
    expect(first.samples.length).toBeGreaterThan(0);
    expect(first.samples.length).toBeLessThanOrEqual(4);
    // scores are sorted inside each availability rung
    const sim = body.stores.filter((s: any) => s.availability === 'similar');
    for (let i = 1; i < sim.length; i++) expect(sim[i - 1].score).toBeGreaterThanOrEqual(sim[i].score);
    expect(Array.isArray(body.clusters)).toBe(true);
    // tier C never appears
    for (const s of body.stores) expect(s.shop.tier).not.toBe('C');
  });

  it('400 without any need', async () => {
    const { r } = await json('/api/need/stores');
    expect(r.status).toBe(400);
  });

  it('single product → availability ladder with fixed copy', () => {
    const pid = catalog.get<{ id: string }>(
      `SELECT p.id FROM products p WHERE p.model_key IN (SELECT model_key FROM products WHERE model_key IS NOT NULL GROUP BY model_key HAVING count(*) > 1)
       ORDER BY p.shop_count DESC LIMIT 1`,
    )?.id;
    if (!pid) return;
    const res = services.getStoresForNeed({ productIds: [pid] }, {}, { limit: 100 });
    const rungs = new Set(res.stores.map((s) => s.availability));
    expect(rungs.has('exact')).toBe(true);
    for (const s of res.stores) {
      if (s.availability === 'exact') expect(s.availabilityLabel).toBe(AVAILABILITY_LABELS.exact);
      if (s.availability === 'variant') expect(s.availabilityLabel).toBe(AVAILABILITY_LABELS.variant);
      if (s.availability === 'category_only') expect(s.availabilityLabel).toBe(AVAILABILITY_LABELS.category_only);
    }
    // exact before variant before similar before category_only
    const order = ['exact', 'variant', 'similar', 'category_only'];
    const idx = res.stores.map((s) => order.indexOf(s.availability));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it('GET /api/shortlist/stores returns coverage', async () => {
    const ids = catalog.all<{ id: string }>('SELECT id FROM products WHERE shop_count > 0 ORDER BY shop_count DESC LIMIT 2').map((x) => x.id);
    const { body } = await json(`/api/shortlist/stores?ids=${ids.join(',')}&${LOC}`);
    expect(body.stores.length).toBeGreaterThan(0);
    const withCov = body.stores.filter((s: any) => s.coverage?.length);
    expect(withCov.length).toBeGreaterThan(0);
    for (const s of withCov) for (const id of s.coverage) expect(ids).toContain(id);
  });

  it('stores: installment groups instead of filtering, never empty (D6/SV9)', async () => {
    const pid = catalog.get<{ id: string }>('SELECT id FROM products ORDER BY shop_count DESC LIMIT 1')!.id;
    const all = await json(`/api/products/${pid}/stores?${LOC}`);
    const inst = await json(`/api/products/${pid}/stores?${LOC}&inst=1`);
    expect(inst.body.stores.length).toBe(all.body.stores.length);
    expect(inst.body.installmentGroups.length).toBeGreaterThan(0);
    const grouped = inst.body.installmentGroups.reduce((n: number, g: any) => n + g.shopIds.length, 0);
    expect(grouped).toBe(inst.body.stores.length);
  });

  it('stores: tiny radius → empty list with a nearest-cluster notice (SV6)', async () => {
    const pid = catalog.get<{ id: string }>('SELECT id FROM products ORDER BY shop_count DESC LIMIT 1')!.id;
    const { body } = await json(`/api/products/${pid}/stores?lat=35.95&lng=51.6&loc=x&locsrc=place&km=0.5`);
    expect(body.stores.length).toBe(0);
    expect(body.nearestCluster).toBeTruthy();
    expect(body.nearestCluster.text).toContain('نزدیک‌ترین خوشه');
    expect(body.nearestCluster.actions.map((a: any) => a.id)).toEqual(['expand_range', 'ask_category_shops']);
  });

  it('stores: price sort puts fresh prices first and statuses carry Persian notes (SV4/DT2)', async () => {
    const pid = catalog.get<{ id: string }>('SELECT id FROM products ORDER BY shop_count DESC LIMIT 1')!.id;
    const { body } = await json(`/api/products/${pid}/stores?${LOC}&sort=price`);
    expect(body.priceGroups).toBeTruthy();
    let seenStale = false;
    for (const s of body.stores) {
      const fresh = s.price.price !== null && (s.price.freshness === 'fresh' || s.price.freshness === 'recent') && !s.price.likelyOutdated;
      if (!fresh) seenStale = true;
      else expect(seenStale).toBe(false);
      if (s.price.status !== 'ok') expect(typeof s.price.note).toBe('string');
      expect(s.shop.openStatus.detail).toBeTruthy();
    }
    expect(Array.isArray(body.insights)).toBe(true);
  });

  it('alternatives accept over_budget / no_installment and return relative chips', async () => {
    const pid = catalog.get<{ id: string }>('SELECT id FROM products ORDER BY shop_count DESC LIMIT 1')!.id;
    const shop = catalog.get<{ id: string }>('SELECT s.id FROM offers o JOIN shops s ON s.rid=o.shop_rid JOIN products p ON p.rid=o.product_rid WHERE p.id=? ORDER BY o.price DESC LIMIT 1', pid)!.id;
    for (const reason of ['over_budget', 'no_installment']) {
      const { r, body } = await json('/api/alternatives', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: pid, shopId: shop, reason }),
      });
      expect(r.status).toBe(200);
      expect(body.reason).toBe(reason);
      expect(typeof body.relativeChips).toBe('object');
    }
  });

  it('GET /api/meta/data-quality exposes rule hit counts', async () => {
    const { r, body } = await json('/api/meta/data-quality');
    expect(r.status).toBe(200);
    expect(body.counts.price_rule_missing).toBeGreaterThanOrEqual(0);
    expect(body.counts.shop_tier_A).toBeGreaterThan(0);
    expect(body.lines.length).toBeGreaterThan(2);
  });

  it('meta exposes dataAsOf (snapshot) and clock', async () => {
    const { body } = await json('/api/meta');
    expect(body.dataAsOf).toBe(body.catalog.dataAsOf);
    expect(body.dataAsOf.endsWith('Z')).toBe(true);
    expect(body.clock.demo).toBe(false);
  });
});
