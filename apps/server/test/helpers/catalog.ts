import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { loadConfig } from '../../src/config.js';
import { CatalogDb } from '../../src/db/catalog.js';
import { noopReports, noopVerification, type AppDeps, type Providers } from '../../src/deps.js';
import { onError } from '../../src/http.js';
import { createLogger } from '../../src/logger.js';
import { registerCatalogRoutes } from '../../src/routes/catalog.js';
import { createServices } from '../../src/services/index.js';
import type { Services } from '../../src/services/types.js';

/** data/fixture.db (small real-data subset built by the ETL). */
export const FIXTURE = fileURLToPath(new URL('../../../../data/fixture.db', import.meta.url));
export const hasFixture = existsSync(FIXTURE);

let cached: { services: Services; app: Hono; catalog: CatalogDb; providers: Providers } | null = null;

export function testCatalog() {
  if (cached) return cached;
  const config = loadConfig({ ...process.env, CATALOG_PATH: FIXTURE, NODE_ENV: 'test' });
  const log = createLogger('error');
  const catalog = new CatalogDb(FIXTURE);
  const providers: Providers = { verification: noopVerification, reports: noopReports };
  const services = createServices({ catalog, config, log, providers });
  const app = new Hono();
  registerCatalogRoutes(app, { config, log, catalog, services } as unknown as AppDeps);
  app.onError(onError(log));
  cached = { services, app, catalog, providers };
  return cached;
}
