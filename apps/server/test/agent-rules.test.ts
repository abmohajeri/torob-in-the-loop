import { describe, expect, it } from 'vitest';
import type { AgentEvent, Inquiry } from '@titl/shared';
import { createAgent } from '../src/agent/index.js';
import { detectIntent } from '../src/agent/rules.js';
import { agentDeps, fakeContact, hasCatalog, turn } from './helpers/agent.js';

const mem0 = { focusProduct: false, shops: false, inquiries: false };
const memAll = { focusProduct: true, shops: true, inquiries: true };

describe('rules intent detection (Persian)', () => {
  const cases: [string, string, typeof mem0?][] = [
    ['سلام', 'greet'],
    ['چی کار می‌کنی؟', 'greet'],
    ['مرسی', 'thanks'],
    ['رسیدم ولی بسته بود', 'alternatives'],
    ['جواب نداد', 'alternatives'],
    ['پیداش نکردم', 'alternatives'],
    ['گرون بود', 'alternatives'],
    ['تموم شده بود', 'alternatives'],
    ['از ۳ فروشگاه اول بپرس', 'contact'],
    ['زنگ بزن ببین دارن', 'contact'],
    ['هنوز دارن؟', 'contact_confirm', memAll],
    ['نتیجه تماس‌ها چی شد؟', 'status', memAll],
    ['برنامه بازدید', 'plan'],
    ['کجا اول برم؟', 'plan'],
    ['مقایسه فروشگاه‌ها', 'compare_stores'],
    ['مقایسه دو گزینه اول', 'compare_products'],
    ['کدوم بهتره؟', 'compare_products'],
    ['کجا بخرم؟', 'stores'],
    ['فروشنده‌های گزینه ۲ کجا هستند؟', 'stores'],
    ['کجا چند مدل کتانی را یک‌جا ببینم؟', 'need_stores'],
    ['تا کی بازه؟', 'hours'],
    ['طبقه چند است؟', 'mall'],
    ['پاساژ علاءالدین', 'mall'],
    ['کتونی می‌خوام، مدلش رو نمی‌دونم', 'choose'],
    ['گوشی سامسونگ A07 قسطی نزدیک جمهوری', 'search'],
    ['بدون فیلتر', 'preferences'],
  ];
  for (const [text, intent, mem] of cases) {
    it(`«${text}» → ${intent}`, () => {
      expect(detectIntent(text, mem ?? mem0).intent).toBe(intent);
    });
  }

  it('extracts reason, ordinal, count and questions', () => {
    expect(detectIntent('رسیدم ولی بسته بود', mem0).altReason).toBe('closed');
    expect(detectIntent('گرون‌تر بود', mem0).altReason).toBe('too_expensive');
    expect(detectIntent('فروشنده‌های گزینه ۲ کجا هستند؟', mem0).ordinal).toBe(2);
    expect(detectIntent('فروشنده‌های دومی', mem0).ordinal).toBe(2);
    const c = detectIntent('از دو فروشگاه اول موجودی و قسط را بپرس', mem0);
    expect(c.count).toBe(2);
    expect(c.questions).toEqual(['stock', 'installment']);
  });
});

const d = hasCatalog ? describe : describe.skip;

d('rules assistant on the real catalog', () => {
  const SAT = { visitAt: '2026-10-24T08:00:00.000Z', location: { lat: 35.6942, lng: 51.4132, label: 'خیابان جمهوری', source: 'place' as const } };

  it('greets with the 4-step intro and example quick replies', async () => {
    const agent = createAgent(agentDeps(fakeContact().contact));
    const r = await turn(agent, 'sess-greet', 'سلام');
    expect(r.text).toContain('Torob in the Loop');
    expect(r.text).toContain('مسیر بازدید');
    expect(r.kinds).toContain('quick_replies');
    expect(r.done?.mode).toBe('rules');
  });

  it('vague need → discovery + popular models; then stores of a product; contact; plan; closed → alternatives', async () => {
    const fc = fakeContact();
    const agent = createAgent(agentDeps(fc.contact));
    const sid = 'sess-journey';

    const r1 = await turn(agent, sid, 'گوشی می‌خوام، نمی‌دونم کدوم مدل', SAT);
    expect(r1.kinds).toContain('discovery');
    expect(r1.kinds).toContain('products');
    expect(r1.text).toMatch(/مدل/);

    const r2 = await turn(agent, sid, 'گوشی سامسونگ', SAT);
    expect(r2.kinds).toContain('products');
    expect(r2.text).toContain('قیمت ثبت‌شده');

    const r3 = await turn(agent, sid, 'فروشنده‌های گزینه ۱ کجا هستند؟', SAT);
    expect(r3.kinds).toContain('stores');
    expect(r3.text).toMatch(/فروشندهٔ حضوری/);
    expect(r3.text).toContain('پیشنهاد اول');
    const qr = r3.blocks.find((b) => b.kind === 'quick_replies');
    expect(qr && qr.kind === 'quick_replies' && qr.options.some((o) => o.message.includes('بپرس'))).toBe(true);

    const r4 = await turn(agent, sid, 'از ۲ فروشگاه اول بپرس', SAT);
    expect(fc.created).toHaveLength(1);
    expect(fc.created[0]!.shopIds).toHaveLength(2);
    expect(fc.created[0]!.questions).toEqual(expect.arrayContaining(['stock', 'price', 'hours']));
    expect(r4.kinds).toContain('inquiries');
    expect(r4.text).toContain('شبیه‌سازی‌شده');

    const r5 = await turn(agent, sid, 'برنامه بازدید', SAT);
    expect(r5.kinds).toContain('plan');
    expect(r5.text).toContain('برنامهٔ بازدید');

    const r6 = await turn(agent, sid, 'رسیدم ولی بسته بود', SAT);
    expect(r6.kinds).toContain('alternatives');
    expect(fc.reports[0]?.type).toBe('closed');

    // History is persisted with modes.
    const hist = agent.history(sid);
    expect(hist.filter((m) => m.role === 'user')).toHaveLength(6);
    expect(hist.at(-1)?.mode).toBe('rules');
    agent.reset(sid);
    expect(agent.history(sid)).toHaveLength(0);
  });

  it('preferences-only messages patch context («بودجه‌م ۳۰ میلیونه», «فقط قسطی», «من ونکم»)', async () => {
    const agent = createAgent(agentDeps(fakeContact().contact));
    const sid = 'sess-prefs';
    await turn(agent, sid, 'گوشی سامسونگ');
    const r1 = await turn(agent, sid, 'بودجه‌م ۳۰ میلیونه');
    const p1 = r1.events.find((e) => e.type === 'context') as Extract<AgentEvent, { type: 'context' }>;
    expect(p1.patch.budgetMax).toBe(30_000_000);
    expect(r1.kinds).toContain('products');
    const r2 = await turn(agent, sid, 'فقط قسطی');
    expect((r2.events.find((e) => e.type === 'context') as any).patch.installment).toBe(true);
    const r3 = await turn(agent, sid, 'من ونکم');
    const loc = (r3.events.find((e) => e.type === 'context') as any)?.patch.location;
    expect(loc?.label).toContain('ونک');
  });

  it('status digest recommends the cheapest verified in-stock shop', async () => {
    const fc = fakeContact();
    const agent = createAgent(agentDeps(fc.contact));
    const sid = 'sess-status';
    await turn(agent, sid, 'گوشی سامسونگ');
    await turn(agent, sid, 'فروشنده‌های گزینه ۱ کجا هستند؟');
    const r = await turn(agent, sid, 'از ۲ فروشگاه اول بپرس');
    const ids = (r.blocks.find((b) => b.kind === 'inquiries') as any).items.map((i: Inquiry) => i.id);
    fc.setInquiries([
      { id: ids[0], shop: { id: 's1', name: 'فروشگاه الف', distanceKm: 0.4 }, status: 'resolved', result: { stock: 'in_stock', price: 41_000_000, summary: 'موجود · ۴۱ میلیون' } },
      { id: ids[1], shop: { id: 's2', name: 'فروشگاه ب', distanceKm: 1 }, status: 'retry_scheduled', result: null },
    ] as unknown as Inquiry[]);
    const s = await turn(agent, sid, 'نتیجه تماس‌ها چی شد؟');
    expect(s.text).toContain('فروشگاه الف: موجود');
    expect(s.text).toContain('پیشنهاد من: فروشگاه الف');
  });

  it('unknown text gets a friendly, intentional reply (never an error)', async () => {
    const agent = createAgent(agentDeps(fakeContact().contact));
    const r = await turn(agent, 'sess-unk', 'قلقلک زبرجد');
    expect(r.events.some((e) => e.type === 'error')).toBe(false);
    expect(r.text.length).toBeGreaterThan(10);
    expect(r.kinds).toContain('quick_replies');
  });
});
