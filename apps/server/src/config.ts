import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

/** Walk up from cwd to find `rel` (so `npm run dev` works from the repo root or apps/server). */
function findUp(rel: string, maxDepth = 4): string | null {
  let dir = process.cwd();
  for (let i = 0; i <= maxDepth; i++) {
    const p = join(dir, rel);
    if (existsSync(p)) return p;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function repoRoot(): string {
  const marker = findUp('packages/shared/package.json');
  return marker ? resolve(dirname(marker), '../..') : process.cwd();
}

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.string().default('production'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PUBLIC_BASE_URL: z.string().optional(),

  CATALOG_PATH: z.string().optional(),
  STATE_DB_PATH: z.string().optional(),
  WEB_DIST: z.string().optional(),

  // OpenAI-compatible LLM gateway (e.g. Liara AI: https://ai.liara.ir/api/v1/<id>)
  LLM_BASE_URL: z.string().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().default('anthropic/claude-sonnet-5.5'),
  LLM_FAST_MODEL: z.string().default('anthropic/claude-haiku-4.5'),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),
  LLM_MAX_STEPS: z.coerce.number().int().positive().default(6),
  LLM_DISABLED: bool(false),
  STT_MODEL: z.string().default('openai/whisper-large-v3'),

  // Contact / follow-up engine
  DEMO_MODE: bool(true),
  CALL_SPEED: z.coerce.number().positive().default(1),
  FOLLOWUP_RETRY_SECONDS: z.coerce.number().int().positive().default(45),
  FOLLOWUP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Optional integrations
  BALE_BOT_TOKEN: z.string().optional(),
  BALE_WEBHOOK_SECRET: z.string().optional(),
  NESHAN_API_KEY: z.string().optional(),
  MAP_TILE_URL: z.string().default('https://tile.openstreetmap.org/{z}/{x}/{y}.png'),
  MAP_ATTRIBUTION: z
    .string()
    .default('&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'),

  RATE_LIMIT_CHAT_PER_MIN: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_INQUIRY_PER_MIN: z.coerce.number().int().positive().default(30),
});

export type Env = z.infer<typeof EnvSchema>;

export interface Config extends Env {
  root: string;
  catalogPath: string;
  stateDbPath: string;
  webDist: string;
  isDev: boolean;
  llmEnabled: boolean;
  version: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.parse(env);
  const root = repoRoot();
  const abs = (p: string) => (isAbsolute(p) ? p : resolve(root, p));
  return {
    ...parsed,
    root,
    catalogPath: abs(parsed.CATALOG_PATH ?? 'data/catalog.db'),
    stateDbPath: abs(parsed.STATE_DB_PATH ?? 'data/state/state.db'),
    webDist: abs(parsed.WEB_DIST ?? 'apps/web/dist'),
    isDev: parsed.NODE_ENV === 'development',
    llmEnabled: !parsed.LLM_DISABLED && !!parsed.LLM_BASE_URL && !!parsed.LLM_API_KEY,
    version: env.npm_package_version ?? env.APP_VERSION ?? '1.0.0',
  };
}
