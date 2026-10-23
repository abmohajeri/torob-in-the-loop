/* Torob in the Loop service worker.
 * - cache-first: built assets (/assets/*), fonts, product images from image.torob.com, app icons
 * - network-first: /api/* GET; offline fallback (from cache) only for /api/shops/*, /api/malls/*
 * - POST /api/plan: network, responses mirrored into cache (keyed by body) for offline re-open
 * - navigations: network-first, fall back to cached app shell
 */
const VERSION = 'v1';
const STATIC = `bg-static-${VERSION}`;
const IMAGES = `bg-img-${VERSION}`;
const API = `bg-api-${VERSION}`;
const SHELL = `bg-shell-${VERSION}`;
const MAX_IMAGES = 300;
const MAX_API = 120;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icon.svg']).catch(() => {})),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, IMAGES, API, SHELL]);
      for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function cacheFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await c.put(req, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

const offlineJson = () =>
  new Response(JSON.stringify({ error: { code: 'offline', message: 'اتصال اینترنت برقرار نیست؛ لطفاً دوباره تلاش کنید.' } }), {
    status: 503,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

async function networkFirstApi(req, allowOffline) {
  try {
    const res = await fetch(req);
    if (res.ok && allowOffline) {
      const c = await caches.open(API);
      await c.put(req, res.clone());
      trim(API, MAX_API);
    }
    return res;
  } catch {
    if (allowOffline) {
      const hit = await caches.match(req);
      if (hit) return hit;
    }
    return offlineJson();
  }
}

async function planKey(req) {
  const body = await req.clone().text();
  let h = 0;
  for (let i = 0; i < body.length; i++) h = (h * 31 + body.charCodeAt(i)) | 0;
  return new Request(`/__sw/plan/${(h >>> 0).toString(36)}`);
}

async function planPost(req) {
  const key = await planKey(req);
  try {
    const res = await fetch(req);
    if (res.ok) {
      const c = await caches.open(API);
      await c.put(key, res.clone());
      await c.put(new Request('/__sw/plan/last'), res.clone());
    }
    return res;
  } catch {
    const hit = (await caches.match(key)) || (await caches.match('/__sw/plan/last'));
    return hit || offlineJson();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.origin === self.location.origin && url.pathname === '/api/plan' && req.method === 'POST') {
    event.respondWith(planPost(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Product images (torob CDN) and Google/Fontsource fonts
  if (url.hostname === 'image.torob.com' || /\.(woff2?|ttf)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, url.hostname === 'image.torob.com' ? IMAGES : STATIC, url.hostname === 'image.torob.com' ? MAX_IMAGES : 0));
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // never intercept SSE streams
    if (url.pathname === '/api/events' || url.pathname.endsWith('/events')) return;
    const offline = /^\/api\/(shops|malls)\/[^/]+/.test(url.pathname);
    event.respondWith(networkFirstApi(req, offline));
    return;
  }
  if (url.pathname.startsWith('/assets/') || /^\/(icon|apple-touch-icon)/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, STATIC, 0));
    return;
  }
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const c = await caches.open(SHELL);
          if (res.ok) await c.put('/', res.clone());
          return res;
        } catch {
          return (await caches.match('/')) || offlineJson();
        }
      })(),
    );
  }
});
