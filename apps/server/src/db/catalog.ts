import { existsSync } from 'node:fs';
import { Db, openDatabase } from './sqlite.js';
import type { Logger } from '../logger.js';

/** The read-only product/shop catalog built by packages/etl (schema: packages/etl/src/schema.sql). */
export class CatalogDb extends Db {
  readonly path: string;
  constructor(path: string) {
    super(openDatabase(path, { readOnly: true }));
    this.path = path;
    // Read-only image filesystem friendly: no journal writes, temp structures in memory.
    this.raw.exec('PRAGMA query_only = 1; PRAGMA temp_store = MEMORY; PRAGMA cache_size = -65536; PRAGMA mmap_size = 268435456;');
  }

  metaValue(key: string): string | null {
    const row = this.get<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
    return row?.value ?? null;
  }
}

export function openCatalog(path: string, log: Logger): CatalogDb {
  if (!existsSync(path)) {
    throw new Error(`Catalog database not found at ${path}. Build it with \`npm run data:build\` (see docs/DEPLOY.md).`);
  }
  const db = new CatalogDb(path);
  const products = db.get<{ n: number }>('SELECT count(*) AS n FROM products')?.n ?? 0;
  log.info('catalog opened', { path, products, schema: db.metaValue('schema_version') });
  return db;
}
