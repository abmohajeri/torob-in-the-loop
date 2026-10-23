import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAgent } from '../src/agent/index.js';
import { startMockLlm, type MockLlm } from '../scripts/mock-llm.js';
import { agentDeps, fakeContact, hasCatalog, turn } from './helpers/agent.js';

const d = hasCatalog ? describe : describe.skip;

d('orchestrator (LLM mode against mock gateway)', () => {
  let mock: MockLlm;
  beforeAll(async () => {
    mock = await startMockLlm();
  });
  afterAll(() => mock.close());
  const llmEnv = (extra: Record<string, unknown> = {}) => ({ llmEnabled: true, LLM_BASE_URL: mock.url, LLM_API_KEY: 'test-key', ...extra }) as unknown as Record<string, string>;
  const SAT = { visitAt: '2026-10-24T08:00:00.000Z' };

  it('blocks first (preflight search), then scripted tool calls with handles, fact-guarded text, quick replies', async () => {
    mock.requests.length = 0;
    mock.script.push(
      { toolCalls: [{ name: 'find_stores', args: { product_id: 'P1' } }] },
      {
        content: 'فروشنده‌های حضوری این مدل را پیدا کردم. قیمت ثبت‌شدهٔ ارزان‌ترین ۹۹۹ میلیون است. پیش از رفتن می‌توانم بپرسم.',
        toolCalls: [{ name: 'suggest_replies', args: { options: [{ label: 'بپرس', message: 'از ۳ فروشگاه اول بپرس' }] } }],
      },
    );
    const agent = createAgent(agentDeps(fakeContact().contact, llmEnv()));
    expect(agent.llmEnabled()).toBe(true);
    const r = await turn(agent, 'o-1', 'گوشی سامسونگ A07', SAT);
    expect(r.done?.mode).toBe('llm');
    // Products block arrives before any text.
    const firstBlock = r.events.findIndex((e) => e.type === 'block');
    const firstText = r.events.findIndex((e) => e.type === 'text');
    expect(firstBlock).toBeGreaterThanOrEqual(0);
    expect(firstBlock).toBeLessThan(firstText);
    expect(r.kinds.slice(0, 2)).toEqual(['products', 'stores']);
    expect(r.kinds.at(-1)).toBe('quick_replies');
    expect(r.text).toContain('فروشنده‌های حضوری این مدل را پیدا کردم.');
    expect(r.text).not.toContain('۹۹۹'); // fabricated number dropped
    expect(r.text).toContain('می‌توانم بپرسم');
    expect(r.events.some((e) => e.type === 'status' && e.text.includes('فروشنده'))).toBe(true);

    const first = mock.requests[0];
    expect(first.model).toBe('m');
    expect(first.tools.map((t: any) => t.function.name)).toContain('contact_stores');
    expect(first.messages[0].content).toContain('Now in Tehran');
    expect(first.messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'pre_search' && m.content.includes('"h":"P1"'))).toBe(true);
    const second = mock.requests[1];
    expect(second.messages.at(-1).role).toBe('tool');
    expect(second.messages.at(-1).content).toContain('"h":"S1"');

    // History keeps a compact tool digest for the next turn.
    mock.script.push({ content: 'در خدمتم.' });
    await turn(agent, 'o-1', 'ممنون', SAT);
    const hist = mock.requests.at(-1).messages;
    expect(hist.some((m: any) => m.role === 'assistant' && m.content.includes('[ابزار find_stores'))).toBe(true);
  });

  it('unknown handle → tool error payload, not a crash', async () => {
    mock.requests.length = 0;
    mock.script.push({ toolCalls: [{ name: 'shop_info', args: { shop_id: 'S99' } }] }, { content: 'این فروشگاه را پیدا نکردم.' });
    const agent = createAgent(agentDeps(fakeContact().contact, llmEnv()));
    const r = await turn(agent, 'o-2', 'ساعت کاری فروشگاه اول', SAT);
    expect(r.done?.mode).toBe('llm');
    expect(mock.requests[1].messages.at(-1).content).toContain('error');
    expect(r.text).toContain('پیدا نکردم');
  });

  it('falls back to the rules assistant when the LLM fails', async () => {
    mock.script.push({ status: 500 });
    const agent = createAgent(agentDeps(fakeContact().contact, llmEnv()));
    const r = await turn(agent, 'o-3', 'سلام', SAT);
    expect(r.done?.mode).toBe('rules');
    expect(r.text).toContain('Torob in the Loop');
    expect(r.events.some((e) => e.type === 'error')).toBe(false);
  });

  it('stops after LLM_MAX_STEPS and forces a tool-less summary', async () => {
    mock.requests.length = 0;
    mock.script.push(
      { toolCalls: [{ name: 'nearby_areas', args: {} }] },
      { toolCalls: [{ name: 'nearby_areas', args: {} }] },
      { content: 'خلاصه: محدوده‌ها را در کارت‌ها می‌بینید.' },
    );
    const agent = createAgent(agentDeps(fakeContact().contact, llmEnv({ LLM_MAX_STEPS: 2 })));
    const r = await turn(agent, 'o-4', 'کجا برم؟', SAT);
    expect(mock.requests).toHaveLength(3);
    expect(mock.requests[2].tools).toBeUndefined();
    expect(r.text).toContain('خلاصه');
  });

  it('update_preferences emits a context patch (location resolved via places)', async () => {
    mock.script.push({ toolCalls: [{ name: 'update_preferences', args: { location_label: 'ونک', installment: true } }] }, { content: 'باشه، محدوده و شرط قسطی ثبت شد.' });
    const agent = createAgent(agentDeps(fakeContact().contact, llmEnv()));
    const r = await turn(agent, 'o-5', 'من ونک هستم و قسطی می‌خوام', SAT);
    const patch = Object.assign({}, ...r.events.filter((e) => e.type === 'context').map((e: any) => e.patch));
    expect(patch.installment).toBe(true);
    expect(patch.location.label).toContain('ونک');
  });

  it('compareVerdict uses the fast model; transcribe proxies STT', async () => {
    mock.requests.length = 0;
    mock.script.push({ content: 'اولی برای بودجهٔ کمتر مناسب‌تر است.', json: true });
    const deps = agentDeps(fakeContact().contact, llmEnv());
    const agent = createAgent(deps);
    const ids = deps.services.search({ q: 'گوشی سامسونگ', limit: 2 }, {}).items.map((p) => p.id);
    const data = deps.services.compareProducts(ids, {});
    const v = await agent.compareVerdict(data, {});
    expect(v).toContain('بودجه');
    expect(mock.requests[0].model).toBe('f');
    const t = await agent.transcribe(new Blob([new Uint8Array([1])]), 'a.webm');
    expect(t).toContain('سامسونگ');
  });

  it('without LLM config: rules mode, verdict/transcribe return null', async () => {
    const agent = createAgent(agentDeps(fakeContact().contact));
    expect(agent.llmEnabled()).toBe(false);
    expect(await agent.transcribe(new Blob([new Uint8Array([1])]), 'a.webm')).toBeNull();
  });
});
