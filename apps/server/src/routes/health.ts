import type { Hono } from 'hono';
import type { HealthResponse } from '@titl/shared';
import type { AppDeps } from '../deps.js';

export function registerHealthRoutes(app: Hono, deps: AppDeps): void {
  app.get('/api/health', (c) => {
    let catalogOk = false;
    let products = 0;
    try {
      products = deps.catalog.get<{ n: number }>('SELECT count(*) AS n FROM products')?.n ?? 0;
      catalogOk = products > 0;
    } catch {
      catalogOk = false;
    }
    let stateOk = false;
    try {
      deps.state.get('SELECT 1 AS ok');
      stateOk = true;
    } catch {
      stateOk = false;
    }
    const body: HealthResponse = {
      status: catalogOk && stateOk ? 'ok' : 'degraded',
      uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000),
      catalog: { ok: catalogOk, products },
      state: { ok: stateOk, persistent: deps.state.persistent },
      llm: { enabled: deps.agent.llmEnabled(), model: deps.agent.llmEnabled() ? deps.config.LLM_MODEL : null },
      version: deps.config.version,
    };
    c.header('Cache-Control', 'no-store');
    return c.json(body, catalogOk && stateOk ? 200 : 503);
  });
}
