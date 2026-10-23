/**
 * Filesystem locations used by the catalog builder (all overridable through env vars).
 *
 *   DATASET_DIR  directory with shops.csv / products.csv / offers.csv   (default: <repo>/../dataset)
 *   OUT          output SQLite file                                    (default: <repo>/data/catalog.db)
 *   ETL_DATA_DIR curated JSON inputs (taxonomy, synonyms, brands, places, osm/)  (default: packages/etl/data)
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** packages/etl */
export const ETL_ROOT = resolve(HERE, '..');
/** Repository root (torob-in-the-loop/). */
export const REPO_ROOT = resolve(ETL_ROOT, '../..');

export const SCHEMA_PATH = resolve(HERE, 'schema.sql');

export function datasetDir(): string {
  return process.env.DATASET_DIR ? resolve(process.env.DATASET_DIR) : resolve(REPO_ROOT, '../dataset');
}

export function outPath(): string {
  return process.env.OUT ? resolve(process.env.OUT) : resolve(REPO_ROOT, 'data/catalog.db');
}

export function curationDir(): string {
  return process.env.ETL_DATA_DIR ? resolve(process.env.ETL_DATA_DIR) : resolve(ETL_ROOT, 'data');
}

export const FIXTURES_DIR = resolve(ETL_ROOT, 'fixtures');
export const FIXTURE_DB_PATH = resolve(REPO_ROOT, 'data/fixture.db');
export const DATA_REPORT_PATH = resolve(REPO_ROOT, 'docs/DATA-REPORT.md');
