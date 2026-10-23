/**
 * Minimal build logger. Warnings are collected so the data report can list them.
 */
const warnings: string[] = [];
let quiet = process.env.ETL_QUIET === '1';

export function setQuiet(v: boolean): void {
  quiet = v;
}

export function info(msg: string): void {
  if (!quiet) process.stdout.write(`[etl] ${msg}\n`);
}

export function warn(msg: string): void {
  warnings.push(msg);
  if (!quiet) process.stderr.write(`[etl] WARN ${msg}\n`);
}

export function collectedWarnings(): readonly string[] {
  return warnings;
}

export function resetWarnings(): void {
  warnings.length = 0;
}

/** Measure a synchronous or async step and log its duration. */
export async function step<T>(label: string, fn: () => T | Promise<T>): Promise<T> {
  const t0 = performance.now();
  const r = await fn();
  info(`${label} — ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  return r;
}
