import { afterEach, describe, expect, it } from 'vitest';
import type { LiveEvent } from '@titl/shared';
import { makeContact, until } from './helpers/contact.js';

const stops: (() => void)[] = [];
afterEach(() => {
  while (stops.length) stops.pop()!();
});

function setup(opts: Parameters<typeof makeContact>[0] = {}) {
  const t = makeContact(opts);
  const events: LiveEvent[] = [];
  t.bus.subscribeSession('s', (e) => events.push(e));
  t.contact.start();
  stops.push(() => t.contact.stop());
  return { ...t, events };
}

const req = (shopIds: string[], extra: Record<string, unknown> = {}) => ({
  sessionId: 's',
  productId: 'p1',
  shopIds,
  questions: ['stock', 'price'] as ('stock' | 'price')[],
  ...extra,
});

describe('contact engine: state machine', () => {
  it('scenario batch: #1 no answer → retry → resolved, #3 out of stock → alternatives, digest posted', async () => {
    const t = setup({ settings: { scenarios: true, scenarioName: 'demo' } });
    const created = t.contact.createInquiries(req(['a', 'b', 'c']));
    expect(created.map((i) => i.status)).toEqual(['queued', 'queued', 'queued']);
    expect(created.every((i) => i.simulated)).toBe(true);
    await until(() => created.every((i) => t.contact.getInquiry(i.id)!.status === 'resolved'));
    const [a, b, c] = created.map((i) => t.contact.getInquiry(i.id)!);
    expect(a!.attempts).toBe(2);
    const statuses = a!.events.filter((e) => e.type === 'status').map((e) => (e.data as { status: string }).status);
    expect(statuses).toEqual(['calling', 'no_answer', 'retry_scheduled', 'calling', 'in_call', 'answered', 'resolved']);
    expect(a!.result!.holdUntil).toBe('18:00');
    expect(b!.result!.priceDeltaPct).toBe(0);
    expect(c!.result!.stock).toBe('out_of_stock');
    expect(c!.alternatives?.reason).toBe('out_of_stock');
    const digests = t.events.filter((e) => e.type === 'assistant.message');
    expect(digests.length).toBeGreaterThanOrEqual(2); // first-miss line + digest (+ update)
    const last = digests.at(-1)!;
    if (last.type !== 'assistant.message') throw new Error();
    expect(last.message.text).toContain('پیگیری ۳ فروشگاه');
    expect(last.message.text).toContain('پیشنهاد من:');
    // persisted in chat history
    const n = t.state.get<{ n: number }>(`SELECT count(*) AS n FROM chat_messages WHERE session_id = 's' AND role = 'assistant'`)!.n;
    expect(n).toBe(digests.length);
  });

  it('exhausts attempts → unreachable with alternatives', async () => {
    const t = setup({ settings: { maxAttempts: 1 } });
    // Find a deterministic miss: try shops until one is not answered on attempt 1.
    const created = t.contact.createInquiries(req(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8']));
    await until(() => created.every((i) => ['resolved', 'unreachable', 'callback_promised', 'scheduled_at_open'].includes(t.contact.getInquiry(i.id)!.status)));
    const un = created.map((i) => t.contact.getInquiry(i.id)!).filter((i) => i.status === 'unreachable');
    for (const u of un) expect(u.alternatives).not.toBeNull();
  });

  it('closed by registered hours → scheduled_at_open (no dialing); call-now forces a disclosed demo call', async () => {
    const world = { open: new Map([['z', { state: 'closed' as const, label: 'بسته', opensAt: '10:00', opensDay: 'sat' as const, at: new Date().toISOString() }]]) };
    const t = setup({ world });
    const [inq] = t.contact.createInquiries(req(['z']));
    await until(() => t.contact.getInquiry(inq!.id)!.status === 'scheduled_at_open');
    const s = t.contact.getInquiry(inq!.id)!;
    expect(s.attempts).toBe(0);
    expect(s.nextAttemptAt).not.toBeNull();
    expect(s.statusNote).toMatch(/^فروشگاه الان بسته است؛ تماس .+ انجام می‌شود\. پیامتان همین حالا در صندوق فروشنده ثبت شد\.$/);
    const again = t.contact.retry(inq!.id)!;
    expect(again.status).toBe('queued');
    await until(() => t.contact.getInquiry(inq!.id)!.attempts >= 1 && !['queued', 'calling', 'in_call', 'answered'].includes(t.contact.getInquiry(inq!.id)!.status));
  });

  it('cancel stops follow-up', async () => {
    const t = setup({ settings: { timeScale: 1 } });
    const [inq] = t.contact.createInquiries(req(['k']));
    const c = t.contact.cancel(inq!.id)!;
    expect(c.status).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 50));
    expect(t.contact.getInquiry(inq!.id)!.status).toBe('cancelled');
  });
});

describe('contact engine: seller reply precedence', () => {
  it('seller reply mid-call wins, aborts the call, and ranks above simulated answers', async () => {
    const t = setup({ settings: { timeScale: 20 } });
    const [x, y] = t.contact.createInquiries(req(['x', 'y']));
    await until(() => t.contact.getInquiry(x!.id)!.status === 'calling');
    const r = t.contact.sellerReply('x', x!.id, { stock: 'limited', price: 41_000_000, holdUntil: '18:00' })!;
    expect(r.status).toBe('resolved');
    expect(r.resultSource).toBe('seller_inbox');
    expect(r.result!.priceDeltaPct).toBe(2.5);
    const nEvents = r.events.length;
    await new Promise((res) => setTimeout(res, 400));
    const after = t.contact.getInquiry(x!.id)!;
    expect(after.resultSource).toBe('seller_inbox');
    expect(after.events.length).toBe(nEvents); // no transcript lines after the reply
    // wrong shop cannot answer
    expect(t.contact.sellerReply('y', x!.id, { stock: 'in_stock' })).toBeNull();
    // verification: seller answer for x, nothing for unresolved y
    const v = t.contact.verification.latestFor('p1', ['x', 'y']);
    expect(v.get('x')!.source).toBe('seller_inbox');
    t.contact.cancel(y!.id);
  });

  it('seller_inbox beats a newer simulated answer; unpublished replies stay private', async () => {
    const t = setup();
    const [a] = t.contact.createInquiries(req(['m']));
    t.contact.sellerReply('m', a!.id, { stock: 'in_stock', samePrice: true });
    const [b] = t.contact.createInquiries(req(['m']));
    await until(() => ['resolved', 'unreachable'].includes(t.contact.getInquiry(b!.id)!.status) || t.contact.getInquiry(b!.id)!.status === 'callback_promised');
    expect(t.contact.verification.latestFor('p1', ['m']).get('m')!.source).toBe('seller_inbox');
    expect(t.contact.getInquiry(a!.id)!.result!.price).toBe(40_000_000);
    const [c] = t.contact.createInquiries(req(['n']));
    t.contact.sellerReply('n', c!.id, { stock: 'in_stock', price: 39_000_000, publish: false });
    expect(t.contact.verification.latestFor('p1', ['n']).has('n')).toBe(false);
  });
});

describe('contact engine: scheduling & restart safety', () => {
  it('jobs survive a restart: interrupted calls are re-queued and completed', async () => {
    const first = makeContact({ settings: { timeScale: 2 } });
    first.contact.start();
    const [inq] = first.contact.createInquiries(req(['r']));
    await until(() => first.contact.getInquiry(inq!.id)!.status === 'calling');
    first.contact.stop(); // "crash" mid-call
    const second = makeContact({ dbPath: first.dbPath, settings: { timeScale: 1000 } });
    second.contact.start();
    stops.push(() => second.contact.stop());
    await until(() => !['queued', 'calling', 'in_call', 'answered'].includes(second.contact.getInquiry(inq!.id)!.status));
    const done = second.contact.getInquiry(inq!.id)!;
    expect(done.events.some((e) => e.text.includes('نیمه‌کاره'))).toBe(true);
  });

  it('retry delays follow FOLLOWUP_RETRY_SECONDS × 1.5^(n−1) ÷ time scale', async () => {
    let now = new Date('2026-10-24T08:00:00Z').getTime();
    const t = setup({ settings: { scenarios: true, scenarioName: 'demo', timeScale: 1000, retrySeconds: 45_000 }, now: () => new Date(now) });
    const [a] = t.contact.createInquiries(req(['q1', 'q2', 'q3']));
    await until(() => t.contact.getInquiry(a!.id)!.status === 'retry_scheduled');
    const s = t.contact.getInquiry(a!.id)!;
    // 45 000 s / 1000 = 45 s after the miss
    expect(new Date(s.nextAttemptAt!).getTime() - now).toBe(45_000);
    now += 46_000;
    await until(() => t.contact.getInquiry(a!.id)!.status === 'resolved');
  });
});
