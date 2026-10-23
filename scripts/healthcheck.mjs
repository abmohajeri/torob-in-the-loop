#!/usr/bin/env node
// @ts-check
/**
 * Container health probe for Docker HEALTHCHECK and Liara `healthCheck.command`.
 *
 * The runtime image is node:*-slim, which has no curl/wget, so we use Node's global fetch.
 * Exit 0 only when GET /api/health answers 200 (status "ok"); 503 ("degraded"), timeouts and
 * connection errors exit 1. Zero dependencies, no file writes (works on a read-only root FS).
 *
 * Env: PORT (default 3000), HEALTHCHECK_URL (full URL override), HEALTHCHECK_TIMEOUT_MS (default 4000).
 */
import { pathToFileURL } from 'node:url';

const port = process.env.PORT || '3000';
const url = process.env.HEALTHCHECK_URL || `http://127.0.0.1:${port}/api/health`;
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS) || 4000;

/**
 * @param {string} target
 * @param {number} ms
 * @returns {Promise<{ ok: boolean, line: string }>}
 */
export async function probe(target, ms) {
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(ms), headers: { accept: 'application/json' } });
    const text = await res.text();
    /** @type {{ status?: string, catalog?: { products?: number }, state?: { persistent?: boolean } } | null} */
    let body = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
    const summary = body
      ? `status=${body.status} products=${body.catalog?.products ?? '?'} persistentState=${body.state?.persistent ?? '?'}`
      : text.slice(0, 120);
    return { ok: res.status === 200, line: `HTTP ${res.status} ${summary}` };
  } catch (err) {
    const e = /** @type {Error & { cause?: { code?: string } }} */ (err);
    return { ok: false, line: `unreachable: ${e.cause?.code ?? e.name}: ${e.message}` };
  }
}

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const { ok, line } = await probe(url, timeoutMs);
  (ok ? process.stdout : process.stderr).write(`healthcheck ${url} → ${line}\n`);
  process.exit(ok ? 0 : 1);
}
