import type {
  AlternativesRequest,
  AlternativesResponse,
  AppMeta,
  AreaSummary,
  CompareProductsResponse,
  CompareStoresResponse,
  CrowdReport,
  DataQualityResponse,
  Insight,
  NeedSpec,
  NeedStoresResponse,
  BudgetReality,
  DiscoveryResponse,
  LatLng,
  MallDetail,
  MetroStationRef,
  OpenStatus,
  ParsedQuery,
  Place,
  ProductDetail,
  ProductSummary,
  RegisteredPrice,
  SearchRequest,
  SearchResponse,
  ShopDetail,
  ShopLite,
  ShopProductsResponse,
  StoreSort,
  StoresResponse,
  SuggestResponse,
  UserContext,
  VerifiedInfo,
  VisitPlan,
  VisitPlanRequest,
  WeeklyHours,
} from '@titl/shared';

/** Supplied by the contact module: latest verified (inquiry) info per shop for a product. */
export interface VerificationProvider {
  latestFor(productId: string, shopIds: string[]): Map<string, VerifiedInfo>;
}

/** Supplied by the contact module: recent crowd reports for a shop. */
export interface ReportsProvider {
  forShop(shopId: string, limit?: number): CrowdReport[];
  /** shopId -> report types in the last N hours (used to down-rank "reported closed"). */
  recentByShops(shopIds: string[], hours?: number): Map<string, CrowdReport['type'][]>;
}

/**
 * Catalog services — deterministic, synchronous (node:sqlite), side-effect free.
 * Implemented in apps/server/src/services/*. Consumed by REST routes, the agent tools and the contact module.
 */
export interface Services {
  meta(): AppMeta;

  /** Persian NLU over free text → structured query + chips (shared with the agent's fallback). */
  parseQuery(q: string, ctx: UserContext): ParsedQuery;
  search(req: SearchRequest, ctx: UserContext): SearchResponse;
  suggest(q: string): SuggestResponse;
  discover(input: { q?: string; category?: string }, ctx: UserContext): DiscoveryResponse;

  getProduct(id: string, ctx: UserContext): ProductDetail | null;
  getProductSummary(id: string, ctx: UserContext): ProductSummary | null;
  getStores(productId: string, ctx: UserContext, opts?: { sort?: StoreSort; limit?: number }): StoresResponse | null;
  getSimilar(productId: string, ctx: UserContext, limit?: number): ProductSummary[];
  compareProducts(ids: string[], ctx: UserContext): CompareProductsResponse;
  compareStores(productId: string, shopIds: string[], ctx: UserContext): CompareStoresResponse | null;
  /** Registered best price of a product at a shop (for inquiry snapshots). */
  registeredPrice(productId: string, shopId: string): RegisteredPrice | null;

  getShop(id: string, ctx: UserContext): ShopDetail | null;
  getShopLite(id: string, ctx: UserContext): ShopLite | null;
  getShopHours(id: string): WeeklyHours | null;
  getShopProducts(id: string, opts: { q?: string; page?: number; limit?: number }, ctx: UserContext): ShopProductsResponse;
  /** Open status of a shop at a moment (defaults to ctx.visitAt / now). */
  openStatus(shopId: string, at?: Date): OpenStatus;
  /** Free-text shop search (seller-panel picker, agent). */
  findShops(q: string, limit?: number): ShopLite[];

  getMall(slugOrId: string, ctx: UserContext): MallDetail | null;
  getAreas(productId: string | null, ctx: UserContext): AreaSummary[];
  nearestMetro(p: LatLng, limit?: number): MetroStationRef[];

  alternatives(req: AlternativesRequest): AlternativesResponse;
  plan(req: VisitPlanRequest, ctx: UserContext): Promise<VisitPlan>;

  places(q: string, limit?: number): Place[];
  reversePlace(p: LatLng): Place | null;

  /** (SV1/SV2) Need-level store finder; `need.productIds` = shortlist / single-product availability ladder. */
  getStoresForNeed(need: NeedSpec, ctx: UserContext, opts?: { limit?: number }): NeedStoresResponse;
  /** (SV8) Budget reality check for a category/group/brand; null when the budget is realistic. */
  budgetReality(q: { categoryId: number | null; group: string | null; brand: string | null; budgetMax: number }): BudgetReality | null;
  /** (SV11) Deterministic insights over stores/clusters/inquiries/plan (shared by LLM and rules modes). */
  insights(input: import('../domain/insights.js').InsightInput): Insight[];
  /** (DT15) Rule hit counts of the ETL run + /about lines. */
  dataQuality(): DataQualityResponse;
}
