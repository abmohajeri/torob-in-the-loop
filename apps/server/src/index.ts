import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { openCatalog } from './db/catalog.js';
import { openState } from './db/state.js';
import { EventBus } from './bus.js';
import { noopReports, noopVerification, type AppDeps, type Providers } from './deps.js';
import { createServices } from './services/index.js';
import { createContact } from './contact/index.js';
import { createAgent } from './agent/index.js';
import { createApp } from './app.js';

const config = loadConfig();
const log = createLogger(config.LOG_LEVEL, config.isDev);

process.on('unhandledRejection', (reason) => log.error('unhandledRejection', { err: reason as Error }));
process.on('uncaughtException', (err) => log.error('uncaughtException', { err }));

const catalog = openCatalog(config.catalogPath, log);
const state = openState(config.stateDbPath, log);
const bus = new EventBus();
const providers: Providers = { verification: noopVerification, reports: noopReports };
const services = createServices({ catalog, config, log: log.child({ mod: 'services' }), providers });
const contact = createContact({ services, state, bus, config, log: log.child({ mod: 'contact' }) });
providers.verification = contact.verification;
providers.reports = contact.reports;
const agent = createAgent({ services, contact, state, config, log: log.child({ mod: 'agent' }) });

const deps: AppDeps = { config, log, catalog, state, bus, services, contact, agent, startedAt: Date.now() };
const app = createApp(deps);

contact.start();
const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  log.info('torob-in-the-loop listening', {
    url: `http://${info.address === '0.0.0.0' ? 'localhost' : info.address}:${info.port}`,
    llm: config.llmEnabled ? config.LLM_MODEL : 'disabled (rule-based assistant)',
    demo: config.DEMO_MODE,
  });
});

function shutdown(signal: string) {
  log.info('shutting down', { signal });
  contact.stop();
  server.close(() => {
    state.close();
    catalog.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
