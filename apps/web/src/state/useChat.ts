/**
 * Assistant conversation state (Home page). Streams `AgentEvent`s from POST /api/chat; when the agent endpoint
 * is not available (404 / network) it degrades to a local "basic mode" turn built from /api/search so the
 * assistant never dead-ends.
 */
import { create } from 'zustand';
import { formatNumber, type AgentEvent, type UIBlock, type UserContext } from '@titl/shared';
import { api, ApiError, errorMessage } from '../lib/api.js';
import { getSessionId } from '../lib/session.js';
import { getUserContext, useContextStore } from './useContextStore.js';

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  blocks: UIBlock[];
  /** Latest status line while streaming («در حال جستجوی فروشگاه‌ها…»). */
  status?: string;
  streaming?: boolean;
  error?: string;
  mode?: 'llm' | 'rules' | 'local';
  /** Context changes the assistant made in this turn (for the «برگرداندن» caption). */
  contextChange?: { patch: Partial<UserContext>; before: UserContext };
}

interface ChatState {
  turns: ChatTurn[];
  busy: boolean;
  send: (message: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** Undo the context patch applied by an assistant turn. */
  undoContext: (turnId: string) => void;
}

let controller: AbortController | null = null;
const uid = () => Math.random().toString(36).slice(2, 10);

/** Local fallback when /api/chat is not reachable: search + quick replies. */
async function localTurn(message: string, ctx: UserContext, emit: (e: AgentEvent) => void, signal: AbortSignal) {
  emit({ type: 'status', text: 'در حال جستجو در کالاها و فروشگاه‌ها…' });
  const res = await api.search({ q: message, limit: 6 }, ctx, signal);
  if (res.items.length) {
    emit({
      type: 'text',
      delta: `${formatNumber(res.total)} کالا پیدا کردم. این‌ها نزدیک‌ترین گزینه‌ها به خواسته‌ی شما هستند؛ روی هر کدام بزنید تا فروشگاه‌های حضوری‌اش را ببینید.`,
    });
    emit({ type: 'block', block: { kind: 'products', items: res.items, parsed: res.parsed, total: res.total } });
  } else {
    emit({ type: 'text', delta: 'کالای دقیقاً مطابقی پیدا نکردم. با چند سؤال کوتاه کمکتان می‌کنم انتخاب کنید.' });
    try {
      const d = await api.discover({ q: message }, ctx, signal);
      if (d.questions.length) emit({ type: 'block', block: { kind: 'discovery', data: d } });
    } catch {
      /* discovery optional */
    }
  }
  if (res.didYouMean) emit({ type: 'block', block: { kind: 'quick_replies', options: [{ label: `منظورتان «${res.didYouMean}» بود؟`, message: res.didYouMean }] } });
  emit({ type: 'done', messageId: uid(), mode: 'rules' });
}

export const useChat = create<ChatState>()((set, get) => {
  const patchTurn = (id: string, fn: (t: ChatTurn) => ChatTurn) => set((s) => ({ turns: s.turns.map((t) => (t.id === id ? fn(t) : t)) }));

  return {
    turns: [],
    busy: false,
    stop: () => {
      controller?.abort();
      controller = null;
      set((s) => ({ busy: false, turns: s.turns.map((t) => (t.streaming ? { ...t, streaming: false, status: undefined } : t)) }));
    },
    reset: () => {
      get().stop();
      set({ turns: [] });
      api.chatReset(getSessionId()).catch(() => undefined);
    },
    undoContext: (turnId) => {
      const turn = get().turns.find((t) => t.id === turnId);
      if (!turn?.contextChange) return;
      useContextStore.setState({ ctx: turn.contextChange.before });
      patchTurn(turnId, (t) => ({ ...t, contextChange: undefined }));
    },
    send: async (raw) => {
      const message = raw.trim();
      if (!message || get().busy) return;
      controller?.abort();
      const ac = new AbortController();
      controller = ac;
      const aid = uid();
      set((s) => ({
        busy: true,
        turns: [
          ...s.turns,
          { id: uid(), role: 'user', text: message, blocks: [] },
          { id: aid, role: 'assistant', text: '', blocks: [], streaming: true, status: 'در حال فکر کردن…' },
        ],
      }));

      const onEvent = (e: AgentEvent) => {
        if (ac.signal.aborted) return;
        switch (e.type) {
          case 'status':
            patchTurn(aid, (t) => ({ ...t, status: e.text }));
            break;
          case 'text':
            patchTurn(aid, (t) => ({ ...t, text: t.text + e.delta, status: undefined }));
            break;
          case 'block':
            patchTurn(aid, (t) => ({ ...t, blocks: [...t.blocks, e.block] }));
            break;
          case 'context': {
            const before = useContextStore.getState().ctx;
            useContextStore.getState().patch(e.patch);
            patchTurn(aid, (t) => ({ ...t, contextChange: { patch: { ...t.contextChange?.patch, ...e.patch }, before: t.contextChange?.before ?? before } }));
            break;
          }
          case 'done':
            patchTurn(aid, (t) => ({ ...t, mode: t.mode ?? e.mode }));
            break;
          case 'error':
            patchTurn(aid, (t) => ({ ...t, error: e.message }));
            break;
        }
      };

      const ctx = getUserContext();
      try {
        try {
          await api.chat({ sessionId: getSessionId(), message, context: ctx }, onEvent, ac.signal);
        } catch (e) {
          if (ac.signal.aborted) throw e;
          // Agent endpoint not ready / unreachable → basic local mode.
          if (e instanceof ApiError && (e.isNotFound || e.status >= 500 || e.isNetwork)) {
            patchTurn(aid, (t) => ({ ...t, mode: 'local', text: '', blocks: [] }));
            await localTurn(message, ctx, onEvent, ac.signal);
          } else throw e;
        }
      } catch (e) {
        if (!ac.signal.aborted) patchTurn(aid, (t) => ({ ...t, error: errorMessage(e) }));
      } finally {
        if (controller === ac) controller = null;
        patchTurn(aid, (t) => ({ ...t, streaming: false, status: undefined }));
        set({ busy: false });
      }
    },
  };
});
