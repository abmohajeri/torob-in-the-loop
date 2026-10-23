/**
 * Typed client for every REST endpoint in docs/ARCHITECTURE.md §7.
 * GET endpoints that depend on the user's context take `ctx` and append it via `contextToParams`.
 * Errors are thrown as `ApiError` with a Persian `message` ready for the UI.
 */
import {
  contextToParams,
  type AgentEvent,
  type AlternativesRequest,
  type AlternativesResponse,
  type AppMeta,
  type AreaSummary,
  type ChatMessageDTO,
  type ChatRequest,
  type CompareProductsResponse,
  type CompareStoresResponse,
  type CreateInquiriesRequest,
  type CrowdReport,
  type DiscoveryResponse,
  type HealthResponse,
  type Inquiry,
  type LatLng,
  type MallDetail,
  type Place,
  type ProductDetail,
  type ProductSummary,
  type SearchRequest,
  type SearchResponse,
  type SellerReplyRequest,
  type ShopDetail,
  type ShopLite,
  type ShopProductsResponse,
  type StoreSort,
  type StoresResponse,
  type SuggestResponse,
  type UserContext,
  type VisitPlan,
  type VisitPlanRequest,
} from '@titl/shared';
import { API_MESSAGES, ApiError, apiErrorFromResponse, networkError } from './api-error.js';
import { streamPost } from './sse.js';

export { ApiError, API_MESSAGES, errorMessage } from './api-error.js';

export const API_BASE = '/api';
const DEFAULT_TIMEOUT_MS = 20_000;

export type QueryValue = string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

/**
 * Build `/api{path}?{query}&{context}`.
 * - `undefined`/`null`/`''`/`false` are omitted; `true` → `1`; arrays repeat the key (`spec=a&spec=b`).
 */
export function buildUrl(path: string, query?: Query, ctx?: UserContext): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '' || value === false) continue;
      if (Array.isArray(value)) {
        for (const item of value as readonly (string | number)[]) params.append(key, String(item));
        continue;
      }
      params.set(key, value === true ? '1' : String(value));
    }
  }
  if (ctx) contextToParams(ctx, params);
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

const seg = (s: string) => encodeURIComponent(s);

/** Combine a caller signal with a timeout signal (AbortSignal.any when available). Call `done()` when finished. */
function withTimeout(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; done: () => void } {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const done = () => clearTimeout(timer);
  const timedOut = () => timeout.signal.aborted;
  if (!signal) return { signal: timeout.signal, timedOut, done };
  const anyFn = (AbortSignal as unknown as { any?: (signals: AbortSignal[]) => AbortSignal }).any;
  if (anyFn) return { signal: anyFn.call(AbortSignal, [signal, timeout.signal]), timedOut, done };
  const merged = new AbortController();
  const abort = () => merged.abort();
  if (signal.aborted) abort();
  signal.addEventListener('abort', abort, { once: true });
  timeout.signal.addEventListener('abort', abort, { once: true });
  return { signal: merged.signal, timedOut, done };
}

export interface RequestOptions {
  query?: Query;
  ctx?: UserContext;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Low-level JSON request. Prefer the typed `api.*` functions. */
export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, opts: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, opts.query, opts.ctx);
  const { signal, timedOut, done } = withTimeout(opts.signal, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';

  let text: string;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
      signal,
      credentials: 'same-origin',
    });
    if (!res.ok) throw await apiErrorFromResponse(res);
    text = res.status === 204 ? '' : await res.text();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (opts.signal?.aborted) throw e; // caller cancelled (React Query handles it)
    if (timedOut()) throw new ApiError(0, 'timeout', API_MESSAGES.timeout, e);
    throw networkError(e);
  } finally {
    done();
  }
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new ApiError(res.status, 'bad_response', API_MESSAGES.badResponse, e);
  }
}

const get = <T>(path: string, opts?: Omit<RequestOptions, 'body'>) => request<T>('GET', path, opts);
const post = <T>(path: string, body: unknown, opts?: Omit<RequestOptions, 'body'>) => request<T>('POST', path, { ...opts, body });

/** SearchRequest → query params (spec repeats). */
export function searchQuery(req: SearchRequest): Query {
  return {
    q: req.q?.trim(),
    category: req.category,
    group: req.group,
    brand: req.brand,
    priceMin: req.priceMin,
    priceMax: req.priceMax,
    minSellers: req.minSellers,
    nearOnly: req.nearOnly,
    audience: req.audience,
    spec: req.spec,
    sort: req.sort,
    page: req.page,
    limit: req.limit,
  };
}

export const api = {
  // ── meta & places ──────────────────────────────────────────────
  health: (signal?: AbortSignal) => get<HealthResponse>('/health', { signal }),
  meta: (signal?: AbortSignal) => get<AppMeta>('/meta', { signal }),
  places: (q: string, limit = 8, signal?: AbortSignal) => get<Place[]>('/places', { query: { q, limit }, signal }),
  reversePlace: (p: LatLng, signal?: AbortSignal) =>
    get<Place | null>('/places/reverse', { query: { lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }, signal }),

  // ── search & discovery ─────────────────────────────────────────
  search: (req: SearchRequest, ctx: UserContext, signal?: AbortSignal) =>
    get<SearchResponse>('/search', { query: searchQuery(req), ctx, signal }),
  suggest: (q: string, signal?: AbortSignal) => get<SuggestResponse>('/suggest', { query: { q }, signal }),
  discover: (input: { q?: string; category?: string }, ctx: UserContext, signal?: AbortSignal) =>
    get<DiscoveryResponse>('/discover', { query: { q: input.q, category: input.category }, ctx, signal }),

  // ── products ───────────────────────────────────────────────────
  product: (id: string, ctx: UserContext, signal?: AbortSignal) => get<ProductDetail>(`/products/${seg(id)}`, { ctx, signal }),
  productStores: (id: string, opts: { sort?: StoreSort; limit?: number }, ctx: UserContext, signal?: AbortSignal) =>
    get<StoresResponse>(`/products/${seg(id)}/stores`, { query: { sort: opts.sort, limit: opts.limit }, ctx, signal }),
  productSimilar: (id: string, opts: { limit?: number }, ctx: UserContext, signal?: AbortSignal) =>
    get<ProductSummary[]>(`/products/${seg(id)}/similar`, { query: { limit: opts.limit }, ctx, signal }),
  productAreas: (id: string, ctx: UserContext, signal?: AbortSignal) =>
    get<AreaSummary[]>(`/products/${seg(id)}/areas`, { ctx, signal }),

  // ── comparison ─────────────────────────────────────────────────
  compareProducts: (ids: string[], ctx: UserContext, signal?: AbortSignal) =>
    get<CompareProductsResponse>('/compare/products', { query: { ids: ids.join(',') }, ctx, signal }),
  compareVerdict: (ids: string[], ctx: UserContext, signal?: AbortSignal) =>
    post<{ verdict: string | null }>('/compare/products/verdict', { ids, context: ctx }, { signal, timeoutMs: 30_000 }),
  compareStores: (productId: string, shopIds: string[], ctx: UserContext, signal?: AbortSignal) =>
    get<CompareStoresResponse>('/compare/stores', { query: { product: productId, shops: shopIds.join(',') }, ctx, signal }),

  // ── shops & malls ──────────────────────────────────────────────
  shop: (id: string, ctx: UserContext, signal?: AbortSignal) => get<ShopDetail>(`/shops/${seg(id)}`, { ctx, signal }),
  shopProducts: (
    id: string,
    opts: { q?: string; page?: number; limit?: number },
    ctx: UserContext,
    signal?: AbortSignal,
  ) => get<ShopProductsResponse>(`/shops/${seg(id)}/products`, { query: { q: opts.q, page: opts.page, limit: opts.limit }, ctx, signal }),
  shops: (q: string, limit = 20, signal?: AbortSignal) => get<ShopLite[]>('/shops', { query: { q, limit }, signal }),
  reportShop: (shopId: string, body: { type: CrowdReport['type']; note?: string; sessionId: string }) =>
    post<CrowdReport>(`/shops/${seg(shopId)}/reports`, body),
  mall: (slug: string, ctx: UserContext, signal?: AbortSignal) => get<MallDetail>(`/malls/${seg(slug)}`, { ctx, signal }),

  // ── alternatives & plan ────────────────────────────────────────
  alternatives: (req: AlternativesRequest, signal?: AbortSignal) => post<AlternativesResponse>('/alternatives', req, { signal }),
  plan: (req: VisitPlanRequest & { context?: UserContext }, signal?: AbortSignal) => post<VisitPlan>('/plan', req, { signal }),

  // ── inquiries (contact & follow-up) ────────────────────────────
  createInquiries: (req: CreateInquiriesRequest) => post<{ inquiries: Inquiry[] }>('/inquiries', req),
  inquiries: (sessionId: string, signal?: AbortSignal) =>
    get<{ inquiries: Inquiry[] }>('/inquiries', { query: { sessionId }, signal }),
  inquiry: (id: string, signal?: AbortSignal) => get<Inquiry>(`/inquiries/${seg(id)}`, { signal }),
  retryInquiry: (id: string) => post<Inquiry>(`/inquiries/${seg(id)}/retry`, {}),
  cancelInquiry: (id: string) => post<Inquiry>(`/inquiries/${seg(id)}/cancel`, {}),
  /** SSE URL for `LiveEvent` frames (use with `connectEventSource` / `useLiveEvents`). */
  eventsUrl: (sessionId: string) => buildUrl('/events', { sessionId }),

  // ── seller inbox ───────────────────────────────────────────────
  sellerShops: (q: string, signal?: AbortSignal) => get<ShopLite[]>('/seller/shops', { query: { q }, signal }),
  sellerInquiries: (shopId: string, signal?: AbortSignal) =>
    get<{ inquiries: Inquiry[] }>(`/seller/${seg(shopId)}/inquiries`, { signal }),
  sellerReply: (shopId: string, inquiryId: string, body: SellerReplyRequest) =>
    post<Inquiry>(`/seller/${seg(shopId)}/inquiries/${seg(inquiryId)}/reply`, body),
  /** SSE URL for `SellerLiveEvent` frames. */
  sellerEventsUrl: (shopId: string) => buildUrl(`/seller/${seg(shopId)}/events`),

  // ── assistant ──────────────────────────────────────────────────
  /** Streams `AgentEvent`s (pings filtered). Resolves at end of stream. */
  chat: (req: ChatRequest, onEvent: (event: AgentEvent) => void, signal?: AbortSignal) =>
    streamPost<AgentEvent>(buildUrl('/chat'), req, onEvent, signal),
  chatHistory: (sessionId: string, signal?: AbortSignal) =>
    get<{ messages: ChatMessageDTO[] }>('/chat/history', { query: { sessionId }, signal }),
  chatReset: (sessionId: string) => post<{ ok: true }>('/chat/reset', { sessionId }),
  transcribe: (audio: Blob, filename = 'voice.webm', signal?: AbortSignal) => {
    const form = new FormData();
    form.append('audio', audio, filename);
    return request<{ text: string | null }>('POST', '/transcribe', { body: form, signal, timeoutMs: 40_000 });
  },
} as const;

export type Api = typeof api;
