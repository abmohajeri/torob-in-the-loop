/**
 * CSV reading/writing for the Torob dataset (RFC 4180, multi-line quoted fields).
 * The dataset writes the literal string `null` for missing values; JSON columns are JSON strings.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { parse } from 'csv-parse';

export type CsvRecord = Record<string, string>;

/** Stream records of a CSV file as objects keyed by header names. */
export async function* readCsv(path: string): AsyncGenerator<CsvRecord> {
  const parser = createReadStream(path).pipe(
    parse({
      columns: true,
      bom: true,
      relax_quotes: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  );
  for await (const rec of parser) yield rec as CsvRecord;
}

/** Read the header row of a CSV file. */
export async function readCsvHeader(path: string): Promise<string[]> {
  const parser = createReadStream(path).pipe(parse({ bom: true, relax_quotes: true, to_line: 1 }));
  for await (const rec of parser) return rec as string[];
  return [];
}

/** Dataset NULL convention: missing, empty or the literal `null` → null. */
export function nul(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  if (t === '' || t === 'null' || t === 'NULL' || t === 'None') return null;
  return v;
}

/** Parse a JSON column defensively. */
export function parseJsonField<T>(v: string | undefined | null, fallback: T): T {
  const s = nul(v);
  if (s === null) return fallback;
  try {
    const parsed = JSON.parse(s) as unknown;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Number column (finite) or null. */
export function numField(v: string | undefined | null): number | null {
  const s = nul(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** RFC 4180 quoting for one field. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Write records to a CSV file with the given header order (values written verbatim). */
export async function writeCsv(path: string, columns: string[], records: Iterable<CsvRecord>): Promise<number> {
  const out = createWriteStream(path, { encoding: 'utf8' });
  let n = 0;
  const write = async (line: string) => {
    if (!out.write(line)) await once(out, 'drain');
  };
  await write(columns.map(csvField).join(',') + '\n');
  for (const rec of records) {
    await write(columns.map((c) => csvField(rec[c] ?? '')).join(',') + '\n');
    n++;
  }
  out.end();
  await once(out, 'finish');
  return n;
}
