/** Assistant module: LLM tool-calling agent with a deterministic Persian fallback (docs/ARCHITECTURE.md §8). */
import type { AgentDeps } from '../deps.js';
import type { AgentModule } from './types.js';
import { Orchestrator, type OrchestratorOptions } from './orchestrator.js';
import { compareVerdict } from './verdict.js';

export function createAgent(deps: AgentDeps, opts: OrchestratorOptions = {}): AgentModule {
  const orch = new Orchestrator(deps, opts);
  return {
    async chat(req, emit, signal) {
      try {
        await orch.chat(req, emit, signal);
      } catch (e) {
        deps.log.error('agent chat crashed', { err: e as Error });
        emit({ type: 'error', message: 'دستیار با خطا روبه‌رو شد؛ لطفاً دوباره تلاش کنید.' });
      }
    },
    history: (sessionId) => orch.store.history(sessionId),
    reset: (sessionId) => orch.store.reset(sessionId),
    llmEnabled: () => !!orch.llmClient,
    compareVerdict: async (data, ctx, signal) => {
      const llm = orch.llmClient;
      if (!llm) return null;
      try {
        return await compareVerdict(llm, deps.config.LLM_FAST_MODEL, data, ctx, signal);
      } catch (e) {
        deps.log.warn('compare verdict failed', { err: e as Error });
        return null;
      }
    },
    transcribe: async (audio, filename, signal) => {
      const llm = orch.llmClient;
      if (!llm) return null;
      try {
        const t = await llm.transcribe(audio, filename, deps.config.STT_MODEL, signal);
        return t || null;
      } catch (e) {
        deps.log.warn('transcribe failed', { err: e as Error });
        return null;
      }
    },
  };
}
