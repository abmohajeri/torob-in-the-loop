/**
 * Deterministic Persian assistant (rules mode). Runs when no LLM is configured or the LLM fails for a turn.
 * Intent detection on normalized text (first match wins) + session memory → the same tools as the LLM →
 * templated Persian replies + tailored quick replies. See docs/AGENT-DESIGN.md §B.
 */
import {
  ALT_REASON_META,
  EXAMPLE_QUERIES,
  INQUIRY_QUESTION_META,
  INQUIRY_STATUS_META,
  formatClock,
  formatDistance,
  formatMinutes,
  formatNumber,
  formatTimeOfDay,
  formatTomanShort,
  normalizeForSearch,
  type AltReason,
  type Inquiry,
  type InquiryQuestion,
  type ParsedQuery,
  type ProductSummary,
  type StoreOffer,
  type StoresResponse,
  type UIBlock,
  type UserContext,
} from '@titl/shared';
import { insightSentence, weekendInsight } from './insights.js';
import { TOOL_STATUS, runTool, type ToolEnv, type ToolOutput } from './tools.js';

export type Intent =
  | 'greet'
  | 'thanks'
  | 'alternatives'
  | 'contact'
  | 'contact_confirm'
  | 'status'
  | 'plan'
  | 'compare_stores'
  | 'compare_products'
  | 'stores'
  | 'need_stores'
  | 'hours'
  | 'mall'
  | 'preferences'
  | 'choose'
  | 'search';

export interface DetectedIntent {
  intent: Intent;
  altReason?: AltReason;
  /** 1-based ordinal reference («گزینهٔ ۲», «دومی»). */
  ordinal?: number;
  /** «۳ فروشگاه اول». */
  count?: number;
  mall?: string;
  questions?: InquiryQuestion[];
  /** «بدون فیلتر» — drop boolean filters. */
  relax?: boolean;
}

export interface RulesSink {
  status(text: string): void;
  block(block: UIBlock): void;
  patch(patch: Partial<UserContext>): void;
}

export interface RulesResult {
  text: string;
  intent: Intent;
  digests: string[];
  quickReplies: { label: string; message: string }[];
}

// ───────────────────────── text helpers ─────────────────────────

const N = (s: string) => ` ${normalizeForSearch(s)} `;
const T = (list: string[]) => list.map((t) => normalizeForSearch(t)).filter(Boolean);
const hasAny = (n: string, list: string[]) => list.some((t) => n.includes(t));
/** Whole-word(s) match. */
const hasWord = (n: string, list: string[]) => list.some((t) => n.includes(` ${t} `));

const fa = (n: number) => formatNumber(n);
const short = (s: string, n = 38) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function ageFa(days: number | null | undefined): string {
  if (days == null) return 'تاریخ نامشخص';
  if (days < 2) return 'کمتر از ۲ روز پیش';
  if (days < 14) return `${fa(Math.round(days))} روز پیش`;
  if (days < 60) return `${fa(Math.round(days / 7))} هفته پیش`;
  if (days < 365) return `${fa(Math.round(days / 30))} ماه پیش`;
  return 'بیش از یک سال پیش';
}

function priceFa(s: StoreOffer): string {
  if (s.verified?.price) return `${formatTomanShort(s.verified.price)} (تأییدشده در استعلام)`;
  if (s.price.price == null) return 'قیمت ثبت نشده';
  return `${formatTomanShort(s.price.price)} (قیمت ثبت‌شده، ${ageFa(s.price.ageDays)})`;
}

// ───────────────────────── triggers ─────────────────────────

const TR = {
  greet: T(['سلام', 'درود', 'چطوری', 'خوبی', 'کمک', 'چی کار می کنی', 'چیکار میکنی', 'چه کار می کنی', 'راهنما', 'شروع']),
  thanks: T(['مرسی', 'ممنون', 'متشکرم', 'دستت درد نکنه', 'سپاس', 'عالی بود']),
  altClosed: T(['بسته بود', 'بسته است', 'بسته بودن', 'تعطیل', 'باز نبود']),
  altNoAnswer: T(['جواب نداد', 'جواب ندادن', 'پاسخ نداد', 'تلفن رو برنداشت']),
  altOut: T(['نداشت', 'نداشتن', 'تموم شده', 'تمام شده', 'تموم کرده', 'موجود نبود', 'ناموجود']),
  altNotFound: T(['پیدا نکردم', 'پیداش نکردم', 'پیدایش نکردم', 'گم کردم', 'نتونستم پیدا']),
  altExpensive: T(['گرون بود', 'گران بود', 'گرون تر بود', 'گران تر بود', 'گرون گفت', 'گرون حساب']),
  contactDo: T(['بپرس', 'استعلام', 'زنگ بزن', 'تماس بگیر', 'تماس بگیرید', 'زنگ بزنید', 'بپرسید', 'سوال کن']),
  contactAsk: T(['هنوز دارن', 'هنوز دارند', 'موجود دارن', 'موجود دارند', 'موجوده', 'موجود هست']),
  status: T(['چی شد', 'چه شد', 'جواب دادن', 'جواب دادند', 'نتیجه', 'پیگیری', 'خبری شد']),
  plan: T(['برنامه', 'مسیر', 'کجا اول برم', 'از کجا شروع', 'بریم', 'نقشه راه', 'ترتیب']),
  compareStores: T(['مقایسه فروشگاه', 'مقایسه مغازه', 'کدوم مغازه', 'کدام مغازه', 'کدوم فروشگاه', 'کدام فروشگاه', 'مقایسه فروشنده']),
  compareProducts: T(['مقایسه', 'فرقشون', 'فرق شون', 'تفاوت', 'کدوم بهتره', 'کدام بهتر', 'کدوم بهتر']),
  relax: T(['بدون فیلتر', 'همه فروشگاه ها را نشان بده', 'شرط ها را بردار', 'فیلتر ها را بردار', 'بدون شرط', 'بسته ها هم']),
  need: T(['چند مدل', 'یک جا', 'یکجا', 'همه مدل', 'پرو کنم', 'کجا برم ببینم']),
  stores: T(['کجا بخرم', 'کجا برم', 'کجا ببینم', 'کجا داره', 'کجا دارن', 'کجا پیدا', 'فروشنده', 'مغازه', 'نزدیک ترین', 'فروشگاه', 'از کجا بخرم', 'کجا هست', 'کجا میشه']),
  hours: T(['ساعت کاری', 'تا کی بازه', 'تا کی باز', 'الان بازه', 'باز هست', 'کی باز', 'کی میبنده', 'کی می بنده']),
  mallQ: T(['طبقه چند', 'کجای پاساژ', 'چه طبقه', 'کدوم طبقه', 'واحد چند']),
  choose: T(['نمی دونم', 'نمیدونم', 'نمی دانم', 'کدوم مدل', 'چه مدلی', 'پیشنهاد بده', 'پیشنهاد میدی', 'چی بخرم', 'چی پیشنهاد', 'مدلش', 'کمکم کن انتخاب']),
};

const ORD: Record<string, number> = { اولی: 1, اول: 1, دومی: 2, دوم: 2, سومی: 3, سوم: 3, چهارمی: 4, چهارم: 4 };
const COUNT_WORDS: Record<string, number> = { دو: 2, سه: 3, چهار: 4, پنج: 5, همه: 5, هر: 0 };

function ordinalOf(n: string): number | undefined {
  const m = n.match(/ (?:گزینه|مورد|محصول|کالا|مدل) (\d) /);
  if (m) return Number(m[1]);
  for (const [w, v] of Object.entries(ORD)) if (n.includes(` ${w} `) && !/ (\d|دو|سه|چهار|پنج) (تا )?(فروشگاه|مغازه|فروشنده)/.test(n)) return v;
  return undefined;
}

function countOf(n: string): number | undefined {
  const m = n.match(/ (\d|دو|سه|چهار|پنج) (?:تا )?(?:فروشگاه|مغازه|فروشنده)/);
  if (!m) return undefined;
  const v = /\d/.test(m[1]!) ? Number(m[1]) : COUNT_WORDS[m[1]!];
  return v ? Math.min(5, Math.max(1, v)) : undefined;
}

function questionsOf(n: string): InquiryQuestion[] | undefined {
  const q: InquiryQuestion[] = [];
  if (hasAny(n, T(['موجود']))) q.push('stock');
  if (hasAny(n, T(['قیمت']))) q.push('price');
  if (hasAny(n, T(['ساعت', 'تا کی']))) q.push('hours');
  if (hasAny(n, T(['نگه']))) q.push('hold');
  if (hasAny(n, T(['قسط', 'ترب پی']))) q.push('installment');
  if (hasAny(n, T(['کالابرگ']))) q.push('kalabarg');
  if (hasAny(n, T(['نشانی', 'آدرس', 'طبقه']))) q.push('location');
  if (hasAny(n, T(['گارانتی']))) q.push('warranty');
  return q.length ? q : undefined;
}

/** Product-ish content in a parsed query (category/brand/meaningful keywords). */
function hasProductTerms(p: ParsedQuery): boolean {
  if (p.category || p.brand) return true;
  const generic = new Set(T(['فقط', 'بازها', 'باز', 'من', 'هستم', 'لطفا', 'همه', 'را', 'رو', 'نشان', 'بده', 'میخوام', 'می خوام', 'ارزان', 'ارزون', 'تر', 'ها', 'قسطی', 'نزدیک']));
  return p.keywords.some((k) => k.length > 1 && !generic.has(k) && !/^\d+$/.test(k));
}

/** «من ونکم», «نزدیک تجریش هستم», «محدوده‌ام ونکه» → place candidate text. */
function locationCandidate(raw: string): string | null {
  const n = normalizeForSearch(raw);
  const m =
    n.match(/^(?:من )?(?:الان )?(?:تو |توی |در |نزدیک |حوالی |سمت )?(.{2,30}?)(?:م| هستم| هستیم| ام| ایم| ه)$/) ??
    n.match(/^(?:محدوده|محله|موقعیت)(?: ?م| من)? (.{2,30}?)(?:ه| است)?$/);
  if (!m) return null;
  const c = m[1]!.replace(/^(تو|توی|در|نزدیک) /, '').trim();
  return c.length >= 2 ? c : null;
}

export function detectIntent(message: string, hasMemory: { focusProduct: boolean; shops: boolean; inquiries: boolean }): DetectedIntent {
  const n = N(message);
  const words = n.trim().split(' ').filter(Boolean);
  const ordinal = ordinalOf(n);
  const count = countOf(n);
  const withRefs = (d: DetectedIntent): DetectedIntent => {
    if (ordinal) d.ordinal = ordinal;
    if (count) d.count = count;
    return d;
  };

  if (words.length <= 4 && hasAny(n, TR.thanks)) return { intent: 'thanks' };
  if (words.length <= 5 && (hasWord(n, TR.greet) || n.trim() === '')) return { intent: 'greet' };

  if (hasAny(n, TR.relax)) return { intent: 'preferences', relax: true };
  if (hasAny(n, TR.altClosed)) return withRefs({ intent: 'alternatives', altReason: 'closed' });
  if (hasAny(n, TR.altNoAnswer)) return withRefs({ intent: 'alternatives', altReason: 'no_answer' });
  if (hasAny(n, TR.altNotFound)) return withRefs({ intent: 'alternatives', altReason: 'not_found' });
  if (hasAny(n, TR.altExpensive)) return withRefs({ intent: 'alternatives', altReason: 'too_expensive' });
  if (hasAny(n, TR.altOut) && !hasAny(n, T(['ندارم']))) return withRefs({ intent: 'alternatives', altReason: 'out_of_stock' });

  if (hasAny(n, TR.contactDo)) {
    const d = withRefs({ intent: 'contact' });
    const q = questionsOf(n);
    if (q) d.questions = q;
    return d;
  }
  if (hasAny(n, TR.contactAsk) && (hasMemory.shops || hasMemory.focusProduct)) return withRefs({ intent: 'contact_confirm' });
  if (hasAny(n, TR.status) && hasMemory.inquiries) return { intent: 'status' };
  if (hasAny(n, TR.plan)) return withRefs({ intent: 'plan' });
  if (hasAny(n, TR.compareStores)) return withRefs({ intent: 'compare_stores' });
  if (hasAny(n, TR.compareProducts)) return withRefs({ intent: 'compare_products' });
  if (hasAny(n, TR.hours)) return withRefs({ intent: 'hours' });
  if (hasAny(n, TR.mallQ)) return withRefs({ intent: 'mall' });
  const mallM = n.match(/ (پاساژ|مجتمع|بازار|سرای|مرکز خرید) (.{2,30})$/);
  if (mallM && words.length <= 5 && !hasAny(n, TR.stores)) return { intent: 'mall', mall: `${mallM[1]} ${mallM[2]!.trim()}` };
  if (hasAny(n, TR.need) && hasAny(n, T(['کجا', 'فروشگاه', 'مغازه']))) return { intent: 'need_stores' };
  if (hasAny(n, TR.stores)) return withRefs({ intent: 'stores' });
  if (hasAny(n, TR.choose)) return { intent: 'choose' };
  return withRefs({ intent: 'search' });
}

// ───────────────────────── runner ─────────────────────────

export async function runRules(env: ToolEnv, message: string, sink: RulesSink): Promise<RulesResult> {
  const s = env.deps.services;
  const mem = env.mem;
  const digests: string[] = [];
  const replies: { label: string; message: string }[] = [];
  const reply = (label: string, msg = label) => {
    if (replies.length < 4 && !replies.some((r) => r.label === label)) replies.push({ label, message: msg });
  };

  async function call(name: string, args: Record<string, unknown>, opts: { emit?: boolean } = {}): Promise<ToolOutput> {
    const st = TOOL_STATUS[name];
    if (st) sink.status(st);
    const out = await runTool(env, name, args);
    if (out.patch && Object.keys(out.patch).length) sink.patch(out.patch);
    if (opts.emit !== false) for (const b of out.blocks) sink.block(b);
    if (out.digest) digests.push(out.digest);
    return out;
  }

  const det = detectIntent(message, { focusProduct: !!mem.focusProductId, shops: mem.lastShopIds.length > 0, inquiries: mem.lastInquiryIds.length > 0 });
  let intent = det.intent;
  const parsed = s.parseQuery(message, env.ctx);
  let text = '';

  // ── preferences-only («فقط قسطی», «بودجه‌م ۱۰ میلیونه», «من ونکم», «ارزان‌ترین‌ها») ──
  let placeLabel: string | null = null;
  if (intent === 'search' && !parsed.category && !parsed.brand && N(message).trim().split(' ').length <= 5) {
    const cand = locationCandidate(message);
    const place = cand ? s.places(cand, 1)[0] : undefined;
    if (cand && place && normalizeForSearch(place.name).includes(normalizeForSearch(cand))) {
      placeLabel = cand;
      intent = 'preferences';
    }
  }
  if (intent === 'search' && !hasProductTerms(parsed)) {
    const loc = locationCandidate(message);
    const hasPref = parsed.budgetMax || parsed.budgetMin || parsed.installment || parsed.openNow || parsed.areaLabel || parsed.sort || parsed.nearMe || loc || / فقط بازها | باز ها /.test(N(message));
    if (hasPref) intent = 'preferences';
  }

  const productAt = (ord?: number): string | null => {
    if (ord && mem.lastProductIds[ord - 1]) return mem.lastProductIds[ord - 1]!;
    return mem.focusProductId ?? mem.lastProductIds[0] ?? null;
  };

  /** Search, emitting products (+ discovery when a broad category). Returns facts. */
  async function doSearch(q: string, extra: Record<string, unknown> = {}) {
    const out = await call('search_products', { query: q, ...extra });
    const total = (out.facts?.total as number) ?? 0;
    const items = (out.facts?.items as ProductSummary[]) ?? [];
    const p = (out.facts?.parsed as ParsedQuery) ?? parsed;
    return { out, total, items, p };
  }

  async function storesFor(productId: string, sort?: string, sameAsAbove = false): Promise<StoresResponse | null> {
    const out = await call('find_stores', sort ? { product_id: productId, sort } : { product_id: productId });
    if (out.error) return null;
    const r = out.facts?.stores as StoresResponse;
    const ins = (out.facts?.insights as Parameters<typeof insightSentence>[0]) ?? [];
    const title = short(r.product.title, 45);
    const forTitle = sameAsAbove ? 'همین مدل' : `«${title}»`;
    if (!r.stores.length) {
      text = `برای «${title}» فروشندهٔ حضوری‌ای با شرایط فعلی شما پیدا نکردم${r.excludedByFilters ? ` (${fa(r.excludedByFilters)} فروشگاه با فیلترهای شما کنار رفت)` : ''}.`;
      if (r.categoryOnly.length) text += ` ${fa(r.categoryOnly.length)} فروشگاه در همین دسته فعالیت می‌کنند؛ می‌توانم از آن‌ها بپرسم.`;
      reply('شرایط را کمتر کن', 'همه فروشگاه‌ها را نشان بده');
      reply('کالاهای مشابه', `مشابه ${title}`);
      return r;
    }
    const top = r.stores[0]!;
    const near = r.stores.filter((x) => x.shop.distanceKm != null && x.shop.distanceKm <= 3).length;
    text = `${fa(r.stores.length)} فروشندهٔ حضوری برای ${forTitle} پیدا کردم${env.ctx.location && near ? `؛ ${fa(near)} تا در ۳ کیلومتری ${env.ctx.location.label}` : ''}.`;
    if (r.excludedByFilters) text += ` (${fa(r.excludedByFilters)} فروشگاه با فیلترهای شما کنار رفت.)`;
    const relaxLater = r.excludedByFilters > r.stores.length && (env.ctx.installment || env.ctx.openNow);
    const where = [top.shop.distanceKm != null ? formatDistance(top.shop.distanceKm) : top.shop.location.mall?.name ?? top.shop.area, top.shop.openStatus.label].filter(Boolean).join('، ');
    text += `\nپیشنهاد اول: ${top.shop.name} — ${priceFa(top)}${where ? `؛ ${where}` : ''}.`;
    const tip = insightSentence(ins);
    if (tip) text += `\n${tip}`;
    const stale = r.stores.slice(0, 3).some((x) => !x.verified && (x.price.ageDays ?? 99) > 14);
    const n3 = Math.min(3, r.stores.length);
    reply(stale ? `قیمت امروز را از ${fa(n3)} فروشگاه اول بپرس` : `از ${fa(n3)} فروشگاه اول بپرس`, `از ${fa(n3)} فروشگاه اول بپرس`);
    if (r.stores.length >= 2) reply('مقایسهٔ فروشگاه‌ها', 'مقایسه فروشگاه‌ها');
    reply('برنامهٔ بازدید بچین', 'برنامه بازدید');
    if (relaxLater) reply(`همهٔ ${fa(r.stores.length + r.excludedByFilters)} فروشنده (بدون شرط)`, 'بدون فیلتر');
    else if (!env.ctx.openNow) reply('فقط بازها', 'فقط بازها');
    return r;
  }

  let finalIntent: Intent | null = null;
  async function needReply(q: string, lead: string | null): Promise<void> {
    finalIntent = 'need_stores';
    const out = await call('find_stores_for_need', { query: q });
    const need = out.facts?.need as import('@titl/shared').NeedStoresResponse | undefined;
    if (!need || !need.stores.length) {
      text = env.ctx.openNow
        ? 'با شرط «فقط بازها» الان فروشگاهی باز نیست. شرط را برمی‌دارم تا ببینید کدام‌ها زودتر باز می‌شوند؟'
        : 'با شرایط فعلی فروشگاهی پیدا نکردم؛ بودجه یا محدوده را کمی بازتر کنید.';
      if (env.ctx.openNow || env.ctx.installment) reply('شرط‌ها را بردار', 'بدون فیلتر');
      return;
    }
    const top = need.stores[0]!;
    const c = need.clusters[0];
    text = lead ? `${lead}\n` : '';
    text += `از ${fa(need.totalMatchingProducts)} مدل مطابق، ${fa(need.stores.length)} فروشگاه حضوری چند مدل را یک‌جا دارند. بیشترین تنوع: ${top.shop.name} با ${fa(top.matchCount)} مدل${top.priceMin != null ? `، از ${formatTomanShort(top.priceMin)}` : ''}${top.shop.distanceKm != null ? `، ${formatDistance(top.shop.distanceKm)} از شما` : ''} (${top.shop.openStatus.label}).`;
    if (c) text += `\n${c.text}.`;
    const w = weekendInsight(env.ctx, env.now);
    if (w) text += `\n${w.text}`;
    const n3 = Math.min(3, need.stores.length);
    reply(`از ${fa(n3)} فروشگاه اول بپرس`, `از ${fa(n3)} فروشگاه اول بپرس چه مدل‌هایی دارند`);
    reply('برنامهٔ بازدید بچین', 'برنامه بازدید');
    if (!env.ctx.openNow) reply('فقط بازها', 'فقط بازها');
  }

  switch (intent) {
    case 'greet': {
      text =
        'سلام! من دستیار خرید حضوری Torob in the Loop هستم. کمک‌تان می‌کنم:\n۱) مدل مناسب را انتخاب کنید،\n۲) فروشگاه‌های نزدیکی را که آن را دارند پیدا کنید،\n۳) قیمت، فاصله و ساعت کاری‌شان را مقایسه کنید،\n۴) پیش از رفتن از فروشگاه‌ها بپرسم (تماس نمایشی) و مسیر بازدید را بچینم.\nدنبال چه هستید؟';
      for (const q of EXAMPLE_QUERIES.slice(0, 4)) reply(q);
      break;
    }

    case 'thanks': {
      text = 'خواهش می‌کنم! هر وقت خواستید، از فروشگاه‌ها می‌پرسم یا برنامهٔ بازدید را به‌روز می‌کنم.';
      if (mem.lastShopIds.length) reply('برنامهٔ بازدید', 'برنامه بازدید');
      if (mem.lastInquiryIds.length) reply('نتیجهٔ تماس‌ها؟', 'نتیجه تماس‌ها چی شد؟');
      reply('جستجوی تازه', 'سلام');
      break;
    }

    case 'alternatives': {
      const reason = det.altReason ?? 'closed';
      const shopId = mem.focusShopId ?? mem.lastPlanShopIds[0] ?? mem.lastShopIds[0] ?? null;
      const pid = mem.focusProductId;
      if (!shopId && !pid) {
        text = `${ALT_REASON_META[reason].label}؟ بگویید دنبال چه کالایی بودید تا فروشگاه‌های دیگری که دارند و الان باز هستند را پیدا کنم.`;
        for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
        break;
      }
      // Crowd report (best effort).
      const reportType = reason === 'closed' ? 'closed' : reason === 'not_found' ? 'not_found' : reason === 'out_of_stock' ? 'out_of_stock' : reason === 'too_expensive' ? 'price_mismatch' : null;
      let reported = false;
      if (shopId && reportType) {
        try {
          env.deps.contact.addReport({ shopId, sessionId: env.sessionId, type: reportType, note: null });
          reported = true;
        } catch {
          /* contact module may be unavailable */
        }
      }
      const args: Record<string, unknown> = { reason };
      if (pid) args.product_id = pid;
      if (shopId) args.shop_id = shopId;
      const out = await call('find_alternatives', args);
      const r = out.facts?.alternatives as import('@titl/shared').AlternativesResponse | undefined;
      if (!r) {
        text = 'متأسفانه الان نتوانستم جایگزین پیدا کنم؛ دوباره امتحان می‌کنید؟';
        break;
      }
      const best = r.sameProduct[0];
      const closedName = shopId ? s.getShopLite(shopId, {})?.name : null;
      text = best || r.samePassage.length ? r.headline.replace(/([^.!؟])$/, '$1.') : `${ALT_REASON_META[reason].label}؟ فعلاً فروشگاه باز دیگری که همین کالا را ثبت کرده باشد پیدا نکردم.`;
      const wk = weekendInsight(env.ctx, env.now);
      if (!best && wk) text += ` ${wk.text}`;
      if (best) {
        const bits = [best.shop.openStatus.label, best.shop.distanceKm != null ? formatDistance(best.shop.distanceKm) : null, priceFa(best)].filter(Boolean);
        text += `\nبهترین گزینه: ${best.shop.name} — ${bits.join('، ')}.`;
      } else if (r.samePassage.length) {
        text += `\nهمین کالا جای دیگری ثبت نشده، ولی ${fa(r.samePassage.length)} فروشگاه هم‌دسته${closedName ? ` نزدیک ${closedName}` : ''} هست که می‌توانم از آن‌ها بپرسم.`;
      } else if (r.similarProducts.length) {
        text += `\n${fa(r.similarProducts.length)} کالای مشابه با فروشندهٔ حضوری پیدا کردم.`;
      }
      if (reported) text += `\nگزارش «${ALT_REASON_META[reason].label}»${closedName ? ` برای ${closedName}` : ''} ثبت شد تا به خریداران دیگر هم نشان دهیم.`;
      if (best) {
        mem.focusShopId = best.shop.id;
        reply('اول از این فروشگاه بپرس', 'از ۱ فروشگاه اول بپرس');
        reply('برنامه را با این فروشگاه بچین', 'برنامه بازدید');
      }
      if (r.sameProduct.length >= 2) reply('مقایسهٔ جایگزین‌ها', 'مقایسه فروشگاه‌ها');
      if (r.similarProducts[0]) reply('کالاهای مشابه', `فروشنده‌های ${short(r.similarProducts[0].title, 30)}`);
      break;
    }

    case 'contact':
    case 'contact_confirm': {
      let shops = mem.lastShopIds;
      let pid = productAt(det.ordinal);
      if (!shops.length && pid) {
        const r = s.getStores(pid, env.ctx, { limit: 10 });
        shops = r?.stores.map((x) => x.shop.id) ?? [];
        mem.lastShopIds = shops;
      }
      if (!shops.length) {
        text = 'برای استعلام اول باید بدانم دنبال چه کالایی هستید؛ نام کالا یا مدل را بنویسید تا فروشنده‌هایش را پیدا کنم.';
        for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
        break;
      }
      const n = det.count ?? Math.min(3, shops.length);
      const chosen = det.count === 1 && mem.focusShopId ? [mem.focusShopId] : shops.slice(0, n);
      const names = chosen.map((id) => s.getShopLite(id, {})?.name).filter(Boolean) as string[];
      const questions: InquiryQuestion[] = det.questions ?? ['stock', 'price', 'hours'];
      if (env.ctx.installment && !questions.includes('installment')) questions.push('installment');
      const qLabels = questions.map((q) => INQUIRY_QUESTION_META[q].label).join('، ');
      if (intent === 'contact_confirm') {
        text = `موجودی هنوز تأیید نشده است. از ${fa(chosen.length)} فروشگاه (${names.join('، ')}) دربارهٔ ${qLabels} بپرسم؟ تماس‌ها نمایشی (شبیه‌سازی‌شده) است.`;
        reply(`بله، از هر ${fa(chosen.length)} بپرس`, `از ${fa(chosen.length)} فروشگاه اول بپرس`);
        reply('فقط موجودی را بپرس', `فقط موجودی را از ${fa(chosen.length)} فروشگاه اول بپرس`);
        reply('نه، برنامهٔ بازدید بچین', 'برنامه بازدید');
        break;
      }
      const args: Record<string, unknown> = { shop_ids: chosen, questions };
      if (pid) args.product_id = pid;
      const out = await call('contact_stores', args);
      if (out.error) {
        text = 'سامانهٔ استعلام همین الان در دسترس نیست. می‌توانید از صفحهٔ هر فروشگاه دوباره امتحان کنید؛ تا آن موقع برنامهٔ بازدید را بچینم؟';
        sink.block({ kind: 'notice', tone: 'warn', text: 'استعلام انجام نشد؛ کمی بعد دوباره امتحان کنید.' });
        reply('برنامهٔ بازدید', 'برنامه بازدید');
        reply('دوباره بپرس', `از ${fa(chosen.length)} فروشگاه اول بپرس`);
        break;
      }
      const items = (out.facts?.inquiries as Inquiry[]) ?? [];
      text = `از ${fa(items.length)} فروشگاه (${names.join('، ')}) دربارهٔ ${qLabels} می‌پرسم.\nتماس‌ها نمایشی (شبیه‌سازی‌شده) است، چون شماره‌های این داده واقعی نیستند. نتیجه معمولاً کمتر از یک دقیقه می‌رسد و در «پیگیری‌ها» هم می‌آید؛ لازم نیست صبر کنید.`;
      reply('نتیجهٔ تماس‌ها؟', 'نتیجه تماس‌ها چی شد؟');
      reply('برنامهٔ بازدید بچین', 'برنامه بازدید');
      break;
    }

    case 'status': {
      const out = await call('inquiry_status', {});
      const items = (out.facts?.inquiries as Inquiry[]) ?? [];
      if (!items.length) {
        text = 'هنوز از فروشگاهی استعلام نگرفته‌ایم. بگویید کدام کالا تا فروشنده‌هایش را پیدا کنم و از آن‌ها بپرسم.';
        break;
      }
      const done = items.filter((i) => i.result);
      const lines = items.map((i) => `• ${i.shop.name}: ${i.result?.summary ?? INQUIRY_STATUS_META[i.status].label}`);
      text = `${done.length === items.length ? `نتیجهٔ پیگیری ${fa(items.length)} فروشگاه` : done.length ? `${fa(done.length)} از ${fa(items.length)} فروشگاه پاسخ داده‌اند` : 'هنوز پاسخی نرسیده؛ وضعیت تماس‌ها'}:\n${lines.join('\n')}`;
      const good = done
        .filter((i) => i.result && (i.result.stock === 'in_stock' || i.result.stock === 'limited'))
        .sort((a, b) => (a.result!.price ?? Infinity) - (b.result!.price ?? Infinity));
      if (good[0]) {
        text += `\nپیشنهاد من: ${good[0].shop.name} — ارزان‌ترین گزینهٔ تأییدشده${good[0].shop.distanceKm != null ? `، ${formatDistance(good[0].shop.distanceKm)} از شما` : ''}.`;
        mem.focusShopId = good[0].shop.id;
        reply(`برنامهٔ رفتن به ${short(good[0].shop.name, 20)}`, 'برنامه بازدید با فروشگاه‌های تأییدشده');
      } else if (done.length && done.every((i) => i.result?.stock === 'out_of_stock')) {
        text += '\nهیچ‌کدام موجود نداشتند؛ جایگزین پیدا کنم؟';
        reply('جایگزین پیدا کن', 'موجود نداشت');
      }
      if (done.length < items.length) reply('دوباره بررسی کن', 'نتیجه تماس‌ها چی شد؟');
      reply('برنامهٔ بازدید', 'برنامه بازدید');
      break;
    }

    case 'plan': {
      let shops: string[] = [];
      // Verified in-stock shops first.
      const inq = env.deps.contact.listInquiries(env.sessionId).filter((i) => mem.lastInquiryIds.includes(i.id));
      const verified = inq.filter((i) => i.result && (i.result.stock === 'in_stock' || i.result.stock === 'limited')).map((i) => i.shop.id);
      if (verified.length) shops = verified;
      else if (mem.focusShopId && det.count === 1) shops = [mem.focusShopId];
      else shops = [...new Set([mem.focusShopId, ...mem.lastShopIds].filter((x): x is string => !!x))].slice(0, det.count ?? 3);
      if (!shops.length && mem.focusProductId) {
        const r = s.getStores(mem.focusProductId, env.ctx, { limit: 5 });
        shops = r?.stores.slice(0, 3).map((x) => x.shop.id) ?? [];
      }
      if (!shops.length) {
        text = 'برای چیدن برنامه، اول کالا را پیدا کنیم. دنبال چه هستید؟';
        for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
        break;
      }
      const out = await call('plan_visit', { shop_ids: shops });
      const plan = out.facts?.plan as import('@titl/shared').VisitPlan | undefined;
      if (!plan) {
        text = 'نتوانستم برنامه را بچینم؛ فروشگاه‌ها را دوباره انتخاب کنید.';
        break;
      }
      const sameMall = plan.stops.length > 1 && new Set(plan.stops.map((x) => x.shop.location.mall?.name ?? x.shop.id)).size === 1 && plan.stops[0]?.shop.location.mall;
      text = `برنامهٔ بازدید از ${fa(plan.stops.length)} فروشگاه${verified.length ? ' تأییدشده' : ''} آماده است${sameMall ? ` (همه در ${plan.stops[0]!.shop.location.mall!.name})` : ''}: کل برنامه حدود ${formatMinutes(plan.totalMinutes)}${plan.totalDistanceKm >= 0.1 ? `، ${formatDistance(plan.totalDistanceKm)} راه` : ''}.`;
      if (plan.leaveBy) text += ` اگر تا ساعت ${formatTimeOfDay(plan.leaveBy)} راه بیفتید، همه هنگام رسیدن باز هستند.`;
      const closed = plan.stops.filter((x) => x.openAtArrival.state === 'closed');
      if (closed.length) text += `\nتوجه: ${closed.map((x) => x.shop.name).join('، ')} هنگام رسیدن بسته است؛ جایگزینش را پیدا کنم؟`;
      else if (plan.warnings[0]) text += `\n${plan.warnings[0].label}`;
      if (plan.trafficZone.anyStopInside) text += '\nمسیر داخل طرح ترافیک است؛ مترو یا تاکسی راحت‌تر است.';
      if (!verified.length) text += '\nموجودی هنوز تأیید نشده؛ پیشنهاد می‌کنم پیش از رفتن بپرسیم.';
      reply('اگر بسته بود چه کنم؟', 'بسته بود');
      if (!verified.length) reply('اول از این فروشگاه‌ها بپرس', `از ${fa(Math.min(3, plan.stops.length))} فروشگاه اول بپرس`);
      reply('ساعت کاری فروشگاه اول', 'ساعت کاری فروشگاه اول');
      break;
    }

    case 'compare_stores': {
      const pid = productAt(det.ordinal);
      const shops = mem.lastShopIds.slice(0, det.count ?? 3);
      if (!pid || shops.length < 2) {
        text = 'برای مقایسه، اول فروشنده‌های یک کالا را پیدا کنیم. کدام کالا؟';
        if (pid) reply('فروشنده‌ها را نشان بده', 'فروشنده‌ها کجا هستند؟');
        break;
      }
      const out = await call('compare_stores', { product_id: pid, shop_ids: shops });
      const r = out.facts?.compare as import('@titl/shared').CompareStoresResponse | undefined;
      text = r?.summary || `${fa(shops.length)} فروشگاه را کنار هم گذاشتم.`;
      text += '\nقیمت‌ها ثبت‌شده است، نه تأییدشده؛ برای قطعی شدن می‌توانم بپرسم.';
      reply(`از هر ${fa(shops.length)} بپرس`, `از ${fa(shops.length)} فروشگاه اول بپرس`);
      reply('برنامهٔ بازدید', 'برنامه بازدید');
      break;
    }

    case 'compare_products': {
      const ids = mem.lastProductIds.slice(0, det.count ?? 3);
      if (ids.length < 2) {
        text = 'برای مقایسه حداقل دو کالا لازم است. اول جستجو کنید، بعد بگویید «مقایسه دو گزینه اول».';
        for (const q of EXAMPLE_QUERIES.slice(0, 2)) reply(q);
        break;
      }
      const pick = /دو|2/.test(N(message)) ? ids.slice(0, 2) : ids.slice(0, 3);
      const out = await call('compare_products', { product_ids: pick });
      const r = out.facts?.compare as import('@titl/shared').CompareProductsResponse | undefined;
      text = r?.summary || `${fa(pick.length)} کالا را کنار هم گذاشتم؛ ردیف‌های متفاوت پررنگ شده‌اند.`;
      reply('فروشنده‌های گزینهٔ ۱', 'فروشنده‌های گزینه ۱ کجا هستند؟');
      reply('فروشنده‌های گزینهٔ ۲', 'فروشنده‌های گزینه ۲ کجا هستند؟');
      break;
    }

    case 'stores': {
      // Fresh product in the message → search first.
      let pid: string | null = null;
      if (hasProductTerms(parsed) && !det.ordinal) {
        const { items, total, p } = await doSearch(message);
        const top = items[0];
        if (top && top.sellerCount >= 2 && (total <= 40 || !!p.brand)) pid = top.id;
        else if (top) {
          await needReply(message, `${fa(total)} مدل پیدا شد و بیشترشان فقط یک فروشنده دارند؛ پس فروشگاه‌هایی را آوردم که چند مدل را یک‌جا دارند.`);
          break;
        } else {
          text = `برای «${short(message, 40)}» کالایی پیدا نکردم. نام کالا را ساده‌تر بنویسید (مثلاً «گوشی سامسونگ A07»).`;
          for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
          break;
        }
      } else pid = det.ordinal ? productAt(det.ordinal) : mem.focusProductId;
      if (!pid) {
        if (mem.lastQuery || mem.lastCategory) {
          await needReply(mem.lastQuery ?? mem.lastCategory ?? '', 'هنوز مدل مشخصی انتخاب نکرده‌اید؛ فروشگاه‌هایی را آوردم که چند مدل مطابق را یک‌جا دارند تا حضوری ببینید و پرو کنید.');
          break;
        }
        text = 'دنبال فروشندهٔ چه کالایی هستید؟ نام کالا یا مدل را بنویسید.';
        for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
        break;
      }
      await storesFor(pid, parsed.sort === 'price_asc' ? 'price' : parsed.sort === 'distance' ? 'distance' : undefined);
      break;
    }

    case 'need_stores': {
      const q = hasProductTerms(parsed) ? message : mem.lastQuery ?? mem.lastCategory ?? message;
      await needReply(q, null);
      break;
    }

    case 'hours':
    case 'mall': {
      if (det.mall) {
        const out = await call('mall_info', { mall: det.mall });
        const m = out.facts?.mall as import('@titl/shared').MallDetail | undefined;
        if (!m) {
          text = `پاساژ «${det.mall}» را در داده‌ها پیدا نکردم.`;
          break;
        }
        text = `${m.mall.name}: ${fa(m.mall.shopCount)} فروشگاه در ${fa(m.floors.length)} طبقه.${m.tips[0] ? ` ${m.tips[0]}` : ''}${m.nearbyMetro[0] ? ` نزدیک‌ترین مترو: ${m.nearbyMetro[0].name} (${formatMinutes(m.nearbyMetro[0].walkMin)} پیاده).` : ''}`;
        reply('ساعت کاری فروشگاه‌ها', 'ساعت کاری فروشگاه اول');
        break;
      }
      const sid = (det.ordinal ? mem.lastShopIds[det.ordinal - 1] : null) ?? mem.focusShopId ?? mem.lastShopIds[0];
      if (!sid) {
        text = 'کدام فروشگاه؟ اول کالا یا فروشگاه را پیدا کنیم تا ساعت کاری و نشانی دقیقش را بگویم.';
        break;
      }
      const out = await call('shop_info', { shop_id: sid });
      const d = out.facts?.shop as import('@titl/shared').ShopDetail | undefined;
      if (!d) {
        text = 'اطلاعات این فروشگاه پیدا نشد.';
        break;
      }
      const guide = d.location.guide.length ? d.location.guide.join(' ← ') : null;
      text = `${d.name}: ${d.openStatus.label}.`;
      if (!d.hours?.declared) text += ' ساعت کاری‌اش ثبت نشده؛ می‌توانم بپرسم.';
      if (guide) text += `\nنشانی: ${guide}${d.location.confidence === 'low' ? ' (دقت نشانی کم است؛ پیش از رفتن بپرسید)' : ''}.`;
      if (d.reports.some((r) => r.type === 'closed')) text += '\nخریداران اخیراً گزارش داده‌اند که بسته بوده است.';
      reply('از این فروشگاه بپرس', 'از ۱ فروشگاه اول بپرس');
      reply('برنامهٔ بازدید', 'برنامه بازدید');
      if (d.location.mall) reply(`فروشگاه‌های ${short(d.location.mall.name, 20)}`, d.location.mall.name);
      break;
    }

    case 'preferences': {
      const args: Record<string, unknown> = {};
      const loc = parsed.areaLabel ?? placeLabel ?? locationCandidate(message);
      if (loc) args.location_label = loc;
      if (parsed.budgetMax) args.budget_max = parsed.budgetMax;
      if (parsed.budgetMin) args.budget_min = parsed.budgetMin;
      if (parsed.installment) args.installment = true;
      if (parsed.providers?.length) args.providers = parsed.providers;
      if (parsed.openNow || / بازها | باز ها /.test(N(message))) args.open_now = true;
      if (det.relax) {
        if (env.ctx.openNow) args.open_now = false;
        if (env.ctx.installment) args.installment = false;
        if (env.ctx.warrantyOnly) args.warranty_only = false;
      }
      const out = Object.keys(args).length ? await call('update_preferences', args) : null;
      const notes = (out?.facts?.notes as string[]) ?? [];
      const sortWord = parsed.sort === 'price_asc' ? 'price' : parsed.sort === 'distance' ? 'distance' : undefined;
      text = det.relax ? 'باشه، شرط‌ها را برداشتم.' : notes.length ? `باشه، ${notes.map((x) => `«${x}»`).join(' و ')} را لحاظ کردم.` : '';
      if (mem.lastIntent === 'need_stores' && (mem.lastQuery || mem.lastCategory)) {
        const before = text;
        await needReply(mem.lastQuery ?? mem.lastCategory ?? '', before || null);
      } else if (mem.focusProductId && (mem.lastIntent === 'stores' || mem.lastShopIds.length)) {
        finalIntent = 'stores';
        const before = text;
        await storesFor(mem.focusProductId, sortWord);
        text = `${before}${before ? '\n' : ''}${text}`;
      } else if (mem.lastQuery) {
        const before = text;
        const extra: Record<string, unknown> = parsed.sort ? { sort: parsed.sort } : {};
        const { total, items } = await doSearch(mem.lastQuery, extra);
        text = `${before}${before ? ' ' : ''}${total ? `${parsed.sort === 'price_asc' ? 'به ترتیب قیمت، از ارزان‌ترین: ' : ''}با این شرایط ${fa(total)} مدل پیدا شد${items[0] ? `؛ اولی «${short(items[0].title)}»` : ''}.` : 'با این شرایط چیزی نماند؛ یکی از شرط‌ها را بردارید.'}`;
        reply('فروشنده‌های گزینهٔ ۱', 'فروشنده‌های گزینه ۱ کجا هستند؟');
        reply('مقایسهٔ دو گزینهٔ اول', 'مقایسه دو گزینه اول');
      } else {
        text = `${text || 'متوجه شدم.'} حالا دنبال چه کالایی هستید؟`;
        for (const q of EXAMPLE_QUERIES.slice(0, 3)) reply(q);
      }
      break;
    }

    case 'choose':
    case 'search': {
      const q = message.trim().slice(0, 200);
      const broad =
        !!parsed.category &&
        !parsed.brand &&
        !parsed.budgetMax &&
        !parsed.budgetMin &&
        !parsed.audience &&
        !env.ctx.budgetMax &&
        !hasProductTerms({ ...parsed, category: undefined, categoryGroup: undefined } as ParsedQuery);
      if (intent === 'choose' || broad) {
        const d = await call('discovery_questions', { query: q, ...(parsed.category ? { category: parsed.category } : {}) });
        const disc = d.facts?.discovery as import('@titl/shared').DiscoveryResponse | undefined;
        const pop = await call('search_products', { query: q, sort: 'sellers' }, { emit: false });
        const items = ((pop.facts?.items as ProductSummary[]) ?? []).slice(0, 6);
        if (items.length) sink.block({ kind: 'products', title: 'پرفروشنده‌ترین مدل‌ها (بیشترین فروشگاه حضوری)', items, total: (pop.facts?.total as number) ?? items.length });
        const total = disc?.totalProducts ?? (pop.facts?.total as number) ?? 0;
        if (!total) {
          text = 'چیزی پیدا نکردم. کمی دقیق‌تر بگویید دنبال چه هستید (مثلاً «کتونی مردانه» یا «گوشی سامسونگ»)؟';
          for (const ex of EXAMPLE_QUERIES.slice(0, 3)) reply(ex);
          break;
        }
        text = `${fa(total)} مدل ${disc?.category ?? parsed.category ?? ''} میان فروشنده‌های حضوری هست. با دو سؤال کوتاه انتخاب را راحت می‌کنم؛ پایین هم مدل‌هایی را گذاشتم که بیشترین فروشگاه حضوری را دارند.`.replace(/  +/g, ' ');
        const q1 = disc?.questions[0];
        if (q1) for (const o of q1.options.slice(0, 3)) reply(o.label, `${disc?.category ?? q} ${o.label}`);
        reply('کجا چند مدل را یک‌جا ببینم؟', `کجا چند مدل ${disc?.category ?? ''} را یک‌جا ببینم؟`.replace(/  +/g, ' '));
        break;
      }
      const { total, items, p, out } = await doSearch(q);
      if (!total || !items.length) {
        text = `برای «${short(q, 40)}» میان فروشنده‌های حضوری چیزی پیدا نکردم.`;
        if (p.category) {
          text += ` در دستهٔ ${p.category} چند سؤال کوتاه کمک می‌کند.`;
          reply('کمکم کن انتخاب کنم', `نمی‌دونم کدوم ${p.category}`);
        } else text += ' نام کالا را ساده‌تر بنویسید یا یکی از این‌ها را امتحان کنید.';
        for (const ex of EXAMPLE_QUERIES.slice(0, 3)) reply(ex);
        break;
      }
      const top = items[0]!;
      const conds = [p.areaLabel ? `نزدیک ${p.areaLabel}` : null, env.ctx.installment ? 'با شرط قسطی' : null, env.ctx.budgetMax ? `تا ${formatTomanShort(env.ctx.budgetMax)}` : null].filter(Boolean);
      text = `${fa(total)} مدل پیدا کردم${conds.length ? ` (${conds.join('، ')})` : ''}. اولی «${short(top.title, 45)}» با ${fa(top.sellerCount)} فروشندهٔ حضوری، ${top.priceMin != null ? `از ${formatTomanShort(top.priceMin)} (قیمت ثبت‌شده)` : 'قیمت ثبت نشده'}.`;
      const ins = out.blocks.find((b) => b.kind === 'insights');
      if (ins && ins.kind === 'insights' && ins.items[0]) text += `\n${ins.items[0].text}`;
      const scattered = !!(ins && ins.kind === 'insights' && ins.items.some((i) => i.code === 'tradeoff'));
      if (scattered) reply('کجا چند مدل را یک‌جا ببینم؟', `کجا چند مدل ${p.category ?? q} را یک‌جا ببینم؟`);
      // In-person intent (area / installment / near) + a specific model → show its stores right away (AG1).
      const inPerson = !!(p.areaLabel || p.installment || p.nearMe || env.ctx.location);
      if (inPerson && top.sellerCount >= 3 && total <= 40 && (p.brand || p.keywords.length)) {
        const head = text;
        await storesFor(top.id, undefined, true);
        text = `${head}\n${text}`;
        break;
      }
      reply(`فروشنده‌های «${short(top.title, 18)}»`, 'فروشنده‌های گزینه ۱ کجا هستند؟');
      if (items.length >= 2) reply('مقایسهٔ دو گزینهٔ اول', 'مقایسه دو گزینه اول');
      if (!env.ctx.installment) reply('فقط قسطی‌ها', 'فقط قسطی');
      reply('ارزان‌ترها', 'ارزان‌ترین‌ها');
      break;
    }
  }

  mem.lastIntent = finalIntent ?? intent;
  return { text: text.trim(), intent, digests, quickReplies: replies };
}
