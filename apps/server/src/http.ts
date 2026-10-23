import type { Context, MiddlewareHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ZodType } from 'zod';
import { paramsToContext, type ApiError, type UserContext } from '@titl/shared';
import type { Logger } from './logger.js';

/** Throwable API error rendered as `{ error: { code, message } }`. */
export class ApiErr extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'مورد درخواستی') => new ApiErr(404, 'not_found', `${what} پیدا نشد.`);
export const badRequest = (message: string) => new ApiErr(400, 'bad_request', message);

/** UserContext from query params (see shared/context.ts encoding). */
export function ctxFrom(c: Context): UserContext {
  return paramsToContext(c.req.query());
}

export function intParam(v: string | undefined, def: number, min: number, max: number): number {
  const n = v === undefined ? NaN : Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export function numParam(v: string | undefined): number | undefined {
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function csvParam(v: string | undefined, max = 20): string[] {
  if (!v) return [];
  return v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Parse + validate a JSON body with zod; 400 on failure. */
export async function body<T>(c: Context, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest('بدنه درخواست JSON معتبر نیست.');
  }
  const r = schema.safeParse(raw);
  if (!r.success) throw new ApiErr(422, 'validation_error', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

export function errorJson(code: string, message: string): ApiError {
  return { error: { code, message } };
}

export function onError(log: Logger) {
  return (err: Error, c: Context) => {
    if (err instanceof ApiErr) return c.json(errorJson(err.code, err.message), err.status);
    if (err instanceof HTTPException) return c.json(errorJson('http_error', err.message), err.status);
    log.error('unhandled error', { err, path: c.req.path });
    return c.json(errorJson('internal_error', 'خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.'), 500);
  };
}

/** Access log for API calls (skips static assets). */
export function requestLogger(log: Logger): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now();
    await next();
    if (!c.req.path.startsWith('/api/')) return;
    const ms = Math.round(performance.now() - start);
    const fields = { method: c.req.method, path: c.req.path, status: c.res.status, ms };
    if (c.res.status >= 500) log.error('request', fields);
    else if (ms > 1000) log.warn('slow request', fields);
    else log.debug('request', fields);
  };
}

/** Fixed-window in-memory rate limiter keyed by client IP (+ optional session). */
export function rateLimit(opts: { windowMs: number; max: number; key?: (c: Context) => string }): MiddlewareHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return async (c, next) => {
    const now = Date.now();
    const ip =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
    const k = opts.key ? `${ip}:${opts.key(c)}` : ip;
    const h = hits.get(k);
    if (!h || h.reset < now) {
      hits.set(k, { n: 1, reset: now + opts.windowMs });
      if (hits.size > 10_000) for (const [key, v] of hits) if (v.reset < now) hits.delete(key);
    } else if (++h.n > opts.max) {
      c.header('Retry-After', String(Math.ceil((h.reset - now) / 1000)));
      return c.json(errorJson('rate_limited', 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.'), 429);
    }
    await next();
  };
}
