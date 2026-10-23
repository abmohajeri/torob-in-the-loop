/**
 * Call simulator (docs/AGENT-DESIGN.md §C.1–C.2, DESIGN-REVIEW CT2–CT4).
 * Pure + deterministic: `decide()` picks the outcome and facts from a seeded PRNG,
 * `transcript()` verbalizes those facts with seeded template variation. No I/O.
 */
import type { DayKey, InquiryQuestion, InquiryResult } from '@titl/shared';
import { formatClock, formatNumber, formatTomanShort, minutesToHHMM, toPersianDigits, toLatinDigits } from '@titl/shared';
import { rng } from './prng.js';
import { spokenProduct, summarize } from './templates.js';

export interface SimShop {
  name: string;
  /** Today's hours are registered. */
  hoursKnown: boolean;
  /** Today's closing minute-of-day (Tehran), null when unknown. */
  closeMin: number | null;
  /** Midday break today, e.g. {from:'14:00', to:'16:00'}. */
  middayBreak: { from: string; to: string } | null;
  /** Declared installment provider labels (Persian). */
  installmentProviders: string[];
  /** «پاساژ علاءالدین، طبقه ۶، واحد ۶۲۲» when parsable. */
  locationText: string | null;
  /** Crowd report «بسته بود» in the last hours. */
  reportedClosed: boolean;
}

export interface SimScenario {
  name: string;
  /** 1 = first batch of the session, 2 = second… */
  batchOrdinal: number;
  /** 0-based position in the batch. */
  index: number;
}

export interface SimInput {
  seed: string;
  /** 1-based attempt number. */
  attempt: number;
  questions: InquiryQuestion[];
  customQuestion: string | null;
  variant: { key: string; value: string }[];
  productTitle: string | null;
  priceRange: { min: number | null; max: number | null } | null;
  registered: { price: number | null; fresh: boolean };
  warranty: string | null;
  shop: SimShop;
  /** Shopper-clock minute of day and weekday at call time. */
  nowMin: number;
  weekday: DayKey;
  budgetMax: number | null;
  scenario: SimScenario | null;
  /** «همین الان بپرس» on a shop whose hours say closed → nobody picks up. */
  forcedWhileClosed?: boolean;
}

export type SimOutcome = 'answered' | 'no_answer' | 'busy' | 'closed' | 'callback';

export interface SimDecision {
  outcome: SimOutcome;
  result: InquiryResult | null;
  /** HH:MM the seller promised to call back (outcome 'callback'). */
  callbackAt: string | null;
  /** Seller offered to hold without being asked (demo scenario #1). */
  volunteeredHold: boolean;
  /** Price quoted on the phone without a registered price. */
  phoneQuotedPrice: boolean;
  /** Hours stated on the phone (not registered). */
  phoneHours: boolean;
}

export interface SimLine {
  speaker: 'agent' | 'store' | 'system';
  text: string;
}

const round10k = (n: number) => Math.max(10_000, Math.round(n / 10_000) * 10_000);
const fa = (n: number) => formatNumber(n);

function outcomeFor(input: SimInput): { outcome: SimOutcome; callbackAt: string | null } {
  const r = rng(`${input.seed}:o`);
  if (input.forcedWhileClosed) return { outcome: 'closed', callbackAt: null };
  const sc = input.scenario;
  if (sc && sc.index <= 2) {
    // DEMO_SCENARIOS choreography (disclosed): #1 misses the first call, everything else answers.
    if (sc.batchOrdinal === 1 && sc.index === 0 && input.attempt === 1) return { outcome: 'no_answer', callbackAt: null };
    return { outcome: 'answered', callbackAt: null };
  }
  if (!input.shop.hoursKnown && r.chance(0.12)) return { outcome: 'closed', callbackAt: null };
  let pAnswer = input.attempt > 1 ? 0.85 : 0.72;
  let pNoAnswer = input.attempt > 1 ? 0.1 : 0.18;
  if (input.shop.reportedClosed) {
    pAnswer -= 0.2;
    pNoAnswer += 0.2;
  }
  const x = r.next();
  if (x < pAnswer) {
    // CT9: a few sellers are busy and promise to call back.
    if (!sc && input.attempt === 1 && r.chance(0.06)) {
      const at = Math.min(input.nowMin + r.int(2, 4) * 30, (input.shop.closeMin ?? 21 * 60) - 30);
      if (at > input.nowMin + 30) return { outcome: 'callback', callbackAt: minutesToHHMM(Math.floor(at / 30) * 30) };
    }
    return { outcome: 'answered', callbackAt: null };
  }
  if (x < pAnswer + pNoAnswer) return { outcome: 'no_answer', callbackAt: null };
  return { outcome: 'busy', callbackAt: null };
}

function sizeOf(variant: { key: string; value: string }[]): { v: { key: string; value: string }; n: number } | null {
  for (const v of variant) {
    if (!/سایز|size|شماره/i.test(v.key)) continue;
    const n = Number.parseInt(toLatinDigits(v.value), 10);
    if (Number.isFinite(n)) return { v, n };
  }
  return null;
}

function variantText(variant: { key: string; value: string }[]): string {
  return variant.map((v) => (/سایز|رنگ/.test(v.key) ? `${v.key} ${v.value}` : v.value)).join(' ');
}

/** Decide outcome + facts (no wording). */
export function decide(input: SimInput): SimDecision {
  const { outcome, callbackAt } = outcomeFor(input);
  const base: SimDecision = { outcome, result: null, callbackAt, volunteeredHold: false, phoneQuotedPrice: false, phoneHours: false };
  if (outcome !== 'answered') return base;

  const f = rng(`${input.seed}:f`);
  const sc = input.scenario && input.scenario.index <= 2 ? input.scenario : null;
  const q = new Set(input.questions);

  // Stock
  let stock: InquiryResult['stock'];
  if (sc) stock = sc.index === 2 ? 'out_of_stock' : 'in_stock';
  else {
    const x = f.next();
    stock = x < 0.72 ? 'in_stock' : x < 0.85 ? 'limited' : 'out_of_stock';
  }

  // Price
  let price: number | null = null;
  let delta: number | null = null;
  const reg = input.registered.price;
  const secondBatchOver = sc && sc.batchOrdinal >= 2 && sc.index === 0;
  if (reg !== null) {
    let pct: number;
    if (secondBatchOver) {
      const target = input.budgetMax ? Math.max(reg * 1.03, input.budgetMax * 1.06) : reg * 1.15;
      pct = (target / reg - 1) * 100;
    } else if (sc) pct = sc.index === 0 ? f.range(4, 6) : 0;
    else if (f.chance(input.registered.fresh ? 0.8 : 0.3)) pct = 0;
    else pct = f.chance(0.9) ? f.range(2, 12) : -f.range(1, 5);
    price = pct === 0 ? reg : round10k(reg * (1 + pct / 100));
    delta = Math.round(((price - reg) / reg) * 1000) / 10;
  } else if (input.priceRange && (input.priceRange.min || input.priceRange.max)) {
    const lo = input.priceRange.min ?? input.priceRange.max!;
    const hi = input.priceRange.max ?? lo;
    price = round10k(f.range(lo, hi));
    base.phoneQuotedPrice = true;
  }
  const overBudget = price !== null && input.budgetMax != null && price > input.budgetMax && stock !== 'out_of_stock';

  // Hours today
  let hoursToday: string | null = null;
  if (input.shop.closeMin !== null) hoursToday = minutesToHHMM(input.shop.closeMin);
  else if (q.has('hours') || q.has('hold')) {
    hoursToday = minutesToHHMM(f.pick([20 * 60, 20 * 60 + 30, 21 * 60]));
    base.phoneHours = true;
  }

  // Hold
  let holdUntil: string | null = null;
  if (stock !== 'out_of_stock') {
    if (sc && sc.index === 0 && sc.batchOrdinal === 1) {
      holdUntil = '18:00';
      base.volunteeredHold = !q.has('hold');
    } else if (q.has('hold') && f.chance(0.75)) {
      const close = input.shop.closeMin ?? 20 * 60;
      const until = Math.min(close - 30, input.nowMin + 180);
      const rounded = Math.floor(until / 30) * 30;
      if (rounded >= input.nowMin + 30) holdUntil = minutesToHHMM(rounded);
    }
  }

  // Installment
  let installment: InquiryResult['installment'] = null;
  if (q.has('installment') || q.has('cash_vs_installment')) {
    if (input.shop.installmentProviders.length) installment = { available: true, providers: input.shop.installmentProviders, note: null };
    else if (!sc && f.chance(0.25)) installment = { available: false, providers: [], note: 'فقط چک' };
    else installment = { available: false, providers: [], note: null };
  }

  const kalabarg = q.has('kalabarg') ? f.chance(0.1) : null;
  const locationHint = q.has('location') ? (input.shop.locationText ?? 'نشانی دقیق را تلفنی گفتند') : null;
  const warranty = q.has('warranty') ? (input.warranty ?? 'گارانتی ۱۸ ماهه (اعلام تلفنی)') : null;

  // Extra answers (CT4)
  const answers: { question: InquiryQuestion; text: string }[] = [];
  let variantAvailable: boolean | null = null;
  if (input.variant.length && stock !== 'out_of_stock') {
    const size = sizeOf(input.variant);
    variantAvailable = f.chance(0.7);
    if (variantAvailable) answers.push({ question: 'variant', text: `بله، ${variantText(input.variant)} داریم.` });
    else if (size)
      answers.push({
        question: 'variant',
        text: `${toPersianDigits(size.n)} تمام شده، ${toPersianDigits(size.n - 1)} و ${toPersianDigits(size.n + 1)} داریم.`,
      });
    else answers.push({ question: 'variant', text: `${variantText(input.variant)} فعلاً نداریم؛ رنگ‌ها و مدل‌های دیگرش هست.` });
  }
  if (q.has('registry'))
    answers.push({
      question: 'registry',
      text: f.chance(0.85) ? 'بله، رجیستر شده است و قابل فعال‌سازی تحویل می‌دهیم.' : 'این یکی نات‌اکتیو است؛ رجیستری ندارد.',
    });
  if (q.has('condition'))
    answers.push({
      question: 'condition',
      text: f.chance(0.8) ? 'آکبند و پلمپ است، اصل.' : 'کارتنش باز شده ولی کارنکرده است (اوپن‌باکس).',
    });
  if (q.has('cash_vs_installment'))
    answers.push({
      question: 'cash_vs_installment',
      text: installment?.available ? `قسطی حدود ${fa(f.int(10, 25))} درصد گران‌تر از نقد است.` : 'فقط نقد و کارت می‌فروشیم.',
    });
  if (q.has('return_policy'))
    answers.push({
      question: 'return_policy',
      text: f.chance(0.6) ? 'تا ۷ روز اگر پلمپ باز نشده باشد تعویض می‌کنیم.' : 'فقط اگر ایراد فنی داشته باشد تعویض می‌کنیم.',
    });
  const answerToCustom =
    q.has('custom') && input.customQuestion ? f.pick(['بله، این مورد هم هست.', 'باید از همکارم بپرسم؛ حضوری بیایید توضیح می‌دهم.']) : null;

  const partial: Omit<InquiryResult, 'summary'> = {
    stock,
    price,
    priceDeltaPct: delta,
    hoursToday,
    holdUntil,
    installment,
    kalabarg,
    locationHint,
    warranty,
    answerToCustom,
    ...(input.variant.length ? { variantAvailable } : {}),
    ...(answers.length ? { answers } : {}),
    ...(overBudget ? { overBudget: true } : {}),
  };
  base.result = { ...partial, summary: summarize(partial) };
  return base;
}

/** Verbalize a decision as transcript lines (no new facts). */
export function transcript(input: SimInput, d: SimDecision): SimLine[] {
  const w = rng(`${input.seed}:w`);
  const product = spokenProduct(input.productTitle) + (input.variant.length ? ` (${variantText(input.variant)})` : '');
  const lines: SimLine[] = [];
  const agent = (text: string) => lines.push({ speaker: 'agent', text });
  const store = (text: string) => lines.push({ speaker: 'store', text });

  if (d.outcome !== 'answered' && d.outcome !== 'callback') return lines;

  store(w.pick(['سلام، بفرمایید.', 'بله، در خدمتم.', 'الو، بفرمایید؟']));
  agent(
    `سلام، وقت‌تون بخیر. از دستیار خرید «Torob in the Loop» تماس می‌گیرم؛ یکی از مشتری‌ها دنبال ${product} است. چند سؤال کوتاه داشتم.`,
  );
  if (d.outcome === 'callback') {
    store(`الان دستم بند است و مشتری دارم؛ ساعت ${formatClock(d.callbackAt)} خودم خبر می‌دهم.`);
    agent('حتماً، ممنون. اگر خبری نشد خودم دوباره تماس می‌گیرم.');
    return lines;
  }
  const r = d.result!;
  const q = new Set(input.questions);
  const answersBy = new Map((r.answers ?? []).map((a) => [a.question, a.text]));

  // Stock is always asked first (it decides the rest of the call).
  agent(`${spokenProduct(input.productTitle)} را الان موجود دارید؟`);
  if (r.stock === 'in_stock') store(w.pick(['بله، موجود داریم.', 'بله، چند تا داریم.']));
  else if (r.stock === 'limited') store('آخرین دانه‌اش مانده؛ اگر می‌آیید زودتر بیایید.');
  else store(w.pick(['نه متأسفانه، فعلاً تمام کرده‌ایم.', 'فعلاً نداریم؛ شاید هفته بعد بیاید.']));

  if (input.variant.length && answersBy.has('variant')) {
    agent(`${variantText(input.variant)} هم دارید؟`);
    store(answersBy.get('variant')!);
  }

  const inStock = r.stock !== 'out_of_stock';
  if (inStock && (q.has('price') || r.price !== null) && r.price !== null) {
    agent('قیمت امروزش چند است؟');
    const p = `${formatTomanShort(r.price, false)} تومان`;
    if (d.phoneQuotedPrice) store(`الان ${p} حساب می‌کنیم.`);
    else if (!r.priceDeltaPct) store(`همان ${p} است.`);
    else if (r.priceDeltaPct > 0) store(`قیمتش کمی بالا رفته؛ الان ${p} است.`);
    else store(`الان ${p} حساب می‌کنیم.`);
  }
  for (const k of ['registry', 'condition'] as const) {
    if (inStock && answersBy.has(k)) {
      agent(k === 'registry' ? 'رجیستر شده و قابل فعال‌سازی است؟' : 'آکبند و پلمپ است؟');
      store(answersBy.get(k)!);
    }
  }
  if (q.has('hours') && r.hoursToday) {
    agent('امروز تا چه ساعتی باز هستید؟');
    const close = formatClock(r.hoursToday);
    if (input.shop.middayBreak) store(`ظهر از ${formatClock(input.shop.middayBreak.from)} تا ${formatClock(input.shop.middayBreak.to)} می‌بندیم، بعدش تا ${close} هستیم.`);
    else if (input.weekday === 'thu') store(`امروز پنجشنبه است؛ تا ${close} بیشتر نیستیم.`);
    else store(`تا ساعت ${close} هستیم.`);
  }
  if (inStock && q.has('hold')) {
    agent('امکانش هست تا رسیدن مشتری نگهش دارید؟');
    store(r.holdUntil ? `بله، تا ساعت ${formatClock(r.holdUntil)} به اسم Torob in the Loop نگه می‌دارم.` : 'نگه نمی‌داریم، ولی فعلاً موجود است.');
  } else if (inStock && d.volunteeredHold && r.holdUntil) {
    store(`اگر مشتری امروز می‌آید، تا ساعت ${formatClock(r.holdUntil)} برایش نگه می‌دارم.`);
  }
  if (q.has('installment') && r.installment) {
    agent('امکان خرید قسطی یا با ترب‌پی دارید؟');
    if (r.installment.available) store(`بله، با ${r.installment.providers.join('، ')} می‌شود قسطی خرید.`);
    else if (r.installment.note) store('فقط چک قبول می‌کنیم.');
    else store('نه، فقط نقد و کارت.');
  }
  if (answersBy.has('cash_vs_installment')) {
    agent('قیمت نقد و قسط چقدر فرق دارد؟');
    store(answersBy.get('cash_vs_installment')!);
  }
  if (q.has('kalabarg') && r.kalabarg !== null) {
    agent('کالابرگ قبول می‌کنید؟');
    store(r.kalabarg ? 'بله، کالابرگ هم قبول می‌کنیم.' : 'نه، کالابرگ برای ما فعال نیست.');
  }
  if (q.has('location') && r.locationHint) {
    agent('دقیقاً کجای پاساژ هستید؟');
    store(`${r.locationHint}؛ ${w.pick(['از پله‌برقی که بالا بیایید سمت راست', 'روبه‌روی آسانسور', 'ته راهرو، کنار پله'])}.`);
  }
  if (q.has('warranty') && r.warranty) {
    agent('گارانتی‌اش چیست؟');
    store(`${r.warranty}.`);
  }
  if (answersBy.has('return_policy')) {
    agent('امکان تعویض دارید؟');
    store(answersBy.get('return_policy')!);
  }
  if (q.has('custom') && input.customQuestion && r.answerToCustom) {
    agent(input.customQuestion);
    store(r.answerToCustom);
  }
  agent('خیلی ممنون، روز خوبی داشته باشید.');
  store(w.pick(['خواهش می‌کنم، منتظرتان هستیم.', 'قربان شما، در خدمتیم.']));
  return lines;
}
