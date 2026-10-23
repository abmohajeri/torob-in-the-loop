/**
 * Thin wrapper over Node's built-in `node:sqlite` (no native addons → nothing to compile on deploy).
 * `process.getBuiltinModule` keeps bundlers from trying to resolve the module.
 */
import type { DatabaseSync as DatabaseSyncT, StatementSync } from 'node:sqlite';

type SqliteModule = typeof import('node:sqlite');
const sqlite = process.getBuiltinModule('node:sqlite') as SqliteModule;

export type Database = DatabaseSyncT;
export type Statement = StatementSync;
export type SqlValue = null | number | bigint | string | Uint8Array;
export type Row = Record<string, SqlValue>;

export function openDatabase(path: string, opts: { readOnly?: boolean } = {}): Database {
  return new sqlite.DatabaseSync(path, { readOnly: opts.readOnly ?? false });
}

/** Prepared-statement cache keyed by SQL text (statements are reusable and much faster). */
export class Db {
  private cache = new Map<string, Statement>();
  constructor(readonly raw: Database) {}

  stmt(sql: string): Statement {
    let s = this.cache.get(sql);
    if (!s) {
      s = this.raw.prepare(sql);
      this.cache.set(sql, s);
    }
    return s;
  }

  all<T = Row>(sql: string, ...params: SqlValue[]): T[] {
    return this.stmt(sql).all(...params) as T[];
  }

  get<T = Row>(sql: string, ...params: SqlValue[]): T | undefined {
    return this.stmt(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SqlValue[]): { changes: number | bigint; lastInsertRowid: number | bigint } {
    return this.stmt(sql).run(...params);
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  /** Run fn inside a transaction (BEGIN IMMEDIATE … COMMIT / ROLLBACK). */
  tx<T>(fn: () => T): T {
    this.raw.exec('BEGIN IMMEDIATE');
    try {
      const r = fn();
      this.raw.exec('COMMIT');
      return r;
    } catch (e) {
      this.raw.exec('ROLLBACK');
      throw e;
    }
  }

  close(): void {
    this.cache.clear();
    this.raw.close();
  }
}

/** Parse a JSON column defensively. */
export function json<T>(value: SqlValue | undefined, fallback: T): T {
  if (typeof value !== 'string' || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
