/**
 * Contact & follow-up engine (docs/ARCHITECTURE.md §9, AGENT-DESIGN §C, DESIGN-REVIEW CT1–CT6).
 *
 * State machine per inquiry:
 *   queued → calling → in_call → answered → resolved
 *          ↘ (closed by hours) scheduled_at_open → … at opening (+5–10 min)
 *   calling → no_answer | busy | closed → retry_scheduled (+retry × 1.5^(n−1)) → … → unreachable (+ alternatives)
 *   in_call → callback_promised → … (attempt at promised time + 10 min)
 *   any non-final → resolved by a seller-inbox reply (wins over everything, cancels pending jobs)
 *   any non-final → cancelled
 * Facts are decided first (simulator.decide), then verbalized (templates / optional LLM rephrase).
 * Scheduling lives in the `jobs` table → restart-safe.
 */
import { randomUUID } from 'node:crypto';
import type {
  AltReason,
  AlternativesResponse,
  CreateInquiriesRequest,
  DayKey,
  Inquiry,
  InquiryEvent,
  InquiryQuestion,
  InquiryResult,
  InquiryStatus,
  OpenStatus,
  RegisteredPrice,
  SellerReplyRequest,
  ShopLite,
  UserContext,
} from '@titl/shared';
import { INSTALLMENT_PROVIDERS, INQUIRY_STATUS_META, hhmmToMinutes, tehranInstant, tehranParts } from '@titl/shared';
import type { ContactDeps } from '../deps.js';
import { json } from '../db/sqlite.js';
import { dayCloseMinutes, normalizeHours, dayIndex } from '../domain/hours.js';
import { ApiErr, badRequest, notFound } from '../http.js';
import { rephraseLines } from './llm.js';
import { rng } from './prng.js';
import { decide, transcript, type SimInput, type SimShop } from './simulator.js';
import { ACTIVE, ContactStore, FINAL, type InquiryRow } from './store.js';
import {
  PRIVACY_LINE,
  SIMULATED_LABEL,
  STATUS_TEXT,
  callbackNote,
  dayClock,
  minutesWord,
  retryNote,
  scheduledAtOpenNote,
  summarize,
  unreachableNote,
} from './templates.js';
import { composeDigest, composeFirstMiss } from './digest.js';

export interface ContactSettings {
  /** Simulate calls (DEMO_MODE). Off → inquiries go to the seller inbox only (awaiting_seller). */
  simulate: boolean;
  /** DEMO_SCENARIOS: disclosed, order-based outcomes. */
  scenarios: boolean;
  scenarioName: string;
  /** DEMO_TIME_SCALE (1/3/10×): divides ringing, line pacing and retry delays. */
  timeScale: number;
  retrySeconds: number;
  maxAttempts: number;
  /** Scheduler poll interval (ms). */
  tickMs: number;
  /** Use the LLM to rephrase transcripts when configured (never in scenario mode). */
  llmRephrase: boolean;
}

const MAX_SHOPS = 10;
const truthy = (v: string | undefined) => !!v && ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

export function settingsFromEnv(deps: ContactDeps, env: NodeJS.ProcessEnv = process.env): ContactSettings {
  const scale = Number(env.DEMO_TIME_SCALE);
  return {
    simulate: deps.config.DEMO_MODE,
    scenarios: truthy(env.DEMO_SCENARIOS),
    scenarioName: env.DEMO_SCENARIO_NAME || 'jomhouri-a07',
    timeScale: Number.isFinite(scale) && scale > 0 ? scale : deps.config.CALL_SPEED,
    retrySeconds: deps.config.FOLLOWUP_RETRY_SECONDS,
    maxAttempts: deps.config.FOLLOWUP_MAX_ATTEMPTS,
    tickMs: 500,
    llmRephrase: true,
  };
}

type AttemptPayload = { callNow?: boolean };

export class ContactEngine {
  readonly store: ContactStore;
  private timer: NodeJS.Timeout | null = null;
  private running = new Map<string, { aborted: boolean }>();
  private inflight = new Set<Promise<void>>();

  constructor(
    private deps: ContactDeps,
    readonly settings: ContactSettings,
    private clock: () => Date = () => new Date(),
  ) {
    this.store = new ContactStore(deps.state);
  }

  now(): Date {
    return this.clock();
  }
  private iso(): string {
    return this.clock().toISOString();
  }
  private scaled(ms: number): number {
    return ms / this.settings.timeScale;
  }

  // ───────────────────────── DTO ─────────────────────────

  ctxOf(row: InquiryRow): UserContext {
    return json<UserContext>(row.context, {});
  }

  shopOf(row: InquiryRow): ShopLite | null {
    return this.deps.services.getShopLite(row.shop_id, this.ctxOf(row));
  }

  toDto(row: InquiryRow, withEvents = true): Inquiry | null {
    const ctx = this.ctxOf(row);
    const shop = this.deps.services.getShopLite(row.shop_id, ctx);
    if (!shop) return null;
    const offset = row.clock_offset_ms ?? 0;
    const next = row.next_attempt_at ? new Date(new Date(row.next_attempt_at).getTime() + offset).toISOString() : null;
    const inq: Inquiry = {
      id: row.id,
      sessionId: row.session_id,
      batchId: row.batch_id,
      shop,
      product: row.product_id ? this.deps.services.getProductSummary(row.product_id, ctx) : null,
      registeredPrice: json<RegisteredPrice | null>(row.registered_price, null),
      questions: json<InquiryQuestion[]>(row.questions, []),
      customQuestion: row.custom_question,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      nextAttemptAt: next,
      channel: row.channel,
      result: json<InquiryResult | null>(row.result, null),
      resultSource: row.result_source,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      events: withEvents ? this.store.events(row.id) : [],
      alternatives: json<AlternativesResponse | null>(row.alternatives, null),
      simulated: row.channel === 'simulated_call',
      batchIndex: row.batch_index ?? 0,
      scenario: row.scenario,
      statusNote: row.status_note,
      published: (row.published ?? 1) === 1,
    };
    const variant = json<{ key: string; value: string }[]>(row.variant, []);
    if (variant.length) inq.variant = variant;
    return inq;
  }

  private dto(id: string): Inquiry | null {
    const row = this.store.get(id);
    return row ? this.toDto(row) : null;
  }

  // ───────────────────────── events ─────────────────────────

  private emitUpdate(id: string): Inquiry | null {
    const inq = this.dto(id);
    if (!inq) return null;
    this.deps.bus.publishSession(inq.sessionId, { type: 'inquiry.updated', inquiry: inq });
    this.deps.bus.publishSeller(inq.shop.id, { type: 'seller.inquiry', inquiry: inq });
    return inq;
  }

  private line(row: InquiryRow, type: InquiryEvent['type'], speaker: InquiryEvent['speaker'] | null, text: string, data?: unknown): InquiryEvent {
    const ev = this.store.addEvent(row.id, this.iso(), type, speaker, text, data);
    this.deps.bus.publishSession(row.session_id, { type: 'inquiry.line', inquiryId: row.id, event: ev });
    return ev;
  }

  private setStatus(
    row: InquiryRow,
    status: InquiryStatus,
    extra: Parameters<ContactStore['update']>[1] = {},
    note?: string | null,
    text?: string,
  ): void {
    this.store.update(row.id, { status, ...extra }, this.iso());
    if (note !== undefined) this.store.setMeta(row.id, { status_note: note });
    row.status = status;
    this.line(row, 'status', 'system', text ?? note ?? INQUIRY_STATUS_META[status].label, { status });
  }

  private notify(row: InquiryRow, title: string, body: string, tone: 'good' | 'info' | 'warn' | 'bad'): void {
    this.deps.bus.publishSession(row.session_id, {
      type: 'notification',
      id: `${row.id}:${row.status}:${row.attempts}`,
      title,
      body,
      tone,
      link: `/inquiries/${row.id}`,
    });
  }

  // ───────────────────────── create / list ─────────────────────────

  /** CT4: auto-add contextual questions per shop. */
  autoQuestions(base: InquiryQuestion[], ctx: UserContext, shop: ShopLite, shopperNow: Date, hasVariant: boolean): InquiryQuestion[] {
    const qs = new Set<InquiryQuestion>(base.length ? base : ['stock', 'price']);
    qs.add('stock');
    if (ctx.installment || ctx.providers?.length) qs.add('installment');
    if (ctx.kalabarg) qs.add('kalabarg');
    if (shop.location.confidence !== 'high') qs.add('location');
    const visit = ctx.visitAt ? new Date(ctx.visitAt) : shopperNow;
    const a = tehranParts(visit);
    const b = tehranParts(shopperNow);
    if (a.year === b.year && a.month === b.month && a.day === b.day) qs.add('hours');
    if (hasVariant) qs.add('variant');
    return [...qs];
  }

  createInquiries(req: CreateInquiriesRequest): Inquiry[] {
    const shopIds = [...new Set(req.shopIds)].slice(0, MAX_SHOPS);
    if (!shopIds.length) throw badRequest('حداقل یک فروشگاه انتخاب کنید.');
    const ctx = req.context ?? {};
    const productId = req.productId ?? null;
    if (productId && !this.deps.services.getProductSummary(productId, ctx)) throw notFound('کالا');
    const shops = shopIds.map((id) => {
      const s = this.deps.services.getShopLite(id, ctx);
      if (!s) throw notFound(`فروشگاه ${id}`);
      return s;
    });
    const now = this.now();
    const nowIso = now.toISOString();
    let offset = 0;
    if (this.settings.simulate && req.clockNow) {
      const t = new Date(req.clockNow).getTime();
      if (Number.isFinite(t)) offset = t - now.getTime();
    }
    const shopperNow = new Date(now.getTime() + offset);
    const variant = (req.variant ?? []).filter((v) => v.key && v.value).slice(0, 4);
    const batchId = randomUUID();
    const scenario = this.settings.simulate && this.settings.scenarios ? this.settings.scenarioName : null;
    const ids: string[] = [];

    this.deps.state.tx(() => {
      const ordinal = this.store.insertBatch(batchId, req.sessionId, productId, nowIso);
      shops.forEach((shop, i) => {
        const id = randomUUID();
        ids.push(id);
        const questions = this.autoQuestions(req.questions, ctx, shop, shopperNow, variant.length > 0);
        if (req.customQuestion?.trim() && !questions.includes('custom')) questions.push('custom');
        const reg = productId ? this.deps.services.registeredPrice(productId, shop.id) : null;
        this.store.insertInquiry({
          id,
          sessionId: req.sessionId,
          batchId,
          shopId: shop.id,
          productId,
          questions,
          customQuestion: req.customQuestion?.trim() || null,
          status: this.settings.simulate ? 'queued' : 'awaiting_seller',
          maxAttempts: this.settings.maxAttempts,
          channel: this.settings.simulate ? 'simulated_call' : 'seller_inbox',
          registeredPrice: reg ? JSON.stringify(reg) : null,
          context: JSON.stringify(ctx),
          now: nowIso,
          meta: { batchIndex: i, batchOrdinal: ordinal, scenario, variant: variant.length ? JSON.stringify(variant) : null, clockOffsetMs: offset, force: !!req.force },
        });
        this.store.addEvent(id, nowIso, 'note', 'system', PRIVACY_LINE);
        if (this.settings.simulate) {
          this.store.addEvent(id, nowIso, 'note', 'system', SIMULATED_LABEL, { simulated: true, scenario });
          this.store.enqueue('inquiry.attempt', id, new Date(now.getTime() + this.scaled(800 * i)).toISOString());
        } else {
          this.store.addEvent(id, nowIso, 'note', 'system', 'پیام شما در صندوق فروشنده ثبت شد؛ پاسخ فروشنده همین‌جا نمایش داده می‌شود.');
        }
      });
    });
    const out: Inquiry[] = [];
    for (const id of ids) {
      const inq = this.emitUpdate(id);
      if (inq) out.push(inq);
    }
    return out;
  }

  listInquiries(sessionId: string): Inquiry[] {
    return this.store.bySession(sessionId).flatMap((r) => this.toDto(r) ?? []);
  }

  getInquiry(id: string): Inquiry | null {
    return this.dto(id);
  }

  sellerInbox(shopId: string): Inquiry[] {
    return this.store.byShop(shopId).flatMap((r) => this.toDto(r) ?? []);
  }

  // ───────────────────────── user actions ─────────────────────────

  /** «همین حالا دوباره» / «همین حالا تماس بگیر (نسخه نمایشی)»: immediate attempt (closed hours ignored, disclosed). */
  retry(id: string, opts: { callNow?: boolean } = { callNow: true }): Inquiry | null {
    const row = this.store.get(id);
    if (!row) return null;
    if (row.status === 'cancelled' || ACTIVE.has(row.status) || this.running.has(id)) return this.toDto(row);
    if (!this.settings.simulate) return this.toDto(row);
    if (row.result_source === 'seller_inbox') return this.toDto(row);
    this.store.cancelJobs(id);
    const patch: Parameters<ContactStore['update']>[1] = { next_attempt_at: null };
    if (row.attempts >= row.max_attempts) patch.max_attempts = row.attempts + 1;
    this.setStatus(row, 'queued', patch, null);
    if (opts.callNow) this.line(row, 'note', 'system', 'تماس فوری به درخواست شما · نسخه نمایشی');
    this.store.enqueue('inquiry.attempt', id, this.iso(), { callNow: !!opts.callNow } satisfies AttemptPayload);
    this.kick();
    return this.emitUpdate(id);
  }

  cancel(id: string): Inquiry | null {
    const row = this.store.get(id);
    if (!row) return null;
    if (FINAL.has(row.status)) return this.toDto(row);
    const run = this.running.get(id);
    if (run) run.aborted = true;
    this.store.cancelJobs(id);
    this.setStatus(row, 'cancelled', { next_attempt_at: null }, STATUS_TEXT.cancelled);
    const inq = this.emitUpdate(id);
    if (row.batch_id) this.checkBatch(row.batch_id);
    return inq;
  }

  /** CT5: seller reply wins over any simulated call, at any time. */
  sellerReply(shopId: string, id: string, reply: SellerReplyRequest): Inquiry | null {
    const row = this.store.get(id);
    if (!row || row.shop_id !== shopId) return null;
    if (row.status === 'cancelled') throw new ApiErr(409, 'cancelled', 'این درخواست توسط مشتری لغو شده است.');
    const run = this.running.get(id);
    if (run) run.aborted = true;
    this.store.cancelJobs(id);
    const reg = json<RegisteredPrice | null>(row.registered_price, null);
    const price = reply.price ?? (reply.samePrice ? (reg?.price ?? null) : null);
    const delta = price !== null && reg?.price ? Math.round(((price - reg.price) / reg.price) * 1000) / 10 : null;
    const ctx = this.ctxOf(row);
    const overBudget = price !== null && ctx.budgetMax != null && price > ctx.budgetMax && reply.stock !== 'out_of_stock';
    const partial: Omit<InquiryResult, 'summary'> = {
      stock: reply.stock,
      price,
      priceDeltaPct: delta,
      hoursToday: reply.hoursToday ?? null,
      holdUntil: reply.stock === 'out_of_stock' ? null : (reply.holdUntil ?? null),
      installment: reply.installment === undefined ? null : { available: reply.installment, providers: [], note: null },
      kalabarg: reply.kalabarg ?? null,
      locationHint: null,
      warranty: null,
      answerToCustom: reply.note?.trim() || null,
      ...(overBudget ? { overBudget: true } : {}),
    };
    const result: InquiryResult = { ...partial, summary: summarize(partial) };
    const publish = reply.publish ?? true;
    this.store.setMeta(id, { published: publish ? 1 : 0 });
    this.store.update(id, { result: JSON.stringify(result), result_source: 'seller_inbox', next_attempt_at: null }, this.iso());
    this.line(row, 'line', 'store', `پاسخ مستقیم فروشنده: ${result.summary}${reply.note?.trim() ? ` — «${reply.note.trim()}»` : ''}`);
    this.line(row, 'result', 'system', result.summary, { result, source: 'seller_inbox' });
    const altReason: AltReason | null = reply.stock === 'out_of_stock' ? 'out_of_stock' : overBudget ? 'over_budget' : null;
    const alts = altReason ? this.computeAlternatives(row, altReason) : null;
    this.setStatus(row, 'resolved', { alternatives: alts ? JSON.stringify(alts) : row.alternatives }, null);
    row.status = 'resolved';
    const shopName = this.shopOf(row)?.name ?? 'فروشگاه';
    this.notify(row, `پاسخ مستقیم فروشنده ${shopName}`, result.summary, reply.stock === 'out_of_stock' ? 'warn' : 'good');
    const inq = this.emitUpdate(id);
    if (row.batch_id) this.checkBatch(row.batch_id);
    return inq;
  }

  // ───────────────────────── scheduler ─────────────────────────

  start(): void {
    if (this.timer) return;
    this.recover();
    this.timer = setInterval(() => this.tick(), this.settings.tickMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const r of this.running.values()) r.aborted = true;
  }

  /** Wait for in-flight attempts (tests). */
  async idle(): Promise<void> {
    while (this.inflight.size) await Promise.all([...this.inflight]);
  }

  private kick(): void {
    if (this.timer) setImmediate(() => this.tick());
  }

  /** Boot recovery: void stale locks, re-queue interrupted calls, re-create missing jobs. */
  recover(): void {
    this.store.clearLocks();
    for (const row of this.store.unfinished()) {
      if (row.channel !== 'simulated_call') continue;
      if (this.store.pendingJobs(row.id) > 0 && !['calling', 'in_call', 'answered'].includes(row.status)) continue;
      if (['calling', 'in_call', 'answered'].includes(row.status)) {
        this.store.cancelJobs(row.id);
        this.store.update(row.id, { status: 'queued', attempts: Math.max(0, row.attempts - 1) }, this.iso());
        this.store.addEvent(row.id, this.iso(), 'note', 'system', STATUS_TEXT.restart);
        this.store.enqueue('inquiry.attempt', row.id, this.iso());
      } else {
        this.store.enqueue('inquiry.attempt', row.id, row.next_attempt_at ?? this.iso());
      }
    }
  }

  tick(): void {
    let jobs;
    try {
      jobs = this.store.claimDue(this.now(), 120_000);
    } catch (err) {
      this.deps.log.warn('job claim failed', { err: err as Error });
      return;
    }
    for (const job of jobs) {
      if (job.kind !== 'inquiry.attempt') {
        this.store.finishJob(job.id);
        continue;
      }
      const payload = json<AttemptPayload>(job.payload, {});
      const p = this.runAttempt(job.ref_id, payload)
        .then(() => this.store.finishJob(job.id))
        .catch((err: unknown) => {
          this.deps.log.error('inquiry attempt failed', { err: err as Error, inquiryId: job.ref_id });
          if (job.attempts >= 3) this.store.finishJob(job.id);
          else this.store.releaseJob(job.id, new Date(this.now().getTime() + 5000).toISOString());
        })
        .finally(() => this.inflight.delete(p));
      this.inflight.add(p);
    }
  }

  // ───────────────────────── the call ─────────────────────────

  private shopperNow(row: InquiryRow): Date {
    return new Date(this.now().getTime() + (row.clock_offset_ms ?? 0));
  }

  /** Next opening instant (shopper clock) from an OpenStatus. */
  nextOpening(os: OpenStatus, shopperNow: Date): Date | null {
    if (!os.opensAt) return null;
    const mins = hhmmToMinutes(os.opensAt);
    const today = tehranParts(shopperNow).weekday;
    const days: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
    for (let off = 0; off <= 7; off++) {
      const key = days[(dayIndex(today) + off) % 7]!;
      if (os.opensDay && key !== os.opensDay) continue;
      const t = tehranInstant(shopperNow, mins, off);
      if (t.getTime() > shopperNow.getTime()) return t;
    }
    return null;
  }

  private simShop(row: InquiryRow, shop: ShopLite, shopperNow: Date): SimShop {
    const hours = normalizeHours(this.deps.services.getShopHours(row.shop_id));
    const weekday = tehranParts(shopperNow).weekday;
    const day = hours?.declared ? hours.days[dayIndex(weekday)] : undefined;
    const hoursKnown = !!day && day.status !== 'unknown';
    let closeMin = hoursKnown ? dayCloseMinutes(hours, weekday) : null;
    if (closeMin !== null && closeMin > 24 * 60) closeMin = 24 * 60 - 1;
    const middayBreak = day && day.status === 'open' && day.shifts.length > 1 ? { from: day.shifts[0]!.end, to: day.shifts[1]!.start } : null;
    const installmentProviders = [
      ...new Set(shop.payment.options.filter((o) => INSTALLMENT_PROVIDERS.includes(o.provider)).map((o) => o.label)),
    ];
    const reports = this.deps.state.get<{ n: number }>(
      `SELECT count(*) AS n FROM reports WHERE shop_id = ? AND type = 'closed' AND created_at >= ?`,
      row.shop_id,
      new Date(this.now().getTime() - 6 * 3600_000).toISOString(),
    );
    return {
      name: shop.name,
      hoursKnown,
      closeMin,
      middayBreak,
      installmentProviders,
      locationText: shop.location.guide.length ? shop.location.guide.join('، ') : null,
      reportedClosed: (reports?.n ?? 0) > 0,
    };
  }

  private simInput(row: InquiryRow, shop: ShopLite, shopperNow: Date, forcedWhileClosed: boolean): SimInput {
    const ctx = this.ctxOf(row);
    const product = row.product_id ? this.deps.services.getProductSummary(row.product_id, ctx) : null;
    const reg = json<RegisteredPrice | null>(row.registered_price, null);
    let warranty: string | null = null;
    if (row.product_id && json<InquiryQuestion[]>(row.questions, []).includes('warranty')) {
      const st = this.deps.services.getStores(row.product_id, {}, { limit: 200 });
      warranty = st?.stores.find((s) => s.shop.id === row.shop_id)?.warranty?.label ?? null;
    }
    const p = tehranParts(shopperNow);
    const scenario = row.scenario ? { name: row.scenario, batchOrdinal: row.batch_ordinal ?? 1, index: row.batch_index ?? 0 } : null;
    const pr = product as unknown as { minPrice?: number | null; maxPrice?: number | null } | null;
    return {
      seed: scenario ? `${scenario.name}:${scenario.batchOrdinal}:${scenario.index}:${row.attempts}` : `${row.id}:${row.attempts}`,
      attempt: row.attempts,
      questions: json<InquiryQuestion[]>(row.questions, []),
      customQuestion: row.custom_question,
      variant: json<{ key: string; value: string }[]>(row.variant, []),
      productTitle: product?.title ?? null,
      priceRange: pr ? { min: pr.minPrice ?? null, max: pr.maxPrice ?? null } : null,
      registered: { price: reg?.price ?? null, fresh: reg?.freshness === 'fresh' || reg?.freshness === 'recent' },
      warranty,
      shop: this.simShop(row, shop, shopperNow),
      nowMin: p.minutes,
      weekday: p.weekday,
      budgetMax: ctx.budgetMax ?? null,
      scenario,
      forcedWhileClosed,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, Math.max(0, ms)));
  }

  async runAttempt(id: string, payload: AttemptPayload = {}): Promise<void> {
    const row = this.store.get(id);
    if (!row || FINAL.has(row.status) || row.status === 'awaiting_seller' || this.running.has(id)) return;
    const shop = this.shopOf(row);
    if (!shop) return;
    const shopperNow = this.shopperNow(row);
    const os = this.deps.services.openStatus(row.shop_id, shopperNow);
    const closedByHours = os.state === 'closed' || os.state === 'opens_later_today';

    // CT2: never dial a shop that is closed by its registered hours (unless forced / demo call-now).
    if (closedByHours && !payload.callNow && !row.force) {
      const opening = this.nextOpening(os, shopperNow);
      if (opening) {
        this.scheduleAtOpen(row, opening, shopperNow);
        return;
      }
    }

    const run = { aborted: false };
    this.running.set(id, run);
    try {
      row.attempts += 1;
      this.store.update(id, { attempts: row.attempts, next_attempt_at: null }, this.iso());
      this.setStatus(row, 'calling', {}, null, STATUS_TEXT.calling(shop.name));
      this.emitUpdate(id);

      const input = this.simInput(row, shop, shopperNow, closedByHours && !payload.callNow && !!row.force);
      const decision = decide(input);
      const pace = rng(`${input.seed}:t`);
      await this.sleep(this.scaled(pace.int(2000, 4000)));
      if (run.aborted) return;
      this.line(row, 'line', 'system', STATUS_TEXT.ringing);
      await this.sleep(this.scaled(pace.int(900, 1600)));
      if (run.aborted) return;

      if (decision.outcome === 'no_answer' || decision.outcome === 'busy' || decision.outcome === 'closed') {
        const text = decision.outcome === 'no_answer' ? STATUS_TEXT.noAnswer : decision.outcome === 'busy' ? STATUS_TEXT.busy : STATUS_TEXT.closedNoPickup;
        this.setStatus(row, decision.outcome, {}, null, text);
        this.handleMiss(row, shop, decision.outcome, os, shopperNow);
        return;
      }

      // Picked up.
      this.setStatus(row, 'in_call', {}, null);
      this.emitUpdate(id);
      let lines = transcript(input, decision);
      if (this.settings.llmRephrase && !row.scenario && this.deps.config.llmEnabled) {
        lines = (await rephraseLines(this.deps.config, lines)) ?? lines;
        if (run.aborted) return;
      }
      for (const l of lines) {
        this.line(row, 'line', l.speaker, l.text);
        await this.sleep(this.scaled(pace.int(900, 1600)));
        if (run.aborted) return;
      }

      if (decision.outcome === 'callback' && decision.callbackAt) {
        const promised = tehranInstant(shopperNow, hhmmToMinutes(decision.callbackAt));
        const retryShopper = new Date(promised.getTime() + 10 * 60_000);
        const realAt = new Date(retryShopper.getTime() - (row.clock_offset_ms ?? 0));
        const note = callbackNote(dayClock(promised, shopperNow).replace(/^ساعت /, ''), dayClock(retryShopper, shopperNow));
        this.setStatus(row, 'callback_promised', { next_attempt_at: realAt.toISOString() }, note);
        if (row.attempts >= row.max_attempts) this.store.update(id, { max_attempts: row.attempts + 1 }, this.iso());
        this.store.enqueue('inquiry.attempt', id, realAt.toISOString());
        this.emitUpdate(id);
        if (row.batch_id) this.checkBatch(row.batch_id);
        return;
      }

      const result = decision.result!;
      this.setStatus(row, 'answered', { result: JSON.stringify(result), result_source: 'simulated_call' }, null);
      this.line(row, 'result', 'system', result.summary, { result, source: 'simulated_call', simulated: true });
      const altReason: AltReason | null = result.stock === 'out_of_stock' ? 'out_of_stock' : result.overBudget ? 'over_budget' : null;
      let alts: AlternativesResponse | null = null;
      if (altReason) alts = this.computeAlternatives(row, altReason);
      if (run.aborted) return;
      this.setStatus(row, 'resolved', alts ? { alternatives: JSON.stringify(alts) } : {}, null);
      const tone = result.stock === 'out_of_stock' || result.overBudget || (result.priceDeltaPct ?? 0) > 5 ? 'warn' : 'good';
      this.notify(row, shop.name, result.summary, tone);
      this.emitUpdate(id);
      if (row.batch_id) this.checkBatch(row.batch_id);
    } finally {
      this.running.delete(id);
    }
  }

  private scheduleAtOpen(row: InquiryRow, opening: Date, shopperNow: Date): void {
    const extraMin = rng(`${row.id}:open`).int(5, 10);
    const shopperAt = new Date(opening.getTime() + extraMin * 60_000);
    const realAt = new Date(shopperAt.getTime() - (row.clock_offset_ms ?? 0));
    const note = scheduledAtOpenNote(dayClock(shopperAt, shopperNow));
    this.line(row, 'line', 'system', STATUS_TEXT.closedByHours);
    this.setStatus(row, 'scheduled_at_open', { next_attempt_at: realAt.toISOString() }, note);
    this.store.enqueue('inquiry.attempt', row.id, realAt.toISOString());
    this.emitUpdate(row.id);
    if (row.batch_id) this.checkBatch(row.batch_id);
  }

  private handleMiss(row: InquiryRow, shop: ShopLite, outcome: 'no_answer' | 'busy' | 'closed', os: OpenStatus, shopperNow: Date): void {
    if (outcome === 'closed') {
      const opening = this.nextOpening(os, shopperNow);
      if (opening && row.attempts < row.max_attempts) {
        this.scheduleAtOpen(row, opening, shopperNow);
        return;
      }
    }
    if (row.attempts < row.max_attempts) {
      const delayMs = this.scaled(this.settings.retrySeconds * 1000 * Math.pow(1.5, row.attempts - 1));
      const realAt = new Date(this.now().getTime() + delayMs);
      const shopperAt = new Date(realAt.getTime() + (row.clock_offset_ms ?? 0));
      const when = dayClock(shopperAt, shopperNow);
      this.setStatus(row, 'retry_scheduled', { next_attempt_at: realAt.toISOString() }, retryNote(when));
      this.store.enqueue('inquiry.attempt', row.id, realAt.toISOString());
      this.notify(row, `${shop.name} پاسخ نداد`, `${minutesWord(Math.max(1, Math.round(delayMs / 60_000)))} دیگر دوباره تماس می‌گیرم.`, 'info');
      this.emitUpdate(row.id);
      if (row.batch_id) this.firstMiss(row, shop, when);
      if (row.batch_id) this.checkBatch(row.batch_id);
      return;
    }
    const alts = this.computeAlternatives(row, outcome === 'closed' ? 'closed' : 'unreachable');
    const k = alts ? alts.sameProduct.length + alts.samePassage.length : 0;
    this.setStatus(row, 'unreachable', { next_attempt_at: null, alternatives: alts ? JSON.stringify(alts) : null }, unreachableNote(k));
    if (alts) this.line(row, 'alternatives', 'system', alts.headline, { count: k });
    this.notify(row, `${shop.name} در دسترس نبود`, k ? `${k.toLocaleString('fa-IR')} جایگزین پیدا شد.` : 'پیام شما در صندوق فروشنده می‌ماند.', 'bad');
    this.emitUpdate(row.id);
    if (row.batch_id) this.checkBatch(row.batch_id);
  }

  computeAlternatives(row: InquiryRow, reason: AltReason): AlternativesResponse | null {
    try {
      const alts = this.deps.services.alternatives({
        productId: row.product_id ?? undefined,
        shopId: row.shop_id,
        reason,
        context: this.ctxOf(row),
      });
      if (alts) this.line(row, 'alternatives', 'system', alts.headline, { reason, count: alts.sameProduct.length + alts.samePassage.length });
      return alts;
    } catch (err) {
      this.deps.log.warn('alternatives failed', { err: err as Error, inquiryId: row.id });
      return null;
    }
  }

  // ───────────────────────── digest (CT1) ─────────────────────────

  private postAssistant(sessionId: string, batchId: string, text: string, quickReplies: { label: string; message: string }[]): void {
    const id = randomUUID();
    const at = this.iso();
    const blocks = quickReplies.length ? [{ kind: 'quick_replies' as const, options: quickReplies }] : [];
    this.deps.state.run(
      `INSERT INTO chat_messages (id, session_id, role, text, blocks, llm_messages, mode, created_at) VALUES (?, ?, 'assistant', ?, ?, NULL, 'rules', ?)`,
      id,
      sessionId,
      text,
      JSON.stringify(blocks),
      at,
    );
    this.deps.bus.publishSession(sessionId, {
      type: 'assistant.message',
      sessionId,
      message: { id, role: 'assistant', text, blocks, createdAt: at, mode: 'rules' },
    });
    this.deps.log.debug('assistant digest posted', { batchId });
  }

  private firstMiss(row: InquiryRow, shop: ShopLite, when: string): void {
    const batch = this.store.byBatch(row.batch_id!);
    if (batch.length < 2) return;
    if (!batch.some((r) => r.id !== row.id && ACTIVE.has(r.status))) return; // the digest will cover it
    if (!this.store.markFirstMiss(row.batch_id!)) return;
    this.postAssistant(row.session_id, row.batch_id!, composeFirstMiss(shop.name, when), []);
  }

  checkBatch(batchId: string): void {
    const rows = this.store.byBatch(batchId);
    if (!rows.length || rows.some((r) => ACTIVE.has(r.status))) return;
    const batch = this.store.batch(batchId);
    if (!batch || batch.digest_count >= 4) return;
    const allFinal = rows.every((r) => FINAL.has(r.status));
    if (batch.digest_count >= 1 && !allFinal) return;
    const items = rows.flatMap((r) => this.toDto(r, false) ?? []);
    if (items.every((i) => i.status === 'cancelled')) return;
    const d = composeDigest(items, { update: batch.digest_count > 0, now: new Date(this.now().getTime() + (rows[0]!.clock_offset_ms ?? 0)) });
    if (d.hash === batch.digest_hash) return;
    this.store.setDigest(batchId, d.hash);
    this.postAssistant(batch.session_id, batchId, d.text, d.quickReplies);
  }

  // ───────────────────────── seller stats ─────────────────────────

  sellerStats(shopId: string): { askedToday: number; pending: number; staleOffers: number } {
    const now = this.now();
    const midnight = tehranInstant(now, 0).toISOString();
    const asked = this.deps.state.get<{ n: number }>(
      `SELECT count(DISTINCT session_id) AS n FROM inquiries WHERE shop_id = ? AND created_at >= ?`,
      shopId,
      midnight,
    );
    const pending = this.deps.state.get<{ n: number }>(
      `SELECT count(*) AS n FROM inquiries WHERE shop_id = ? AND status NOT IN ('resolved','unreachable','cancelled')`,
      shopId,
    );
    let stale = 0;
    try {
      const prods = this.deps.services.getShopProducts(shopId, { limit: 100 }, {});
      stale = prods.items.filter((i) => (i.price.ageDays ?? 0) > 30).length;
    } catch {
      /* ignore */
    }
    return { askedToday: asked?.n ?? 0, pending: pending?.n ?? 0, staleOffers: stale };
  }

  /** Shops that have been asked about (most recent first). */
  askedShopIds(limit = 20): string[] {
    return this.deps.state
      .all<{ shop_id: string }>(`SELECT shop_id, max(created_at) AS t FROM inquiries GROUP BY shop_id ORDER BY t DESC LIMIT ?`, limit)
      .map((r) => r.shop_id);
  }
}

