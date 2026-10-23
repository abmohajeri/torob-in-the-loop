import { describe, expect, it } from 'vitest';
import { hasFixture, testCatalog } from './helpers/catalog.js';

const d = hasFixture ? describe : describe.skip;
const LOC = 'lat=35.7575&lng=51.4098';

d('catalog REST API (fixture.db)', () => {
  const { app, catalog } = testCatalog();
  const get = (p: string) => app.request(p);
  const json = async <T = any>(p: string, init?: RequestInit) => {
    const r = await app.request(p, init);
    return { r, body: (await r.json()) as T };
  };
  const topProduct = () => catalog.get<{ id: string }>('SELECT p.id FROM products p JOIN offers o ON o.product_rid=p.rid GROUP BY p.rid ORDER BY count(*) DESC LIMIT 1')!.id;
  const shopsOf = (pid: string) =>
    catalog.all<{ id: string }>('SELECT DISTINCT s.id FROM offers o JOIN shops s ON s.rid=o.shop_rid JOIN products p ON p.rid=o.product_rid WHERE p.id=? LIMIT 3', pid).map((x) => x.id);

  it('GET /api/meta is cacheable', async () => {
    const { r } = await json('/api/meta');
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toContain('max-age=60');
  });

  it('GET /api/search parses Persian and is no-store', async () => {
    const { r, body } = await json(`/api/search?q=${encodeURIComponent('گوشی سامسونگ زیر ۲۰ میلیون')}&${LOC}`);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(body.parsed.budgetMax).toBe(20_000_000);
    expect(body.items.length).toBeGreaterThan(0);
    for (const it of body.items) if (it.minPrice != null) expect(it.minPrice).toBeLessThanOrEqual(20_000_000);
  });

  it('GET /api/discover returns data-driven questions with counts', async () => {
    const { body } = await json(`/api/discover?q=${encodeURIComponent('کتونی')}`);
    expect(body.questions.length).toBeGreaterThan(0);
    const budget = body.questions.find((q: any) => q.title.includes('بودجه'));
    expect(budget).toBeTruthy();
    for (const o of budget.options) expect(o.count).toBeGreaterThan(0);
  });

  it('product detail, stores, similar, areas', async () => {
    const id = topProduct();
    const p = await json(`/api/products/${id}?${LOC}`);
    expect(p.r.status).toBe(200);
    const st = await json(`/api/products/${id}/stores?${LOC}`);
    expect(st.r.status).toBe(200);
    expect(st.body.stores.length).toBeGreaterThan(1);
    const s0 = st.body.stores[0];
    expect(s0.shop.distanceKm).toBeTypeOf('number');
    expect(s0.shop.openStatus.label).toBeTruthy();
    const scores = st.body.stores.map((s: any) => s.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect((await get(`/api/products/${id}/similar`)).status).toBe(200);
    expect((await get(`/api/products/${id}/areas?${LOC}`)).status).toBe(200);
  });

  it('404s for unknown ids', async () => {
    expect((await get('/api/products/nope')).status).toBe(404);
    expect((await get('/api/products/nope/stores')).status).toBe(404);
    expect((await get('/api/shops/nope')).status).toBe(404);
    expect((await get('/api/malls/nope')).status).toBe(404);
  });

  it('compare stores: Kalabarg shown as «ثبت نشده»', async () => {
    const id = topProduct();
    const { r, body } = await json(`/api/compare/stores?product=${id}&shops=${shopsOf(id).join(',')}&${LOC}`);
    expect(r.status).toBe(200);
    expect(JSON.stringify(body)).toContain('ثبت نشده');
  });

  it('compare products', async () => {
    const ids = catalog.all<{ id: string }>("SELECT id FROM products LIMIT 2").map((x) => x.id);
    const { r, body } = await json(`/api/compare/products?ids=${ids.join(',')}`);
    expect(r.status).toBe(200);
    expect(body.summary).toBeTruthy();
  });

  it('shop detail + products + mall', async () => {
    const shop = shopsOf(topProduct())[0]!;
    expect((await get(`/api/shops/${shop}?${LOC}`)).status).toBe(200);
    expect((await get(`/api/shops/${shop}/products`)).status).toBe(200);
    const slug = catalog.get<{ slug: string }>('SELECT slug FROM malls LIMIT 1')!.slug;
    expect((await get(`/api/malls/${encodeURIComponent(slug)}`)).status).toBe(200);
  });

  it('places + suggest', async () => {
    expect((await get(`/api/places?q=${encodeURIComponent('تجریش')}`)).status).toBe(200);
    expect((await get(`/api/suggest?q=${encodeURIComponent('گوش')}`)).status).toBe(200);
  });

  it('POST /api/plan validates and plans', async () => {
    const bad = await app.request('/api/plan', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stops: [] }) });
    expect([400, 422]).toContain(bad.status);
    const id = topProduct();
    const stops = shopsOf(id).map((shopId) => ({ shopId, productId: id }));
    const { r, body } = await json('/api/plan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stops, origin: { lat: 35.7575, lng: 51.4098 }, departAt: '2026-10-24T10:00:00+03:30', mode: 'taxi' }),
    });
    expect(r.status).toBe(200);
    expect(body.stops.length).toBe(stops.length);
    expect(body.stops.map((s: any) => s.order)).toEqual(stops.map((_, i) => i + 1));
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('POST /api/plan on a Friday warns', async () => {
    const id = topProduct();
    const { body } = await json('/api/plan', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stops: shopsOf(id).map((shopId) => ({ shopId })), departAt: '2026-10-23T11:00:00+03:30' }),
    });
    expect(JSON.stringify(body.warnings)).toContain('جمعه');
  });

  it('POST /api/alternatives', async () => {
    const id = topProduct();
    const bad = await app.request('/api/alternatives', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"reason":"x"}' });
    expect([400, 422]).toContain(bad.status);
    const { r } = await json('/api/alternatives', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: id, shopId: shopsOf(id)[0], reason: 'closed' }),
    });
    expect(r.status).toBe(200);
  });
});
