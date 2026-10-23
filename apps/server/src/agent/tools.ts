/**
 * Agent tools: JSON-schema definitions (OpenAI function calling) + implementations over Services / ContactModule.
 * Every tool returns { llm: compact JSON (≤ 1.5k chars), blocks, patch, digest }.
 * Entities are exposed to the LLM as short handles (P1 / S1 / I1) that the executor maps back to real ids (AG2).
 */
import {
  DEFAULT_INQUIRY_QUESTIONS,
  PROVIDERS,
  formatNumber,
  formatTomanShort,
  type AltReason,
  type Audience,
  type Inquiry,
  type InquiryQuestion,
  type NeedSpec,
  type NeedStoresResponse,
  type ProductSummary,
  type ProviderCode,
  type SearchRequest,
  type SearchSort,
  type StoreOffer,
  type StoreSort,
  type TravelMode,
  type UIBlock,
  type UserContext,
} from '@titl/shared';
import type { AgentDeps } from '../deps.js';
import type { LlmToolDef } from './llm.js';
import type { AgentMemory } from './memory.js';
import { planInsights, productInsights, storeInsights } from './insights.js';
import { needStoresFallback } from './need.js';

export interface ToolEnv {
  deps: AgentDeps;
  sessionId: string;
  /** Mutable effective context for this turn (patches are applied in place). */
  ctx: UserContext;
  mem: AgentMemory;
  now: Date;
  signal?: AbortSignal;
}

export interface ToolOutput {
  llm: string;
  blocks: UIBlock[];
  patch?: Partial<UserContext>;
  /** One-line Persian digest kept in chat history («[ابزار find_stores: …]»). */
  digest: string;
  /** Short structured facts the rules composer can use. */
  facts?: Record<string, unknown>;
  error?: boolean;
}

export class ToolError extends Error {}

const fa = (n: number) => formatNumber(n);
const cut = (s: string | null | undefined, n = 40) => (s ? (s.length > n ? `${s.slice(0, n - 1)}…` : s) : null);
const LLM_CAP = 1500;

function capJson(o: unknown): string {
  let s = JSON.stringify(o);
  if (s.length <= LLM_CAP) return s;
  // Trim the longest array until it fits.
  const obj = JSON.parse(s) as Record<string, unknown>;
  for (let i = 0; i < 30 && s.length > LLM_CAP; i++) {
    const arrKey = Object.keys(obj)
      .filter((k) => Array.isArray(obj[k]) && (obj[k] as unknown[]).length > 1)
      .sort((a, b) => JSON.stringify(obj[b]).length - JSON.stringify(obj[a]).length)[0];
    if (!arrKey) break;
    (obj[arrKey] as unknown[]).pop();
    s = JSON.stringify(obj);
  }
  return s.length > LLM_CAP ? `${s.slice(0, LLM_CAP - 3)}…` : s;
}

// ───────────────────────── handles ─────────────────────────

export function handleFor(mem: AgentMemory, prefix: 'P' | 'S' | 'I', id: string): string {
  for (const [h, v] of Object.entries(mem.handles)) if (v === id && h.startsWith(prefix)) return h;
  let n = 1;
  while (mem.handles[`${prefix}${n}`]) n++;
  const h = `${prefix}${n}`;
  mem.handles[h] = id;
  return h;
}

export function resolveId(mem: AgentMemory, ref: unknown): string {
  if (typeof ref !== 'string' || !ref.trim()) throw new ToolError('شناسه خالی است');
  const r = ref.trim();
  const up = r.toUpperCase();
  if (/^[PSI]\d+$/.test(up)) {
    const id = mem.handles[up];
    if (!id) throw new ToolError(`شناسهٔ کوتاه ناشناخته: ${r}`);
    return id;
  }
  return r;
}

// ───────────────────────── tool definitions ─────────────────────────

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });
const ids = (description: string, min: number, max: number) => ({ type: 'array', items: { type: 'string' }, minItems: min, maxItems: max, description });

function def(name: string, description: string, properties: Record<string, unknown>, required: string[] = []): LlmToolDef {
  return { type: 'function', function: { name, description, parameters: { type: 'object', properties, required, additionalProperties: false } } };
}

export const TOOL_DEFS: LlmToolDef[] = [
  def(
    'search_products',
    'Search the catalog of in-person Tehran sellers. User context (location, budget, installment, open now) is applied automatically. Returns product handles P1…',
    {
      query: str('Persian free text, e.g. «گوشی سامسونگ A07»'),
      category: str('Category name if known'),
      brand: str('Brand'),
      budget_min: num('Toman'),
      budget_max: num('Toman'),
      audience: { type: 'string', enum: ['men', 'women', 'kids', 'unisex'] },
      near_only: bool('Only products with a seller near the user'),
      sort: { type: 'string', enum: ['relevance', 'price_asc', 'price_desc', 'sellers', 'distance'] },
    },
    ['query'],
  ),
  def('discovery_questions', 'Short data-driven questions (budget, size, use…) to narrow a vague need. After calling, stop and wait for the user.', {
    query: str('User need text'),
    category: str('Category'),
  }),
  def('get_product', 'Product details (specs, price stats, notes).', { product_id: str('P handle or id') }, ['product_id']),
  def('compare_products', 'Compare 2–4 products side by side.', { product_ids: ids('P handles', 2, 4) }, ['product_ids']),
  def(
    'find_stores',
    'In-person stores that carry a product, ranked by price/distance/hours/freshness, plus nearby areas and insights. Returns shop handles S1…',
    { product_id: str('P handle or id'), sort: { type: 'string', enum: ['smart', 'price', 'distance', 'freshness'] } },
    ['product_id'],
  ),
  def('find_stores_for_need', 'Stores that carry many models of a need (category/brand/budget/size) when the user has no exact model.', {
    query: str('Need in Persian, e.g. «کتانی مردانه سایز ۴۳»'),
    category: str('Category'),
    brand: str('Brand'),
    budget_max: num('Toman'),
    size: str('Size'),
  }),
  def('compare_stores', 'Compare 2–4 stores for one product.', { product_id: str('P handle'), shop_ids: ids('S handles', 2, 4) }, ['product_id', 'shop_ids']),
  def('nearby_areas', 'Shopping areas/clusters that carry the product, with distance and metro.', { product_id: str('P handle (optional)') }),
  def('shop_info', 'Shop details: hours, in-mall location guide, payments, reports.', { shop_id: str('S handle or id') }, ['shop_id']),
  def('mall_info', 'A passage/mall: floors, shops, tips.', { mall: str('mall slug, id or Persian name') }, ['mall']),
  def('check_visit', 'Check if shops are open at the planned visit time (or a given time).', { shop_ids: ids('S handles', 1, 6), at: str('ISO time (optional)') }, ['shop_ids']),
  def(
    'contact_stores',
    'Ask stores (SIMULATED call / seller inbox) about stock, today price, hours, hold, installment… Results stream into the UI.',
    {
      shop_ids: ids('S handles', 1, 5),
      product_id: str('P handle'),
      questions: { type: 'array', items: { type: 'string', enum: ['stock', 'price', 'hours', 'hold', 'installment', 'kalabarg', 'location', 'warranty'] } },
      custom_question: str('Free-text question'),
    },
    ['shop_ids'],
  ),
  def('inquiry_status', 'Status/digest of the inquiries in this session ("what did they say?").', {}),
  def(
    'find_alternatives',
    'Alternatives when a store was closed / out of stock / did not answer / not found / too expensive.',
    {
      reason: { type: 'string', enum: ['closed', 'out_of_stock', 'no_answer', 'not_found', 'too_expensive', 'unreachable'] },
      product_id: str('P handle'),
      shop_id: str('S handle'),
    },
    ['reason'],
  ),
  def(
    'plan_visit',
    'Plan a visit route across shops (order, travel time, open at arrival, in-mall guide).',
    { shop_ids: ids('S handles', 1, 8), product_id: str('P handle'), depart_at: str('ISO time'), mode: { type: 'string', enum: ['walk', 'metro', 'taxi', 'car'] } },
    ['shop_ids'],
  ),
  def('update_preferences', 'Save new user constraints (applies to all later tools).', {
    location_label: str('Area/landmark in Tehran, e.g. «ونک»'),
    budget_min: num('Toman'),
    budget_max: num('Toman'),
    installment: bool('Needs installment'),
    providers: { type: 'array', items: { type: 'string', enum: ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam'] } },
    open_now: bool('Only open at visit time'),
    warranty_only: bool('Only with warranty'),
    max_distance_km: num('km'),
    travel_mode: { type: 'string', enum: ['walk', 'metro', 'taxi', 'car'] },
    visit_at: str('ISO time of the visit'),
  }),
  def(
    'suggest_replies',
    'Show 2–4 tappable next steps. Always call last.',
    {
      options: {
        type: 'array',
        maxItems: 4,
        items: { type: 'object', properties: { label: { type: 'string' }, message: { type: 'string' } }, required: ['label', 'message'] },
      },
    },
    ['options'],
  ),
];

export const TOOL_STATUS: Record<string, string> = {
  search_products: 'در حال جستجو میان ۲۲۵ هزار کالا…',
  discovery_questions: 'در حال آماده کردن چند سؤال کوتاه…',
  get_product: 'خواندن مشخصات کالا…',
  compare_products: 'مقایسهٔ مشخصات…',
  find_stores: 'پیدا کردن فروشنده‌های حضوری نزدیک شما…',
  find_stores_for_need: 'پیدا کردن فروشگاه‌هایی که چند مدل را یک‌جا دارند…',
  compare_stores: 'مقایسهٔ فروشگاه‌ها…',
  nearby_areas: 'بررسی محله‌ها و پاساژهای نزدیک…',
  shop_info: 'بررسی ساعت کاری و نشانی فروشگاه…',
  mall_info: 'بررسی پاساژ…',
  check_visit: 'بررسی باز بودن فروشگاه‌ها هنگام رسیدن…',
  contact_stores: 'تماس با فروشگاه‌ها…',
  inquiry_status: 'بررسی نتیجهٔ استعلام‌ها…',
  find_alternatives: 'یافتن جایگزین…',
  plan_visit: 'برنامه‌ریزی مسیر بازدید…',
  update_preferences: 'به‌روزرسانی ترجیحات شما…',
  suggest_replies: '',
};

// ───────────────────────── helpers ─────────────────────────

function applyPatch(env: ToolEnv, patch: Partial<UserContext>): void {
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    (env.ctx as Record<string, unknown>)[k] = v;
  }
}

function productLlm(env: ToolEnv, p: ProductSummary) {
  return {
    h: handleFor(env.mem, 'P', p.id),
    title: cut(p.title),
    brand: p.brand,
    price: p.priceMin != null ? `${formatTomanShort(p.priceMin, false)}–${formatTomanShort(p.priceMax, false)}` : 'ثبت نشده',
    sellers: p.sellerCount,
    near: p.sellersNearby,
    inst: p.installmentSellers || undefined,
    fresh: p.freshness,
  };
}

function storeLlm(env: ToolEnv, s: StoreOffer) {
  return {
    h: handleFor(env.mem, 'S', s.shop.id),
    name: cut(s.shop.name, 30),
    price: s.price.price,
    age_d: s.price.ageDays,
    km: s.shop.distanceKm != null ? Math.round(s.shop.distanceKm * 10) / 10 : null,
    open: s.shop.openStatus.label,
    mall: s.shop.location.mall?.name ?? s.shop.area,
    inst: s.shop.payment.installment || undefined,
    verified: s.verified ? { stock: s.verified.stock, price: s.verified.price } : undefined,
  };
}

function focusProduct(env: ToolEnv, p: { id: string; title: string }): void {
  env.mem.focusProductId = p.id;
  env.mem.focusProductTitle = p.title;
}

function num0(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];
}

// ───────────────────────── implementations ─────────────────────────

type Impl = (env: ToolEnv, args: Record<string, unknown>) => Promise<ToolOutput> | ToolOutput;

const impls: Record<string, Impl> = {
  search_products(env, a) {
    const s = env.deps.services;
    const query = String(a.query ?? '').slice(0, 200);
    const parsed = s.parseQuery(query, env.ctx);
    const patch: Partial<UserContext> = {};
    if (parsed.location && parsed.areaLabel) patch.location = { ...parsed.location, label: parsed.areaLabel, source: 'place' };
    if (parsed.installment && !env.ctx.installment) patch.installment = true;
    if (parsed.openNow && !env.ctx.openNow) patch.openNow = true;
    if (parsed.budgetMax && parsed.budgetMax !== env.ctx.budgetMax) patch.budgetMax = parsed.budgetMax;
    applyPatch(env, patch);
    const req: SearchRequest = { q: query, limit: 8 };
    if (typeof a.category === 'string') req.category = a.category;
    if (typeof a.brand === 'string') req.brand = a.brand;
    const bmin = num0(a.budget_min);
    const bmax = num0(a.budget_max);
    if (bmin) req.priceMin = bmin;
    if (bmax) req.priceMax = bmax;
    if (typeof a.audience === 'string') req.audience = a.audience as Audience;
    if (a.near_only === true) req.nearOnly = true;
    if (typeof a.sort === 'string') req.sort = a.sort as SearchSort;
    const r = s.search(req, env.ctx);
    env.mem.lastQuery = query;
    env.mem.lastCategory = r.parsed.category ?? env.mem.lastCategory;
    env.mem.lastProductIds = r.items.map((p) => p.id);
    if (r.items.length === 1 || (r.items[0] && r.total <= 40 && !r.parsed.category)) focusProduct(env, r.items[0]!);
    const blocks: UIBlock[] = [{ kind: 'products', items: r.items, parsed: r.parsed, total: r.total }];
    const ins = productInsights(r.items, r.total, env.ctx);
    if (ins.length) blocks.push({ kind: 'insights', items: ins });
    const top = r.items[0];
    return {
      llm: capJson({
        total: r.total,
        parsed: { category: r.parsed.category, brand: r.parsed.brand, budgetMax: r.parsed.budgetMax, area: r.parsed.areaLabel },
        notices: r.notices?.map((n) => n.label),
        items: r.items.slice(0, 6).map((p) => productLlm(env, p)),
        insights: ins.map((i) => i.text),
      }),
      blocks,
      ...(Object.keys(patch).length ? { patch } : {}),
      digest: `[ابزار search_products «${cut(query, 30)}»: ${fa(r.total)} نتیجه${top ? `؛ اولی ${cut(top.title, 30)}` : ''}]`,
      facts: { total: r.total, items: r.items, parsed: r.parsed },
    };
  },

  discovery_questions(env, a) {
    const input: { q?: string; category?: string } = {};
    if (typeof a.query === 'string') input.q = a.query;
    if (typeof a.category === 'string') input.category = a.category;
    const d = env.deps.services.discover(input, env.ctx);
    if (d.category) env.mem.lastCategory = d.category;
    return {
      llm: capJson({ category: d.category, total: d.totalProducts, intro: d.intro, questions: d.questions.slice(0, 3).map((q) => ({ title: q.title, options: q.options.slice(0, 5).map((o) => `${o.label} (${o.count})`) })) }),
      blocks: [{ kind: 'discovery', data: d }],
      digest: `[ابزار discovery_questions: ${d.category ?? '—'}، ${fa(d.totalProducts)} مدل]`,
      facts: { discovery: d },
    };
  },

  get_product(env, a) {
    const id = resolveId(env.mem, a.product_id);
    const p = env.deps.services.getProduct(id, env.ctx);
    if (!p) throw new ToolError('کالا پیدا نشد');
    focusProduct(env, p);
    return {
      llm: capJson({ ...productLlm(env, p), specs: p.specs.slice(0, 10).map((x) => `${x.key}: ${x.value}`), notes: p.notes, median: p.priceMedian }),
      blocks: [{ kind: 'product', data: p }],
      digest: `[ابزار get_product: ${cut(p.title, 30)}]`,
      facts: { product: p },
    };
  },

  compare_products(env, a) {
    const list = strArr(a.product_ids).map((x) => resolveId(env.mem, x)).slice(0, 4);
    if (list.length < 2) throw new ToolError('حداقل دو کالا لازم است');
    const r = env.deps.services.compareProducts(list, env.ctx);
    return {
      llm: capJson({ products: r.products.map((p) => productLlm(env, p)), differs: r.rows.filter((x) => x.differs).slice(0, 8).map((x) => ({ k: x.key, v: x.values })), summary: r.summary }),
      blocks: [{ kind: 'compare_products', data: r }],
      digest: `[ابزار compare_products: ${fa(r.products.length)} کالا]`,
      facts: { compare: r },
    };
  },

  find_stores(env, a) {
    const id = resolveId(env.mem, a.product_id);
    const opts: { sort?: StoreSort; limit?: number } = { limit: 30 };
    if (typeof a.sort === 'string') opts.sort = a.sort as StoreSort;
    const r = env.deps.services.getStores(id, env.ctx, opts);
    if (!r) throw new ToolError('کالا پیدا نشد');
    focusProduct(env, r.product);
    env.mem.lastShopIds = r.stores.slice(0, 10).map((s) => s.shop.id);
    env.mem.focusShopId = r.stores[0]?.shop.id ?? env.mem.focusShopId;
    const ins = storeInsights(r, env.ctx, env.now);
    const blocks: UIBlock[] = [{ kind: 'stores', data: r, limit: 5 }];
    if (ins.length) blocks.push({ kind: 'insights', items: ins });
    const prices = r.stores.map((s) => s.price.price).filter((x): x is number => x != null);
    return {
      llm: capJson({
        product: productLlm(env, r.product),
        count: r.stores.length,
        hidden_by_filters: r.excludedByFilters,
        category_only: r.categoryOnly.length,
        stores: r.stores.slice(0, 6).map((s) => storeLlm(env, s)),
        areas: r.areas.slice(0, 3).map((x) => ({ area: x.area, n: x.storeCount, km: x.distanceKm })),
        insights: ins.map((i) => i.text),
      }),
      blocks,
      digest: `[ابزار find_stores: ${fa(r.stores.length)} فروشنده${prices.length ? `؛ ارزان‌ترین ${formatTomanShort(Math.min(...prices))}` : ''}]`,
      facts: { stores: r, insights: ins },
    };
  },

  find_stores_for_need(env, a) {
    const s = env.deps.services as typeof env.deps.services & { needStores?: (need: NeedSpec, ctx: UserContext) => NeedStoresResponse };
    const q = typeof a.query === 'string' && a.query.trim() ? a.query : env.mem.lastQuery ?? '';
    const parsed = s.parseQuery(q, env.ctx);
    const need: NeedSpec = {};
    const cat = (typeof a.category === 'string' && a.category) || parsed.category || env.mem.lastCategory;
    if (cat) need.categoryId = cat;
    const brand = (typeof a.brand === 'string' && a.brand) || parsed.brand;
    if (brand) need.brand = brand;
    const bmax = num0(a.budget_max) ?? parsed.budgetMax ?? env.ctx.budgetMax;
    if (bmax) need.budgetMax = bmax;
    if (typeof a.size === 'string') need.size = a.size;
    if (parsed.audience) need.audience = parsed.audience;
    if (!cat && parsed.keywords.length) need.keywords = parsed.keywords;
    const r = s.needStores ? s.needStores(need, env.ctx) : needStoresFallback(s, need, q, env.ctx);
    env.mem.lastShopIds = r.stores.slice(0, 10).map((x) => x.shop.id);
    env.mem.focusShopId = r.stores[0]?.shop.id ?? env.mem.focusShopId;
    const blocks: UIBlock[] = [{ kind: 'need_stores', data: r }];
    if (r.insights?.length) blocks.push({ kind: 'insights', items: r.insights });
    return {
      llm: capJson({
        total_models: r.totalMatchingProducts,
        clusters: r.clusters.slice(0, 2).map((c) => c.text),
        stores: r.stores.slice(0, 6).map((x) => ({ h: handleFor(env.mem, 'S', x.shop.id), name: cut(x.shop.name, 30), models: x.matchCount, from: x.priceMin, km: x.shop.distanceKm, open: x.shop.openStatus.label })),
      }),
      blocks,
      digest: `[ابزار find_stores_for_need: ${fa(r.stores.length)} فروشگاه، ${fa(r.totalMatchingProducts)} مدل]`,
      facts: { need: r },
    };
  },

  compare_stores(env, a) {
    const pid = resolveId(env.mem, a.product_id ?? env.mem.focusProductId);
    const shops = strArr(a.shop_ids).map((x) => resolveId(env.mem, x)).slice(0, 4);
    if (shops.length < 2) throw new ToolError('حداقل دو فروشگاه لازم است');
    const r = env.deps.services.compareStores(pid, shops, env.ctx);
    if (!r) throw new ToolError('کالا پیدا نشد');
    return {
      llm: capJson({ stores: r.stores.map((s) => storeLlm(env, s)), summary: r.summary }),
      blocks: [{ kind: 'compare_stores', data: r }],
      digest: `[ابزار compare_stores: ${fa(r.stores.length)} فروشگاه]`,
      facts: { compare: r },
    };
  },

  nearby_areas(env, a) {
    const pid = a.product_id ? resolveId(env.mem, a.product_id) : env.mem.focusProductId;
    const items = env.deps.services.getAreas(pid ?? null, env.ctx);
    const product = pid ? env.deps.services.getProductSummary(pid, env.ctx) : null;
    return {
      llm: capJson({ areas: items.slice(0, 6).map((x) => ({ area: x.area, n: x.storeCount, km: x.distanceKm, from: x.priceMin, metro: x.nearestMetro?.name, tz: x.inTrafficZone })) }),
      blocks: [{ kind: 'areas', product, items: items.slice(0, 6) }],
      digest: `[ابزار nearby_areas: ${fa(items.length)} محدوده]`,
      facts: { areas: items },
    };
  },

  shop_info(env, a) {
    const id = resolveId(env.mem, a.shop_id);
    const d = env.deps.services.getShop(id, env.ctx);
    if (!d) throw new ToolError('فروشگاه پیدا نشد');
    env.mem.focusShopId = d.id;
    return {
      llm: capJson({
        h: handleFor(env.mem, 'S', d.id),
        name: d.name,
        open: d.openStatus.label,
        guide: d.location.guide,
        confidence: d.location.confidence,
        payments: d.payment.options.map((o) => o.label),
        km: d.distanceKm,
        reports: d.reports.length,
        traffic_zone: d.inTrafficZone,
        metro: d.nearbyMetro[0]?.name,
      }),
      blocks: [{ kind: 'shop', data: d }],
      digest: `[ابزار shop_info: ${cut(d.name, 30)} — ${d.openStatus.label}]`,
      facts: { shop: d },
    };
  },

  mall_info(env, a) {
    const q = String(a.mall ?? '');
    let m = env.deps.services.getMall(q, env.ctx);
    if (!m) {
      const place = env.deps.services.places(q, 5).find((p) => p.kind === 'mall');
      if (place) m = env.deps.services.getMall(place.id.replace(/^mall:/, ''), env.ctx);
    }
    if (!m) throw new ToolError('پاساژ پیدا نشد');
    return {
      llm: capJson({ name: m.mall.name, shops: m.mall.shopCount, floors: m.floors.map((f) => `${f.label}: ${f.shops.length}`), tips: m.tips, metro: m.nearbyMetro[0]?.name }),
      blocks: [{ kind: 'mall', data: m }],
      digest: `[ابزار mall_info: ${m.mall.name}]`,
      facts: { mall: m },
    };
  },

  check_visit(env, a) {
    const shops = strArr(a.shop_ids).map((x) => resolveId(env.mem, x)).slice(0, 6);
    const at = typeof a.at === 'string' && !Number.isNaN(Date.parse(a.at)) ? new Date(a.at) : env.ctx.visitAt ? new Date(env.ctx.visitAt) : env.now;
    const rows = shops.map((id) => {
      const lite = env.deps.services.getShopLite(id, env.ctx);
      const st = env.deps.services.openStatus(id, at);
      return { id, name: lite?.name ?? id, eta: lite?.etaMin ?? null, st };
    });
    const warnings = rows.filter((r) => r.st.state === 'closed' || r.st.state === 'unknown' || (r.eta != null && r.st.minutesToClose != null && r.st.minutesToClose < r.eta + 15));
    const text = warnings.length
      ? `${warnings.map((w) => `${w.name}: ${w.st.label}`).join('؛ ')}.`
      : `همهٔ ${fa(rows.length)} فروشگاه در زمان مراجعه باز هستند.`;
    return {
      llm: capJson({ at: at.toISOString(), shops: rows.map((r) => ({ h: handleFor(env.mem, 'S', r.id), name: cut(r.name, 30), state: r.st.state, label: r.st.label, eta_min: r.eta })) }),
      blocks: [{ kind: 'notice', tone: warnings.length ? 'warn' : 'good', text }],
      digest: `[ابزار check_visit: ${fa(rows.length - warnings.length)} از ${fa(rows.length)} باز]`,
      facts: { rows },
    };
  },

  contact_stores(env, a) {
    const shopIds = strArr(a.shop_ids).map((x) => resolveId(env.mem, x)).slice(0, 5);
    if (!shopIds.length) throw new ToolError('فروشگاهی انتخاب نشده');
    const pidRaw = a.product_id ?? env.mem.focusProductId;
    const productId = pidRaw ? resolveId(env.mem, pidRaw) : undefined;
    let questions = strArr(a.questions).filter((q): q is InquiryQuestion => q in { stock: 1, price: 1, hours: 1, hold: 1, installment: 1, kalabarg: 1, location: 1, warranty: 1 });
    if (!questions.length) questions = [...DEFAULT_INQUIRY_QUESTIONS];
    if (env.ctx.installment && !questions.includes('installment')) questions.push('installment');
    const req: Parameters<AgentDeps['contact']['createInquiries']>[0] = { sessionId: env.sessionId, shopIds, questions, context: env.ctx };
    if (productId) req.productId = productId;
    if (typeof a.custom_question === 'string' && a.custom_question.trim()) {
      req.customQuestion = a.custom_question.trim().slice(0, 300);
      req.questions = [...questions, 'custom'];
    }
    let items: Inquiry[];
    try {
      items = env.deps.contact.createInquiries(req);
    } catch (e) {
      env.deps.log.warn('contact_stores failed', { err: e as Error });
      throw new ToolError('سامانهٔ استعلام الان در دسترس نیست');
    }
    env.mem.lastInquiryIds = items.map((i) => i.id);
    return {
      llm: capJson({ simulated: true, inquiries: items.map((i) => ({ h: handleFor(env.mem, 'I', i.id), shop: cut(i.shop.name, 30), status: i.status })), questions }),
      blocks: [{ kind: 'inquiries', items }],
      digest: `[ابزار contact_stores: استعلام از ${fa(items.length)} فروشگاه (شبیه‌سازی‌شده)]`,
      facts: { inquiries: items },
    };
  },

  inquiry_status(env) {
    const all = env.deps.contact.listInquiries(env.sessionId);
    const mine = env.mem.lastInquiryIds.length ? all.filter((i) => env.mem.lastInquiryIds.includes(i.id)) : all.slice(0, 5);
    const items = mine.length ? mine : all.slice(0, 5);
    return {
      llm: capJson({
        inquiries: items.map((i) => ({ h: handleFor(env.mem, 'I', i.id), shop: cut(i.shop.name, 30), shop_h: handleFor(env.mem, 'S', i.shop.id), status: i.status, result: i.result?.summary ?? null })),
      }),
      blocks: items.length ? [{ kind: 'inquiries', items }] : [],
      digest: `[ابزار inquiry_status: ${fa(items.filter((i) => i.result).length)} پاسخ از ${fa(items.length)}]`,
      facts: { inquiries: items },
    };
  },

  find_alternatives(env, a) {
    const reason = (String(a.reason ?? 'closed') as AltReason) || 'closed';
    const req: Parameters<AgentDeps['services']['alternatives']>[0] = { reason, context: env.ctx };
    const pid = a.product_id ? resolveId(env.mem, a.product_id) : env.mem.focusProductId;
    const sid = a.shop_id ? resolveId(env.mem, a.shop_id) : env.mem.focusShopId;
    if (pid) req.productId = pid;
    if (sid) req.shopId = sid;
    if (!pid && !sid) throw new ToolError('کالا یا فروشگاهی در جریان گفتگو نیست');
    const r = env.deps.services.alternatives(req);
    env.mem.lastShopIds = r.sameProduct.slice(0, 6).map((s) => s.shop.id);
    return {
      llm: capJson({ headline: r.headline, same_product: r.sameProduct.slice(0, 5).map((s) => storeLlm(env, s)), same_passage: r.samePassage.length, similar: r.similarProducts.slice(0, 3).map((p) => productLlm(env, p)) }),
      blocks: [{ kind: 'alternatives', data: r }],
      digest: `[ابزار find_alternatives (${reason}): ${fa(r.sameProduct.length)} فروشگاه جایگزین]`,
      facts: { alternatives: r },
    };
  },

  async plan_visit(env, a) {
    const shops = strArr(a.shop_ids).map((x) => resolveId(env.mem, x)).slice(0, 8);
    if (!shops.length) throw new ToolError('فروشگاهی برای برنامه انتخاب نشده');
    const pidRaw = a.product_id ?? env.mem.focusProductId;
    const pid = pidRaw ? resolveId(env.mem, pidRaw) : undefined;
    const known = shops.filter((id) => env.deps.services.getShopLite(id, {}));
    if (!known.length) throw new ToolError('فروشگاه‌ها پیدا نشدند');
    const req: Parameters<AgentDeps['services']['plan']>[0] = { stops: known.map((shopId) => (pid ? { shopId, productId: pid } : { shopId })) };
    if (env.ctx.location) req.origin = { lat: env.ctx.location.lat, lng: env.ctx.location.lng };
    const dep = typeof a.depart_at === 'string' && !Number.isNaN(Date.parse(a.depart_at)) ? a.depart_at : env.ctx.visitAt;
    if (dep) req.departAt = dep;
    const mode = (typeof a.mode === 'string' ? a.mode : env.ctx.travelMode) as TravelMode | undefined;
    if (mode) req.mode = mode;
    const plan = await env.deps.services.plan(req, env.ctx);
    env.mem.lastPlanShopIds = plan.stops.map((s) => s.shop.id);
    env.mem.focusShopId = plan.stops[0]?.shop.id ?? env.mem.focusShopId;
    const ins = planInsights(plan);
    const blocks: UIBlock[] = [{ kind: 'plan', data: plan }];
    if (ins.length) blocks.push({ kind: 'insights', items: ins });
    return {
      llm: capJson({
        stops: plan.stops.map((s) => ({ h: handleFor(env.mem, 'S', s.shop.id), name: cut(s.shop.name, 30), arrive: s.arriveAt, open: s.openAtArrival.label })),
        total_min: plan.totalMinutes,
        km: plan.totalDistanceKm,
        leave_by: plan.leaveBy,
        warnings: plan.warnings.map((w) => w.label),
        tips: plan.tips.slice(0, 3),
      }),
      blocks,
      digest: `[ابزار plan_visit: ${fa(plan.stops.length)} توقف، ${fa(plan.totalMinutes)} دقیقه]`,
      facts: { plan },
    };
  },

  update_preferences(env, a) {
    const patch: Partial<UserContext> = {};
    const notes: string[] = [];
    if (typeof a.location_label === 'string' && a.location_label.trim()) {
      const place = env.deps.services.places(a.location_label.trim(), 1)[0];
      if (place) {
        patch.location = { lat: place.lat, lng: place.lng, label: place.name, source: 'place' };
        notes.push(`محدوده: ${place.name}`);
      } else notes.push(`محدودهٔ «${a.location_label}» پیدا نشد`);
    }
    const bmin = num0(a.budget_min);
    const bmax = num0(a.budget_max);
    if (bmin) patch.budgetMin = bmin;
    if (bmax) {
      patch.budgetMax = bmax;
      notes.push(`بودجه تا ${formatTomanShort(bmax)}`);
    }
    if (typeof a.installment === 'boolean') {
      patch.installment = a.installment;
      notes.push(a.installment ? 'فقط قسطی' : 'قسطی لازم نیست');
    }
    const prov = strArr(a.providers).filter((p): p is ProviderCode => p in PROVIDERS);
    if (prov.length) {
      patch.providers = prov;
      notes.push(prov.map((p) => PROVIDERS[p].label).join('، '));
    }
    if (typeof a.open_now === 'boolean') {
      patch.openNow = a.open_now;
      if (a.open_now) notes.push('فقط بازها');
    }
    if (typeof a.warranty_only === 'boolean') patch.warrantyOnly = a.warranty_only;
    const md = num0(a.max_distance_km);
    if (md) patch.maxDistanceKm = Math.min(100, md);
    if (typeof a.travel_mode === 'string' && ['walk', 'metro', 'taxi', 'car'].includes(a.travel_mode)) patch.travelMode = a.travel_mode as TravelMode;
    if (typeof a.visit_at === 'string' && !Number.isNaN(Date.parse(a.visit_at))) patch.visitAt = new Date(a.visit_at).toISOString();
    applyPatch(env, patch);
    return {
      llm: capJson({ applied: patch, notes }),
      blocks: [],
      patch,
      digest: `[ابزار update_preferences: ${notes.join('، ') || 'بدون تغییر'}]`,
      facts: { notes },
    };
  },

  suggest_replies(_env, a) {
    const raw = Array.isArray(a.options) ? (a.options as unknown[]) : [];
    const options = raw
      .map((o) => (o && typeof o === 'object' ? (o as Record<string, unknown>) : {}))
      .filter((o) => typeof o.label === 'string' && o.label)
      .slice(0, 4)
      .map((o) => ({ label: String(o.label).slice(0, 40), message: String(o.message ?? o.label).slice(0, 200) }));
    return { llm: '{"ok":true}', blocks: options.length ? [{ kind: 'quick_replies', options }] : [], digest: '' };
  },
};

export const TOOL_NAMES = Object.keys(impls);

/** Execute one tool; never throws (errors become an LLM-visible error payload). */
export async function runTool(env: ToolEnv, name: string, args: Record<string, unknown>): Promise<ToolOutput> {
  const impl = impls[name];
  if (!impl) return { llm: JSON.stringify({ error: `unknown tool ${name}` }), blocks: [], digest: '', error: true };
  try {
    return await impl(env, args);
  } catch (e) {
    const msg = e instanceof ToolError ? e.message : 'خطای داخلی ابزار';
    if (!(e instanceof ToolError)) env.deps.log.error('tool failed', { tool: name, err: e as Error });
    return { llm: JSON.stringify({ error: msg }), blocks: [], digest: `[ابزار ${name}: خطا — ${msg}]`, error: true };
  }
}

export function parseArgs(raw: string): Record<string, unknown> {
  if (!raw || !raw.trim()) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
