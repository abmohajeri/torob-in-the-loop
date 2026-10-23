/**
 * Seller-text attributes, replica detection, variant grouping and spec brands
 * (docs/DESIGN-REVIEW.md DT3, DT6, DT8).
 *
 * Every regex is word-bounded on Persian/Latin letters: a hit inside another word never counts
 * (the old substring cheque rule matched «کوچک» ~94 % of the time).
 */
import type { OfferAttrs } from '@titl/shared';
import { cleanFa, normalizeForSearch, toLatinDigits } from '@titl/shared';

/** Word-bounded alternation over Persian/Latin letters (ZWNJ counts as part of a word). */
const W = (alts: string) => new RegExp(`(?:^|[^\\p{L}\\u200c])(?:${alts})(?=$|[^\\p{L}\\u200c])`, 'iu');

const RE = {
  used: W('کارکرده|دست\\s*دوم|استفاده\\s*شده|used'),
  stock: W('استوک|stock'),
  openBox: W('اپن\\s*باکس|open\\s*box|جعبه\\s*باز'),
  akband: W('آکبند|اکبند|آک\\s*بند|آکبن'),
  new: W('کاملا\\s*نو|نو\\s*و\\s*آکبند|brand\\s*new'),
  replica: W('فیک|کپی|های\\s*کپی|درجه\\s*یک|مستر\\s*کوالیتی|رپلیکا|طرح\\s*اصل|fake|replica|master\\s*quality'),
  original: W('اورجینال|اوریجینال|اورجینا|original|اصل'),
  notActive: W('نات\\s*اکتیو|not\\s*active'),
  registered: W('رجیستر\\s*شده|رجیستری\\s*شده|ریجستر\\s*شده|رجیستر|registered'),
  notRegistered: W('بدون\\s*رجیستر(?:ی)?|رجیستر\\s*نشده'),
  charger: W('(?:همراه|با|به\\s*همراه)\\s*(?:شارژر|آداپتور)'),
};

/** Attributes mentioned in the seller title/description. null when nothing was mentioned. */
export function offerAttrs(...texts: (string | null | undefined)[]): OfferAttrs | null {
  const t = texts.filter(Boolean).map((x) => cleanFa(x as string)).join(' \n ');
  if (!t) return null;
  const a: OfferAttrs = { source: 'seller_text' };
  if (RE.used.test(t)) a.condition = 'used';
  else if (RE.stock.test(t)) a.condition = 'stock';
  else if (RE.openBox.test(t)) a.condition = 'open_box';
  else if (RE.akband.test(t)) a.condition = 'akband';
  else if (RE.new.test(t)) a.condition = 'new';
  if (RE.replica.test(t)) a.authenticity = 'replica';
  else if (RE.original.test(t)) a.authenticity = 'claims_original';
  if (RE.notActive.test(t)) a.registry = 'not_active';
  else if (!RE.notRegistered.test(t) && RE.registered.test(t)) a.registry = 'registered';
  if (RE.charger.test(t)) a.bundle = 'with_charger';
  return Object.keys(a).length > 1 ? a : null;
}

const REPLICA_BRANDS =
  'اصل|نوکیا|سامسونگ|اپل|آیفون|ایفون|شیائومی|هواوی|ایرپاد|ایرپادز|رولکس|کاسیو|نایک|نایکی|آدیداس|ادیداس|گوچی|شنل|دیور|' +
  'apple|samsung|nokia|xiaomi|huawei|iphone|airpods|rolex|nike|adidas|gucci|dior|chanel';
const REPLICA_TITLE = [W(`طرح\\s+(?:${REPLICA_BRANDS})`), W('های\\s*کپی|فیک|مستر\\s*کوالیتی|رپلیکا|fake|replica')];

/** Product-level replica flag from the CATALOG title («گوشی طرح نوکیا …», «… های کپی», «مستر کوالیتی»). */
export function isReplicaTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const t = cleanFa(title);
  return REPLICA_TITLE.some((re) => re.test(t));
}

// ───────────────────────── variant grouping (DT8) ─────────────────────────

const STORAGE = /\d+(?:[.,]\d+)?\s*(?:gb|tb|mb|گیگابایت|گیگ|ترابایت|مگابایت|گیگا\s*بایت)(?=\s|$)/gi;
const MEM_WORDS = /(?:^|\s)(?:حافظه|رم|ram|rom|ظرفیت)\s*\d+(?:\s*\/\s*\d+)?/gi;
const COLORS =
  'مشکی|سفید|آبی|ابی|قرمز|سبز|زرد|نارنجی|بنفش|صورتی|طوسی|خاکستری|نقره ای|نقره‌ای|نقره|طلایی|رزگلد|سرمه ای|کرم|بژ|قهوه ای|' +
  'black|white|blue|red|green|gold|silver|gray|grey|pink|purple|titanium|graphite|midnight|starlight';
const COLOR_RE = new RegExp(`(?:^|\\s)(?:رنگ\\s+)?(?:${COLORS})(?=\\s|$)`, 'gi');
const STOP = new Set([
  'گوشی', 'موبایل', 'مدل', 'رنگ', 'با', 'و', 'ظرفیت', 'دو', 'سیم', 'کارت', 'تک', 'نسخه', 'پک', 'اصلی', 'اورجینال',
  'تایپ', 'سی', 'type', 'c', 'usb', 'dual', 'sim', 'ds', 'گیگابایت', 'حافظه', 'رم', 'به', 'همراه',
]);

/** Persian spellings of model words → Latin, so «گلکسی S25 اولترا» and «Galaxy S25 Ultra» share a key. */
const TRANSLIT: Record<string, string> = {
  اولترا: 'ultra', الترا: 'ultra', پرو: 'pro', پلاس: 'plus', مکس: 'max', مینی: 'mini', لایت: 'lite', نوت: 'note',
  ایر: 'air', فولد: 'fold', فلیپ: 'flip', گلکسی: '', galaxy: '', ردمی: 'redmi', پوکو: 'poco', آیفون: 'iphone', ایفون: 'iphone',
  ایرپاد: 'airpods', ایرپادز: 'airpods', airpod: 'airpods',
};

/**
 * Normalised brand + model key shared by variants of one model (storage / RAM / colour / build region):
 * «گوشی سامسونگ (چین) A07 4G | حافظه 64 رم 4 گیگابایت» → «<cat>|سامسونگ|a07 4g».
 * Null when the brand is unknown or nothing model-like is left.
 */
export function modelKey(
  brandNorm: string | null,
  brandAliases: readonly string[],
  categoryId: number,
  model: string | null,
  title: string,
): string | null {
  if (!brandNorm) return null;
  let s = model && model.trim().length >= 2 ? model : title;
  s = s.split('|')[0]!;
  s = s.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ');
  s = toLatinDigits(cleanFa(s)).toLowerCase();
  s = s.replace(STORAGE, ' ').replace(MEM_WORDS, ' ').replace(COLOR_RE, ' ').replace(/(?:^|\s)(?:[2345]g|lte|nfc)(?=\s|$)/g, ' ');
  let n = normalizeForSearch(s);
  for (const a of [brandNorm, ...brandAliases].sort((x, y) => y.length - x.length)) {
    if (a && a.length >= 2) n = ` ${n} `.split(` ${a} `).join(' ').trim();
  }
  const toks = n
    .split(/\s+/)
    .map((x) => TRANSLIT[x] ?? x)
    .filter((x) => x && !STOP.has(x));
  if (!toks.length) return null;
  const modelish = toks.some((x) => /\d/.test(x) || /^[a-z]{2,}$/.test(x));
  if (!modelish && toks.length < 2) return null;
  return `${categoryId}|${brandNorm}|${toks.join(' ')}`;
}

// ───────────────────────── spec brand (DT3) ─────────────────────────

const SPEC_BRAND_KEYS = new Set(['برند', 'شرکت سازنده', 'برند سازنده', 'سازنده', 'نام تجاری']);
const JUNK_BRAND = /^(سایر|متفرقه|نامشخص|نا مشخص|ندارد|متفرقه ها|other|others|no ?brand|non ?brand|unknown|-|برند|متفرقه\s*\/\s*سایر|ایرانی|چینی|خارجی|اصلی|اورجینال|original|oem|generic)$/i;

/** Brand value declared in the specs (برند / شرکت سازنده), junk stripped; null when absent. */
export function specBrand(specs: readonly (readonly string[])[]): string | null {
  for (const s of specs) {
    const k = (s[0] ?? '').replace(/‌/g, ' ').trim();
    if (!SPEC_BRAND_KEYS.has(k)) continue;
    const v = cleanFa(s[1] ?? '').replace(/\s+/g, ' ').trim();
    if (!v || v.length > 30 || JUNK_BRAND.test(v) || /^[\d\s.,\-]+$/.test(v)) continue;
    return v;
  }
  return null;
}
