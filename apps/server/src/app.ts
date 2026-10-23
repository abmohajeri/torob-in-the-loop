import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import type { AppDeps } from './deps.js';
import { onError, requestLogger } from './http.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerCatalogRoutes } from './routes/catalog.js';
import { registerInquiryRoutes } from './routes/inquiries.js';
import { registerSellerRoutes } from './routes/seller.js';
import { registerEventRoutes } from './routes/events.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerChatRoutes } from './routes/chat.js';
import { registerStatic } from './static.js';

const SSE_PATHS = [/^\/api\/events/, /^\/api\/chat$/, /^\/api\/seller\/[^/]+\/events/];

/** Composition root for HTTP. Route modules are owned by their feature areas (see docs/ARCHITECTURE.md). */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.use('*', requestLogger(deps.log));
  app.use(
    '*',
    secureHeaders({
      contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://image.torob.com', 'https://*.tile.openstreetmap.org', 'https://tile.openstreetmap.org'],
        connectSrc: ["'self'", 'https://image.torob.com', 'https://tile.openstreetmap.org'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
  if (deps.config.isDev) app.use('/api/*', cors());
  app.use('*', async (c, next) => {
    // Never compress Server-Sent Event streams (would buffer them).
    if (SSE_PATHS.some((re) => re.test(c.req.path))) return next();
    return compress()(c, next);
  });

  registerHealthRoutes(app, deps);
  registerCatalogRoutes(app, deps);
  registerInquiryRoutes(app, deps);
  registerSellerRoutes(app, deps);
  registerEventRoutes(app, deps);
  registerReportRoutes(app, deps);
  registerChatRoutes(app, deps);
  registerStatic(app, deps);

  app.onError(onError(deps.log));
  return app;
}
