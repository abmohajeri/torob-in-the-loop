/**
 * `npm run data:build` — builds data/catalog.db from the Torob dataset and writes docs/DATA-REPORT.md.
 *
 * Env: DATASET_DIR (default <repo>/../dataset), OUT (default <repo>/data/catalog.db),
 *      ETL_DATA_DIR (curated JSON, default packages/etl/data), NO_REPORT=1 to skip the report.
 */
import { writeFileSync } from 'node:fs';
import { buildCatalog } from './catalog.js';
import { CAVEATS } from './caveats.js';
import { info } from './log.js';
import { DATA_REPORT_PATH, curationDir, datasetDir, outPath } from './paths.js';
import { renderReport } from './report.js';

async function main(): Promise<void> {
  const opts = { datasetDir: datasetDir(), out: outPath(), curationDir: curationDir() };
  info(`dataset: ${opts.datasetDir}`);
  info(`curation: ${opts.curationDir}`);
  info(`output: ${opts.out}`);
  const { stats, warnings } = await buildCatalog(opts);
  if (process.env.NO_REPORT !== '1') {
    writeFileSync(DATA_REPORT_PATH, renderReport(stats, warnings, CAVEATS));
    info(`report → ${DATA_REPORT_PATH}`);
  }
}

main().catch((e: unknown) => {
  process.stderr.write(`[etl] build failed: ${(e as Error).stack ?? String(e)}\n`);
  process.exit(1);
});
