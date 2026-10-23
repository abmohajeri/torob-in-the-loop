/**
 * Contact & follow-up module (docs/ARCHITECTURE.md §9): inquiries (simulated AI calls + seller inbox),
 * restart-safe scheduler on the `jobs` table, follow-up digest, verification + crowd-report providers.
 */
import type { ContactDeps } from '../deps.js';
import { ContactEngine, settingsFromEnv, type ContactSettings } from './engine.js';
import { createReports, createVerification } from './providers.js';
import type { ContactModule } from './types.js';

export interface ContactModuleExt extends ContactModule {
  engine: ContactEngine;
  sellerStats(shopId: string): { askedToday: number; pending: number; staleOffers: number };
  askedShopIds(limit?: number): string[];
  /** Runtime toggle for DEMO_SCENARIOS (the /about switch). */
  setScenarios(on: boolean, name?: string): ContactSettings;
}

export function createContact(
  deps: ContactDeps,
  opts: { now?: () => Date; settings?: Partial<ContactSettings> } = {},
): ContactModuleExt {
  const now = opts.now ?? (() => new Date());
  const settings = { ...settingsFromEnv(deps), ...opts.settings };
  const engine = new ContactEngine(deps, settings, now);
  const reports = createReports(deps.state, now);
  return {
    engine,
    createInquiries: (req) => engine.createInquiries(req),
    listInquiries: (sessionId) => engine.listInquiries(sessionId),
    getInquiry: (id) => engine.getInquiry(id),
    retry: (id) => engine.retry(id, { callNow: true }),
    cancel: (id) => engine.cancel(id),
    sellerInbox: (shopId) => engine.sellerInbox(shopId),
    sellerReply: (shopId, id, reply) => engine.sellerReply(shopId, id, reply),
    addReport: (input) => reports.add(input),
    verification: createVerification(deps.state, now),
    reports: reports.provider,
    sellerStats: (shopId) => engine.sellerStats(shopId),
    askedShopIds: (limit) => engine.askedShopIds(limit),
    setScenarios: (on, name) => {
      engine.settings.scenarios = on;
      if (name) engine.settings.scenarioName = name;
      return { ...engine.settings };
    },
    start: () => engine.start(),
    stop: () => engine.stop(),
  };
}
