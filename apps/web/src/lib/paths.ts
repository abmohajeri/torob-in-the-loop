/**
 * Route builders — use these instead of hand-written strings so links stay in sync with src/router.tsx.
 */
const enc = encodeURIComponent;

function withQuery(path: string, query: Record<string, string | number | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export const paths = {
  home: '/',
  /** Assistant home with a prefilled message (`?q=`), e.g. from desktop demo links. */
  assistant: (q?: string) => withQuery('/', { q }),
  search: (q?: string, extra: Record<string, string | number | undefined> = {}) => withQuery('/search', { q, ...extra }),
  product: (id: string) => `/p/${enc(id)}`,
  productStores: (id: string, sort?: string) => withQuery(`/p/${enc(id)}/stores`, { sort }),
  compare: (ids: string[] = []) => withQuery('/compare', { ids: ids.length ? ids.join(',') : undefined }),
  compareStores: (productId: string, shopIds: string[]) =>
    withQuery('/compare/stores', { product: productId, shops: shopIds.join(',') }),
  shop: (id: string) => `/shop/${enc(id)}`,
  mall: (slug: string) => `/mall/${enc(slug)}`,
  inquiries: '/inquiries',
  inquiry: (id: string) => `/inquiries/${enc(id)}`,
  plan: '/plan',
  seller: '/seller',
  sellerInbox: (shopId: string) => `/seller/${enc(shopId)}`,
  about: '/about',
  dev: '/_dev',
} as const;
