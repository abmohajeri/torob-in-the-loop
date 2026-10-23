// @ts-check
/**
 * Reproduce exactly what `liara deploy` uploads for this project.
 *
 * Two strategies:
 *  - "cli"      — import the installed Liara CLI's own `createArchive()` (byte-exact).
 *  - "emulate"  — walk the tree with the same ignore algorithm (see ./ignore.mjs) and pack it with
 *                 tar + gzip level 9 (same as the CLI; size within a fraction of a percent).
 *
 * Liara CLI 9.4.7 facts reproduced here (lib/utils/create-archive.js):
 *  - default ignores: .git .idea .vscode .next .dockerignore *.*~ liara.json node_modules bower_components .DS_Store
 *  - per directory, ONE ignore file is read: .liaraignore, else .dockerignore, else .gitignore
 *  - every pattern is rebased to the project root with path.join/path.relative (which also drops trailing "/")
 *  - archive = tar.gz (gzip level 9); MAX_SOURCE_SIZE = 256 MiB client-side; plans: 128 MB (free/bronze), 256 MB.
 */
import { spawnSync } from 'node:child_process';
import { createReadStream, createWriteStream, existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import { createGunzip, createGzip } from 'node:zlib';
import { Ignore } from './ignore.mjs';

export const LIARA_DEFAULT_IGNORES = Object.freeze([
  '.git',
  '.idea',
  '.vscode',
  '.next',
  '.dockerignore',
  '*.*~',
  'liara.json',
  'node_modules',
  'bower_components',
  '.DS_Store',
]);

/** Extra ignores the CLI adds for some platforms (none for docker). */
export const LIARA_PLATFORM_IGNORES = Object.freeze(
  /** @type {Record<string, readonly string[]>} */ ({
    laravel: ['/vendor'],
    php: ['/vendor'],
  }),
);

/** Client-side hard limit in Liara CLI (constants.js). */
export const LIARA_MAX_SOURCE_BYTES = 256 * 1024 * 1024;
/** Server-side plan limits ("128MB" free/bronze, "256MB" standard/silver) — decimal MB to stay conservative. */
export const LIARA_PLAN_LIMITS = Object.freeze({ free: 128_000_000, standard: 256_000_000 });

/**
 * @typedef {{ path: string, type: 'file' | 'dir' | 'symlink', size: number }} ArchiveEntry
 * @typedef {{ mode: 'cli' | 'emulate', bytes: number, entries: ArchiveEntry[], cliRoot: string | null, cliVersion: string | null, archivePath: string | null }} UploadInfo
 */

/** @param {string} p */
const toPosix = (p) => p.split(sep).join('/');

/**
 * Add the patterns of one ignore file, rebased to the project root exactly like the CLI's loadIgnoreFile().
 * @param {Ignore} ig
 * @param {string} ignoreFilePath absolute
 * @param {string} projectPath absolute
 */
export function loadIgnoreFile(ig, ignoreFilePath, projectPath) {
  const lines = readFileSync(ignoreFilePath, 'utf8')
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'));
  const dir = dirname(ignoreFilePath);
  const rebased = lines.map((pattern) => {
    if (pattern.startsWith('!')) {
      const abs = pattern.slice(1).startsWith('/') ? '/' : '';
      return '!' + abs + relative(projectPath, join(dir, pattern.slice(1)));
    }
    const abs = pattern.startsWith('/') ? '/' : '';
    return abs + relative(projectPath, join(dir, pattern));
  });
  ig.add(rebased.map((p) => p.replace(/\\/g, '/')));
}

/**
 * @param {Ignore} ig
 * @param {string} projectPath
 * @param {string} dir relative to project ('.' for root)
 */
function addIgnorePatterns(ig, projectPath, dir) {
  for (const name of ['.liaraignore', '.dockerignore', '.gitignore']) {
    const p = join(projectPath, dir, name);
    if (existsSync(p)) {
      loadIgnoreFile(ig, p, projectPath);
      return;
    }
  }
}

/**
 * Walk the project like `tar.create({ filter })` in the Liara CLI and return what would be archived.
 * @param {string} projectDir
 * @param {{ platform?: string }} [opts]
 * @returns {ArchiveEntry[]}
 */
export function listUploadEntries(projectDir, opts = {}) {
  const projectPath = resolve(projectDir);
  const ig = new Ignore({ ignoreCase: false });
  ig.add([...LIARA_DEFAULT_IGNORES]);
  ig.add([...(LIARA_PLATFORM_IGNORES[opts.platform ?? 'docker'] ?? [])]);

  /** @param {string} rel */
  const keep = (rel) => {
    // The CLI re-reads the ignore file of the entry's directory before every test.
    addIgnorePatterns(ig, projectPath, toPosix(dirname(rel)));
    return !ig.ignores(rel);
  };

  /** @type {ArchiveEntry[]} */
  const out = [];
  /** @param {string} rel */
  const visit = (rel) => {
    const st = lstatSync(join(projectPath, rel));
    if (st.isSymbolicLink()) {
      out.push({ path: rel, type: 'symlink', size: 0 });
    } else if (st.isDirectory()) {
      out.push({ path: rel, type: 'dir', size: 0 });
      for (const name of readdirSync(join(projectPath, rel)).sort()) {
        const child = `${rel}/${name}`;
        if (keep(child)) visit(child);
      }
    } else if (st.isFile()) {
      out.push({ path: rel, type: 'file', size: st.size });
    }
  };
  const top = readdirSync(projectPath).sort().filter(keep);
  if (top.length === 0) throw new Error('Everything is ignored — Liara would refuse to deploy (check .liaraignore).');
  for (const name of top) visit(name);
  return out;
}

// ───────────────────────── tar (ustar) writer / reader ─────────────────────────

/**
 * @param {Buffer} buf
 * @param {number} off
 * @param {number} len
 * @param {number} value
 */
function writeOctal(buf, off, len, value) {
  const s = value.toString(8).padStart(len - 1, '0');
  buf.write(s.slice(-(len - 1)) + '\0', off, len, 'ascii');
}

/**
 * @param {string} name
 * @returns {{ name: string, prefix: string } | null}
 */
function splitUstarName(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  for (let i = name.indexOf('/'); i !== -1; i = name.indexOf('/', i + 1)) {
    const prefix = name.slice(0, i);
    const rest = name.slice(i + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(rest) <= 100) return { name: rest, prefix };
  }
  return null;
}

/**
 * @param {{ name: string, prefix?: string, size: number, type: string, mode: number, mtime: number }} h
 */
function ustarHeader(h) {
  const b = Buffer.alloc(512, 0);
  b.write(h.name, 0, 100, 'utf8');
  writeOctal(b, 100, 8, h.mode);
  writeOctal(b, 108, 8, 0);
  writeOctal(b, 116, 8, 0);
  writeOctal(b, 124, 12, h.size);
  writeOctal(b, 136, 12, h.mtime);
  b.fill(0x20, 148, 156); // checksum placeholder (spaces)
  b.write(h.type, 156, 1, 'ascii');
  b.write('ustar\0', 257, 6, 'ascii');
  b.write('00', 263, 2, 'ascii');
  if (h.prefix) b.write(h.prefix, 345, 155, 'utf8');
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += b[i] ?? 0;
  writeOctal(b, 148, 7, sum);
  b[155] = 0x20;
  return b;
}

/** @param {string} path */
function paxHeaderFor(path) {
  /** @param {string} k @param {string} v */
  const record = (k, v) => {
    const body = ` ${k}=${v}\n`;
    let len = Buffer.byteLength(body);
    let total = len + String(len).length;
    if (String(total).length !== String(len).length) total = len + String(total).length;
    return `${total}${body}`;
  };
  const data = Buffer.from(record('path', path), 'utf8');
  const head = ustarHeader({ name: 'PaxHeader', size: data.length, type: 'x', mode: 0o644, mtime: 0 });
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512, 0);
  return Buffer.concat([head, data, pad]);
}

/**
 * Stream the entries as a gzip(level 9) tarball; returns the compressed size. Optionally keep the file.
 * @param {string} projectDir
 * @param {ArchiveEntry[]} entries
 * @param {string | null} [outFile]
 */
export async function packTarGz(projectDir, entries, outFile = null) {
  const root = resolve(projectDir);
  const mtime = Math.floor(Date.now() / 1000);
  async function* tarStream() {
    for (const e of entries) {
      const name = e.type === 'dir' ? `${e.path}/` : e.path;
      const split = splitUstarName(name);
      if (!split) yield paxHeaderFor(name);
      const hdrName = split ?? { name: name.slice(-100), prefix: '' };
      const type = e.type === 'dir' ? '5' : e.type === 'symlink' ? '2' : '0';
      const size = e.type === 'file' ? e.size : 0;
      yield ustarHeader({ name: hdrName.name, prefix: hdrName.prefix, size, type, mode: e.type === 'dir' ? 0o755 : 0o644, mtime });
      if (e.type === 'file' && size > 0) {
        let written = 0;
        for await (const chunk of createReadStream(join(root, e.path))) {
          const buf = /** @type {Buffer} */ (chunk);
          written += buf.length;
          yield buf;
        }
        if (written !== size) throw new Error(`file changed while packing: ${e.path}`);
        const pad = (512 - (size % 512)) % 512;
        if (pad) yield Buffer.alloc(pad, 0);
      }
    }
    yield Buffer.alloc(1024, 0); // end-of-archive marker
  }
  let bytes = 0;
  const file = outFile ? createWriteStream(outFile) : null;
  const sink = new Writable({
    write(chunk, _enc, cb) {
      bytes += chunk.length;
      if (file) file.write(chunk, cb);
      else cb();
    },
    final(cb) {
      if (file) file.end(cb);
      else cb();
    },
  });
  await pipeline(Readable.from(tarStream()), createGzip({ level: 9 }), sink);
  return bytes;
}

/**
 * List the entries of a .tar.gz (ustar + pax/GNU long names) without extracting it.
 * @param {string} file
 * @returns {Promise<ArchiveEntry[]>}
 */
export async function readTarGz(file) {
  /** @type {ArchiveEntry[]} */
  const entries = [];
  /** @type {Buffer[]} */
  let queue = [];
  let queued = 0;
  let skip = 0; // bytes of file data (incl. padding) still to discard
  /** @type {null | { kind: 'pax' | 'gnu', remaining: number, chunks: Buffer[], padded: number }} */
  let meta = null;
  /** @type {string | null} */
  let nextPath = null;
  let ended = false;

  /** @param {number} n */
  const take = (n) => {
    const out = Buffer.alloc(n);
    let off = 0;
    while (off < n) {
      const head = /** @type {Buffer} */ (queue[0]);
      const k = Math.min(head.length, n - off);
      head.copy(out, off, 0, k);
      off += k;
      if (k === head.length) queue.shift();
      else queue[0] = head.subarray(k);
    }
    queued -= n;
    return out;
  };
  /** @param {Buffer} b @param {number} off @param {number} len */
  const str = (b, off, len) => {
    const s = b.subarray(off, off + len);
    const z = s.indexOf(0);
    return (z === -1 ? s : s.subarray(0, z)).toString('utf8');
  };
  /** @param {Buffer} b @param {number} off @param {number} len */
  const oct = (b, off, len) => {
    const s = str(b, off, len).trim();
    return s ? Number.parseInt(s, 8) : 0;
  };

  const drain = () => {
    while (!ended) {
      if (skip > 0) {
        const n = Math.min(skip, queued);
        if (n === 0) return;
        take(n);
        skip -= n;
        continue;
      }
      if (meta) {
        const n = Math.min(meta.remaining, queued);
        if (n > 0) {
          meta.chunks.push(take(n));
          meta.remaining -= n;
        }
        if (meta.remaining > 0) return;
        const data = Buffer.concat(meta.chunks).toString('utf8');
        if (meta.kind === 'gnu') nextPath = data.replace(/\0+$/, '');
        else {
          for (const m of data.matchAll(/(\d+) ([^=]+)=([^\n]*)\n/g)) if (m[2] === 'path' && m[3] !== undefined) nextPath = m[3];
        }
        skip = meta.padded;
        meta = null;
        continue;
      }
      if (queued < 512) return;
      const h = take(512);
      if (h.every((x) => x === 0)) {
        ended = true;
        return;
      }
      const size = oct(h, 124, 12);
      const type = String.fromCharCode(h[156] ?? 0x30);
      const padded = (512 - (size % 512)) % 512;
      if (type === 'x' || type === 'L') {
        meta = { kind: type === 'x' ? 'pax' : 'gnu', remaining: size, chunks: [], padded };
        continue;
      }
      if (type === 'g') {
        skip = size + padded;
        continue;
      }
      const prefix = str(h, 345, 155);
      const name = str(h, 0, 100);
      let path = nextPath ?? (prefix ? `${prefix}/${name}` : name);
      nextPath = null;
      path = path.replace(/^\.\//, '').replace(/\/$/, '');
      const kind = type === '5' ? 'dir' : type === '2' ? 'symlink' : 'file';
      entries.push({ path, type: kind, size: kind === 'file' ? size : 0 });
      skip = kind === 'file' ? size + padded : 0;
    }
  };

  await pipeline(
    createReadStream(file),
    createGunzip(),
    new Writable({
      write(chunk, _enc, cb) {
        if (!ended) {
          queue.push(chunk);
          queued += chunk.length;
          drain();
        }
        cb();
      },
    }),
  );
  queue = [];
  return entries;
}

// ───────────────────────── Liara CLI discovery ─────────────────────────

/**
 * Locate the installed @liara/cli package root (or null).
 * Order: $LIARA_CLI_ROOT · the `liara` binary on PATH · `npm root -g`.
 * @returns {string | null}
 */
export function findLiaraCliRoot() {
  /** @param {string | undefined | null} dir */
  const isCli = (dir) => {
    if (!dir) return false;
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      return pkg.name === '@liara/cli' && existsSync(join(dir, 'lib/utils/create-archive.js'));
    } catch {
      return false;
    }
  };
  const fromEnv = process.env.LIARA_CLI_ROOT;
  if (fromEnv && isCli(fromEnv)) return resolve(fromEnv);

  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['liara'], { encoding: 'utf8' });
  const bin = which.status === 0 ? which.stdout.split(/\r?\n/)[0]?.trim() : '';
  if (bin) {
    try {
      let dir = dirname(realpathSync(bin));
      for (let i = 0; i < 4; i++) {
        if (isCli(dir)) return dir;
        dir = dirname(dir);
      }
    } catch {
      /* fall through */
    }
  }
  const npmRoot = spawnSync('npm', ['root', '-g'], { encoding: 'utf8' });
  if (npmRoot.status === 0) {
    const dir = join(npmRoot.stdout.trim(), '@liara', 'cli');
    if (isCli(dir)) return dir;
  }
  return null;
}

/** @param {string} cliRoot */
function cliVersion(cliRoot) {
  try {
    return String(JSON.parse(readFileSync(join(cliRoot, 'package.json'), 'utf8')).version ?? '') || null;
  } catch {
    return null;
  }
}

/**
 * Build the upload archive and describe it.
 * @param {string} projectDir
 * @param {{ mode?: 'auto' | 'cli' | 'emulate', platform?: string, archivePath: string }} opts
 * @returns {Promise<UploadInfo>}
 */
export async function inspectUpload(projectDir, opts) {
  const projectPath = resolve(projectDir);
  const platform = opts.platform ?? 'docker';
  const mode = opts.mode ?? 'auto';
  const cliRoot = mode === 'emulate' ? null : findLiaraCliRoot();
  if (mode === 'cli' && !cliRoot) throw new Error('Liara CLI not found (install: npm i -g @liara/cli@9).');

  if (cliRoot) {
    const mod = await import(pathToFileURL(join(cliRoot, 'lib/utils/create-archive.js')).href);
    await mod.default(opts.archivePath, projectPath, platform, () => {});
    const entries = await readTarGz(opts.archivePath);
    const bytes = lstatSync(opts.archivePath).size;
    return { mode: 'cli', bytes, entries, cliRoot, cliVersion: cliVersion(cliRoot), archivePath: opts.archivePath };
  }
  const entries = listUploadEntries(projectPath, { platform });
  const bytes = await packTarGz(projectPath, entries, opts.archivePath);
  return { mode: 'emulate', bytes, entries, cliRoot: null, cliVersion: null, archivePath: opts.archivePath };
}
