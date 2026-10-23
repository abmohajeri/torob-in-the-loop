import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import type { AppDeps } from '../src/deps.js';
import { onError } from '../src/http.js';
import { registerEventRoutes } from '../src/routes/events.js';
import { registerInquiryRoutes } from '../src/routes/inquiries.js';
import { registerSellerRoutes } from '../src/routes/seller.js';
import { makeContact } from './helpers/contact.js';

function app() {
  const t = makeContact({ settings: { timeScale: 1000 } });
  const a = new Hono();
  const deps = { ...t, catalog: null, agent: null, startedAt: Date.now() } as unknown as AppDeps;
  registerInquiryRoutes(a, deps);
  registerSellerRoutes(a, deps);
  registerEventRoutes(a, deps);
  a.onError(onError(t.log));
  return { a, t };
}

async function readFrames(res: Response, n: number): Promise<unknown[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const frames: unknown[] = [];
  while (frames.length < n) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split('\n').find((l) => l.startsWith('data: '));
      if (line) frames.push(JSON.parse(line.slice(6)));
    }
  }
  await reader.cancel();
  return frames;
}

describe('SSE + REST', () => {
  it('GET /api/events streams `data: <json>` frames: ping first, then inquiry events', async () => {
    const { a } = app();
    const ctrl = new AbortController();
    const res = await a.request('/api/events?sessionId=s', { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    const create = await a.request('/api/inquiries', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: 's', productId: 'p1', shopIds: ['a'], questions: ['stock'] }),
    });
    expect(create.status).toBe(201);
    const frames = (await readFrames(res, 2)) as { type: string }[];
    expect(frames[0]!.type).toBe('ping');
    expect(frames[1]!.type).toBe('inquiry.updated');
    ctrl.abort();
  });

  it('validates input and serves the seller inbox + reply', async () => {
    const { a } = app();
    const bad = await a.request('/api/inquiries', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"sessionId":"s","shopIds":[]}' });
    expect(bad.status).toBe(422);
    const created = (await (
      await a.request('/api/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId: 's', productId: 'p1', shopIds: ['shop1'], questions: ['stock', 'price'] }),
      })
    ).json()) as { inquiries: { id: string }[] };
    const id = created.inquiries[0]!.id;
    const inbox = (await (await a.request('/api/seller/shop1/inquiries')).json()) as { inquiries: { id: string }[] };
    expect(inbox.inquiries.map((i) => i.id)).toContain(id);
    const reply = await a.request(`/api/seller/shop1/inquiries/${id}/reply`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stock: 'in_stock', price: 42_900_000, holdUntil: '18:00' }),
    });
    expect(reply.status).toBe(200);
    const body = (await reply.json()) as { status: string; resultSource: string };
    expect(body).toMatchObject({ status: 'resolved', resultSource: 'seller_inbox' });
    const stats = (await (await a.request('/api/seller/shop1/stats')).json()) as { headline: string };
    expect(stats.headline).toContain('امروز ۱ نفر');
  });
});
