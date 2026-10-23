import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LlmClient, LlmError, SseParser, ToolCallAssembler, joinUrl } from '../src/agent/llm.js';
import { FactGuard } from '../src/agent/orchestrator.js';
import { startMockLlm, type MockLlm } from '../scripts/mock-llm.js';

describe('SSE parser', () => {
  it('splits frames across arbitrary chunk boundaries and joins multi-line data', () => {
    const p = new SseParser();
    const raw = 'data: {"a":1}\n\n: comment\ndata: x\ndata: y\n\nevent: e\r\ndata: [DONE]\r\n\r\n';
    const out: string[] = [];
    for (let i = 0; i < raw.length; i += 3) out.push(...p.push(raw.slice(i, i + 3)));
    out.push(...p.end());
    expect(out).toEqual(['{"a":1}', 'x\ny', '[DONE]']);
  });

  it('flushes a trailing frame without the final blank line', () => {
    const p = new SseParser();
    expect(p.push('data: 1')).toEqual([]);
    expect(p.end()).toEqual(['1']);
  });
});

describe('tool-call assembly', () => {
  it('assembles fragmented calls by index, in order', () => {
    const a = new ToolCallAssembler();
    a.add([{ index: 1, id: 'b', function: { name: 'find_', arguments: '' } }]);
    a.add([{ index: 0, id: 'a', function: { name: 'search_products', arguments: '{"que' } }]);
    a.add([{ index: 1, function: { name: 'stores', arguments: '{"product_id":"P1"}' } }]);
    a.add([{ index: 0, function: { arguments: 'ry":"کتونی"}' } }]);
    expect(a.result()).toEqual([
      { id: 'a', type: 'function', function: { name: 'search_products', arguments: '{"query":"کتونی"}' } },
      { id: 'b', type: 'function', function: { name: 'find_stores', arguments: '{"product_id":"P1"}' } },
    ]);
  });

  it('joinUrl tolerates trailing/leading slashes', () => {
    expect(joinUrl('https://ai.liara.ir/api/v1/abc/', 'chat/completions')).toBe('https://ai.liara.ir/api/v1/abc/chat/completions');
    expect(joinUrl('https://ai.liara.ir/api/v1/abc', '/chat/completions')).toBe('https://ai.liara.ir/api/v1/abc/chat/completions');
  });
});

describe('LlmClient against mock OpenAI-compatible server', () => {
  let mock: MockLlm;
  beforeAll(async () => {
    mock = await startMockLlm();
  });
  afterAll(() => mock.close());

  it('streams text deltas and assembles tool calls (base URL with trailing slash)', async () => {
    mock.script.push({ content: 'سلام! در حال جستجو هستم.', toolCalls: [{ name: 'search_products', args: { query: 'گوشی سامسونگ A07', budget_max: 45_000_000 } }] });
    const c = new LlmClient({ baseUrl: `${mock.url}/`, apiKey: 'test-key', timeoutMs: 5000 });
    const deltas: string[] = [];
    const r = await c.stream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools: [] }, (d) => deltas.push(d));
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).toBe('سلام! در حال جستجو هستم.');
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0]!.function.name).toBe('search_products');
    expect(JSON.parse(r.toolCalls[0]!.function.arguments)).toEqual({ query: 'گوشی سامسونگ A07', budget_max: 45_000_000 });
    expect(r.finishReason).toBe('tool_calls');
    expect(mock.requests.at(-1).stream).toBe(true);
  });

  it('handles a gateway that ignores stream:true (plain JSON)', async () => {
    mock.script.push({ content: 'باشه.', json: true });
    const c = new LlmClient({ baseUrl: mock.url, apiKey: 'test-key', timeoutMs: 5000 });
    const r = await c.stream({ model: 'm', messages: [{ role: 'user', content: 'x' }] }, () => {});
    expect(r.content).toBe('باشه.');
  });

  it('raises LlmError on HTTP errors and on timeout', async () => {
    mock.script.push({ status: 500 });
    const c = new LlmClient({ baseUrl: mock.url, apiKey: 'test-key', timeoutMs: 300 });
    await expect(c.stream({ model: 'm', messages: [] }, () => {})).rejects.toBeInstanceOf(LlmError);
    mock.script.push({ delayMs: 1000, content: 'دیر' });
    await expect(c.stream({ model: 'm', messages: [] }, () => {})).rejects.toThrow(/timeout/);
  });

  it('aborts when the caller signal fires', async () => {
    mock.script.push({ delayMs: 800, content: 'x' });
    const c = new LlmClient({ baseUrl: mock.url, apiKey: 'test-key', timeoutMs: 5000 });
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 50);
    await expect(c.stream({ model: 'm', messages: [] }, () => {}, ctrl.signal)).rejects.toBeInstanceOf(LlmError);
  });

  it('transcribes audio via /audio/transcriptions', async () => {
    const c = new LlmClient({ baseUrl: mock.url, apiKey: 'test-key', timeoutMs: 5000 });
    const t = await c.transcribe(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }), 'a.webm', 'openai/whisper-large-v3');
    expect(t).toContain('سامسونگ');
  });
});

describe('fact guard', () => {
  it('drops sentences with numbers not present in tool payloads', () => {
    const g = new FactGuard();
    g.allow('{"price":42600000,"km":1.2,"open":"باز است تا ۱۹:۰۰","sellers":27}');
    const out = g.push('۲۷ فروشنده پیدا شد. ارزان‌ترین ۴۲٫۶ میلیون است. قیمت ۹۹ میلیون است. تا ۱۹:۰۰ باز است.\n') + g.flush();
    expect(out).toContain('۲۷ فروشنده');
    expect(out).toContain('۴۲٫۶ میلیون');
    expect(out).toContain('۱۹:۰۰');
    expect(out).not.toContain('۹۹');
  });

  it('drops «verified price» wording when nothing was verified', () => {
    const g = new FactGuard();
    g.allow('{"price":42600000}');
    const out = g.push('قیمت تأییدشده ۴۲٫۶ میلیون است. سه فروشگاه نزدیک‌اند. ') + g.flush();
    expect(out).not.toContain('تأییدشده');
    expect(out).toContain('سه فروشگاه');
  });
});
