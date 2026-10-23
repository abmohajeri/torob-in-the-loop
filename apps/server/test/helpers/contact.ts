import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AlternativesResponse, OpenStatus, ShopLite, WeeklyHours } from '@titl/shared';
import { EventBus } from '../../src/bus.js';
import { loadConfig } from '../../src/config.js';
import { createContact } from '../../src/contact/index.js';
import type { ContactSettings } from '../../src/contact/engine.js';
import { openState } from '../../src/db/state.js';
import { createLogger } from '../../src/logger.js';
import type { Services } from '../../src/services/types.js';

export function fakeShop(id: string, name = `فروشگاه ${id}`): ShopLite {
  return {
    id,
    name,
    nameIsReal: false,
    area: 'جمهوری',
    address: null,
    lat: 35.7,
    lng: 51.4,
    distanceKm: 1,
    etaMin: 4,
    location: { mall: null, floorLabel: 'طبقه اول', floorNum: 1, unit: '۱۲', plaque: null, wing: null, landmark: null, guide: ['پاساژ علاءالدین', 'طبقه اول', 'واحد ۱۲'], confidence: 'high' },
    openStatus: { state: 'open', label: 'باز است', at: new Date().toISOString() },
    payment: { options: [], installment: false, torobPayInPerson: false, textHints: [], kalabarg: null, fastDelivery: null },
    hasOffers: true,
  };
}

export interface FakeWorld {
  open: Map<string, OpenStatus>;
}

/** Minimal Services stub: every shop exists, is open (unless overridden), product p1 registered at 40m. */
export function fakeServices(world: FakeWorld): Services {
  const hours: WeeklyHours = {
    declared: true,
    suspicious: false,
    days: (['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const).map((day) => ({ day, status: 'open' as const, shifts: [{ start: '10:00', end: '21:00' }] })),
  };
  const alts = (reason: AlternativesResponse['reason']): AlternativesResponse => ({
    reason,
    headline: 'جایگزین‌ها',
    sameProduct: [],
    samePassage: [{} as never, {} as never],
    similarProducts: [],
  });
  const s: Partial<Services> = {
    getShopLite: (id) => (id.startsWith('missing') ? null : fakeShop(id)),
    getShopHours: () => hours,
    openStatus: (id, at) => world.open.get(id) ?? { state: 'open', label: 'باز است تا ۲۱:۰۰', closesAt: '21:00', at: (at ?? new Date()).toISOString() },
    getProductSummary: (id) => ({ id, title: 'گوشی سامسونگ (چین) A07 4G | حافظه 64', minPrice: 38_000_000, maxPrice: 45_000_000 }) as never,
    registeredPrice: () => ({ price: 40_000_000, rawPrice: 40_000_000, status: 'ok', changedAt: null, ageDays: 3, freshness: 'fresh' }),
    alternatives: (req) => alts(req.reason),
    getStores: () => null,
    getShopProducts: () => ({ items: [], total: 0, page: 1, limit: 100 }),
  };
  return s as Services;
}

export function makeContact(opts: { dbPath?: string; settings?: Partial<ContactSettings>; world?: FakeWorld; now?: () => Date } = {}) {
  const dir = opts.dbPath ? null : mkdtempSync(join(tmpdir(), 'hitt-contact-'));
  const dbPath = opts.dbPath ?? join(dir!, 'state.db');
  const log = createLogger('error');
  const config = loadConfig({ NODE_ENV: 'test', LLM_DISABLED: '1', STATE_DB_PATH: dbPath });
  const state = openState(dbPath, log);
  const bus = new EventBus();
  const world = opts.world ?? { open: new Map() };
  const services = fakeServices(world);
  const contact = createContact(
    { services, state, bus, config, log },
    {
      now: opts.now,
      settings: { simulate: true, scenarios: false, timeScale: 1000, retrySeconds: 1, maxAttempts: 3, tickMs: 5, llmRephrase: false, ...opts.settings },
    },
  );
  return { contact, state, bus, world, dbPath, config, log, services };
}

export async function until(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > timeoutMs) throw new Error('timeout waiting for condition');
    await new Promise((r) => setTimeout(r, 5));
  }
}
