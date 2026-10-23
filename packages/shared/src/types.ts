/**
 * Torob in the Loop API contract — the single source of truth for every shape that crosses
 * the server/web boundary. Server routes return these; the web client consumes them.
 *
 * Rules for contributors:
 *  - Never rename/remove a field. Add OPTIONAL fields only, and note them in docs/ARCHITECTURE.md.
 *  - Money is always integer Toman. Dates are ISO-8601 strings (UTC). Clock times are "HH:MM" Tehran local.
 *  - "Unknown" is modeled explicitly (null / 'unknown'), never as 0 or false.
 */

// ───────────────────────── Primitives ─────────────────────────

export type ISODate = string;
export type ProviderCode = 'torobpay' | 'snapppay' | 'digipay' | 'tara' | 'azkivam' | 'other';
/** Information type of a payment option, exactly as registered: accepted in person, or channel not specified. */
export type PaymentChannel = 'in_person' | 'unknown';
export type TravelMode = 'walk' | 'metro' | 'taxi' | 'car';
/**
 * Age of a registered price, measured against `AppMeta.catalog.dataAsOf` (NOT wall clock), per DESIGN-REVIEW D2:
 * ≤14d fresh «تازه» · 15–60d recent «معمولی» · 61–180d stale «قدیمی» · >180d very_stale «خیلی قدیمی» · null unknown «نامشخص».
 */
export type Freshness = 'fresh' | 'recent' | 'stale' | 'very_stale' | 'unknown';
export type PriceStatus = 'ok' | 'missing' | 'suspicious';
export type TriState = true | false | null;
export type DayKey = 'sat' | 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri';
export type Tone = 'good' | 'info' | 'warn' | 'bad';
export type Audience = 'men' | 'women' | 'kids' | 'unisex';

export interface LatLng {
  lat: number;
  lng: number;
}

/** A short explanation chip: why something is recommended, or a caveat. */
export interface Reason {
  code: string;
  label: string;
  tone: Tone;
}

// ───────────────────────── User context ─────────────────────────

/** Everything the user can tweak from the context bar. Shared by pages, API and agent. */
export interface UserContext {
  location?: LatLng & { label: string; source: 'gps' | 'place' | 'map' };
  budgetMin?: number;
  budgetMax?: number;
  /** Require any installment / BNPL provider (قسطی). */
  installment?: boolean;
  /** Require one of these specific providers. */
  providers?: ProviderCode[];
  /** Only stores open at the visit time. */
  openNow?: boolean;
  warrantyOnly?: boolean;
  fastDelivery?: boolean;
  /** User wants Kalabarg. Dataset has no Kalabarg records → shown as unknown + "ask" action, never used to exclude. */
  kalabarg?: boolean;
  maxDistanceKm?: number;
  travelMode?: TravelMode;
  /** Planned visit time. Absent = now. */
  visitAt?: ISODate;
  /** (optional, SV6) Search range; `maxDistanceKm` stays as an alias of `{kind:'radius', km}`. */
  range?: SearchRange;
  /** (optional, SV14) What matters most. Default 'balanced'. */
  priority?: Priority;
  /** (optional, SV14) Needed by this time (e.g. «همین امروز»). */
  needBy?: ISODate;
  /** (optional, SV8) Include «طرح/کپی» (replica) products, hidden by default for brand queries. */
  showReplicas?: boolean;
}

export type Priority = 'balanced' | 'price' | 'time' | 'certainty';

/** (SV6) Range as a first-class concept. `route` (corridor) is P1. */
export interface SearchRange {
  kind: 'radius' | 'areas' | 'time' | 'route';
  km?: number;
  areas?: string[];
  maxMinutes?: number;
  dest?: LatLng & { label?: string };
}

/**
 * (SV2) Availability ladder for a shop vs. a need/product. Fixed copy in AVAILABILITY_LABELS (shared/labels).
 * exact = this product registered · variant = same model_key, other storage/colour/build ·
 * similar = n similar models in the category, not this one · category_only = activity category only, no items.
 */
export type Availability = 'exact' | 'variant' | 'similar' | 'category_only';

/** (SV9) Strength of the installment information for a shop. */
export type InstallmentTier = 'in_person' | 'declared_unknown_channel' | 'seller_text' | 'none_recorded';

/** (DT5) Shop tier: A = has offers · B = declared categories only · C = neither (map/mall pages only). */
export type ShopTier = 'A' | 'B' | 'C';

// ───────────────────────── Price / hours / location ─────────────────────────

export interface RegisteredPrice {
  /** Valid registered price in Toman; null when missing or suspicious. */
  price: number | null;
  /** Raw registered value (to show suspicious values transparently). */
  rawPrice: number | null;
  status: PriceStatus;
  changedAt: ISODate | null;
  ageDays: number | null;
  freshness: Freshness;
  /** (optional, DT2) Persian explanation when missing/suspicious, e.g. «قیمت نامعتبر (احتمالاً تماسی)». */
  note?: string | null;
  /** (optional, SV4) Older than 30 d and below 0.8 × fresh median → «احتمالاً قیمت قدیمی — قبل از رفتن بپرسید». */
  likelyOutdated?: boolean;
}

export interface DayHours {
  day: DayKey;
  status: 'open' | 'closed' | 'unknown';
  shifts: { start: string; end: string }[];
}

export interface WeeklyHours {
  /** Seller registered a schedule at all. */
  declared: boolean;
  /** Schedule contains implausible values (e.g. 02:00–08:00); shown with a caution. */
  suspicious: boolean;
  /** Ordered sat → fri (Iranian week). */
  days: DayHours[];
}

export type OpenState = 'open' | 'closing_soon' | 'closed' | 'opens_later_today' | 'unknown';

/** (SV5) Finer open state at arrival time (visitAt + etaMin). Carried on OpenStatus.detail. */
export type OpenStateDetail = 'open' | 'closing_soon' | 'between_shifts' | 'closed_today' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  /** Persian, e.g. «باز است تا ۱۹:۰۰», «بسته — فردا ۱۰:۰۰ باز می‌شود», «ساعت کاری ثبت نشده». */
  label: string;
  closesAt?: string;
  opensAt?: string;
  opensDay?: DayKey;
  minutesToClose?: number;
  /** The moment this status was evaluated for (visit time). */
  at: ISODate;
  /** (optional, SV5) between_shifts = reopens later today after a break; closed_today = next opening on another day. */
  detail?: OpenStateDetail;
}

export type MallKind = 'passage' | 'complex' | 'mall' | 'bazaar' | 'sara' | 'building' | 'tower';

export interface MallRef {
  id: number;
  slug: string;
  name: string;
  kind: MallKind;
}

/** Parsed "where exactly is this shop" info from the shop's address text. */
export interface InMallLocation {
  mall: MallRef | null;
  floorLabel: string | null;
  floorNum: number | null;
  unit: string | null;
  plaque: string | null;
  wing: string | null;
  landmark: string | null;
  /** Human-readable steps in Persian, e.g. ["پاساژ علاءالدین ۲", "طبقه ششم", "واحد ۶۲۲"]. */
  guide: string[];
  confidence: 'high' | 'medium' | 'low';
  /** (optional, services) Heuristic wayfinding hints, each already labeled as heuristic in its text. */
  hints?: string[];
}

export interface MetroStationRef {
  name: string;
  nameEn: string | null;
  lines: { ref: string; color: string }[];
  lat: number;
  lng: number;
  distanceKm: number;
  walkMin: number;
}

// ───────────────────────── Payment & warranty ─────────────────────────

export interface PaymentOption {
  provider: ProviderCode;
  /** Persian provider label as registered, e.g. «ترب‌پی». */
  label: string;
  channel: PaymentChannel;
  minPrice: number | null;
  maxPrice: number | null;
}

export interface PaymentInfo {
  /** Structured, seller-declared options from Torob. */
  options: PaymentOption[];
  /** Any installment/BNPL provider declared. */
  installment: boolean;
  torobPayInPerson: boolean;
  /** Weaker signals mined from offer descriptions (e.g. 'installment', 'fast_delivery'); label as «در توضیحات فروشنده». */
  textHints: ('installment' | 'fast_delivery' | 'cheque' | 'pay_on_delivery')[];
  /** Kalabarg is never registered in the dataset → always null (unknown). */
  kalabarg: null;
  fastDelivery: TriState;
}

export interface WarrantyInfo {
  kind: 'company' | 'test_delivery' | 'authenticity' | 'exchange' | 'none' | 'other';
  months: number | null;
  provider: string | null;
  /** Persian display label, e.g. «۱۸ ماه گارانتی شرکتی». */
  label: string;
}

// ───────────────────────── Shops ─────────────────────────

export interface ShopLite {
  id: string;
  name: string;
  /** Dataset note: most names are anonymized; real when Instagram/website present. */
  nameIsReal: boolean;
  area: string | null;
  address: string | null;
  lat: number;
  lng: number;
  /** Relative to the request's context location; null without location. */
  distanceKm: number | null;
  etaMin: number | null;
  location: InMallLocation;
  openStatus: OpenStatus;
  payment: PaymentInfo;
  hasOffers: boolean;
  /** (optional, DT5) A has offers · B categories only · C neither. */
  tier?: ShopTier;
  /** (optional, SV4) Share 0..1 of this shop's valid prices changed ≤14 d before dataAsOf; null when it has no priced offers. */
  updateDiscipline?: number | null;
  /** (optional, SV9) Strongest installment information available for this shop. */
  installmentTier?: InstallmentTier;
}

export interface CrowdReport {
  id: string;
  shopId: string;
  type: 'closed' | 'not_found' | 'price_mismatch' | 'out_of_stock' | 'moved';
  note: string | null;
  at: ISODate;
}

export interface ShopDetail extends ShopLite {
  phone: string | null;
  phoneKind: 'mobile' | 'landline' | null;
  /** Always true in this dataset — phones are fake; UI must not present them as callable truth. */
  phoneIsFake: boolean;
  instagram: string | null;
  website: string | null;
  /** Declared activity categories (NOT proof of availability). */
  categories: string[];
  hours: WeeklyHours | null;
  stats: { offerCount: number; productCount: number; lastPriceChange: ISODate | null };
  reports: CrowdReport[];
  nearbyMetro: MetroStationRef[];
  inTrafficZone: boolean;
}

// ───────────────────────── Products ─────────────────────────

export interface ProductSummary {
  id: string;
  title: string;
  /** 'seller' = catalog title was redacted, a seller title is shown; 'generated' = built from category/brand. */
  titleSource: 'catalog' | 'seller' | 'generated';
  brand: string | null;
  brandInferred: boolean;
  category: string;
  categoryGroup: string;
  image: string | null;
  priceMin: number | null;
  priceMax: number | null;
  priceMedian: number | null;
  /** Number of in-person shops with an offer. */
  sellerCount: number;
  validPriceCount: number;
  lastPriceChange: ISODate | null;
  freshness: Freshness;
  nearest: { shopId: string; distanceKm: number } | null;
  /** Sellers within the context radius (default 3 km) when location known. */
  sellersNearby: number | null;
  installmentSellers: number;
  audience: Audience | null;
  /** Why this product is shown for the current query/context. */
  reasons: Reason[];
  /** (optional, DT8) Normalised brand+model grouping key (variants share it), null when unknown. */
  modelKey?: string | null;
  /** (optional, DT6) Catalog title marks it as a replica («طرح …», «های کپی», «مستر کوالیتی» …). */
  isReplica?: boolean;
  /** (optional, DT3) Where the brand came from. */
  brandSource?: BrandSource | null;
}

export type BrandSource = 'dataset' | 'spec' | 'title';

export interface SpecItem {
  key: string;
  value: string;
}

export interface PriceStats {
  min: number | null;
  median: number | null;
  max: number | null;
  validCount: number;
  missingCount: number;
  suspiciousCount: number;
  freshnessBuckets: Record<Freshness, number>;
  newest: ISODate | null;
  oldest: ISODate | null;
  /** (optional, SV4) Median of valid prices ≤14 d old (vs dataAsOf); only when ≥3 such prices. «قیمت رایج (تازه)». */
  freshMedian?: number | null;
}

export interface ProductDetail extends ProductSummary {
  titleEn: string | null;
  model: string | null;
  images: string[];
  specs: SpecItem[];
  priceStats: PriceStats;
  /** Transparency notes in Persian (redacted title, inferred brand, no specs…). */
  notes: string[];
}

// ───────────────────────── Stores for a product ─────────────────────────

export interface VerifiedInfo {
  inquiryId: string;
  source: 'simulated_call' | 'seller_inbox' | 'bale';
  at: ISODate;
  stock: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  price: number | null;
  priceDeltaPct: number | null;
  holdUntil: string | null;
}

export interface StoreOffer {
  shop: ShopLite;
  offerIds: string[];
  /** Distinct seller-written titles for this product at this shop (variants). */
  sellerTitles: string[];
  /** Best (lowest valid) registered price at this shop. */
  price: RegisteredPrice;
  /** (optional, DT6) Attributes mined from seller title/description (always labelled «طبق عنوان/توضیحات فروشنده»). */
  attrs?: OfferAttrs;
  /** (optional, SV2) Availability rung; StoreOffer rows are 'exact' (or 'variant' when merged from a sibling model). */
  availability?: Availability;
  /** Highest valid variant price when variants differ. */
  priceMax: number | null;
  warranty: WarrantyInfo | null;
  description: string | null;
  /** Latest verification from an inquiry, if any. */
  verified: VerifiedInfo | null;
  /** 0..100 smart score (see docs/ARCHITECTURE.md §Ranking). */
  score: number;
  reasons: Reason[];
  rank: number;
}

/** (DT6) Seller-text attributes. Absent field = not mentioned (unknown), never "no". */
export interface OfferAttrs {
  condition?: 'new' | 'akband' | 'used' | 'stock' | 'open_box';
  authenticity?: 'replica' | 'claims_original';
  registry?: 'registered' | 'not_active';
  bundle?: 'with_charger';
  source: 'seller_text';
}

/** Business whose declared activity category matches, with NO offer for the product (availability unknown). */
export interface CandidateShop {
  shop: ShopLite;
  matchedCategory: string;
  note: string;
}

export interface AreaSummary {
  area: string;
  lat: number;
  lng: number;
  storeCount: number;
  priceMin: number | null;
  priceMax: number | null;
  distanceKm: number | null;
  etaMin: number | null;
  /** Stores are within comfortable walking distance of each other. */
  walkableCluster: boolean;
  inTrafficZone: boolean;
  nearestMetro: MetroStationRef | null;
}

export interface StoresResponse {
  product: ProductSummary;
  stores: StoreOffer[];
  categoryOnly: CandidateShop[];
  areas: AreaSummary[];
  /** Chips describing active filters (from context). */
  appliedFilters: Reason[];
  /** Stores hidden by the active filters (so UI can say "۵ فروشگاه با فیلترهای شما حذف شدند"). */
  excludedByFilters: number;
  sort: StoreSort;
  /** (optional, SV7) Walkable clusters (single-link ≤300 m) of the stores. */
  clusters?: ClusterSummary[];
  /** (optional, SV6) When the range is empty: nearest cluster outside it + actions. */
  nearestCluster?: NearestClusterNotice | null;
  /** (optional, SV9) Installment grouping when ctx.installment is on (grouped, never filtered to empty). */
  installmentGroups?: { tier: InstallmentTier; label: string; shopIds: string[] }[];
  /** (optional, SV9) Actions when fewer than 3 stores land in the top installment tiers. */
  installmentActions?: { id: string; label: string; contextPatch?: Partial<UserContext> }[];
  /** (optional, SV3) Suggest leading with need mode («کجا بروم؟»), with the reason sentence. */
  needMode?: { recommended: boolean; text: string; similarStoreCount: number } | null;
  /** (optional, SV4) Price-sort groups: fresh first, then cheaper-but-stale. */
  priceGroups?: { id: 'fresh' | 'stale'; label: string; shopIds: string[] }[];
  /** (optional, SV11) Deterministic insights. */
  insights?: Insight[];
  /** (optional, SV5) When nothing is open at visit time: the soonest opening. */
  soonestOpening?: SoonestOpening | null;
  /** (optional, SV5) Next window with ≥70% of these stores open, when < 35% are open at arrival. */
  nextGoodWindow?: GoodWindow | null;
}

/** (SV7) A walkable group of stores. */
export interface ClusterSummary {
  id: string;
  centroid: LatLng;
  /** Mall name or area, e.g. «جمهوری (پل حافظ)». */
  label: string;
  storeCount: number;
  shopIds: string[];
  priceMin: number | null;
  priceMax: number | null;
  /** Stores open at arrival time. */
  openAtVisit: number;
  etaFromUser: number | null;
  distanceKm: number | null;
  /** Card copy, e.g. «بهترین جا برای خرید حضوری: ۲۱ فروشنده در ۳۰۰ متر …». */
  text: string;
}

/** (SV6) Never-empty notice. */
export interface NearestClusterNotice {
  text: string;
  cluster: ClusterSummary;
  actions: { id: 'expand_range' | 'ask_category_shops'; label: string; contextPatch?: Partial<UserContext> }[];
}

/** (SV5) */
export interface SoonestOpening {
  at: ISODate;
  shopId: string;
  text: string;
}

/** (SV5) Next window where ≥70% of relevant shops are open. */
export interface GoodWindow {
  at: ISODate;
  openShare: number;
  label: string;
}

/** (SV11) A deterministic insight, shared by LLM and rules modes. */
export interface Insight {
  code:
    | 'stale_price'
    | 'closing_before_arrival'
    | 'same_passage_cluster'
    | 'suspiciously_cheap'
    | 'installment_channel_unknown'
    | 'traffic_zone'
    | 'metro'
    | 'tradeoff'
    | 'weekend'
    | 'budget_reality'
    | 'replicas_hidden';
  tone: Tone;
  text: string;
  shopIds?: string[];
  /** Optional one-tap follow-up. */
  action?: { label: string; contextPatch?: Partial<UserContext>; href?: string };
}

// ───────────────────────── Need-level store finder (SV1) ─────────────────────────

export interface NeedSpec {
  categoryId?: string;
  group?: string;
  brand?: string;
  audience?: Audience;
  budgetMin?: number;
  budgetMax?: number;
  size?: string;
  keywords?: string[];
  /** Restrict to these products (shortlist variant, GET /api/shortlist/stores?ids=). */
  productIds?: string[];
}

export interface AssortmentSample {
  productId: string;
  title: string;
  image: string | null;
  price: number | null;
  freshness: Freshness;
}

export interface AssortmentStore {
  shop: ShopLite;
  availability: Availability;
  /** Fixed Persian copy for the availability rung. */
  availabilityLabel: string;
  matchCount: number;
  samples: AssortmentSample[];
  priceMin: number | null;
  priceMax: number | null;
  brands: string[];
  sizes: string[];
  /** Share 0..1 of matched prices ≤14 d old; null when none priced. */
  freshShare: number | null;
  score: number;
  reasons: Reason[];
  /** (shortlist variant) product ids from the shortlist this shop has. */
  coverage?: string[];
}

export interface NeedStoresResponse {
  need: NeedSpec;
  stores: AssortmentStore[];
  clusters: ClusterSummary[];
  excludedByFilters: number;
  totalMatchingProducts: number;
  appliedFilters: Reason[];
  nearestCluster?: NearestClusterNotice | null;
  budgetReality?: BudgetReality | null;
  insights?: Insight[];
  soonestOpening?: SoonestOpening | null;
  nextGoodWindow?: GoodWindow | null;
}

/** (SV8) Budget reality check. */
export interface BudgetReality {
  text: string;
  /** Cheapest credible (non-replica, non-outlier) product in the category/brand. */
  cheapestCredible: { productId: string; title: string; price: number; sellerCount: number } | null;
  actions: { id: string; label: string; contextPatch?: Partial<UserContext>; searchPatch?: Partial<SearchRequest> }[];
}


export type StoreSort = 'smart' | 'price' | 'distance' | 'freshness';

// ───────────────────────── Search & discovery ─────────────────────────

export interface QueryChip {
  /** Which part of the request this chip maps to: 'category' | 'brand' | 'budget' | 'area' | 'installment' | 'open' | 'audience' | 'keyword'. */
  key: string;
  label: string;
  removable: boolean;
  /** (optional, services) The query text without this chip's words — re-run search with it to remove the chip. */
  qWithout?: string;
}

/** Result of Persian NLU over free text. */
export interface ParsedQuery {
  raw: string;
  /** Remaining free-text keywords after extracting structured parts. */
  text: string;
  keywords: string[];
  category?: string;
  categoryGroup?: string;
  brand?: string;
  budgetMin?: number;
  budgetMax?: number;
  areaLabel?: string;
  location?: LatLng;
  installment?: boolean;
  providers?: ProviderCode[];
  openNow?: boolean;
  audience?: Audience;
  chips: QueryChip[];
  /** (optional, services) Sort implied by the text, e.g. «ارزان‌ترین» → price_asc. */
  sort?: SearchSort;
  /** (optional, services) Text asked for sellers near the user («نزدیک من»). */
  nearMe?: boolean;
}

export type SearchSort = 'relevance' | 'price_asc' | 'price_desc' | 'sellers' | 'distance';

export interface SearchRequest {
  q?: string;
  category?: string;
  group?: string;
  brand?: string;
  priceMin?: number;
  priceMax?: number;
  minSellers?: number;
  /** Only products with ≥1 seller within context maxDistanceKm (default 5 km). */
  nearOnly?: boolean;
  audience?: Audience;
  /** Spec facet filter "key::value" (repeatable). */
  spec?: string[];
  sort?: SearchSort;
  page?: number;
  limit?: number;
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface PriceTier {
  id: 'budget' | 'mid' | 'premium' | 'luxury';
  label: string;
  min: number | null;
  max: number | null;
  count: number;
}

export interface Facets {
  categories: FacetBucket[];
  brands: FacetBucket[];
  priceTiers: PriceTier[];
  audiences: FacetBucket[];
  specs: { key: string; values: FacetBucket[] }[];
  installmentCount: number;
  nearCount: number | null;
}

export interface SearchResponse {
  parsed: ParsedQuery;
  total: number;
  page: number;
  limit: number;
  items: ProductSummary[];
  facets: Facets;
  didYouMean: string | null;
  tookMs: number;
  /** (optional, services) Persian notes about how the query was interpreted/relaxed (e.g. a filter dropped to avoid an empty page). */
  notices?: Reason[];
  /** (optional, SV8) Budget reality check notice. */
  budgetReality?: BudgetReality | null;
  /** (optional, SV8) Number of replica products hidden for a brand query («۱۲ کالای طرح/کپی پنهان شد — نمایش»). */
  hiddenReplicas?: number;
  /** (optional, SV3) Lead with need mode («کجا بروم؟»). */
  needMode?: { recommended: boolean; reason: string } | null;
}

export interface DiscoveryOption {
  id: string;
  label: string;
  hint?: string;
  count: number;
  /** Search params this option applies when chosen. */
  patch: Partial<SearchRequest> & { keywords?: string[] };
  /** (optional, services) User-context change this option implies (e.g. «فقط قسطی» → { installment: true }). */
  contextPatch?: Partial<UserContext>;
}

export interface DiscoveryQuestion {
  id: string;
  title: string;
  subtitle?: string;
  multi: boolean;
  options: DiscoveryOption[];
}

export interface DiscoveryResponse {
  category: string | null;
  categoryGroup: string | null;
  intro: string;
  totalProducts: number;
  questions: DiscoveryQuestion[];
}

// ───────────────────────── Comparison ─────────────────────────

export interface CompareRow {
  key: string;
  values: (string | null)[];
  differs: boolean;
  /** Index of the "best" value when objectively comparable (e.g. lowest price), else null. */
  bestIndex: number | null;
}

export interface CompareProductsResponse {
  products: ProductDetail[];
  rows: CompareRow[];
  highlights: { productId: string; reasons: Reason[] }[];
  /** Persian summary (LLM when enabled, deterministic otherwise). */
  summary: string;
  summarySource: 'llm' | 'rules';
}

export interface CompareStoresResponse {
  product: ProductSummary;
  stores: StoreOffer[];
  rows: CompareRow[];
  summary: string;
}

export interface ShopProductsResponse {
  items: { product: ProductSummary; price: RegisteredPrice; sellerTitle: string | null; warranty: WarrantyInfo | null }[];
  total: number;
  page: number;
  limit: number;
}

export interface SuggestResponse {
  suggestions: { type: 'product' | 'category' | 'brand' | 'mall' | 'query'; label: string; value: string; hint?: string }[];
}

// ───────────────────────── Malls & places ─────────────────────────

export interface MallDetail {
  mall: MallRef & { area: string | null; lat: number; lng: number; shopCount: number };
  floors: { floorNum: number | null; label: string; shops: ShopLite[] }[];
  categories: FacetBucket[];
  nearbyMetro: MetroStationRef[];
  inTrafficZone: boolean;
  tips: string[];
}

export interface Place {
  id: string;
  name: string;
  kind: 'area' | 'landmark' | 'metro' | 'mall';
  lat: number;
  lng: number;
  subtitle?: string;
}

// ───────────────────────── Alternatives ─────────────────────────

export type AltReason =
  | 'closed'
  | 'out_of_stock'
  | 'no_answer'
  | 'not_found'
  | 'too_expensive'
  | 'unreachable'
  | 'over_budget'
  | 'no_installment';

export interface AlternativesRequest {
  productId?: string;
  shopId?: string;
  reason: AltReason;
  context?: UserContext;
  /** (optional, SV10) Measure distance from here (the failed shop) instead of the user's location. */
  origin?: LatLng;
}

export interface AlternativesResponse {
  reason: AltReason;
  /** Persian headline, e.g. «فروشگاه بسته بود؟ این ۳ فروشگاه همین الان باز هستند و همین کالا را دارند». */
  headline: string;
  sameProduct: StoreOffer[];
  samePassage: CandidateShop[];
  similarProducts: ProductSummary[];
  /** (optional, SV10) Which constraint was relaxed to find these, in Persian (e.g. «بدون شرط قسطی»). */
  relaxed?: { constraint: string; label: string } | null;
  /** (optional, SV10) Relative chips per shop id, e.g. «همان پاساژ، طبقهٔ ۳ — ۲ دقیقه پیاده». */
  relativeChips?: Record<string, Reason[]>;
  /** (optional, SV10) «اگر هیچ‌کدام نشد»: tier-B shops in the same mall. */
  fallbackTierB?: CandidateShop[];
}

// ───────────────────────── Inquiries (contact & follow-up) ─────────────────────────

export type InquiryQuestion =
  | 'stock'
  | 'price'
  | 'hours'
  | 'hold'
  | 'installment'
  | 'kalabarg'
  | 'location'
  | 'warranty'
  | 'variant'
  | 'registry'
  | 'condition'
  | 'cash_vs_installment'
  | 'return_policy'
  | 'custom';

export type InquiryStatus =
  | 'queued'
  | 'calling'
  | 'in_call'
  | 'answered'
  | 'no_answer'
  | 'busy'
  | 'closed'
  | 'retry_scheduled'
  | 'awaiting_seller'
  | 'resolved'
  | 'unreachable'
  | 'cancelled'
  | 'scheduled_at_open'
  | 'callback_promised';

export type InquiryChannel = 'simulated_call' | 'seller_inbox' | 'bale';

export interface InquiryResult {
  stock: 'in_stock' | 'out_of_stock' | 'limited' | 'unknown';
  price: number | null;
  /** Relative to the registered price (positive = more expensive now). */
  priceDeltaPct: number | null;
  hoursToday: string | null;
  holdUntil: string | null;
  installment: { available: boolean; providers: string[]; note: string | null } | null;
  kalabarg: boolean | null;
  locationHint: string | null;
  warranty: string | null;
  answerToCustom: string | null;
  /** One-line Persian summary. */
  summary: string;
  /** (optional, contact) Requested variant (size/colour/…) availability; null = not asked / unknown. */
  variantAvailable?: boolean | null;
  /** (optional, contact) Answers to the extra questions (variant, registry, condition, cash_vs_installment, return_policy). */
  answers?: { question: InquiryQuestion; text: string }[];
  /** (optional, contact) Quoted price is above the shopper's budgetMax. */
  overBudget?: boolean;
}

export interface InquiryEvent {
  id: number;
  at: ISODate;
  type: 'status' | 'line' | 'result' | 'note' | 'alternatives';
  speaker?: 'agent' | 'store' | 'system';
  text: string;
  data?: unknown;
}

export interface Inquiry {
  id: string;
  sessionId: string;
  batchId: string | null;
  shop: ShopLite;
  product: ProductSummary | null;
  /** Registered price at inquiry time (for delta display). */
  registeredPrice: RegisteredPrice | null;
  questions: InquiryQuestion[];
  customQuestion: string | null;
  status: InquiryStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: ISODate | null;
  channel: InquiryChannel;
  result: InquiryResult | null;
  resultSource: InquiryChannel | null;
  createdAt: ISODate;
  updatedAt: ISODate;
  events: InquiryEvent[];
  alternatives: AlternativesResponse | null;
  /** True when the call was simulated (dataset phones are fake). */
  simulated: boolean;
  /** (optional, contact) Requested variant, e.g. [{key:'سایز', value:'۴۳'}]. */
  variant?: { key: string; value: string }[];
  /** (optional, contact) Position of this inquiry within its batch (0-based). */
  batchIndex?: number;
  /** (optional, contact) Disclosed demo scenario name when DEMO_SCENARIOS chose the outcome. */
  scenario?: string | null;
  /** (optional, contact) One-line Persian next-step text, e.g. «فروشگاه الان بسته است؛ تماس شنبه ۱۰:۰۵ انجام می‌شود…». */
  statusNote?: string | null;
  /** (optional, contact) Seller reply is shown to every buyer (global VerifiedInfo). */
  published?: boolean;
}

export interface CreateInquiriesRequest {
  sessionId: string;
  productId?: string;
  shopIds: string[];
  questions: InquiryQuestion[];
  customQuestion?: string;
  context?: UserContext;
  /** (optional, CT4) Requested variant, e.g. [{key:'سایز', value:'۴۳'}, {key:'رنگ', value:'مشکی'}]. */
  variant?: { key: string; value: string }[];
  /** (optional, CT2) «همین الان بپرس»: call even if the shop's hours say it is closed. */
  force?: boolean;
  /** (optional, D3) Demo-clock «now» (AppMeta.clock.now when demo). Honored only in demo mode. */
  clockNow?: ISODate;
}

export interface SellerReplyRequest {
  stock: 'in_stock' | 'out_of_stock' | 'limited';
  price?: number;
  hoursToday?: string;
  holdUntil?: string;
  installment?: boolean;
  kalabarg?: boolean;
  note?: string;
  /** (optional, CT5) «همان قیمت»: confirm the registered price. */
  samePrice?: boolean;
  /** (optional, CT5, default true) «این قیمت و موجودی برای همهٔ خریداران نمایش داده شود». */
  publish?: boolean;
}

/** (contact, CT5) Seller inbox header stats. */
export interface SellerInboxStats {
  shopId: string;
  askedToday: number;
  pending: number;
  staleOffers: number;
  /** «امروز ۷ نفر دربارهٔ کالاهای شما پرسیدند · ۳ قیمت شما بیش از ۳۰ روز قدیمی است» */
  headline: string;
}

// ───────────────────────── Visit plan ─────────────────────────

export interface PlanStopInput {
  shopId: string;
  productId?: string;
}

export interface VisitPlanRequest {
  stops: PlanStopInput[];
  origin?: LatLng;
  departAt?: ISODate;
  mode?: TravelMode;
  /** Keep the given order instead of optimizing. */
  keepOrder?: boolean;
}

export interface PlanLeg {
  distanceKm: number;
  minutes: number;
  mode: TravelMode;
}

export interface PlanStop {
  order: number;
  shop: ShopLite;
  product: ProductSummary | null;
  offer: StoreOffer | null;
  legFromPrev: PlanLeg | null;
  arriveAt: ISODate;
  openAtArrival: OpenStatus;
  /** Suggested minutes spent in the shop. */
  dwellMin: number;
  warnings: Reason[];
  guide: InMallLocation;
}

export interface NavLinks {
  neshan: string;
  balad: string;
  google: string;
  geo: string;
}

export interface VisitPlan {
  id: string;
  createdAt: ISODate;
  departAt: ISODate;
  /** Latest sensible departure so every stop is still open on arrival, if computable. */
  leaveBy: ISODate | null;
  mode: TravelMode;
  origin: LatLng | null;
  stops: PlanStop[];
  totalMinutes: number;
  totalDistanceKm: number;
  warnings: Reason[];
  tips: string[];
  trafficZone: { anyStopInside: boolean; note: string | null };
  metro: MetroStationRef[];
  /** Navigation to the first stop. Per-stop links via navLinksFor() in shared/geo. */
  navLinks: NavLinks;
}

// ───────────────────────── Assistant (chat) ─────────────────────────

export type UIBlock =
  | { kind: 'products'; title?: string; items: ProductSummary[]; parsed?: ParsedQuery; total?: number }
  | { kind: 'discovery'; data: DiscoveryResponse }
  | { kind: 'product'; data: ProductDetail }
  | { kind: 'stores'; data: StoresResponse; limit?: number }
  | { kind: 'compare_products'; data: CompareProductsResponse }
  | { kind: 'compare_stores'; data: CompareStoresResponse }
  | { kind: 'inquiries'; items: Inquiry[] }
  | { kind: 'plan'; data: VisitPlan }
  | { kind: 'alternatives'; data: AlternativesResponse }
  | { kind: 'areas'; product: ProductSummary | null; items: AreaSummary[] }
  | { kind: 'shop'; data: ShopDetail }
  | { kind: 'mall'; data: MallDetail }
  | { kind: 'quick_replies'; options: { label: string; message: string }[] }
  | { kind: 'notice'; tone: Tone; text: string }
  | { kind: 'insights'; items: Insight[] }
  | { kind: 'agent_plan'; steps: { label: string; status: 'pending' | 'running' | 'done' | 'skipped' }[]; title?: string }
  | { kind: 'need_stores'; data: NeedStoresResponse };

export type AgentEvent =
  | { type: 'status'; text: string }
  | { type: 'text'; delta: string }
  | { type: 'block'; block: UIBlock }
  | { type: 'context'; patch: Partial<UserContext> }
  | { type: 'done'; messageId: string; mode: 'llm' | 'rules' }
  | { type: 'error'; message: string };

export interface ChatRequest {
  sessionId: string;
  message: string;
  context: UserContext;
}

export interface ChatMessageDTO {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  blocks: UIBlock[];
  createdAt: ISODate;
  mode?: 'llm' | 'rules';
}

// ───────────────────────── Live events (SSE) ─────────────────────────

export type LiveEvent =
  | { type: 'inquiry.updated'; inquiry: Inquiry }
  | { type: 'inquiry.line'; inquiryId: string; event: InquiryEvent }
  | {
      type: 'notification';
      id: string;
      title: string;
      body: string;
      tone: Tone;
      link?: string;
    }
  | { type: 'ping'; at: ISODate }
  | { type: 'assistant.message'; sessionId: string; message: ChatMessageDTO };

export type SellerLiveEvent = { type: 'seller.inquiry'; inquiry: Inquiry } | { type: 'ping'; at: ISODate };

// ───────────────────────── Meta ─────────────────────────

export interface CategoryGroupInfo {
  id: string;
  name: string;
  icon: string;
  productCount: number;
  topCategories: string[];
}

export interface AppMeta {
  name: string;
  version: string;
  catalog: {
    products: number;
    offers: number;
    shops: number;
    shopsWithOffers: number;
    malls: number;
    builtAt: ISODate;
    /** Newest last_price_changed_at in the dataset (≈ snapshot date). */
    dataAsOf: ISODate;
  };
  /** (optional, D3) Server clock; `demo` true when a scenario pinned the clock («ساعت نمایشی»). */
  clock?: { now: ISODate; demo: boolean };
  /** (optional, D2) Same as catalog.dataAsOf, top-level for convenience. */
  dataAsOf?: ISODate;
  features: { llm: boolean; stt: boolean; sellerInbox: boolean; bale: boolean; neshan: boolean };
  providers: { code: ProviderCode; label: string; description: string }[];
  categoryGroups: CategoryGroupInfo[];
  areas: { name: string; lat: number; lng: number; shopCount: number; inTrafficZone: boolean }[];
  map: { tileUrl: string; attribution: string; center: LatLng; zoom: number };
  examples: string[];
}

/** (DT15) GET /api/meta/data-quality — rule hit counts from the actual ETL run. */
export interface DataQualityResponse {
  dataAsOf: ISODate | null;
  builtAt: ISODate | null;
  /** Rule id → hit count (e.g. price_missing, price_below_1000, hours_placeholder_dropped …). */
  counts: Record<string, number>;
  /** Persian lines for /about «داده‌ها چقدر کامل است؟». */
  lines: { text: string; share: number | null }[];
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSec: number;
  catalog: { ok: boolean; products: number };
  state: { ok: boolean; persistent: boolean };
  llm: { enabled: boolean; model: string | null };
  version: string;
}

export interface ApiError {
  error: { code: string; message: string };
}
