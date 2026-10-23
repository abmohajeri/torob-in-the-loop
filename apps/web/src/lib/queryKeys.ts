/**
 * TanStack Query key factory. ALWAYS build keys with these helpers:
 *  - keys are prefix-hierarchical (`['bz','product',id, …]`) so live events can invalidate whole families;
 *  - context-dependent keys include `ctxKey` (see `contextKey()`), so changing the context bar refetches.
 */
import { contextToParams, type SearchRequest, type StoreSort, type UserContext } from '@titl/shared';

/** Stable string for a context (same encoding as the API query string). */
export function contextKey(ctx: UserContext | undefined): string {
  if (!ctx) return '';
  const params = contextToParams(ctx);
  params.sort();
  return params.toString();
}

/** SearchRequest with undefined fields dropped + spec sorted → stable key part. */
function normSearch(req: SearchRequest): SearchRequest {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(req)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = Array.isArray(v) ? [...v].sort() : v;
  }
  return out as SearchRequest;
}

export const qk = {
  all: ['bz'] as const,
  health: () => ['bz', 'health'] as const,
  meta: () => ['bz', 'meta'] as const,
  places: (q: string, limit = 8) => ['bz', 'places', q.trim(), limit] as const,
  reversePlace: (lat: number, lng: number) => ['bz', 'places', 'reverse', lat.toFixed(4), lng.toFixed(4)] as const,

  search: (req: SearchRequest, ctxKey: string) => ['bz', 'search', normSearch(req), ctxKey] as const,
  suggest: (q: string) => ['bz', 'suggest', q.trim()] as const,
  discover: (input: { q?: string; category?: string }, ctxKey: string) =>
    ['bz', 'discover', input.q ?? '', input.category ?? '', ctxKey] as const,

  /** Prefix for everything about one product (detail, stores, similar, areas). */
  productAll: (id: string) => ['bz', 'product', id] as const,
  product: (id: string, ctxKey: string) => ['bz', 'product', id, 'detail', ctxKey] as const,
  productStores: (id: string, sort: StoreSort | undefined, ctxKey: string, limit?: number) =>
    ['bz', 'product', id, 'stores', sort ?? 'smart', limit ?? null, ctxKey] as const,
  productSimilar: (id: string, ctxKey: string, limit?: number) => ['bz', 'product', id, 'similar', limit ?? null, ctxKey] as const,
  productAreas: (id: string, ctxKey: string) => ['bz', 'product', id, 'areas', ctxKey] as const,

  compareAll: () => ['bz', 'compare'] as const,
  compareProducts: (ids: string[], ctxKey: string) => ['bz', 'compare', 'products', ids.join(','), ctxKey] as const,
  compareVerdict: (ids: string[], ctxKey: string) => ['bz', 'compare', 'verdict', ids.join(','), ctxKey] as const,
  compareStores: (productId: string, shopIds: string[], ctxKey: string) =>
    ['bz', 'compare', 'stores', productId, shopIds.join(','), ctxKey] as const,

  shopAll: (id: string) => ['bz', 'shop', id] as const,
  shop: (id: string, ctxKey: string) => ['bz', 'shop', id, 'detail', ctxKey] as const,
  shopProducts: (id: string, q: string, page: number, ctxKey: string) => ['bz', 'shop', id, 'products', q, page, ctxKey] as const,
  shops: (q: string) => ['bz', 'shops', q.trim()] as const,
  mall: (slug: string, ctxKey: string) => ['bz', 'mall', slug, ctxKey] as const,

  alternatives: (input: { productId?: string; shopId?: string; reason: string }, ctxKey: string) =>
    ['bz', 'alternatives', input.reason, input.productId ?? '', input.shopId ?? '', ctxKey] as const,
  plan: (stopsKey: string, mode: string, departAt: string, ctxKey: string) => ['bz', 'plan', stopsKey, mode, departAt, ctxKey] as const,

  inquiriesAll: () => ['bz', 'inquiries'] as const,
  inquiries: (sessionId: string) => ['bz', 'inquiries', sessionId] as const,
  inquiry: (id: string) => ['bz', 'inquiry', id] as const,

  sellerShops: (q: string) => ['bz', 'seller', 'shops', q.trim()] as const,
  sellerInquiries: (shopId: string) => ['bz', 'seller', shopId, 'inquiries'] as const,

  chatHistory: (sessionId: string) => ['bz', 'chat', sessionId] as const,
} as const;
