/**
 * Assistant routes (docs/ARCHITECTURE.md §7, rows owned by "agent").
 * POST /api/chat streams AgentEvent frames as SSE (`data: <json>\n\n`, ping every 15 s).
 */
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { AgentEvent, UserContext } from '@titl/shared';
import type { AppDeps } from '../deps.js';
import { ApiErr, badRequest, body, ctxFrom, rateLimit } from '../http.js';

const latLng = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const contextSchema = z
  .object({
    location: latLng.extend({ label: z.string().max(200), source: z.enum(['gps', 'place', 'map']) }).optional(),
    budgetMin: z.number().nonnegative().optional(),
    budgetMax: z.number().nonnegative().optional(),
    installment: z.boolean().optional(),
    providers: z.array(z.enum(['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other'])).max(6).optional(),
    openNow: z.boolean().optional(),
    warrantyOnly: z.boolean().optional(),
    fastDelivery: z.boolean().optional(),
    kalabarg: z.boolean().optional(),
    maxDistanceKm: z.number().positive().max(100).optional(),
    travelMode: z.enum(['walk', 'metro', 'taxi', 'car']).optional(),
    visitAt: z.string().max(40).optional(),
  })
  .strip();

const sessionId = z.string().min(4).max(100).regex(/^[\w-]+$/);

const chatSchema = z.object({
  sessionId,
  message: z.string().max(1000),
  context: contextSchema.optional(),
});

const verdictSchema = z.object({
  ids: z.array(z.string().min(1).max(100)).min(2).max(4),
  context: contextSchema.optional(),
});

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

export function registerChatRoutes(app: Hono, deps: AppDeps): void {
  const { agent, services, config } = deps;

  app.post('/api/chat', rateLimit({ windowMs: 60_000, max: config.RATE_LIMIT_CHAT_PER_MIN }), async (c) => {
    const b = await body(c, chatSchema);
    if (!b.message.trim()) throw badRequest('پیام خالی است.');
    c.header('Cache-Control', 'no-cache');
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      const ctrl = new AbortController();
      stream.onAbort(() => ctrl.abort());
      let writing = Promise.resolve();
      const send = (ev: AgentEvent | { type: 'ping'; at: string }) => {
        writing = writing.then(() => (stream.aborted ? undefined : stream.writeSSE({ data: JSON.stringify(ev) }))).catch(() => undefined);
      };
      const ping = setInterval(() => send({ type: 'ping', at: new Date().toISOString() }), 15_000);
      try {
        await agent.chat({ sessionId: b.sessionId, message: b.message, context: (b.context ?? {}) as UserContext }, (ev) => {
          send(ev);
        }, ctrl.signal);
      } catch (e) {
        deps.log.error('chat stream failed', { err: e as Error });
        send({ type: 'error', message: 'دستیار با خطا روبه‌رو شد؛ لطفاً دوباره تلاش کنید.' });
      } finally {
        clearInterval(ping);
        await writing;
      }
    });
  });

  app.get('/api/chat/history', (c) => {
    const sid = sessionId.safeParse(c.req.query('sessionId'));
    if (!sid.success) throw badRequest('شناسه نشست (sessionId) معتبر نیست.');
    c.header('Cache-Control', 'no-store');
    return c.json({ messages: agent.history(sid.data) });
  });

  app.post('/api/chat/reset', async (c) => {
    const b = await body(c, z.object({ sessionId }));
    agent.reset(b.sessionId);
    return c.json({ ok: true });
  });

  app.post('/api/compare/products/verdict', rateLimit({ windowMs: 60_000, max: config.RATE_LIMIT_CHAT_PER_MIN }), async (c) => {
    const b = await body(c, verdictSchema);
    const ctx = { ...ctxFrom(c), ...((b.context ?? {}) as UserContext) };
    const data = services.compareProducts(b.ids, ctx);
    const verdict = data.products.length >= 2 ? await agent.compareVerdict(data, ctx, c.req.raw.signal) : null;
    c.header('Cache-Control', 'no-store');
    return c.json({ verdict });
  });

  app.post('/api/transcribe', rateLimit({ windowMs: 60_000, max: config.RATE_LIMIT_CHAT_PER_MIN }), async (c) => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len > MAX_AUDIO_BYTES) throw new ApiErr(413, 'too_large', 'فایل صوتی بزرگ‌تر از حد مجاز است.');
    let form: Record<string, string | File | (string | File)[]>;
    try {
      form = (await c.req.parseBody({ all: true })) as typeof form;
    } catch {
      throw badRequest('فرم چندبخشی (multipart) معتبر نیست.');
    }
    const raw = form.audio ?? form.file;
    const file = Array.isArray(raw) ? raw[0] : raw;
    if (!file || typeof file === 'string') throw badRequest('فایل صوتی (audio) لازم است.');
    if (file.size > MAX_AUDIO_BYTES) throw new ApiErr(413, 'too_large', 'فایل صوتی بزرگ‌تر از حد مجاز است.');
    const text = await agent.transcribe(file, file.name || 'audio.webm', c.req.raw.signal);
    c.header('Cache-Control', 'no-store');
    return c.json({ text });
  });
}
