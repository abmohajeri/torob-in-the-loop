/**
 * Product search (docs/ARCHITECTURE.md §5): Persian NLU → FTS5 candidates (AND → OR → LIKE
 * fallbacks) → filters (explicit request, context, text-derived; text-derived ones are relaxed
 * with a notice when they would empty the page) → ranking → facets over the candidate set.
 */
import type {
  Audience,
  FacetBucket,
  Facets,
  ParsedQuery,
  ProductSummary,
  ProviderCode,
  Reason,
  SearchRequest,
  SearchResponse,
  SearchSort,
  UserContext,
} from '@titl/shared';
import { PROVIDERS, formatDistance, formatNumber, haversineKm, normalizeForSearch } from '@titl/shared';
import { isOpenState, stateAt } from '../domain/hours.js';
import { ftsQuery, groupLabel, parseQueryWith, type ParseResult } from '../domain/nlu.js';
import { AUDIENCE_LABEL } from '../domain/nlu-data.js';
import { budgetLabel, priceTiersOf } from '../domain/price.js';
import { shopRidsOf, type Core } from './core.js';
import { budgetReality } from './need.js';
import { resolveCtx, type ReqCtx } from './context.js';
import { basicReasons, productRowsByRids, sellerGeo, summarize, type ProductRow } from './products.js';

export const CANDIDATE_CAP = 5000;
/** SV3: assortment-driven groups where need mode («کجا بروم؟») leads. */
const BRAND_FACET_MIN_SHARE = 0.2;
const NEED_GROUPS = new Set(['fashion', 'shoes_bags', 'watch_jewelry', 'lighting', 'home_kitchen']);
const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

export interface Cand {
  rid: number;
  category_id: number;
  group_id: string;
  brand: string | null;
  audience: string | null;
  price_min: number | null;
  price_max: number | null;
  price_median: number | null;
  shop_count: number;
  installment_shop_count: number;
  popularity: number;
  last_price_change: string | null;
  /** bm25 (negative, lower = better) or 0 when not text-retrieved. */
  r: number;
  is_replica: number;
}

const CAND_COLS = `p.rid, p.category_id, p.group_id, p.brand, p.audience, p.price_min, p.price_max, p.price_median, p.shop_count,
  p.installment_shop_count, p.popularity, p.last_price_change, p.is_replica`;

// ───────────────────────── Parsing ─────────────────────────

export function parseFor(core: Core, q: string, ctx: UserContext, now = new Date()): ParseResult {
  const visitIsNow = !ctx.visitAt || Math.abs(new Date(ctx.visitAt).getTime() - now.getTime()) <= 10 * 60_000;
  return parseQueryWith(q ?? '', core.vocab, { visitIsNow });
}

// ───────────────────────── Retrieval ─────────────────────────

function ftsCandidates(core: Core, match: string, restrict: Restrict = {}): Cand[] {
  let extra = '';
  const params: (string | number)[] = [match];
  if (restrict.categoryId !== undefined) {
    extra = ' AND p.category_id = ?';
    params.push(restrict.categoryId);
  } else if (restrict.groupId !== undefined) {
    extra = ' AND p.group_id = ?';
    params.push(restrict.groupId);
  }
  try {
    return core.db.all<Cand>(
      // FTS hits are materialized first: otherwise SQLite may drive from the category index and
      // re-evaluate MATCH per product (≈ 1 s for a broad synonym group inside a large category).
      `WITH f AS MATERIALIZED (SELECT rowid AS rid, bm25(products_fts, 10.0, 6.0, 4.0, 1.5) AS r FROM products_fts WHERE products_fts MATCH ?)
       SELECT ${CAND_COLS}, f.r AS r FROM f JOIN products p ON p.rid = f.rid
       WHERE 1${extra} ORDER BY f.r LIMIT ${CANDIDATE_CAP}`,
      ...params,
    );
  } catch {
    return [];
  }
}

interface Restrict {
  categoryId?: number;
  groupId?: string;
}

let popularCache: { db: unknown; rows: Cand[] } | null = null;

function listCandidates(core: Core, by: Restrict & { brand?: string }): Cand[] {
  if (by.categoryId !== undefined) {
    return core.db.all<Cand>(`SELECT ${CAND_COLS}, 0 AS r FROM products p WHERE p.category_id = ? ORDER BY p.popularity DESC LIMIT ${CANDIDATE_CAP}`, by.categoryId);
  }
  if (by.groupId !== undefined) {
    return core.db.all<Cand>(`SELECT ${CAND_COLS}, 0 AS r FROM products p WHERE p.group_id = ? ORDER BY p.popularity DESC LIMIT ${CANDIDATE_CAP}`, by.groupId);
  }
  if (by.brand !== undefined) {
    return core.db.all<Cand>(`SELECT ${CAND_COLS}, 0 AS r FROM products p WHERE p.brand = ? ORDER BY p.popularity DESC LIMIT ${CANDIDATE_CAP}`, by.brand);
  }
  if (popularCache?.db !== core.db) {
    popularCache = {
      db: core.db,
      rows: core.db.all<Cand>(`SELECT ${CAND_COLS}, 0 AS r FROM products p ORDER BY p.popularity DESC LIMIT ${CANDIDATE_CAP}`),
    };
  }
  return popularCache.rows;
}

function likeCandidates(core: Core, keywords: string[], mode: 'and' | 'or', restrict: Restrict = {}): Cand[] {
  const kws = keywords.map((k) => k.trim()).filter((k) => k.length >= 2).slice(0, 4);
  if (!kws.length) return [];
  let where = `(${kws.map(() => 'p.title_norm LIKE ?').join(mode === 'and' ? ' AND ' : ' OR ')})`;
  const params: (string | number)[] = kws.map((k) => `%${k.replace(/[%_]/g, '')}%`);
  if (restrict.categoryId !== undefined) {
    where += ' AND p.category_id = ?';
    params.push(restrict.categoryId);
  } else if (restrict.groupId !== undefined) {
    where += ' AND p.group_id = ?';
    params.push(restrict.groupId);
  }
  return core.db.all<Cand>(`SELECT ${CAND_COLS}, 0 AS r FROM products p WHERE ${where} ORDER BY p.popularity DESC LIMIT 500`, ...params);
}

export interface Retrieval {
  cands: Cand[];
  /** How the candidates were found. */
  via: 'fts_and' | 'fts_or' | 'like' | 'list' | 'none';
}

export function retrieve(core: Core, keywords: string[], list: Restrict & { brand?: string }): Retrieval {
  if (!keywords.length) return { cands: listCandidates(core, list), via: 'list' };
  const restrict: Restrict = list.categoryId !== undefined ? { categoryId: list.categoryId } : list.groupId !== undefined ? { groupId: list.groupId } : {};
  const and = ftsQuery(keywords, core.synonyms, 'and');
  let cands = and ? ftsCandidates(core, and, restrict) : [];
  let via: Retrieval['via'] = 'fts_and';
  if (cands.length < 5 && keywords.length > 1) {
    const or = ftsQuery(keywords, core.synonyms, 'or');
    const extra = or ? ftsCandidates(core, or, restrict) : [];
    if (extra.length > cands.length) {
      const seen = new Set(cands.map((c) => c.rid));
      // OR hits rank below every AND hit
      const worst = cands.reduce((m, c) => Math.max(m, c.r), -1e-6);
      for (const c of extra) if (!seen.has(c.rid)) cands.push({ ...c, r: Math.max(c.r, worst) * 0.5 });
      via = 'fts_or';
    }
  }
  if (!cands.length) {
    cands = likeCandidates(core, keywords, 'and', restrict);
    if (!cands.length) cands = likeCandidates(core, keywords, 'or', restrict);
    via = cands.length ? 'like' : 'none';
  }
  return { cands, via };
}

// ───────────────────────── Filters ─────────────────────────

type Dim = 'category' | 'group' | 'brand' | 'audience' | 'price' | 'sellers' | 'installment' | 'providers' | 'open' | 'near' | 'spec';

interface Pred {
  dim: Dim;
  /** Derived from the free text (may be relaxed when it empties the result). */
  soft: boolean;
  fn: (c: Cand) => boolean;
}

interface SellerStats {
  open: boolean;
  near: boolean;
  nearestKm: number | null;
  nearbyCount: number;
  providers: Set<ProviderCode>;
}

function sellerStatsFn(core: Core, rc: ReqCtx, radiusKm: number) {
  const memo = new Map<number, SellerStats>();
  return (rid: number): SellerStats => {
    let s = memo.get(rid);
    if (s) return s;
    s = { open: false, near: false, nearestKm: null, nearbyCount: 0, providers: new Set() };
    for (const sr of shopRidsOf(core, rid)) {
      const shop = core.shops[sr];
      if (!shop) continue;
      if (!s.open && isOpenState(stateAt(shop.compiled, rc.mow).state)) s.open = true;
      for (const p of shop.providerCodes) s.providers.add(p);
      if (rc.location) {
        const d = haversineKm(rc.location, shop);
        if (s.nearestKm === null || d < s.nearestKm) s.nearestKm = d;
        if (d <= radiusKm) {
          s.near = true;
          s.nearbyCount++;
        }
      }
    }
    memo.set(rid, s);
    return s;
  };
}

function overlap(c: Cand, lo: number | undefined, hi: number | undefined): boolean {
  if (lo === undefined && hi === undefined) return true;
  const pMin = c.price_min ?? c.price_median;
  const pMax = c.price_max ?? c.price_median;
  if (pMin === null || pMax === null) return false;
  if (hi !== undefined && pMin > hi) return false;
  if (lo !== undefined && pMax < lo) return false;
  return true;
}

function specRids(core: Core, specs: string[]): Set<number> | null {
  let acc: Set<number> | null = null;
  for (const s of specs) {
    const i = s.indexOf('::');
    if (i <= 0) continue;
    const key = s.slice(0, i);
    const value = s.slice(i + 2);
    const rids = new Set<number>(
      core.db.all<{ r: number }>('SELECT product_rid AS r FROM product_facets WHERE key = ? AND value = ?', key, value).map((x) => x.r),
    );
    if (acc) {
      const both = new Set<number>();
      for (const x of acc) if (rids.has(x)) both.add(x);
      acc = both;
    } else acc = rids;
  }
  return acc;
}

// ───────────────────────── Engine ─────────────────────────

export interface SearchRun {
  parsed: ParsedQuery;
  pr: ParseResult;
  rc: ReqCtx;
  /** Candidates after all filters, ranked. */
  ranked: Cand[];
  /** Candidates before category / brand filters (for those facets). */
  all: Cand[];
  preds: Pred[];
  notices: Reason[];
  stats: (rid: number) => SellerStats;
  categoryId: number | null;
  sort: SearchSort;
  budget: { min?: number; max?: number };
  via: Retrieval['via'];
  /** (SV8) replica products hidden for a brand query */
  hiddenReplicas: number;
  brand: string | null;
  groupId: string | null;
}

export const AUD_OK: Record<Audience, Audience[]> = { men: ['men', 'unisex'], women: ['women', 'unisex'], kids: ['kids'], unisex: ['unisex', 'men', 'women'] };

export function runSearch(core: Core, req: SearchRequest, ctx: UserContext, now = new Date()): SearchRun {
  const q = (req.q ?? '').slice(0, 200);
  const pr = parseFor(core, q, ctx, now);
  const parsed = pr.parsed;
  const notices: Reason[] = [];

  // reference location: a place named in the text beats the context location
  const rc = resolveCtx(ctx, {
    now,
    location: pr.place ? { lat: pr.place.lat, lng: pr.place.lng, label: pr.place.name } : null,
  });
  const radiusKm = ctx.maxDistanceKm ?? (req.nearOnly ? 5 : rc.nearbyKm);
  const stats = sellerStatsFn(core, rc, radiusKm);

  // explicit request params win over text-derived ones
  const explicitCat = req.category ? core.categoriesByName.get(req.category) ?? null : null;
  const textCat = !explicitCat && pr.categoryId !== null ? core.categories.get(pr.categoryId) ?? null : null;
  const groupId = req.group ?? (!explicitCat && !textCat ? parsed.categoryGroup : undefined);
  const groupSoft = !req.group;
  const brand = req.brand ?? parsed.brand;
  const brandSoft = !req.brand;
  const audience = req.audience ?? parsed.audience;
  const budget = {
    min: req.priceMin ?? parsed.budgetMin ?? ctx.budgetMin,
    max: req.priceMax ?? parsed.budgetMax ?? ctx.budgetMax,
  };
  const budgetSoft = req.priceMin === undefined && req.priceMax === undefined && (parsed.budgetMin !== undefined || parsed.budgetMax !== undefined);
  const providers = [...new Set([...(ctx.providers ?? []), ...(parsed.providers ?? [])])];
  const installment = !!(ctx.installment || parsed.installment);
  const openNow = !!(ctx.openNow || parsed.openNow);
  const nearWanted = !!req.nearOnly || ((pr.nearMe || !!pr.place) && !!rc.location) || (ctx.maxDistanceKm !== undefined && !!rc.location);
  const nearSoft = !req.nearOnly && !(ctx.maxDistanceKm !== undefined);
  if (pr.unknownPlace) {
    notices.push({ code: 'unknown_place', label: `مکان «${pr.unknownPlace}» را نشناختم؛ لطفاً موقعیت را از نوار بالا انتخاب کنید`, tone: 'warn' });
  }
  if (pr.nearMe && !rc.location) {
    notices.push({ code: 'need_location', label: 'برای دیدن فروشنده‌های نزدیک، موقعیت خود را مشخص کنید', tone: 'info' });
  }
  if (req.nearOnly && !rc.location) {
    notices.push({ code: 'need_location', label: 'موقعیت شما مشخص نیست؛ فیلتر «فقط نزدیک من» اعمال نشد', tone: 'warn' });
  }

  // ── retrieval
  const keywords = parsed.keywords;
  const list: Restrict & { brand?: string } = {};
  const catForList = explicitCat ?? textCat;
  if (catForList) list.categoryId = catForList.id;
  else if (groupId) list.groupId = groupId;
  else if (brand) list.brand = brand;
  let { cands, via } = retrieve(core, keywords, list);

  // ── predicates
  const preds: Pred[] = [];
  if (explicitCat) preds.push({ dim: 'category', soft: false, fn: (c) => c.category_id === explicitCat.id });
  else if (textCat) preds.push({ dim: 'category', soft: true, fn: (c) => c.category_id === textCat.id });
  if (groupId) preds.push({ dim: 'group', soft: groupSoft, fn: (c) => c.group_id === groupId });
  if (brand) preds.push({ dim: 'brand', soft: brandSoft, fn: (c) => c.brand === brand });
  if (audience) {
    const ok = AUD_OK[audience];
    preds.push({ dim: 'audience', soft: !req.audience, fn: (c) => c.audience !== null && (ok as string[]).includes(c.audience) });
  }
  if (budget.min !== undefined || budget.max !== undefined) {
    preds.push({ dim: 'price', soft: budgetSoft, fn: (c) => overlap(c, budget.min, budget.max) });
  }
  if (req.minSellers && req.minSellers > 1) preds.push({ dim: 'sellers', soft: false, fn: (c) => c.shop_count >= req.minSellers! });
  if (installment) preds.push({ dim: 'installment', soft: false, fn: (c) => c.installment_shop_count > 0 });
  if (providers.length) preds.push({ dim: 'providers', soft: false, fn: (c) => providers.some((p) => stats(c.rid).providers.has(p)) });
  if (openNow) preds.push({ dim: 'open', soft: false, fn: (c) => stats(c.rid).open });
  if (nearWanted && rc.location) preds.push({ dim: 'near', soft: nearSoft, fn: (c) => stats(c.rid).near });
  if (req.spec?.length) {
    const rids = specRids(core, req.spec);
    if (rids) preds.push({ dim: 'spec', soft: false, fn: (c) => rids.has(c.rid) });
  }

  const pass = (c: Cand, skip: Set<Dim>, active: Pred[]) => active.every((p) => skip.has(p.dim) || p.fn(c));
  let active = preds;
  let filtered = cands.filter((c) => pass(c, new Set(), active));

  // ── relax text-derived filters that empty the result (most specific first)
  const relaxOrder: Dim[] = ['audience', 'near', 'brand', 'category', 'group', 'price'];
  for (const dim of relaxOrder) {
    if (filtered.length) break;
    const p = active.find((x) => x.dim === dim && x.soft);
    if (!p) continue;
    const next = active.filter((x) => x !== p);
    let pool = cands;
    let poolVia = via;
    if ((dim === 'category' || dim === 'group') && keywords.length) {
      // retrieval was restricted to the category: search everywhere (keywords may name another category)
      const r2 = retrieve(core, keywords, {});
      pool = r2.cands;
      poolVia = r2.via;
    }
    const trial = pool.filter((c) => pass(c, new Set(), next));
    if (!trial.length) continue;
    active = next;
    filtered = trial;
    cands = pool;
    via = poolVia;
    notices.push(relaxNotice(dim, { brand, audience, place: pr.place?.name ?? null, catName: textCat?.name ?? null, groupId, budget }));
  }

  // ── SV8: brand queries hide «طرح/کپی» products unless asked
  let hiddenReplicas = 0;
  if (brand && !ctx.showReplicas) {
    const kept = filtered.filter((c) => c.is_replica !== 1);
    if (kept.length) {
      hiddenReplicas = filtered.length - kept.length;
      filtered = kept;
    }
  }

  // ── rank
  const sort: SearchSort = req.sort ?? parsed.sort ?? (pr.nearMe && rc.location ? 'distance' : 'relevance');
  const maxNeg = filtered.reduce((m, c) => Math.max(m, -c.r), 0);
  const catId = (explicitCat ?? textCat)?.id ?? null;
  const score = new Map<number, number>();
  for (const c of filtered) {
    const rel = maxNeg > 0 ? -c.r / maxNeg : 1;
    let s = rel * 1.0 + c.popularity * 0.35;
    if (catId !== null && c.category_id === catId) s += 0.6;
    else if (groupId && c.group_id === groupId) s += 0.3;
    if (brand && c.brand === brand) s += 0.4;
    if (rc.location) {
      const st = stats(c.rid);
      if (st.nearestKm !== null) s += st.nearestKm <= 2 ? 0.4 : st.nearestKm <= 5 ? 0.2 : 0;
    }
    if (c.price_min === null && c.price_median === null) s -= 0.3;
    score.set(c.rid, s);
  }
  const byScore = (a: Cand, b: Cand) => score.get(b.rid)! - score.get(a.rid)!;
  const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b);
  const ranked = [...filtered];
  switch (sort) {
    case 'price_asc':
      ranked.sort((a, b) => nullsLast(a.price_min, b.price_min) || byScore(a, b));
      break;
    case 'price_desc':
      ranked.sort((a, b) => nullsLast(b.price_max === null ? null : -b.price_max, a.price_max === null ? null : -a.price_max) || byScore(a, b));
      break;
    case 'sellers':
      ranked.sort((a, b) => b.shop_count - a.shop_count || byScore(a, b));
      break;
    case 'distance':
      ranked.sort((a, b) => nullsLast(stats(a.rid).nearestKm, stats(b.rid).nearestKm) || byScore(a, b));
      break;
    default:
      ranked.sort(byScore);
  }

  // final parsed query reflects relaxed parts too (chips stay so the user sees what was understood)
  return {
    parsed,
    pr,
    rc,
    ranked,
    all: cands.filter((c) =>
      pass(
        c,
        new Set<Dim>(['category', 'group', 'brand']),
        active,
      ),
    ),
    preds: active,
    notices,
    stats,
    categoryId: catId,
    sort,
    budget,
    via,
    hiddenReplicas,
    brand: brand ?? null,
    groupId: groupId ?? null,
  };
}

function relaxNotice(
  dim: Dim,
  x: { brand?: string; audience?: Audience; place: string | null; catName: string | null; groupId?: string; budget: { min?: number; max?: number } },
): Reason {
  switch (dim) {
    case 'audience':
      return { code: 'relaxed_audience', label: `کالای «${AUDIENCE_LABEL[x.audience!]}» پیدا نشد؛ همه موارد نمایش داده می‌شود`, tone: 'info' };
    case 'near':
      return {
        code: 'relaxed_near',
        label: x.place ? `نزدیک ${x.place} فروشنده‌ای پیدا نشد؛ نزدیک‌ترین گزینه‌ها نمایش داده می‌شود` : 'نزدیک شما فروشنده‌ای پیدا نشد؛ نزدیک‌ترین گزینه‌ها نمایش داده می‌شود',
        tone: 'warn',
      };
    case 'brand':
      return { code: 'relaxed_brand', label: `از برند «${x.brand}» موردی پیدا نشد؛ نتایج مشابه نمایش داده می‌شود`, tone: 'warn' };
    case 'category':
      return { code: 'relaxed_category', label: `در دسته «${x.catName}» نتیجه‌ای نبود؛ نتایج سایر دسته‌ها نمایش داده می‌شود`, tone: 'info' };
    case 'group':
      return { code: 'relaxed_group', label: `در گروه «${groupLabel(x.groupId ?? '')}» نتیجه‌ای نبود؛ نتایج سایر گروه‌ها نمایش داده می‌شود`, tone: 'info' };
    default:
      return {
        code: 'relaxed_budget',
        label: `در بودجه ${budgetLabel(x.budget.min ?? null, x.budget.max ?? null)} کالایی پیدا نشد؛ نزدیک‌ترین گزینه‌ها نمایش داده می‌شود`,
        tone: 'warn',
      };
  }
}

// ───────────────────────── Facets ─────────────────────────

export function facetsOf(core: Core, run: SearchRun): Facets {
  const { ranked, all, rc, stats } = run;
  const countBy = <K>(list: Cand[], key: (c: Cand) => K | null) => {
    const m = new Map<K, number>();
    for (const c of list) {
      const k = key(c);
      if (k === null || k === undefined) continue;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  // categories / brands are counted without their own filter so the user can switch
  const catBase = all.filter((c) => run.preds.every((p) => p.dim === 'category' || p.dim === 'group' || p.dim === 'brand' || p.fn(c)));
  const brandBase = all.filter((c) => run.preds.every((p) => p.dim === 'brand' || p.fn(c)));
  const categories: FacetBucket[] = countBy(catBase, (c) => c.category_id)
    .slice(0, 10)
    .map(([id, count]) => {
      const name = core.categories.get(id)?.name ?? 'سایر';
      return { value: name, label: name, count };
    });
  // DT3: hide the brand facet when < 20 % of the results have a brand (unless a brand is already chosen)
  const branded = brandBase.filter((c) => c.brand).length;
  const showBrands = !!run.brand || (brandBase.length > 0 && branded / brandBase.length >= BRAND_FACET_MIN_SHARE);
  const brands: FacetBucket[] = showBrands
    ? countBy(brandBase, (c) => c.brand)
        .slice(0, 12)
        .map(([b, count]) => ({ value: b, label: b, count }))
    : [];
  const priceTiers = priceTiersOf(ranked.map((c) => c.price_median ?? c.price_min ?? NaN));
  const audiences: FacetBucket[] = countBy(ranked, (c) => c.audience as Audience | null).map(([a, count]) => ({
    value: a,
    label: AUDIENCE_LABEL[a] ?? a,
    count,
  }));
  return {
    categories,
    brands,
    priceTiers,
    audiences,
    specs: specFacets(core, ranked),
    installmentCount: ranked.filter((c) => c.installment_shop_count > 0).length,
    nearCount: rc.location ? ranked.filter((c) => stats(c.rid).near).length : null,
  };
}

/** Spec facets — only when one category dominates (≥ 60 %) the candidate set. */
export function specFacets(core: Core, ranked: Cand[], maxKeys = 4): Facets['specs'] {
  if (ranked.length < 4) return [];
  const byCat = new Map<number, number>();
  for (const c of ranked) byCat.set(c.category_id, (byCat.get(c.category_id) ?? 0) + 1);
  const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < ranked.length * 0.6) return [];
  const rids = ranked.filter((c) => c.category_id === top[0]).slice(0, CANDIDATE_CAP).map((c) => c.rid);
  const rows = core.db.all<{ key: string; value: string; n: number }>(
    `SELECT key, value, count(*) AS n FROM product_facets WHERE product_rid IN (SELECT value FROM json_each(?)) GROUP BY key, value`,
    JSON.stringify(rids),
  );
  const byKey = new Map<string, { value: string; n: number }[]>();
  for (const r of rows) {
    const l = byKey.get(r.key) ?? [];
    l.push({ value: r.value, n: r.n });
    byKey.set(r.key, l);
  }
  const keys = [...byKey.entries()]
    .map(([key, vals]) => ({ key, vals: vals.sort((a, b) => b.n - a.n), coverage: vals.reduce((s, v) => s + v.n, 0) }))
    .filter((k) => k.vals.length >= 2 && k.coverage >= rids.length * 0.3)
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, maxKeys);
  return keys.map((k) => ({ key: k.key, values: k.vals.slice(0, 8).map((v) => ({ value: v.value, label: v.value, count: v.n })) }));
}

// ───────────────────────── Response ─────────────────────────

export function productReasons(row: ProductRow, run: SearchRun, cheapest: number | null, geo: ReturnType<typeof sellerGeo>): Reason[] {
  const { rc, budget } = run;
  const out: Reason[] = [];
  if (geo.nearby && geo.nearby > 0) {
    const where = rc.locationLabel ? `نزدیک ${rc.locationLabel}` : 'نزدیک شما';
    out.push({ code: 'near', label: `${formatNumber(geo.nearby)} فروشنده ${where}`, tone: 'good' });
  } else if (geo.nearest && rc.location) {
    out.push({ code: 'nearest', label: `نزدیک‌ترین فروشنده: ${formatDistance(geo.nearest.distanceKm)}`, tone: 'info' });
  }
  if (cheapest !== null && row.price_min !== null && row.price_min <= cheapest && run.ranked.length > 1) {
    out.push({ code: 'cheapest', label: 'ارزان‌ترین بین نتایج', tone: 'good' });
  }
  if ((budget.min !== undefined || budget.max !== undefined) && (row.price_min !== null || row.price_median !== null)) {
    out.push({ code: 'budget', label: 'مطابق بودجه', tone: 'good' });
  }
  if (row.installment_shop_count > 0 && (rc.ctx.installment || run.parsed.installment || run.parsed.providers?.length || rc.ctx.providers?.length)) {
    out.push({ code: 'installment', label: `قسطی در ${formatNumber(row.installment_shop_count)} فروشگاه`, tone: 'good' });
  }
  if ((rc.ctx.openNow || run.parsed.openNow) && geo.openCount > 0) {
    out.push({ code: 'open', label: `${formatNumber(geo.openCount)} فروشنده ${rc.visitIsNow ? 'الان' : 'در زمان مراجعه'} باز`, tone: 'good' });
  }
  if (row.shop_count >= 3) out.push({ code: 'sellers', label: `${formatNumber(row.shop_count)} فروشنده حضوری`, tone: 'info' });
  if (out.length < 3) {
    for (const r of basicReasons(row, geo, rc)) if (!out.some((o) => o.code === r.code)) out.push(r);
  }
  return out.slice(0, 3);
}

export function pageOf(core: Core, run: SearchRun, page: number, limit: number): ProductSummary[] {
  const slice = run.ranked.slice((page - 1) * limit, page * limit);
  const rows = productRowsByRids(
    core,
    slice.map((c) => c.rid),
  );
  let cheapest: number | null = null;
  for (const c of run.ranked) if (c.price_min !== null && (cheapest === null || c.price_min < cheapest)) cheapest = c.price_min;
  return rows.map((row) => {
    const geo = sellerGeo(core, run.rc, row.rid);
    return summarize(core, run.rc, row, productReasons(row, run, cheapest, geo), geo);
  });
}

export function search(core: Core, req: SearchRequest, ctx: UserContext): SearchResponse {
  const t0 = performance.now();
  const now = new Date();
  const run = runSearch(core, req, ctx, now);
  const limit = Math.min(MAX_LIMIT, Math.max(1, req.limit ?? DEFAULT_LIMIT));
  const page = Math.max(1, req.page ?? 1);
  const items = pageOf(core, run, page, limit);
  const facets = facetsOf(core, run);
  let didYouMean: string | null = null;
  if (!run.ranked.length || run.via === 'like') didYouMean = suggestSpelling(core, run.parsed.keywords.join(' ') || run.parsed.raw);
  if (!run.ranked.length && run.parsed.keywords.length && run.via === 'none') {
    run.notices.push({ code: 'no_match', label: 'کالایی با این عبارت پیدا نشد؛ املای دیگری را امتحان کنید', tone: 'warn' });
  } else if (run.via === 'like') {
    run.notices.push({ code: 'fuzzy', label: 'نتیجه دقیقی نبود؛ نتایج نزدیک به عبارت شما نمایش داده می‌شود', tone: 'info' });
  }
  const res: SearchResponse = {
    parsed: run.parsed,
    total: run.ranked.length,
    page,
    limit,
    items,
    facets,
    didYouMean,
    tookMs: Math.round(performance.now() - t0),
  };
  if (run.notices.length) res.notices = run.notices;
  // SV8: replicas hidden + budget reality
  if (run.hiddenReplicas) {
    res.hiddenReplicas = run.hiddenReplicas;
    (res.notices ??= []).push({
      code: 'replicas_hidden',
      label: `${formatNumber(run.hiddenReplicas)} کالای طرح/کپی پنهان شد — نمایش`,
      tone: 'info',
    });
  }
  if (run.budget.max !== undefined && (run.categoryId !== null || run.groupId || run.brand)) {
    const br = budgetReality(core, { categoryId: run.categoryId, group: run.categoryId === null ? run.groupId : null, brand: run.brand, budgetMax: run.budget.max });
    if (br) res.budgetReality = br;
  }
  // SV3: lead with «کجا بروم؟» when most results have < 3 sellers or the group is assortment-driven
  const top = run.ranked.slice(0, 24);
  const groupHit = run.groupId ?? (run.categoryId !== null ? core.categories.get(run.categoryId)?.groupId ?? null : null);
  const fewSellers = top.length > 0 && top.filter((c) => c.shop_count < 3).length / top.length >= 0.6;
  if (groupHit && NEED_GROUPS.has(groupHit)) res.needMode = { recommended: true, reason: 'در این دسته هر مدل معمولاً فقط یک فروشنده دارد؛ بهتر است فروشگاه‌های پرتنوع نزدیک را ببینید' };
  else if (fewSellers) res.needMode = { recommended: true, reason: 'بیشتر این کالاها فقط در ۱ تا ۲ فروشگاه ثبت شده‌اند؛ فروشگاه‌های پرتنوع نزدیک را ببینید' };
  return res;
}

// ───────────────────────── Did you mean ─────────────────────────

let spellTerms: { db: unknown; terms: { key: string; label: string; weight: number }[] } | null = null;

function termsFor(core: Core) {
  if (spellTerms?.db === core.db) return spellTerms.terms;
  const terms: { key: string; label: string; weight: number }[] = [];
  for (const [key, e] of core.vocab.catAlias) {
    if (e.cat) terms.push({ key, label: key === normalizeForSearch(e.cat.name) ? e.cat.name : key, weight: Math.log1p(e.cat.productCount) });
  }
  for (const [key, b] of core.vocab.brandAlias) terms.push({ key, label: b.name, weight: Math.log1p(b.productCount) });
  for (const key of core.vocab.synonyms.keys()) terms.push({ key, label: key, weight: 1 });
  spellTerms = { db: core.db, terms };
  return terms;
}

export function levenshtein(a: string, b: string, max = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length]!;
}

export function suggestSpelling(core: Core, text: string): string | null {
  const q = normalizeForSearch(text);
  if (q.length < 3) return null;
  const max = q.length <= 4 ? 1 : 2;
  let best: { label: string; d: number; w: number } | null = null;
  for (const t of termsFor(core)) {
    if (Math.abs(t.key.length - q.length) > max) continue;
    const d = levenshtein(q, t.key, max);
    if (d === 0 || d > max) continue;
    if (!best || d < best.d || (d === best.d && t.weight > best.w)) best = { label: t.label, d, w: t.weight };
  }
  return best?.label ?? null;
}

export function providerLabels(codes: ProviderCode[]): string {
  return codes.map((c) => PROVIDERS[c].label).join('، ');
}
