import type { Config } from './config.js';
import type { Logger } from './logger.js';
import type { CatalogDb } from './db/catalog.js';
import type { StateDb } from './db/state.js';
import type { EventBus } from './bus.js';
import type { ReportsProvider, Services, VerificationProvider } from './services/types.js';
import type { ContactModule } from './contact/types.js';
import type { AgentModule } from './agent/types.js';

/** Late-bound providers so services (built first) can read contact-module data (built second). */
export interface Providers {
  verification: VerificationProvider;
  reports: ReportsProvider;
}

export interface ServiceDeps {
  catalog: CatalogDb;
  config: Config;
  log: Logger;
  providers: Providers;
}

export interface ContactDeps {
  services: Services;
  state: StateDb;
  bus: EventBus;
  config: Config;
  log: Logger;
}

export interface AgentDeps {
  services: Services;
  contact: ContactModule;
  state: StateDb;
  config: Config;
  log: Logger;
}

export interface AppDeps {
  config: Config;
  log: Logger;
  catalog: CatalogDb;
  state: StateDb;
  bus: EventBus;
  services: Services;
  contact: ContactModule;
  agent: AgentModule;
  startedAt: number;
}

export const noopVerification: VerificationProvider = { latestFor: () => new Map() };
export const noopReports: ReportsProvider = { forShop: () => [], recentByShops: () => new Map() };
