/**
 * REST endpoints backed by catalog services (docs/ARCHITECTURE.md §7, rows owned by "services").
 * Pure, time-independent GETs are cacheable for 60 s; anything depending on context/time is no-store.
 */
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Audience, NeedSpec, SearchRequest, SearchSort, StoreSort, UserContext } from '@titl/shared';
import type { AppDeps } from '../deps.js';
import { badRequest, body, csvParam, ctxFrom, intParam, notFound, numParam } from '../http.js';

const PUBLIC = 'public, max-age=60';
const NO_STORE = 'no-store';

const SEARCH_SORTS: SearchSort[] = ['relevance', 'price_asc', 'price_desc', 'sellers', 'distance'];
const STORE_SORTS: StoreSort[] = ['smart', 'price', 'distance', 'freshness'];
const AUDIENCES: Audience[] = ['men', 'women', 'kids', 'unisex'];

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const providers = z.enum(['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other']);
const travelMode = z.enum(['walk', 'metro', 'taxi', 'car']);
const contextSchema = z
  .object({
    location: latLng.extend({ label: z.string().max(200), source: z.enum(['gps', 'place', 'map']) }).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    installment: z.boolean().optional(),
    providers: z.array(providers).max(6).optional(),
    openNow: z.boolean().optional(),
    warrantyOnly: z.boolean().optional(),
    fastDelivery: z.boolean().optional(),
    kalabarg: z.boolean().optional(),
    maxDistanceKm: z.number().positive().max(100).optional(),
    travelMode: travelMode.optional(),
    visitAt: z.string().max(40).optional(),
    range: z
      .object({
        kind: z.enum(['radius', 'areas', 'time', 'route']),
        km: z.number().positive().max(60).optional(),
        areas: z.array(z.string().max(80)).max(12).optional(),
        maxMinutes: z.number().positive().max(240).optional(),
        dest: latLng.extend({ label: z.string().max(200).optional() }).optional(),
      })
      .optional(),
    priority: z.enum(['balanced', 'price', 'time', 'certainty']).optional(),
    needBy: z.string().max(40).optional(),
    showReplicas: z.boolean().optional(),
  })
  .strip();

const isoDate = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'تاریخ نامعتبر است');

const alternativesSchema = z.object({
  productId: z.string().min(1).max(100).optional(),
  shopId: z.string().min(1).max(100).optional(),
  reason: z.enum(['closed', 'out_of_stock', 'no_answer', 'not_found', 'too_expensive', 'unreachable', 'over_budget', 'no_installment']),
  context: contextSchema.optional(),
  origin: latLng.optional(),
});

const planSchema = z.object({
  stops: z.array(z.object({ shopId: z.string().min(1).max(100), productId: z.string().min(1).max(100).optional() })).min(1).max(12),
  origin: latLng.optional(),
  departAt: isoDate.optional(),
  mode: travelMode.optional(),
  keepOrder: z.boolean().optional(),
  context: contextSchema.optional(),
});

function cache(c: Context, v: string) {
  c.header('Cache-Control', v);
}

function boolParam(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === '1' || v === 'true';
}

/** Merge a body context over the query-string context (body wins). */
function mergeCtx(base: UserContext, extra: UserContext | undefined): UserContext {
  if (!extra) return base;
  const out: UserContext = { ...base };
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

export function registerCatalogRoutes(app: Hono, deps: AppDeps): void {
  const s = deps.services;

  app.get('/api/meta', (c) => {
    cache(c, PUBLIC);
    return c.json(s.meta());
  });

  // DT15: rule hit counts of the ETL run + /about lines
  app.get('/api/meta/data-quality', (c) => {
    cache(c, PUBLIC);
    return c.json(s.dataQuality());
  });

  // SV1: need-level store finder («کجا بروم؟»)
  app.get('/api/need/stores', (c) => {
    const q = c.req.query();
    const need: NeedSpec = {};
    const category = q.category ?? q.categoryId;
    if (category) need.categoryId = category.slice(0, 120);
    if (q.group) need.group = q.group.slice(0, 40);
    if (q.brand) need.brand = q.brand.slice(0, 80);
    if (q.audience && AUDIENCES.includes(q.audience as Audience)) need.audience = q.audience as Audience;
    const bMin = numParam(q.budgetMin);
    const bMax = numParam(q.budgetMax);
    if (bMin !== undefined) need.budgetMin = bMin;
    if (bMax !== undefined) need.budgetMax = bMax;
    if (q.size) need.size = q.size.slice(0, 20);
    const kw = csvParam(q.keywords, 6);
    if (kw.length) need.keywords = kw;
    else if (q.q) need.keywords = q.q.slice(0, 120).split(/\s+/).filter(Boolean).slice(0, 6);
    const ids = csvParam(q.productId ?? q.ids, 12);
    if (ids.length) need.productIds = ids;
    if (!need.categoryId && !need.group && !need.brand && !need.keywords && !need.productIds) {
      throw badRequest('حداقل یکی از category، group، brand، q یا productId لازم است.');
    }
    cache(c, NO_STORE);
    return c.json(s.getStoresForNeed(need, ctxFrom(c), { limit: intParam(q.limit, 30, 1, 100) }));
  });

  // SV1 shortlist variant: coverage per shop for a list of products
  app.get('/api/shortlist/stores', (c) => {
    const ids = csvParam(c.req.query('ids'), 12);
    if (!ids.length) throw badRequest('شناسه کالاها (ids) لازم است.');
    cache(c, NO_STORE);
    return c.json(s.getStoresForNeed({ productIds: ids }, ctxFrom(c), { limit: intParam(c.req.query('limit'), 30, 1, 100) }));
  });

  app.get('/api/places', (c) => {
    cache(c, PUBLIC);
    return c.json(s.places(c.req.query('q') ?? '', intParam(c.req.query('limit'), 10, 1, 30)));
  });

  app.get('/api/places/reverse', (c) => {
    const lat = numParam(c.req.query('lat'));
    const lng = numParam(c.req.query('lng'));
    if (lat === undefined || lng === undefined) throw badRequest('مختصات (lat و lng) لازم است.');
    cache(c, PUBLIC);
    return c.json(s.reversePlace({ lat, lng }));
  });

  app.get('/api/search', (c) => {
    const q = c.req.query();
    const sort = q.sort as SearchSort | undefined;
    const audience = q.audience as Audience | undefined;
    const req: SearchRequest = {};
    if (q.q) req.q = q.q.slice(0, 200);
    if (q.category) req.category = q.category;
    if (q.group) req.group = q.group;
    if (q.brand) req.brand = q.brand;
    const pMin = numParam(q.priceMin);
    const pMax = numParam(q.priceMax);
    if (pMin !== undefined) req.priceMin = pMin;
    if (pMax !== undefined) req.priceMax = pMax;
    const ms = numParam(q.minSellers);
    if (ms !== undefined) req.minSellers = ms;
    if (boolParam(q.nearOnly)) req.nearOnly = true;
    if (audience && AUDIENCES.includes(audience)) req.audience = audience;
    const spec = c.req.queries('spec')?.filter((x) => x.includes('::')).slice(0, 8);
    if (spec?.length) req.spec = spec;
    if (sort && SEARCH_SORTS.includes(sort)) req.sort = sort;
    req.page = intParam(q.page, 1, 1, 100);
    req.limit = intParam(q.limit, 24, 1, 60);
    cache(c, NO_STORE);
    return c.json(s.search(req, ctxFrom(c)));
  });

  app.get('/api/suggest', (c) => {
    cache(c, PUBLIC);
    return c.json(s.suggest((c.req.query('q') ?? '').slice(0, 100)));
  });

  app.get('/api/discover', (c) => {
    const input: { q?: string; category?: string } = {};
    const q = c.req.query('q');
    const category = c.req.query('category');
    if (q) input.q = q.slice(0, 200);
    if (category) input.category = category;
    cache(c, NO_STORE);
    return c.json(s.discover(input, ctxFrom(c)));
  });

  app.get('/api/products/:id', (c) => {
    const p = s.getProduct(c.req.param('id'), ctxFrom(c));
    if (!p) throw notFound('کالا');
    cache(c, NO_STORE);
    return c.json(p);
  });

  app.get('/api/products/:id/stores', (c) => {
    const sort = c.req.query('sort') as StoreSort | undefined;
    const opts: { sort?: StoreSort; limit?: number } = {};
    if (sort && STORE_SORTS.includes(sort)) opts.sort = sort;
    const limit = numParam(c.req.query('limit'));
    if (limit !== undefined) opts.limit = intParam(String(limit), 50, 1, 500);
    const r = s.getStores(c.req.param('id'), ctxFrom(c), opts);
    if (!r) throw notFound('کالا');
    cache(c, NO_STORE);
    return c.json(r);
  });

  app.get('/api/products/:id/similar', (c) => {
    const id = c.req.param('id');
    const ctx = ctxFrom(c);
    if (!s.getProductSummary(id, ctx)) throw notFound('کالا');
    cache(c, NO_STORE);
    return c.json(s.getSimilar(id, ctx, intParam(c.req.query('limit'), 8, 1, 24)));
  });

  app.get('/api/products/:id/areas', (c) => {
    const id = c.req.param('id');
    const ctx = ctxFrom(c);
    if (!s.getProductSummary(id, ctx)) throw notFound('کالا');
    cache(c, NO_STORE);
    return c.json(s.getAreas(id, ctx));
  });

  app.get('/api/compare/products', (c) => {
    const ids = csvParam(c.req.query('ids'), 4);
    if (!ids.length) throw badRequest('شناسه کالاها (ids) لازم است.');
    cache(c, NO_STORE);
    return c.json(s.compareProducts(ids, ctxFrom(c)));
  });

  app.get('/api/compare/stores', (c) => {
    const product = c.req.query('product');
    const shops = csvParam(c.req.query('shops'), 4);
    if (!product || !shops.length) throw badRequest('شناسه کالا (product) و فروشگاه‌ها (shops) لازم است.');
    const r = s.compareStores(product, shops, ctxFrom(c));
    if (!r) throw notFound('کالا');
    cache(c, NO_STORE);
    return c.json(r);
  });

  app.get('/api/shops', (c) => {
    cache(c, PUBLIC);
    return c.json(s.findShops((c.req.query('q') ?? '').slice(0, 100), intParam(c.req.query('limit'), 20, 1, 50)));
  });

  app.get('/api/shops/:id', (c) => {
    const r = s.getShop(c.req.param('id'), ctxFrom(c));
    if (!r) throw notFound('فروشگاه');
    cache(c, NO_STORE);
    return c.json(r);
  });

  app.get('/api/shops/:id/products', (c) => {
    const id = c.req.param('id');
    const ctx = ctxFrom(c);
    if (!s.getShopLite(id, ctx)) throw notFound('فروشگاه');
    const opts: { q?: string; page?: number; limit?: number } = {
      page: intParam(c.req.query('page'), 1, 1, 200),
      limit: intParam(c.req.query('limit'), 24, 1, 60),
    };
    const q = c.req.query('q');
    if (q) opts.q = q.slice(0, 100);
    cache(c, NO_STORE);
    return c.json(s.getShopProducts(id, opts, ctx));
  });

  app.get('/api/malls/:slug', (c) => {
    const r = s.getMall(c.req.param('slug'), ctxFrom(c));
    if (!r) throw notFound('پاساژ');
    cache(c, NO_STORE);
    return c.json(r);
  });

  app.post('/api/alternatives', async (c) => {
    const b = await body(c, alternativesSchema);
    if (!b.productId && !b.shopId) throw badRequest('حداقل یکی از productId یا shopId لازم است.');
    const req = { reason: b.reason, context: mergeCtx(ctxFrom(c), b.context as UserContext | undefined) } as Parameters<typeof s.alternatives>[0];
    if (b.productId) req.productId = b.productId;
    if (b.shopId) req.shopId = b.shopId;
    if (b.origin) req.origin = b.origin;
    cache(c, NO_STORE);
    return c.json(s.alternatives(req));
  });

  app.post('/api/plan', async (c) => {
    const b = await body(c, planSchema);
    const { context, ...rest } = b;
    const ctx = mergeCtx(ctxFrom(c), context as UserContext | undefined);
    const known = rest.stops.filter((st) => s.getShopLite(st.shopId, {}));
    if (!known.length) throw notFound('فروشگاه‌های برنامه');
    const req = { stops: known.map((st) => (st.productId ? { shopId: st.shopId, productId: st.productId } : { shopId: st.shopId })) } as Parameters<typeof s.plan>[0];
    if (rest.origin) req.origin = rest.origin;
    if (rest.departAt) req.departAt = rest.departAt;
    if (rest.mode) req.mode = rest.mode;
    if (rest.keepOrder) req.keepOrder = true;
    cache(c, NO_STORE);
    return c.json(await s.plan(req, ctx));
  });
}
