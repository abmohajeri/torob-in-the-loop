// Bundles the server (incl. hono/zod/shared) into a single ESM file so the runtime image needs no node_modules.
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  legalComments: 'none',
  external: ['node:*'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
mkdirSync('dist', { recursive: true });
cpSync('src/db/state-schema.sql', 'dist/state-schema.sql');
