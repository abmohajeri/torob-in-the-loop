/** Crowd reports («بسته بود», «پیدا نکردم», …) — feed ranking via contact.reports. */
import type { Hono } from 'hono';
import { z } from 'zod';
import type { AppDeps } from '../deps.js';
import { body, intParam, notFound, rateLimit } from '../http.js';

const schema = z.object({
  type: z.enum(['closed', 'not_found', 'price_mismatch', 'out_of_stock', 'moved']),
  note: z.string().max(500).optional(),
  sessionId: z.string().min(1).max(100).optional(),
});

export function registerReportRoutes(app: Hono, deps: AppDeps): void {
  const limiter = rateLimit({ windowMs: 60_000, max: 20 });

  app.post('/api/shops/:id/reports', limiter, async (c) => {
    const shopId = c.req.param('id');
    if (!deps.services.getShopLite(shopId, {})) throw notFound('فروشگاه');
    const b = await body(c, schema);
    const report = deps.contact.addReport({ shopId, sessionId: b.sessionId ?? null, type: b.type, note: b.note ?? null });
    return c.json(report, 201);
  });

  app.get('/api/shops/:id/reports', (c) => {
    const limit = intParam(c.req.query('limit'), 10, 1, 50);
    c.header('Cache-Control', 'no-store');
    return c.json({ reports: deps.contact.reports.forShop(c.req.param('id'), limit) });
  });
}
