import type { AgentEvent, ChatMessageDTO, ChatRequest, CompareProductsResponse, UserContext } from '@titl/shared';

/**
 * Conversational shopping agent (LLM tool-calling with a deterministic Persian fallback).
 * Implemented in apps/server/src/agent/*.
 */
export interface AgentModule {
  /** Run one user turn; emits AgentEvents (streamed to the client as SSE). Never throws — emits {type:'error'}. */
  chat(req: ChatRequest, emit: (ev: AgentEvent) => void, signal: AbortSignal): Promise<void>;
  history(sessionId: string): ChatMessageDTO[];
  reset(sessionId: string): void;
  llmEnabled(): boolean;
  /** Optional AI verdict for the product comparison page; null when LLM is unavailable. */
  compareVerdict(data: CompareProductsResponse, ctx: UserContext, signal?: AbortSignal): Promise<string | null>;
  /** Speech-to-text through the LLM gateway; null when unavailable. */
  transcribe(audio: Blob, filename: string, signal?: AbortSignal): Promise<string | null>;
}
