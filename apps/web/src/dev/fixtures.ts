/**
 * Sample data for the /_dev component gallery. Titles, images, prices, dates, shop names, addresses, coordinates,
 * warranties and payment options are copied from the real Torob dataset (offers/products/shops CSV). Derived fields
 * (distance, ETA, open status, freshness, reasons, in-mall parsing) are what the server computes for such rows.
 * The VerifiedInfo sample stands for a simulated-call result (the demo inquiry flow).
 */
import {
  ageDays,
  formatClock,
  freshnessOf,
  type InMallLocation,
  type OpenStatus,
  type PaymentInfo,
  type ProductSummary,
  type RegisteredPrice,
  type ShopLite,
  type StoreOffer,
  type VerifiedInfo,
  type WarrantyInfo,
} from '@titl/shared';

const NOW = new Date();
const nowIso = NOW.toISOString();

export function registered(price: number | null, changedAt: string | null, status: RegisteredPrice['status'] = 'ok', rawPrice = price): RegisteredPrice {
  return { price: status === 'ok' ? price : null, rawPrice, status, changedAt, ageDays: ageDays(changedAt, NOW), freshness: freshnessOf(changedAt, NOW) };
}

// ── Products (real rows) ─────────────────────────────────────────

export const PRODUCT_A57: ProductSummary = {
  id: 'product_3c2a9952aa40b52f3052eb4b',
  title: 'گوشی سامسونگ A57 5G | حافظه 256 رم 8 گیگابایت',
  titleSource: 'catalog',
  brand: 'سامسونگ',
  brandInferred: false,
  category: 'گوشی موبایل',
  categoryGroup: 'mobile',
  image: 'https://image.torob.com/base/images/7G/gG/7GgGzx2zuAc5C7eF.webp',
  priceMin: 134_000_000,
  priceMax: 191_000_000,
  priceMedian: null,
  sellerCount: 25,
  validPriceCount: 25,
  lastPriceChange: '2026-10-12T21:18:54.424Z',
  freshness: freshnessOf('2026-10-12T21:18:54.424Z', NOW),
  nearest: { shopId: 'shop_ec32a89464e8016804212b92', distanceKm: 0.4 },
  sellersNearby: 18,
  installmentSellers: 0,
  audience: null,
  reasons: [
    { code: 'cluster', label: '۱۸ فروشنده در پاساژ چارسو و اطراف', tone: 'good' },
    { code: 'budget', label: 'داخل بودجه شما', tone: 'good' },
    { code: 'no_installment', label: 'قسطی ثبت نشده', tone: 'warn' },
  ],
};

export const PRODUCT_A17: ProductSummary = {
  ...PRODUCT_A57,
  id: 'product_d24b597176bdf2a82035dcc2',
  title: 'گوشی سامسونگ A17 4G | حافظه 128 رم 4 گیگابایت',
  image: 'https://image.torob.com/base/images/NN/z4/NNz42wxZ_USP56bZ.webp',
  priceMin: 53_900_000,
  priceMax: 77_450_000,
  sellerCount: 25,
  validPriceCount: 25,
  lastPriceChange: '2026-10-12T21:21:18.922Z',
  nearest: { shopId: 'shop_39aef8be9b19cdf55eefabbd', distanceKm: 1.2 },
  reasons: [
    { code: 'cheap', label: 'ارزان‌ترین در این دسته', tone: 'good' },
    { code: 'open', label: 'بیشتر فروشندگان الان باز', tone: 'info' },
  ],
};

export const PRODUCT_EARPODS: ProductSummary = {
  ...PRODUCT_A57,
  id: 'product_05443fcee00eb5592135c294',
  title: 'هندزفری با سیم اپل مدل EarPods کانکتور لایتنینگ',
  brand: 'اپل',
  category: 'هدفون، هدست و هندزفری',
  categoryGroup: 'audio',
  image: 'https://image.torob.com/base/images/vI/fT/vIfTHaZ3CcI_ssma.jpg',
  priceMin: 440_000,
  priceMax: 2_899_000,
  sellerCount: 11,
  validPriceCount: 11,
  lastPriceChange: '2026-10-09T17:12:30.134Z',
  freshness: freshnessOf('2026-10-09T17:12:30.134Z', NOW),
  nearest: null,
  sellersNearby: null,
  reasons: [{ code: 'wide_range', label: 'اختلاف قیمت زیاد بین فروشنده‌ها', tone: 'warn' }],
};

/** Real product with no image, a single seller and no registered brand (brand inferred from the title). */
export const PRODUCT_NO_IMAGE: ProductSummary = {
  ...PRODUCT_A57,
  id: 'product_003579883abb84feb6599a2c',
  title: 'کرم پودر کانفست مدل 301 حجم 40 میلی لیتر',
  brand: 'کانفست',
  brandInferred: true,
  category: 'کرم پودر',
  categoryGroup: 'beauty',
  image: null,
  priceMin: 1_745_150,
  priceMax: 1_745_150,
  sellerCount: 1,
  validPriceCount: 1,
  lastPriceChange: '2026-10-04T02:25:58.166Z',
  freshness: freshnessOf('2026-10-04T02:25:58.166Z', NOW),
  nearest: null,
  sellersNearby: null,
  reasons: [],
};

export const PRODUCTS: ProductSummary[] = [PRODUCT_A57, PRODUCT_A17, PRODUCT_EARPODS, PRODUCT_NO_IMAGE];

// ── Shops (real rows) ────────────────────────────────────────────

const CHARSOO = { id: 1, slug: 'charsoo', name: 'پاساژ چارسو', kind: 'passage' as const };

export const LOC_CHARSOO_C21: InMallLocation = {
  mall: CHARSOO,
  floorLabel: 'طبقه اول',
  floorNum: 1,
  unit: 'C21',
  plaque: null,
  wing: null,
  landmark: 'بعد پل حافظ',
  guide: ['پاساژ چارسو', 'طبقه اول', 'واحد C21'],
  confidence: 'high',
  hints: ['واحدهای C معمولاً در ضلع شرقی طبقه هستند (تخمینی)'],
};

export const LOC_OPAL: InMallLocation = {
  mall: { id: 2, slug: 'opal', name: 'مجتمع تجاری اپال', kind: 'complex' },
  floorLabel: 'طبقه ۷',
  floorNum: 7,
  unit: '۷۵۰',
  plaque: null,
  wing: null,
  landmark: null,
  guide: ['مجتمع تجاری اپال', 'طبقه ۷', 'واحد ۷۵۰'],
  confidence: 'high',
};

export const LOC_LOW: InMallLocation = {
  mall: null,
  floorLabel: 'طبقه دوم',
  floorNum: 2,
  unit: null,
  plaque: '۴۰۷',
  wing: null,
  landmark: 'بین سیف و غزالی',
  guide: ['بازار موبایل ایران', 'طبقه دوم', 'پلاک ۴۰۷'],
  confidence: 'low',
};

const openUntil = (closesAt: string, minutesToClose = 180): OpenStatus => ({
  state: minutesToClose <= 45 ? 'closing_soon' : 'open',
  label: minutesToClose <= 45 ? `به‌زودی بسته می‌شود (${formatClock(closesAt)})` : `باز است تا ${formatClock(closesAt)}`,
  closesAt,
  minutesToClose,
  at: nowIso,
});

export const OPEN_STATUSES: OpenStatus[] = [
  openUntil('21:00'),
  openUntil('20:00', 30),
  { state: 'closed', label: 'بسته — فردا ۱۰:۰۰ باز می‌شود', opensAt: '10:00', opensDay: 'thu', at: nowIso },
  { state: 'opens_later_today', label: 'امروز ۱۱:۰۰ باز می‌شود', opensAt: '11:00', at: nowIso },
  { state: 'unknown', label: 'ساعت کاری ثبت نشده', at: nowIso },
];

const NO_PAYMENT: PaymentInfo = { options: [], installment: false, torobPayInPerson: false, textHints: [], kalabarg: null, fastDelivery: null };

/** shop_e5acf87ccc5d3d1d1ca8e559 — payment_options: اسنپ‌پی, ترب‌پی (channel unknown). */
export const PAYMENT_OPAL: PaymentInfo = {
  options: [
    { provider: 'snapppay', label: 'اسنپ‌پی', channel: 'unknown', minPrice: null, maxPrice: null },
    { provider: 'torobpay', label: 'ترب‌پی', channel: 'unknown', minPrice: null, maxPrice: null },
  ],
  installment: true,
  torobPayInPerson: false,
  textHints: [],
  kalabarg: null,
  fastDelivery: null,
};

export const PAYMENT_IN_PERSON: PaymentInfo = {
  options: [{ provider: 'torobpay', label: 'ترب‌پی', channel: 'in_person', minPrice: null, maxPrice: null }],
  installment: true,
  torobPayInPerson: true,
  textHints: ['cheque'],
  kalabarg: null,
  fastDelivery: true,
};

export const WARRANTY_18: WarrantyInfo = { kind: 'company', months: 18, provider: 'شرکتی', label: '۱۸ ماه گارانتی شرکتی' };
export const WARRANTY_AUTH: WarrantyInfo = { kind: 'authenticity', months: null, provider: null, label: 'ضمانت اصالت کالا' };

const shop = (s: Partial<ShopLite> & Pick<ShopLite, 'id' | 'name' | 'address' | 'area' | 'lat' | 'lng' | 'location'>): ShopLite => ({
  nameIsReal: false,
  distanceKm: null,
  etaMin: null,
  openStatus: OPEN_STATUSES[0]!,
  payment: NO_PAYMENT,
  hasOffers: true,
  ...s,
});

export const SHOP_RAVAN = shop({
  id: 'shop_ec32a89464e8016804212b92',
  name: 'رووان مهرآرا',
  address: 'خیابان جمهوری، بعد پل حافظ، پاساژ چارسو، طبقه اول، پلاکc21',
  area: 'شیخ هادی',
  lat: 35.695037916149275,
  lng: 51.41128420829773,
  distanceKm: 0.4,
  etaMin: 6,
  location: LOC_CHARSOO_C21,
});

export const SHOP_NIINA = shop({
  id: 'shop_d31ef83bf64457123dccc6f2',
  name: 'نیینا نیان',
  address: 'جمهوری اسلامی، جنب پل حافظ، پاساژ چارسو، طبقه اول، واحد C30',
  area: 'فردوسی',
  lat: 35.694706811840298,
  lng: 51.412244439125068,
  distanceKm: 0.5,
  etaMin: 7,
  openStatus: OPEN_STATUSES[1]!,
  location: { ...LOC_CHARSOO_C21, unit: 'C30', guide: ['پاساژ چارسو', 'طبقه اول', 'واحد C30'], hints: undefined },
});

export const SHOP_NOVIAR = shop({
  id: 'shop_20d56d048f03a19fec6bf58c',
  name: 'نویار آذروش',
  address: 'خیابان حافظ، بین سیف و غزالی، بازار موبایل ایران، طبقه دوم، پلاک ۴۰۷',
  area: 'شیخ هادی',
  lat: 35.690772664656457,
  lng: 51.410999894142158,
  distanceKm: 0.9,
  etaMin: 12,
  openStatus: OPEN_STATUSES[2]!,
  location: LOC_LOW,
  payment: { ...NO_PAYMENT, fastDelivery: true },
});

export const SHOP_PAKNOOSH = shop({
  id: 'shop_e5acf87ccc5d3d1d1ca8e559',
  name: 'پاکنوش نییلا',
  address: 'سعادت آباد، بلوار شهید منفرد نیاکی، مجتمع تجاری اپال، طبقه ۷، واحد ۷۵۰',
  area: 'آسمان',
  lat: 35.777080058908751,
  lng: 51.352640993486659,
  distanceKm: 11.3,
  etaMin: 38,
  openStatus: OPEN_STATUSES[4]!,
  location: LOC_OPAL,
  payment: PAYMENT_OPAL,
});

export const VERIFIED_SAMPLE: VerifiedInfo = {
  inquiryId: 'inq_demo_1',
  source: 'simulated_call',
  at: new Date(NOW.getTime() - 12 * 60_000).toISOString(),
  stock: 'in_stock',
  price: 135_500_000,
  priceDeltaPct: 1.1,
  holdUntil: '19:00',
};

export const OFFER_BEST: StoreOffer = {
  shop: SHOP_RAVAN,
  offerIds: ['offer_ravan_a57'],
  sellerTitles: ['گوشی سامسونگ A57 5G | حافظه 256 رم 8 گیگابایت'],
  price: registered(134_000_000, '2026-10-12T10:22:25.161Z'),
  priceMax: null,
  warranty: WARRANTY_18,
  description: 'ضمانت سلامت و اصالت کالا',
  verified: VERIFIED_SAMPLE,
  score: 92,
  reasons: [
    { code: 'cheapest', label: 'ارزان‌ترین قیمت ثبت‌شده', tone: 'good' },
    { code: 'near', label: 'نزدیک شما', tone: 'good' },
    { code: 'open', label: 'الان باز است', tone: 'info' },
  ],
  rank: 1,
};

export const OFFER_CLOSING: StoreOffer = {
  ...OFFER_BEST,
  shop: SHOP_NIINA,
  offerIds: ['offer_niina_a57'],
  price: registered(134_200_000, '2026-10-12T10:21:15.271Z'),
  description: 'دستگاه فوق سفارش اروپا میباشد.',
  verified: null,
  score: 84,
  reasons: [
    { code: 'same_mall', label: 'هم‌پاساژ با گزینه اول', tone: 'info' },
    { code: 'closing', label: 'کمتر از یک ساعت تا تعطیلی', tone: 'warn' },
  ],
  rank: 2,
};

export const OFFER_CLOSED: StoreOffer = {
  ...OFFER_BEST,
  shop: SHOP_NOVIAR,
  offerIds: ['offer_noviar_a57'],
  price: registered(136_300_000, '2026-10-11T10:53:54.398Z'),
  priceMax: 139_000_000,
  description: 'شرکتی بدون دریافت کد ملی',
  verified: null,
  score: 61,
  reasons: [{ code: 'closed', label: 'در زمان مراجعه بسته است', tone: 'bad' }],
  rank: 3,
};

/** Real old offer (2026-08-06) from a shop with registered BNPL options. */
export const OFFER_STALE: StoreOffer = {
  shop: SHOP_PAKNOOSH,
  offerIds: ['offer_paknoosh_r50i'],
  sellerTitles: ['هدفون بلوتوثی انکر Soundcore R50i مدل A3949'],
  price: registered(2_000_000, '2026-08-06T02:01:35.796Z'),
  priceMax: 2_360_000,
  warranty: null,
  description: null,
  verified: null,
  score: 48,
  reasons: [
    { code: 'installment', label: 'اسنپ‌پی و ترب‌پی ثبت شده', tone: 'good' },
    { code: 'stale', label: 'قیمت بیش از ۲ ماه پیش ثبت شده', tone: 'warn' },
  ],
  rank: 4,
};

export const OFFER_MISSING_PRICE: StoreOffer = {
  ...OFFER_CLOSED,
  price: registered(null, null, 'missing', null),
  priceMax: null,
  warranty: null,
  reasons: [],
  rank: 5,
};

export const OFFER_SUSPICIOUS: StoreOffer = {
  ...OFFER_CLOSED,
  price: registered(null, '2026-10-12T10:00:00.000Z', 'suspicious', 1000),
  priceMax: null,
  rank: 6,
};

export const OFFERS: StoreOffer[] = [OFFER_BEST, OFFER_CLOSING, OFFER_CLOSED, OFFER_STALE];
