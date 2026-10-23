/**
 * One chat turn: LLM tool-calling loop (≤ LLM_MAX_STEPS) with blocks-first preflight (AG1), a numeric fact
 * guard (AG2), context patches and persistence. Falls back to the deterministic rules assistant per turn.
 */
import { toLatinDigits, type AgentEvent, type ChatRequest, type UIBlock, type UserContext } from '@titl/shared';
import type { AgentDeps } from '../deps.js';
import { weekendInsight } from './insights.js';
import { LlmClient, type LlmMessage } from './llm.js';
import { ChatStore, type AgentMemory } from './memory.js';
import { buildSystemPrompt } from './prompt.js';
import { detectIntent, runRules } from './rules.js';
import { TOOL_DEFS, TOOL_STATUS, parseArgs, runTool, type ToolEnv } from './tools.js';

export interface OrchestratorOptions {
  /** Injected clock (tests). */
  now?: () => Date;
  llm?: LlmClient | null;
}

type QuickReply = { label: string; message: string };

// ───────────────────────── fact guard ─────────────────────────

const NUM_RE = /\d+(?:[.,٫٬]\d+)*/g;

function numsIn(s: string): string[] {
  return (toLatinDigits(s).match(NUM_RE) ?? []).map((x) => x.replace(/[٬,]/g, '').replace('٫', '.'));
}

/** Collects numbers that tool payloads justify (incl. «۴۲٫۶ میلیون»-style scaled forms). */
export class FactGuard {
  private allowed = new Set<string>();
  private verified = false;
  private buf = '';

  allow(text: string): void {
    if (/"verified":\{|"result":"(?!null)|تأییدشده در استعلام/.test(text)) this.verified = true;
    for (const raw of numsIn(text)) {
      this.allowed.add(raw);
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      this.allowed.add(String(n));
      for (const div of [1e3, 1e6, 1e9]) {
        if (n >= div) {
          const v = n / div;
          this.allowed.add(String(Math.round(v)));
          this.allowed.add(String(Math.round(v * 10) / 10));
          this.allowed.add(String(Math.floor(v)));
        }
      }
    }
  }

  ok(sentence: string): boolean {
    // Models sometimes narrate tool calls or re-list the quick-reply chips in prose; the UI already shows those.
    if (/^\s*\[\s*[a-z_]+\s*[:\]]/i.test(sentence) || /\b(suggest_replies|update_preferences|search_products|find_stores)\b/.test(sentence)) return false;
    if (/^\s*(\*\*)?\s*پیشنهاد(‌| )?(های)? ?بعدی/.test(sentence)) return false;
    for (const raw of numsIn(sentence)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n <= 10) continue;
      if (!this.allowed.has(raw) && !this.allowed.has(String(n))) return false;
    }
    if (!this.verified && /قیمت/.test(sentence) && /(تأیید ?شده|تایید ?شده|قیمت (امروز|الان|به‌روز))/.test(sentence)) return false;
    return true;
  }

  /** Feed streamed text; returns the sentences that are safe to show. */
  push(delta: string): string {
    this.buf += delta;
    let out = '';
    for (;;) {
      // A sentence ends at a newline, or at .!؟?… followed by whitespace (so «4.5» is never split).
      const m = /[.!؟?…]\s|\n/.exec(this.buf);
      if (!m) break;
      const end = m.index + m[0].length;
      const sentence = this.buf.slice(0, end);
      this.buf = this.buf.slice(end);
      if (this.ok(sentence)) out += sentence;
    }
    return out;
  }

  flush(): string {
    const rest = this.buf;
    this.buf = '';
    return rest.trim() && this.ok(rest) ? rest : '';
  }
}

// ───────────────────────── orchestrator ─────────────────────────

export class Orchestrator {
  readonly store: ChatStore;
  private llm: LlmClient | null;
  private now: () => Date;

  constructor(
    private deps: AgentDeps,
    opts: OrchestratorOptions = {},
  ) {
    this.store = new ChatStore(deps.state);
    this.now = opts.now ?? (() => new Date());
    const c = deps.config;
    this.llm =
      opts.llm !== undefined
        ? opts.llm
        : c.llmEnabled && c.LLM_BASE_URL && c.LLM_API_KEY
          ? new LlmClient({ baseUrl: c.LLM_BASE_URL, apiKey: c.LLM_API_KEY, timeoutMs: c.LLM_TIMEOUT_MS })
          : null;
  }

  get llmClient(): LlmClient | null {
    return this.llm;
  }

  async chat(req: ChatRequest, emit: (ev: AgentEvent) => void, signal: AbortSignal): Promise<void> {
    const sessionId = req.sessionId;
    const message = req.message.trim().slice(0, 1000);
    let mem: AgentMemory;
    let history;
    try {
      mem = this.store.loadMemory(sessionId);
      history = this.store.digests(sessionId, 8);
      this.store.addMessage({ sessionId, role: 'user', text: message });
    } catch (e) {
      this.deps.log.error('chat state failed', { err: e as Error });
      emit({ type: 'error', message: 'ذخیره‌سازی گفتگو با خطا روبه‌رو شد؛ دوباره تلاش کنید.' });
      return;
    }

    const ctx: UserContext = { ...(req.context ?? {}) };
    const env: ToolEnv = { deps: this.deps, sessionId, ctx, mem, now: this.now(), signal };
    const blocks: UIBlock[] = [];
    const seen = new Set<string>();
    let quickReplies: QuickReply[] = [];
    let text = '';
    const digests: string[] = [];

    const safeEmit = (ev: AgentEvent) => {
      if (!signal.aborted) emit(ev);
    };
    const pushBlock = (b: UIBlock) => {
      if (b.kind === 'quick_replies') {
        quickReplies = b.options;
        return;
      }
      const key = JSON.stringify(b);
      if (seen.has(key)) return;
      seen.add(key);
      blocks.push(b);
      safeEmit({ type: 'block', block: b });
    };
    const pushPatch = (p: Partial<UserContext>) => {
      if (Object.keys(p).length) safeEmit({ type: 'context', patch: p });
    };
    const pushText = (d: string) => {
      if (!d) return;
      text += d;
      safeEmit({ type: 'text', delta: d });
    };

    let mode: 'llm' | 'rules' = 'rules';
    if (this.llm && !(message.length === 0)) {
      try {
        await this.runLlm(env, message, history, { pushBlock, pushPatch, pushText, digests, status: (t) => safeEmit({ type: 'status', text: t }) });
        mode = 'llm';
      } catch (e) {
        if (signal.aborted) return;
        this.deps.log.warn('llm turn failed; using rules', { err: e as Error });
        if (text.trim()) mode = 'llm';
      }
    }
    if (mode === 'rules') {
      try {
        const r = await runRules(env, message, {
          status: (t) => safeEmit({ type: 'status', text: t }),
          block: pushBlock,
          patch: pushPatch,
        });
        digests.push(...r.digests);
        if (!quickReplies.length) quickReplies = r.quickReplies;
        // Stream the reply in a few chunks so the UI feels alive.
        for (const part of r.text.split(/(?<=\n)/)) pushText(part);
      } catch (e) {
        this.deps.log.error('rules turn failed', { err: e as Error });
        pushText('متأسفانه الان نتوانستم درخواست را انجام دهم. لطفاً دوباره بپرسید یا جملهٔ ساده‌تری بنویسید.');
      }
    }
    if (!text.trim() && blocks.length) pushText('نتیجه را در کارت‌های زیر می‌بینید.');
    if (!quickReplies.length) quickReplies = defaultReplies(mem);
    if (quickReplies.length) {
      const qr: UIBlock = { kind: 'quick_replies', options: quickReplies.slice(0, 4) };
      blocks.push(qr);
      safeEmit({ type: 'block', block: qr });
    }

    let messageId = '';
    try {
      this.store.saveMemory(sessionId, mem);
      messageId = this.store.addMessage({ sessionId, role: 'assistant', text: text.trim(), blocks, tools: digests, mode }).id;
    } catch (e) {
      this.deps.log.error('chat persist failed', { err: e as Error });
    }
    safeEmit({ type: 'done', messageId, mode });
  }

  private async runLlm(
    env: ToolEnv,
    message: string,
    history: { role: 'user' | 'assistant'; text: string; tools?: string[] }[],
    out: {
      pushBlock: (b: UIBlock) => void;
      pushPatch: (p: Partial<UserContext>) => void;
      pushText: (d: string) => void;
      status: (t: string) => void;
      digests: string[];
    },
  ): Promise<void> {
    const llm = this.llm!;
    const cfg = this.deps.config;
    const guard = new FactGuard();
    guard.allow(message);
    guard.allow(JSON.stringify(env.ctx));

    let openInquiries = 0;
    try {
      openInquiries = this.deps.contact.listInquiries(env.sessionId).filter((i) => !['resolved', 'unreachable', 'cancelled'].includes(i.status)).length;
    } catch {
      /* ignore */
    }
    const brief = [weekendInsight(env.ctx, env.now)?.text, env.ctx.installment ? 'کاربر قسطی می‌خواهد' : null, openInquiries ? `${openInquiries} استعلام در جریان است` : null]
      .filter(Boolean)
      .join('؛ ');

    const messages: LlmMessage[] = [{ role: 'system', content: buildSystemPrompt({ now: env.now, ctx: env.ctx, mem: env.mem, openInquiries, brief }) }];
    for (const h of history) {
      if (h.role === 'user') messages.push({ role: 'user', content: h.text });
      else messages.push({ role: 'assistant', content: [h.text, ...(h.tools ?? [])].filter(Boolean).join('\n') || '—' });
    }
    messages.push({ role: 'user', content: message });

    const exec = async (id: string, name: string, args: Record<string, unknown>) => {
      const st = TOOL_STATUS[name];
      if (st) out.status(st);
      const r = await runTool(env, name, args);
      for (const b of r.blocks) out.pushBlock(b);
      if (r.patch) out.pushPatch(r.patch);
      if (r.digest) out.digests.push(r.digest);
      guard.allow(r.llm);
      return { role: 'tool' as const, tool_call_id: id, content: r.llm };
    };

    // AG1: blocks first — run the obvious search deterministically before the first LLM token.
    const det = detectIntent(message, { focusProduct: !!env.mem.focusProductId, shops: env.mem.lastShopIds.length > 0, inquiries: env.mem.lastInquiryIds.length > 0 });
    if (det.intent === 'search' && message.length >= 3) {
      const parsed = this.deps.services.parseQuery(message, env.ctx);
      if (parsed.category || parsed.brand) {
        const call = { id: 'pre_search', type: 'function' as const, function: { name: 'search_products', arguments: JSON.stringify({ query: message }) } };
        messages.push({ role: 'assistant', content: null, tool_calls: [call] });
        messages.push(await exec(call.id, 'search_products', { query: message }));
      }
    }

    let wrote = false;
    const onText = (d: string) => out.pushText(guard.push(d));
    for (let step = 0; step < cfg.LLM_MAX_STEPS; step++) {
      if (env.signal?.aborted) throw new Error('aborted');
      const res = await llm.stream({ model: cfg.LLM_MODEL, messages, tools: TOOL_DEFS, temperature: 0.3, maxTokens: 700 }, onText, env.signal);
      out.pushText(guard.flush());
      if (!res.toolCalls.length) return;
      messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls });
      for (const c of res.toolCalls) messages.push(await exec(c.id, c.function.name, parseArgs(c.function.arguments)));
      if (res.toolCalls.every((c) => c.function.name === 'suggest_replies') && (res.content.trim() || wrote)) return;
      if (res.content.trim()) wrote = true;
    }
    // Step budget exhausted → forced summary without tools.
    const res = await llm.stream({ model: cfg.LLM_MODEL, messages: [...messages, { role: 'user', content: 'خلاصهٔ کوتاه (حداکثر ۳ جمله) بنویس؛ ابزار دیگری صدا نزن.' }], temperature: 0.3, maxTokens: 300 }, onText, env.signal);
    void res;
    out.pushText(guard.flush());
  }
}

function defaultReplies(mem: AgentMemory): QuickReply[] {
  if (mem.lastInquiryIds.length) return [{ label: 'نتیجهٔ تماس‌ها؟', message: 'نتیجه تماس‌ها چی شد؟' }, { label: 'برنامهٔ بازدید', message: 'برنامه بازدید' }];
  if (mem.lastShopIds.length)
    return [
      { label: 'از ۳ فروشگاه اول بپرس', message: 'از ۳ فروشگاه اول بپرس' },
      { label: 'مقایسهٔ فروشگاه‌ها', message: 'مقایسه فروشگاه‌ها' },
      { label: 'برنامهٔ بازدید', message: 'برنامه بازدید' },
    ];
  if (mem.lastProductIds.length)
    return [
      { label: 'فروشنده‌های گزینهٔ ۱', message: 'فروشنده‌های گزینه ۱ کجا هستند؟' },
      { label: 'مقایسهٔ دو گزینهٔ اول', message: 'مقایسه دو گزینه اول' },
    ];
  return [];
}
