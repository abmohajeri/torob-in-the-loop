import { accessSync, constants, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Db, openDatabase } from './sqlite.js';
import type { Logger } from '../logger.js';

/** Mutable state DB (WAL). Falls back to a temp dir when the configured disk is not writable. */
export class StateDb extends Db {
  constructor(
    readonly path: string,
    readonly persistent: boolean,
  ) {
    super(openDatabase(path));
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  }
}

function writableDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true });
    accessSync(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function loadSchema(): string {
  // dev: src/db/state-schema.sql next to this file; prod bundle: dist/state-schema.sql
  const here = dirname(fileURLToPath(import.meta.url));
  for (const p of [join(here, 'state-schema.sql'), join(here, 'db', 'state-schema.sql'), join(here, '../src/db/state-schema.sql')]) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  throw new Error('state-schema.sql not found');
}

export function openState(path: string, log: Logger): StateDb {
  let finalPath = path;
  let persistent = true;
  if (!writableDir(dirname(path))) {
    finalPath = join(tmpdir(), 'torob-in-the-loop', 'state.db');
    persistent = false;
    mkdirSync(dirname(finalPath), { recursive: true });
    log.warn('state dir not writable; using ephemeral temp storage (mount a disk for persistence)', {
      wanted: path,
      using: finalPath,
    });
  }
  const db = new StateDb(finalPath, persistent);
  db.exec(loadSchema());
  log.info('state db ready', { path: finalPath, persistent });
  return db;
}
