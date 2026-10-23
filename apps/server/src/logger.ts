type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

/** Structured JSON logs in production (one line per event), compact text in development. */
export function createLogger(level: Level = 'info', pretty = false, base: Record<string, unknown> = {}): Logger {
  const min = ORDER[level];
  const write = (lvl: Level, msg: string, fields?: Record<string, unknown>) => {
    if (ORDER[lvl] < min) return;
    const rec: Record<string, unknown> & { t: string } = { t: new Date().toISOString(), lvl, msg, ...base, ...fields };
    if (fields?.err instanceof Error) {
      rec.err = { message: fields.err.message, stack: fields.err.stack };
    }
    const line = pretty
      ? `${rec.t.slice(11, 19)} ${lvl.toUpperCase().padEnd(5)} ${msg}${
          Object.keys({ ...base, ...fields }).length ? ' ' + JSON.stringify({ ...base, ...fields }) : ''
        }`
      : JSON.stringify(rec);
    (lvl === 'error' || lvl === 'warn' ? process.stderr : process.stdout).write(line + '\n');
  };
  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (f) => createLogger(level, pretty, { ...base, ...f }),
  };
}
