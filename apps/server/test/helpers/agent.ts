import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentEvent, CreateInquiriesRequest, Inquiry } from '@titl/shared';
import type { createAgent } from '../../src/agent/index.js';
import { openState } from '../../src/db/state.js';
import { createLogger } from '../../src/logger.js';
import type { AgentDeps } from '../../src/deps.js';
import type { ContactModule } from '../../src/contact/types.js';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/config.js';
import { openCatalog } from '../../src/db/catalog.js';
import { noopReports, noopVerification } from '../../src/deps.js';
import { createServices } from '../../src/services/index.js';
import type { Services } from '../../src/services/types.js';

/** Real catalog (data/catalog.db) — the agent is exercised on real Persian data; falls back to fixture.db. */
const CATALOG = fileURLToPath(new URL('../../../../data/catalog.db', import.meta.url));
const FIXTURE = fileURLToPath(new URL('../../../../data/fixture.db', import.meta.url));
const DB = existsSync(CATALOG) ? CATALOG : FIXTURE;
export const hasCatalog = existsSync(DB);
let svc: Services | null = null;
function services(): Services {
  if (svc) return svc;
  const log = createLogger('error');
  const config = loadConfig({ ...process.env, CATALOG_PATH: DB, NODE_ENV: 'test' });
  svc = createServices({ catalog: openCatalog(DB, log), config, log, providers: { verification: noopVerification, reports: noopReports } });
  return svc;
}


export function fakeContact() {
  const created: CreateInquiriesRequest[] = [];
  const reports: { shopId: string; type: string }[] = [];
  let store: Inquiry[] = [];
  const contact = {
    createInquiries(req: CreateInquiriesRequest) {
      created.push(req);
      const items = req.shopIds.map((shopId, i) => ({ id: `inq${created.length}_${i}`, sessionId: req.sessionId, shop: { id: shopId, name: `فروشگاه ${i + 1}` }, status: 'queued', result: null }) as unknown as Inquiry);
      store = [...items, ...store];
      return items;
    },
    listInquiries: () => store,
    addReport(input: { shopId: string; type: string }) {
      reports.push(input);
      return { id: 'r1', shopId: input.shopId, type: input.type, note: null, at: new Date().toISOString() };
    },
  } as unknown as ContactModule;
  return { contact, created, reports, setInquiries: (x: Inquiry[]) => (store = x) };
}

export function agentDeps(contact: ContactModule, env: Record<string, string> = {}): AgentDeps {
  const log = createLogger('error');
  const state = openState(join(mkdtempSync(join(tmpdir(), 'hitt-agent-')), 'state.db'), log);
  const config = { LLM_MODEL: 'm', LLM_FAST_MODEL: 'f', LLM_MAX_STEPS: 6, LLM_TIMEOUT_MS: 3000, STT_MODEL: 's', llmEnabled: false, ...env } as unknown as AgentDeps['config'];
  return { services: services(), contact, state, config, log };
}

export async function turn(agent: ReturnType<typeof createAgent>, sessionId: string, message: string, context = {}) {
  const events: AgentEvent[] = [];
  await agent.chat({ sessionId, message, context }, (e) => events.push(e), new AbortController().signal);
  const text = events.filter((e): e is Extract<AgentEvent, { type: 'text' }> => e.type === 'text').map((e) => e.delta).join('');
  const blocks = events.filter((e): e is Extract<AgentEvent, { type: 'block' }> => e.type === 'block').map((e) => e.block);
  const done = events.find((e) => e.type === 'done') as Extract<AgentEvent, { type: 'done' }> | undefined;
  return { events, text, blocks, kinds: blocks.map((b) => b.kind), done };
}

