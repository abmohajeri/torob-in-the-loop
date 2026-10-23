/**
 * Minimal fetch-based OpenAI-compatible client (chat completions streaming + tool calls, audio transcription).
 * No SDK dependency; works with Liara AI / OpenRouter-style gateways.
 */

export interface LlmToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: LlmToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlmToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface LlmRequest {
  model: string;
  messages: LlmMessage[];
  tools?: LlmToolDef[];
  temperature?: number;
  maxTokens?: number;
  toolChoice?: 'auto' | 'none';
}

export interface LlmResult {
  content: string;
  toolCalls: LlmToolCall[];
  finishReason: string | null;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/** Combine an optional caller signal with a timeout. */
function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new LlmError(`LLM timeout after ${ms} ms`)), ms);
  const onAbort = () => ctrl.abort(signal?.reason ?? new Error('aborted'));
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    clear: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** Incremental SSE parser: feed text chunks, get `data:` payloads (multi-line data joined by \n). */
export class SseParser {
  private buf = '';
  push(chunk: string): string[] {
    this.buf += chunk.replace(/\r\n?/g, '\n');
    const out: string[] = [];
    let idx: number;
    while ((idx = this.buf.indexOf('\n\n')) >= 0) {
      const frame = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + 2);
      const data = frame
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (data) out.push(data);
    }
    return out;
  }
  /** Flush a trailing frame without the final blank line. */
  end(): string[] {
    const rest = this.buf;
    this.buf = '';
    return rest.trim() ? this.push(`${rest}\n\n`) : [];
  }
}

interface DeltaToolCall {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/** Assembles streamed tool-call fragments (by index) into complete calls. */
export class ToolCallAssembler {
  private calls = new Map<number, { id: string; name: string; args: string }>();
  add(deltas: DeltaToolCall[]): void {
    for (const d of deltas) {
      const i = d.index ?? (d.id ? [...this.calls.values()].findIndex((c) => c.id === d.id) : -1);
      const key = i >= 0 ? i : this.calls.size;
      const cur = this.calls.get(key) ?? { id: '', name: '', args: '' };
      if (d.id) cur.id = d.id;
      if (d.function?.name) cur.name += d.function.name;
      if (d.function?.arguments) cur.args += d.function.arguments;
      this.calls.set(key, cur);
    }
  }
  result(): LlmToolCall[] {
    return [...this.calls.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, c]) => c.name)
      .map(([i, c]) => ({ id: c.id || `call_${i}`, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } }));
  }
}

export interface LlmClientOptions {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

export class LlmClient {
  private fetch: typeof fetch;
  constructor(private opts: LlmClientOptions) {
    this.fetch = opts.fetchImpl ?? fetch;
  }

  private body(req: LlmRequest, stream: boolean): string {
    const b: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream,
      temperature: req.temperature ?? 0.3,
    };
    if (req.maxTokens) b[tokenLimitParam(req.model)] = req.maxTokens;
    if (req.tools?.length) {
      b.tools = req.tools;
      b.tool_choice = req.toolChoice ?? 'auto';
    }
    return JSON.stringify(b);
  }

  /** Streaming chat completion. `onText` receives content deltas as they arrive. */
  async stream(req: LlmRequest, onText: (delta: string) => void, signal?: AbortSignal): Promise<LlmResult> {
    const t = withTimeout(signal, this.opts.timeoutMs);
    try {
      const res = await this.fetch(joinUrl(this.opts.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}`, accept: 'text/event-stream' },
        body: this.body(req, true),
        signal: t.signal,
      });
      if (!res.ok || !res.body) {
        const txt = await res.text().catch(() => '');
        throw new LlmError(`LLM HTTP ${res.status}: ${txt.slice(0, 300)}`, res.status);
      }
      const ctype = res.headers.get('content-type') ?? '';
      if (ctype.includes('application/json')) {
        // Gateway ignored stream:true — handle a plain completion.
        return parseCompletion(await res.json(), onText);
      }
      const parser = new SseParser();
      const tools = new ToolCallAssembler();
      const decoder = new TextDecoder();
      let content = '';
      let finish: string | null = null;
      const handle = (data: string) => {
        if (data === '[DONE]') return;
        let j: any;
        try {
          j = JSON.parse(data);
        } catch {
          return;
        }
        if (j.error) throw new LlmError(`LLM stream error: ${JSON.stringify(j.error).slice(0, 300)}`);
        const ch = j.choices?.[0];
        if (!ch) return;
        const d = ch.delta ?? ch.message ?? {};
        if (typeof d.content === 'string' && d.content) {
          content += d.content;
          onText(d.content);
        }
        if (Array.isArray(d.tool_calls)) tools.add(d.tool_calls);
        if (ch.finish_reason) finish = ch.finish_reason;
      };
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const d of parser.push(decoder.decode(value, { stream: true }))) handle(d);
      }
      for (const d of parser.end()) handle(d);
      return { content, toolCalls: tools.result(), finishReason: finish };
    } catch (e) {
      if (t.signal.aborted && !(e instanceof LlmError)) {
        const r = t.signal.reason;
        throw r instanceof LlmError ? r : new LlmError('LLM request aborted');
      }
      throw e instanceof LlmError ? e : new LlmError(`LLM request failed: ${(e as Error).message}`);
    } finally {
      t.clear();
    }
  }

  /** Non-streaming completion (used for short verdicts). */
  async complete(req: LlmRequest, signal?: AbortSignal): Promise<LlmResult> {
    const t = withTimeout(signal, this.opts.timeoutMs);
    try {
      const res = await this.fetch(joinUrl(this.opts.baseUrl, 'chat/completions'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.opts.apiKey}` },
        body: this.body(req, false),
        signal: t.signal,
      });
      if (!res.ok) throw new LlmError(`LLM HTTP ${res.status}`, res.status);
      return parseCompletion(await res.json(), () => {});
    } catch (e) {
      throw e instanceof LlmError ? e : new LlmError(`LLM request failed: ${(e as Error).message}`);
    } finally {
      t.clear();
    }
  }

  /** OpenAI-compatible speech-to-text. */
  async transcribe(audio: Blob, filename: string, model: string, signal?: AbortSignal): Promise<string> {
    const t = withTimeout(signal, this.opts.timeoutMs);
    try {
      const form = new FormData();
      form.append('file', audio, filename);
      form.append('model', model);
      form.append('language', 'fa');
      const res = await this.fetch(joinUrl(this.opts.baseUrl, 'audio/transcriptions'), {
        method: 'POST',
        headers: { authorization: `Bearer ${this.opts.apiKey}` },
        body: form,
        signal: t.signal,
      });
      if (!res.ok) throw new LlmError(`STT HTTP ${res.status}`, res.status);
      const j = (await res.json()) as { text?: string };
      return (j.text ?? '').trim();
    } finally {
      t.clear();
    }
  }
}

function parseCompletion(j: any, onText: (d: string) => void): LlmResult {
  const ch = j?.choices?.[0];
  const msg = ch?.message ?? {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (content) onText(content);
  const toolCalls: LlmToolCall[] = Array.isArray(msg.tool_calls)
    ? msg.tool_calls.map((c: any, i: number) => ({
        id: c.id ?? `call_${i}`,
        type: 'function' as const,
        function: { name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' },
      }))
    : [];
  return { content, toolCalls, finishReason: ch?.finish_reason ?? null };
}

/** OpenAI GPT-5 / o-series models reject `max_tokens` and require `max_completion_tokens`. */
export function tokenLimitParam(model: string): 'max_tokens' | 'max_completion_tokens' {
  return /(^|\/)(gpt-5|o\d)/i.test(model) ? 'max_completion_tokens' : 'max_tokens';
}
