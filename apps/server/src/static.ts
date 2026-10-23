import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, sep } from 'node:path';
import type { Hono } from 'hono';
import type { AppDeps } from './deps.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json',
};

/** Serves the built SPA (apps/web/dist) with long-lived caching for hashed assets and SPA fallback. */
export function registerStatic(app: Hono, deps: AppDeps): void {
  const root = deps.config.webDist;
  const hasDist = existsSync(join(root, 'index.html'));
  if (!hasDist) deps.log.warn('web build not found; UI will not be served (run `npm run build -w @titl/web`)', { root });

  const indexHtml = () => (hasDist ? readFileSync(join(root, 'index.html')) : null);
  let cachedIndex: Buffer | null = deps.config.isDev ? null : indexHtml();

  app.get('*', (c) => {
    const path = c.req.path;
    if (path.startsWith('/api/')) return c.json({ error: { code: 'not_found', message: 'مسیر API پیدا نشد.' } }, 404);
    if (!hasDist) {
      return c.html(
        '<!doctype html><meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:2rem">' +
          '<h1>Torob in the Loop</h1><p>API در حال اجراست. برای رابط کاربری در حالت توسعه به <code>http://localhost:5173</code> بروید.</p></body>',
      );
    }
    const rel = normalize(decodeURIComponent(path)).replace(/^([/\\])+/, '');
    const file = join(root, rel);
    if (rel && file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile()) {
      const ext = extname(file).toLowerCase();
      const immutable = rel.startsWith('assets/') || rel.startsWith('fonts/');
      c.header('Content-Type', TYPES[ext] ?? 'application/octet-stream');
      c.header(
        'Cache-Control',
        immutable ? 'public, max-age=31536000, immutable' : rel === 'sw.js' ? 'no-cache' : 'public, max-age=3600',
      );
      return c.body(readFileSync(file));
    }
    // SPA fallback
    if (!cachedIndex) cachedIndex = indexHtml();
    c.header('Cache-Control', 'no-cache');
    return c.html(cachedIndex!.toString('utf8'));
  });
}
