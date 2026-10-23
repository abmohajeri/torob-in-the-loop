/** Seller inbox (CT5): shop picker, inquiries for a shop, one-tap reply, header stats, live SSE. */
import type { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { SellerInboxStats, SellerLiveEvent, ShopLite } from '@titl/shared';
import { formatNumber } from '@titl/shared';
import type { AppDeps } from '../deps.js';
import { body, intParam, notFound } from '../http.js';

const hhmm = z.string().regex(/^\d{1,2}:\d{2}$/, 'ساعت باید به شکل HH:MM باشد');
const replySchema = z.object({
  stock: z.enum(['in_stock', 'out_of_stock', 'limited']),
  price: z.number().int().positive().max(100_000_000_000).optional(),
  samePrice: z.boolean().optional(),
  hoursToday: hhmm.optional(),
  holdUntil: hhmm.optional(),
  installment: z.boolean().optional(),
  kalabarg: z.boolean().optional(),
  note: z.string().max(300).optional(),
  publish: z.boolean().optional(),
});

export function registerSellerRoutes(app: Hono, deps: AppDeps): void {
  const { contact, services } = deps;

  app.get('/api/seller/shops', (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const limit = intParam(c.req.query('limit'), 20, 1, 50);
    const asked = (contact.askedShopIds?.(50) ?? []).flatMap((id) => services.getShopLite(id, {}) ?? []);
    const askedIds = new Set(asked.map((s) => s.id));
    let out: ShopLite[];
    if (!q) out = asked;
    else {
      const qn = q.toLowerCase();
      const found = services.findShops(q, limit);
      out = [...asked.filter((s) => s.name.toLowerCase().includes(qn) || s.id === q), ...found.filter((s) => !askedIds.has(s.id))];
    }
    c.header('Cache-Control', 'no-store');
    return c.json(out.slice(0, limit));
  });

  app.get('/api/seller/:shopId/inquiries', (c) => {
    const shopId = c.req.param('shopId');
    if (!services.getShopLite(shopId, {})) throw notFound('فروشگاه');
    c.header('Cache-Control', 'no-store');
    return c.json({ inquiries: contact.sellerInbox(shopId) });
  });

  app.get('/api/seller/:shopId/stats', (c) => {
    const shopId = c.req.param('shopId');
    if (!services.getShopLite(shopId, {})) throw notFound('فروشگاه');
    const s = contact.sellerStats?.(shopId) ?? { askedToday: 0, pending: 0, staleOffers: 0 };
    const parts = [
      s.askedToday ? `امروز ${formatNumber(s.askedToday)} نفر دربارهٔ کالاهای شما پرسیدند` : 'امروز هنوز کسی دربارهٔ کالاهای شما نپرسیده',
    ];
    if (s.staleOffers) parts.push(`${formatNumber(s.staleOffers)} قیمت شما بیش از ۳۰ روز قدیمی است`);
    const out: SellerInboxStats = { shopId, ...s, headline: parts.join(' · ') };
    c.header('Cache-Control', 'no-store');
    return c.json(out);
  });

  app.post('/api/seller/:shopId/inquiries/:id/reply', async (c) => {
    const b = await body(c, replySchema);
    const inq = contact.sellerReply(c.req.param('shopId'), c.req.param('id'), b);
    if (!inq) throw notFound('درخواست');
    return c.json(inq);
  });

  app.get('/api/seller/:shopId/events', (c) => {
    const shopId = c.req.param('shopId');
    c.header('X-Accel-Buffering', 'no');
    c.header('Cache-Control', 'no-cache, no-transform');
    return streamSSE(c, async (stream) => {
      const send = (ev: SellerLiveEvent) => stream.writeSSE({ data: JSON.stringify(ev) }).catch(() => undefined);
      const off = deps.bus.subscribeSeller(shopId, (ev) => void send(ev));
      await send({ type: 'ping', at: new Date().toISOString() });
      const ping = setInterval(() => void send({ type: 'ping', at: new Date().toISOString() }), 15_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(ping);
      off();
    });
  });
}
