/** Inquiries (contact & follow-up): create batch, list, detail, retry / call-now, cancel; demo toggle. */
import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { CreateInquiriesRequest, InquiryQuestion, UserContext } from '@titl/shared';
import type { AppDeps } from '../deps.js';
import { badRequest, body, notFound, rateLimit } from '../http.js';

const QUESTIONS = [
  'stock',
  'price',
  'hours',
  'hold',
  'installment',
  'kalabarg',
  'location',
  'warranty',
  'variant',
  'registry',
  'condition',
  'cash_vs_installment',
  'return_policy',
  'custom',
] as const satisfies readonly InquiryQuestion[];

const id = z.string().min(1).max(100);
const isoDate = z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'تاریخ نامعتبر است');

const createSchema = z.object({
  sessionId: id,
  productId: id.optional(),
  shopIds: z.array(id).min(1).max(10),
  questions: z.array(z.enum(QUESTIONS)).max(QUESTIONS.length).default(['stock', 'price']),
  customQuestion: z.string().max(300).optional(),
  // Forward-compatible: UserContext is validated by the services that consume it.
  context: z.record(z.unknown()).optional(),
  variant: z.array(z.object({ key: z.string().min(1).max(40), value: z.string().min(1).max(60) })).max(4).optional(),
  force: z.boolean().optional(),
  clockNow: isoDate.optional(),
});

export function registerInquiryRoutes(app: Hono, deps: AppDeps): void {
  const { contact } = deps;
  const limiter = rateLimit({ windowMs: 60_000, max: deps.config.RATE_LIMIT_INQUIRY_PER_MIN });

  app.post('/api/inquiries', limiter, async (c) => {
    const b = await body(c, createSchema);
    const req: CreateInquiriesRequest = { ...b, questions: b.questions ?? ['stock', 'price'], context: (b.context ?? {}) as UserContext };
    const inquiries = contact.createInquiries(req);
    c.header('Cache-Control', 'no-store');
    return c.json({ inquiries }, 201);
  });

  app.get('/api/inquiries', (c) => {
    const sessionId = c.req.query('sessionId');
    if (!sessionId) throw badRequest('شناسهٔ نشست (sessionId) لازم است.');
    const batch = c.req.query('batch');
    let inquiries = contact.listInquiries(sessionId);
    if (batch) inquiries = inquiries.filter((i) => i.batchId === batch);
    c.header('Cache-Control', 'no-store');
    return c.json({ inquiries });
  });

  app.get('/api/inquiries/:id', (c) => {
    const inq = contact.getInquiry(c.req.param('id'));
    if (!inq) throw notFound('درخواست پیگیری');
    c.header('Cache-Control', 'no-store');
    return c.json(inq);
  });

  // «همین حالا دوباره» and «همین حالا تماس بگیر (نسخه نمایشی)» — immediate attempt (closed hours ignored, disclosed).
  const callNow = (c: Context) => {
    const inq = contact.retry(c.req.param('id') ?? '');
    if (!inq) throw notFound('درخواست پیگیری');
    return c.json(inq);
  };
  app.post('/api/inquiries/:id/retry', limiter, callNow);
  app.post('/api/inquiries/:id/call-now', limiter, callNow);

  app.post('/api/inquiries/:id/cancel', (c) => {
    const inq = contact.cancel(c.req.param('id'));
    if (!inq) throw notFound('درخواست پیگیری');
    return c.json(inq);
  });

  // Demo controls (DESIGN-REVIEW CT3 /about toggle). Disclosed in the UI; no effect outside DEMO_MODE.
  app.get('/api/demo/contact', (c) => {
    const s = contact.setScenarios ? contact.setScenarios(currentScenarios()) : null;
    return c.json(s ?? { scenarios: false });
  });
  let scenariosOn: boolean | null = null;
  const currentScenarios = () => scenariosOn ?? ['1', 'true', 'yes', 'on'].includes((process.env.DEMO_SCENARIOS ?? '').toLowerCase());
  app.post('/api/demo/contact', async (c) => {
    const b = await body(c, z.object({ scenarios: z.boolean(), name: z.string().min(1).max(60).optional() }));
    if (!contact.setScenarios) throw notFound('تنظیمات نمایشی');
    scenariosOn = b.scenarios;
    return c.json(contact.setScenarios(b.scenarios, b.name));
  });
}
