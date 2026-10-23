/** Per-session working memory + chat persistence (state DB tables `agent_memory`, `chat_messages`). */
import { randomUUID } from 'node:crypto';
import type { ChatMessageDTO, UIBlock } from '@titl/shared';
import type { StateDb } from '../db/state.js';
import { json } from '../db/sqlite.js';

export interface AgentMemory {
  focusProductId: string | null;
  focusProductTitle: string | null;
  focusShopId: string | null;
  lastProductIds: string[];
  lastShopIds: string[];
  lastInquiryIds: string[];
  lastPlanShopIds: string[];
  lastQuery: string | null;
  lastCategory: string | null;
  /** Short handles shown to the LLM (P1/S1/I1) → real ids. */
  handles: Record<string, string>;
  /** Last intent handled (rules) — lets follow-ups like «ارزان‌ترها» reuse it. */
  lastIntent: string | null;
}

export const emptyMemory = (): AgentMemory => ({
  focusProductId: null,
  focusProductTitle: null,
  focusShopId: null,
  lastProductIds: [],
  lastShopIds: [],
  lastInquiryIds: [],
  lastPlanShopIds: [],
  lastQuery: null,
  lastCategory: null,
  handles: {},
  lastIntent: null,
});

/** One past turn, compact form for LLM history. */
export interface TurnDigest {
  role: 'user' | 'assistant';
  text: string;
  /** One-line tool digests («[ابزار find_stores: …]»). */
  tools?: string[];
}

export class ChatStore {
  constructor(private db: StateDb) {}

  loadMemory(sessionId: string): AgentMemory {
    const row = this.db.get<{ data: string }>('SELECT data FROM agent_memory WHERE session_id = ?', sessionId);
    return { ...emptyMemory(), ...json<Partial<AgentMemory>>(row?.data, {}) };
  }

  saveMemory(sessionId: string, mem: AgentMemory): void {
    // Keep the handle table bounded.
    const entries = Object.entries(mem.handles);
    if (entries.length > 120) mem.handles = Object.fromEntries(entries.slice(-120));
    this.db.run(
      `INSERT INTO agent_memory (session_id, data, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      sessionId,
      JSON.stringify(mem),
      new Date().toISOString(),
    );
  }

  addMessage(input: {
    sessionId: string;
    role: 'user' | 'assistant';
    text: string;
    blocks?: UIBlock[];
    tools?: string[];
    mode?: 'llm' | 'rules';
    id?: string;
  }): ChatMessageDTO {
    const id = input.id ?? randomUUID();
    const createdAt = new Date().toISOString();
    this.db.run(
      'INSERT INTO chat_messages (id, session_id, role, text, blocks, llm_messages, mode, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id,
      input.sessionId,
      input.role,
      input.text,
      JSON.stringify(input.blocks ?? []),
      input.tools?.length ? JSON.stringify(input.tools) : null,
      input.mode ?? null,
      createdAt,
    );
    const dto: ChatMessageDTO = { id, role: input.role, text: input.text, blocks: input.blocks ?? [], createdAt };
    if (input.mode) dto.mode = input.mode;
    return dto;
  }

  history(sessionId: string, limit = 100): ChatMessageDTO[] {
    const rows = this.db.all<{ id: string; role: string; text: string; blocks: string; mode: string | null; created_at: string }>(
      'SELECT id, role, text, blocks, mode, created_at FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
      sessionId,
      limit,
    );
    return rows.reverse().map((r) => {
      const m: ChatMessageDTO = {
        id: r.id,
        role: r.role === 'assistant' ? 'assistant' : 'user',
        text: r.text,
        blocks: json<UIBlock[]>(r.blocks, []),
        createdAt: r.created_at,
      };
      if (r.mode === 'llm' || r.mode === 'rules') m.mode = r.mode;
      return m;
    });
  }

  /** Last N messages as compact digests for the LLM (no raw blocks). */
  digests(sessionId: string, turns = 8): TurnDigest[] {
    const rows = this.db.all<{ role: string; text: string; llm_messages: string | null }>(
      'SELECT role, text, llm_messages FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
      sessionId,
      turns * 2,
    );
    return rows.reverse().map((r) => {
      const d: TurnDigest = { role: r.role === 'assistant' ? 'assistant' : 'user', text: r.text };
      const tools = json<string[]>(r.llm_messages, []);
      if (tools.length) d.tools = tools;
      return d;
    });
  }

  reset(sessionId: string): void {
    this.db.run('DELETE FROM chat_messages WHERE session_id = ?', sessionId);
    this.db.run('DELETE FROM agent_memory WHERE session_id = ?', sessionId);
  }
}
