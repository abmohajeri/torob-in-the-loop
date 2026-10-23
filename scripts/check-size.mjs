#!/usr/bin/env node
// @ts-check
/**
 * Build exactly what `liara deploy` would upload (respecting .liaraignore) and report its compressed size,
 * the biggest entries, the presence of the artifacts Dockerfile.runtime needs, and the plan budget.
 *
 * Usage: node scripts/check-size.mjs [--mode auto|cli|emulate] [--top N] [--list] [--json] [--keep FILE] [--strict] [--dir DIR]
 *   --mode     auto (default): use the installed Liara CLI's own archiver when found, else the built-in emulation
 *   --strict   exit 1 when a required artifact is missing or the upload exceeds the FREE plan (128 MB)
 * Exit codes: 0 ok · 1 strict check failed · 2 over the CLI hard limit (256 MiB) / usage error.
 */
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIARA_MAX_SOURCE_BYTES, LIARA_PLAN_LIMITS, inspectUpload } from './lib/liara-archive.mjs';

/** Files Dockerfile.runtime COPYs; the deploy is broken without them. */
export const REQUIRED_FOR_RUNTIME = Object.freeze([
  'Dockerfile.runtime',
  'apps/server/dist/index.js',
  'apps/server/dist/state-schema.sql',
  'apps/web/dist/index.html',
  'data/catalog.db',
  'scripts/docker-entrypoint.sh',
  'scripts/healthcheck.mjs',
]);

/** Must never be uploaded. */
export const FORBIDDEN_PREFIXES = Object.freeze(['node_modules/', '.git/', '.env', 'dataset/', '.claude/']);

/** @param {number} n */
export function human(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KiB', 'MiB', 'GiB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * @param {string[]} argv
 */
export function parseArgs(argv) {
  /** @type {{ mode: 'auto' | 'cli' | 'emulate', top: number, list: boolean, json: boolean, keep: string | null, strict: boolean, dir: string }} */
  const o = { mode: 'auto', top: 12, list: false, json: false, keep: null, strict: false, dir: '.' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value for ${a}`);
      return v;
    };
    if (a === '--mode') {
      const m = next();
      if (m !== 'auto' && m !== 'cli' && m !== 'emulate') throw new Error(`bad --mode ${m}`);
      o.mode = m;
    } else if (a === '--top') o.top = Number(next()) || 0;
    else if (a === '--list') o.list = true;
    else if (a === '--json') o.json = true;
    else if (a === '--keep') o.keep = next();
    else if (a === '--strict') o.strict = true;
    else if (a === '--dir') o.dir = next();
    else if (a === '-h' || a === '--help') throw new Error('help');
    else throw new Error(`unknown argument ${a}`);
  }
  return o;
}

/**
 * Pure evaluation of an upload listing (unit-tested).
 * @param {{ path: string, type: string, size: number }[]} entries
 * @param {number} compressedBytes
 */
export function evaluate(entries, compressedBytes) {
  const files = entries.filter((e) => e.type === 'file');
  const paths = new Set(files.map((e) => e.path));
  const missing = REQUIRED_FOR_RUNTIME.filter((p) => !paths.has(p));
  const forbidden = files
    .map((e) => e.path)
    .filter((p) => FORBIDDEN_PREFIXES.some((f) => p === f.replace(/\/$/, '') || p.startsWith(f) || p.includes(`/${f}`)))
    .filter((p) => p !== '.env.example');
  const rawBytes = files.reduce((s, e) => s + e.size, 0);
  const verdict =
    compressedBytes > LIARA_MAX_SOURCE_BYTES
      ? 'over_cli_limit'
      : compressedBytes > LIARA_PLAN_LIMITS.standard
        ? 'over_standard'
        : compressedBytes > LIARA_PLAN_LIMITS.free
          ? 'needs_standard'
          : 'fits_free';
  return { fileCount: files.length, rawBytes, compressedBytes, missing, forbidden, verdict };
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    const msg = /** @type {Error} */ (err).message;
    if (msg !== 'help') console.error(msg);
    console.error('usage: scripts/check-size.sh [--mode auto|cli|emulate] [--top N] [--list] [--json] [--keep FILE] [--strict]');
    process.exit(msg === 'help' ? 0 : 2);
  }
  const root = resolve(opts.dir);
  const tmp = mkdtempSync(join(tmpdir(), 'torob-in-the-loop-upload-'));
  const archivePath = opts.keep ? resolve(opts.keep) : join(tmp, 'upload.tar.gz');
  const t0 = Date.now();
  let info;
  try {
    info = await inspectUpload(root, { mode: opts.mode, platform: 'docker', archivePath });
  } finally {
    if (!opts.keep) rmSync(tmp, { recursive: true, force: true });
  }
  const ev = evaluate(info.entries, info.bytes);
  const ms = Date.now() - t0;
  const files = info.entries.filter((e) => e.type === 'file').sort((a, b) => b.size - a.size);
  /** @type {Record<string, number>} */
  const byTop = {};
  for (const f of files) {
    const top = f.path.split('/').slice(0, f.path.startsWith('apps/') || f.path.startsWith('packages/') ? 3 : 1).join('/');
    byTop[top] = (byTop[top] ?? 0) + f.size;
  }
  let catalogBytes = 0;
  try {
    catalogBytes = statSync(join(root, 'data/catalog.db')).size;
  } catch {
    catalogBytes = 0;
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...ev, mode: info.mode, cliVersion: info.cliVersion, catalogBytes, tookMs: ms, groups: byTop }, null, 2));
  } else {
    const tty = process.stdout.isTTY && !process.env.NO_COLOR;
    /** @param {string} code @param {string} s */
    const c = (code, s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : s);
    console.log(c('1', 'Liara upload preview') + c('2', `  (${info.mode === 'cli' ? `Liara CLI ${info.cliVersion} archiver` : 'emulated archiver, same ignore rules'}, ${ms} ms)`));
    console.log(`  files:       ${ev.fileCount}`);
    console.log(`  raw size:    ${human(ev.rawBytes)}`);
    console.log(`  compressed:  ${c('1', human(ev.compressedBytes))}  (${ev.compressedBytes} bytes, tar + gzip -9 like the CLI)`);
    const budget =
      ev.verdict === 'fits_free'
        ? c('32', `fits the free/bronze plan limit (128 MB), ${human(LIARA_PLAN_LIMITS.free - ev.compressedBytes)} headroom`)
        : ev.verdict === 'needs_standard'
          ? c('33', 'over 128 MB: needs a silver (standard) feature plan (256 MB)')
          : c('31', 'too big for every Liara plan (256 MB / CLI limit 256 MiB)');
    console.log(`  budget:      ${budget}`);
    console.log(c('2', '  by area:'));
    for (const [k, v] of Object.entries(byTop).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`    ${human(v).padStart(10)}  ${k}`);
    if (opts.top > 0) {
      console.log(c('2', `  largest ${Math.min(opts.top, files.length)} files:`));
      for (const f of files.slice(0, opts.top)) console.log(`    ${human(f.size).padStart(10)}  ${f.path}`);
    }
    if (opts.list) for (const f of files) console.log(`  ${f.path}`);
    if (ev.missing.length) {
      console.log(c('33', `  missing for Dockerfile.runtime (${ev.missing.length}):`));
      for (const m of ev.missing) console.log(c('33', `    - ${m}`));
      if (ev.missing.includes('data/catalog.db'))
        console.log(c('33', '    → data/catalog.db not built yet (npm run data:build). The real upload will be larger by roughly the gzip size of the catalog.'));
      if (ev.missing.some((m) => m.includes('/dist/'))) console.log(c('33', '    → run: npm run build'));
    }
    if (ev.forbidden.length) {
      console.log(c('31', `  should NOT be uploaded (${ev.forbidden.length}), check .liaraignore:`));
      for (const f of ev.forbidden.slice(0, 10)) console.log(c('31', `    - ${f}`));
    }
    if (opts.keep) console.log(c('2', `  archive kept at ${archivePath}`));
  }
  if (ev.verdict === 'over_cli_limit' || ev.verdict === 'over_standard') process.exit(2);
  if (opts.strict && (ev.missing.length || ev.forbidden.length || ev.verdict !== 'fits_free')) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`check-size failed: ${/** @type {Error} */ (err).message}`);
    process.exit(2);
  });
}
