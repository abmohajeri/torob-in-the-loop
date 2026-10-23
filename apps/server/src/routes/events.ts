/** Shopper live events (SSE): inquiry updates, transcript lines, notifications, assistant digests. */
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { LiveEvent } from '@titl/shared';
import type { AppDeps } from '../deps.js';
import { badRequest } from '../http.js';

export function registerEventRoutes(app: Hono, deps: AppDeps): void {
  app.get('/api/events', (c) => {
    const sessionId = c.req.query('sessionId');
    if (!sessionId) throw badRequest('شناسهٔ نشست (sessionId) لازم است.');
    const since = c.req.query('since');
    c.header('X-Accel-Buffering', 'no');
    c.header('Cache-Control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const send = (ev: LiveEvent) => stream.writeSSE({ data: JSON.stringify(ev) }).catch(() => undefined);
      const off = deps.bus.subscribeSession(sessionId, (ev) => void send(ev));
      await send({ type: 'ping', at: new Date().toISOString() });
      // Reconnect catch-up: resend inquiries changed since the client's last event.
      if (since && !Number.isNaN(Date.parse(since))) {
        const t = new Date(since).getTime();
        for (const inq of deps.contact.listInquiries(sessionId)) {
          if (new Date(inq.updatedAt).getTime() > t) await send({ type: 'inquiry.updated', inquiry: inq });
        }
      }
      const ping = setInterval(() => void send({ type: 'ping', at: new Date().toISOString() }), 15_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      off();
    });
  });
}
