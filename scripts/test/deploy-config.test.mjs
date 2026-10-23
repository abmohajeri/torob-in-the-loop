import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Ignore } from '../lib/ignore.mjs';
import { listUploadEntries } from '../lib/liara-archive.mjs';
import { probe } from '../healthcheck.mjs';

const ROOT = resolve(import.meta.dirname, '../..');

describe('gitignore matcher', () => {
  it('handles negation and globs', () => {
    const ig = new Ignore({ ignoreCase: false }).add(['data/*', '!data/catalog.db', '**/node_modules', '*.csv']);
    expect(ig.ignores('data/raw.db')).toBe(true);
    expect(ig.ignores('data/catalog.db')).toBe(false);
    expect(ig.ignores('apps/web/node_modules')).toBe(true);
    expect(ig.ignores('x/products.csv')).toBe(true);
    expect(ig.ignores('apps/server/dist/index.js')).toBe(false);
  });
});

describe('Liara upload set (.liaraignore)', () => {
  it('ships runtime artifacts and nothing secret or heavy', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bg-upload-'));
    try {
      writeFileSync(join(dir, '.liaraignore'), readFileSync(join(ROOT, '.liaraignore')));
      const files = {
        'data/catalog.db': 'x', 'data/state/state.db': 'x', 'apps/server/dist/index.js': 'x',
        'apps/web/dist/index.html': 'x', 'node_modules/a/index.js': 'x', '.env': 'SECRET=1',
        'dataset/products.csv': 'x', 'docs/screenshots/a.png': 'x', 'scripts/healthcheck.mjs': 'x',
        'scripts/docker-entrypoint.sh': 'x', 'Dockerfile.runtime': 'x', '.git/HEAD': 'x',
      };
      for (const [p, c] of Object.entries(files)) {
        mkdirSync(join(dir, p, '..'), { recursive: true });
        writeFileSync(join(dir, p), c);
      }
      const paths = new Set(listUploadEntries(dir).filter((e) => e.type === 'file').map((e) => e.path));
      for (const p of ['data/catalog.db', 'apps/server/dist/index.js', 'apps/web/dist/index.html',
        'scripts/healthcheck.mjs', 'scripts/docker-entrypoint.sh', 'Dockerfile.runtime']) expect(paths).toContain(p);
      for (const p of ['data/state/state.db', 'node_modules/a/index.js', '.env', 'dataset/products.csv',
        'docs/screenshots/a.png', '.git/HEAD']) expect(paths).not.toContain(p);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('liara.json', () => {
  it('matches the image layout', () => {
    const cfg = JSON.parse(readFileSync(join(ROOT, 'liara.json'), 'utf8'));
    expect(cfg.platform).toBe('docker');
    expect(cfg.port).toBe(3000);
    expect(cfg.disks[0].mountTo).toBe('/var/lib/torob-in-the-loop');
    expect(readFileSync(join(ROOT, cfg.build.dockerfile), 'utf8')).toContain('STATE_DB_PATH=/var/lib/torob-in-the-loop/state.db');
    expect(cfg.healthCheck.command).toContain('/app/scripts/healthcheck.mjs');
  });
});

describe('healthcheck probe', () => {
  async function withServer(status, body, fn) {
    const srv = createServer((_q, r) => { r.writeHead(status, { 'content-type': 'application/json' }); r.end(body); });
    await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
    try { return await fn(`http://127.0.0.1:${srv.address().port}/api/health`); } finally { srv.close(); }
  }
  it('is healthy only on 200', async () => {
    const ok = await withServer(200, JSON.stringify({ status: 'ok', catalog: { products: 5 }, state: { persistent: true } }), (u) => probe(u, 2000));
    expect(ok.ok).toBe(true);
    expect(ok.line).toContain('products=5');
    const bad = await withServer(503, '{"status":"degraded"}', (u) => probe(u, 2000));
    expect(bad.ok).toBe(false);
  });
  it('fails when unreachable', async () => {
    const r = await probe('http://127.0.0.1:1/api/health', 1000);
    expect(r.ok).toBe(false);
    expect(r.line).toMatch(/unreachable/);
  });
});
