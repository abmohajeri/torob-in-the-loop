/** State-DB access for inquiries, inquiry events, batches and the jobs queue. */
import type { InquiryChannel, InquiryEvent, InquiryQuestion, InquiryStatus } from '@titl/shared';
import type { StateDb } from '../db/state.js';
import type { SqlValue } from '../db/sqlite.js';

export interface InquiryRow {
  id: string;
  session_id: string;
  batch_id: string | null;
  shop_id: string;
  product_id: string | null;
  questions: string;
  custom_question: string | null;
  status: InquiryStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  channel: InquiryChannel;
  result: string | null;
  result_source: InquiryChannel | null;
  registered_price: string | null;
  alternatives: string | null;
  context: string | null;
  created_at: string;
  updated_at: string;
  // inquiry_meta (LEFT JOIN)
  batch_index: number | null;
  batch_ordinal: number | null;
  scenario: string | null;
  variant: string | null;
  clock_offset_ms: number | null;
  force: number | null;
  status_note: string | null;
  published: number | null;
}

export interface BatchRow {
  id: string;
  session_id: string;
  product_id: string | null;
  created_at: string;
  first_miss_posted: number;
  digest_hash: string | null;
  digest_count: number;
}

export interface JobRow {
  id: number;
  kind: string;
  ref_id: string;
  run_at: string;
  payload: string | null;
  attempts: number;
}

const SELECT = `SELECT i.*, m.batch_index, m.batch_ordinal, m.scenario, m.variant, m.clock_offset_ms, m.force, m.status_note, m.published
  FROM inquiries i LEFT JOIN inquiry_meta m ON m.inquiry_id = i.id`;

export const FINAL: ReadonlySet<InquiryStatus> = new Set(['resolved', 'unreachable', 'cancelled']);
export const ACTIVE: ReadonlySet<InquiryStatus> = new Set(['queued', 'calling', 'in_call', 'answered']);

export type InquiryPatch = Partial<{
  status: InquiryStatus;
  attempts: number;
  max_attempts: number;
  next_attempt_at: string | null;
  result: string | null;
  result_source: InquiryChannel | null;
  alternatives: string | null;
}>;

export class ContactStore {
  constructor(readonly db: StateDb) {}

  insertInquiry(r: {
    id: string;
    sessionId: string;
    batchId: string;
    shopId: string;
    productId: string | null;
    questions: InquiryQuestion[];
    customQuestion: string | null;
    status: InquiryStatus;
    maxAttempts: number;
    channel: InquiryChannel;
    registeredPrice: string | null;
    context: string | null;
    now: string;
    meta: { batchIndex: number; batchOrdinal: number; scenario: string | null; variant: string | null; clockOffsetMs: number; force: boolean };
  }): void {
    this.db.run(
      `INSERT INTO inquiries (id, session_id, batch_id, shop_id, product_id, questions, custom_question, status, attempts, max_attempts,
         next_attempt_at, channel, result, result_source, registered_price, alternatives, context, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, NULL, NULL, ?, NULL, ?, ?, ?)`,
      r.id,
      r.sessionId,
      r.batchId,
      r.shopId,
      r.productId,
      JSON.stringify(r.questions),
      r.customQuestion,
      r.status,
      r.maxAttempts,
      r.channel,
      r.registeredPrice,
      r.context,
      r.now,
      r.now,
    );
    this.db.run(
      `INSERT INTO inquiry_meta (inquiry_id, batch_index, batch_ordinal, scenario, variant, clock_offset_ms, force) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      r.id,
      r.meta.batchIndex,
      r.meta.batchOrdinal,
      r.meta.scenario,
      r.meta.variant,
      r.meta.clockOffsetMs,
      r.meta.force ? 1 : 0,
    );
  }

  get(id: string): InquiryRow | undefined {
    return this.db.get<InquiryRow>(`${SELECT} WHERE i.id = ?`, id);
  }

  bySession(sessionId: string, limit = 100): InquiryRow[] {
    return this.db.all<InquiryRow>(`${SELECT} WHERE i.session_id = ? ORDER BY i.created_at DESC, m.batch_index ASC LIMIT ?`, sessionId, limit);
  }

  byShop(shopId: string, limit = 50): InquiryRow[] {
    return this.db.all<InquiryRow>(`${SELECT} WHERE i.shop_id = ? ORDER BY i.created_at DESC LIMIT ?`, shopId, limit);
  }

  byBatch(batchId: string): InquiryRow[] {
    return this.db.all<InquiryRow>(`${SELECT} WHERE i.batch_id = ? ORDER BY m.batch_index ASC`, batchId);
  }

  updatedSince(sessionId: string, since: string): InquiryRow[] {
    return this.db.all<InquiryRow>(`${SELECT} WHERE i.session_id = ? AND i.updated_at > ? ORDER BY i.updated_at`, sessionId, since);
  }

  /** Non-final inquiries (boot recovery). */
  unfinished(): InquiryRow[] {
    return this.db.all<InquiryRow>(`${SELECT} WHERE i.status NOT IN ('resolved','unreachable','cancelled','awaiting_seller')`);
  }

  update(id: string, patch: InquiryPatch, now: string): void {
    const keys = Object.keys(patch) as (keyof InquiryPatch)[];
    if (!keys.length) return;
    const sets = keys.map((k) => `${k} = ?`).join(', ');
    const vals = keys.map((k) => (patch[k] ?? null) as SqlValue);
    this.db.run(`UPDATE inquiries SET ${sets}, updated_at = ? WHERE id = ?`, ...vals, now, id);
  }

  setMeta(id: string, patch: Partial<{ status_note: string | null; published: number }>): void {
    for (const [k, v] of Object.entries(patch)) this.db.run(`UPDATE inquiry_meta SET ${k} = ? WHERE inquiry_id = ?`, (v ?? null) as SqlValue, id);
  }

  addEvent(inquiryId: string, at: string, type: InquiryEvent['type'], speaker: InquiryEvent['speaker'] | null, text: string, data?: unknown): InquiryEvent {
    const r = this.db.run(
      `INSERT INTO inquiry_events (inquiry_id, at, type, speaker, text, data) VALUES (?, ?, ?, ?, ?, ?)`,
      inquiryId,
      at,
      type,
      speaker ?? null,
      text,
      data === undefined ? null : JSON.stringify(data),
    );
    const ev: InquiryEvent = { id: Number(r.lastInsertRowid), at, type, text };
    if (speaker) ev.speaker = speaker;
    if (data !== undefined) ev.data = data;
    return ev;
  }

  events(inquiryId: string): InquiryEvent[] {
    return this.db
      .all<{ id: number; at: string; type: InquiryEvent['type']; speaker: string | null; text: string; data: string | null }>(
        `SELECT id, at, type, speaker, text, data FROM inquiry_events WHERE inquiry_id = ? ORDER BY id`,
        inquiryId,
      )
      .map((e) => {
        const ev: InquiryEvent = { id: e.id, at: e.at, type: e.type, text: e.text };
        if (e.speaker) ev.speaker = e.speaker as InquiryEvent['speaker'];
        if (e.data) {
          try {
            ev.data = JSON.parse(e.data);
          } catch {
            /* ignore */
          }
        }
        return ev;
      });
  }

  // ── batches ──
  insertBatch(id: string, sessionId: string, productId: string | null, now: string): number {
    const n = this.db.get<{ n: number }>(`SELECT count(*) AS n FROM inquiry_batches WHERE session_id = ?`, sessionId)?.n ?? 0;
    this.db.run(`INSERT INTO inquiry_batches (id, session_id, product_id, created_at) VALUES (?, ?, ?, ?)`, id, sessionId, productId, now);
    return n + 1;
  }

  batch(id: string): BatchRow | undefined {
    return this.db.get<BatchRow>(`SELECT * FROM inquiry_batches WHERE id = ?`, id);
  }

  markFirstMiss(id: string): boolean {
    return Number(this.db.run(`UPDATE inquiry_batches SET first_miss_posted = 1 WHERE id = ? AND first_miss_posted = 0`, id).changes) > 0;
  }

  setDigest(id: string, hash: string): void {
    this.db.run(`UPDATE inquiry_batches SET digest_hash = ?, digest_count = digest_count + 1 WHERE id = ?`, hash, id);
  }

  // ── jobs ──
  enqueue(kind: string, refId: string, runAt: string, payload?: unknown): void {
    this.db.run(`INSERT INTO jobs (kind, ref_id, run_at, payload) VALUES (?, ?, ?, ?)`, kind, refId, runAt, payload === undefined ? null : JSON.stringify(payload));
  }

  cancelJobs(refId: string): void {
    this.db.run(`UPDATE jobs SET done = 1 WHERE ref_id = ? AND done = 0`, refId);
  }

  pendingJobs(refId: string): number {
    return this.db.get<{ n: number }>(`SELECT count(*) AS n FROM jobs WHERE ref_id = ? AND done = 0`, refId)?.n ?? 0;
  }

  /** Atomically claim due jobs (lock for `lockMs`). */
  claimDue(now: Date, lockMs: number, limit = 20): JobRow[] {
    const iso = now.toISOString();
    return this.db.tx(() => {
      const rows = this.db.all<JobRow>(
        `SELECT id, kind, ref_id, run_at, payload, attempts FROM jobs
          WHERE done = 0 AND run_at <= ? AND (locked_until IS NULL OR locked_until < ?) ORDER BY run_at LIMIT ?`,
        iso,
        iso,
        limit,
      );
      const until = new Date(now.getTime() + lockMs).toISOString();
      for (const r of rows) this.db.run(`UPDATE jobs SET locked_until = ?, attempts = attempts + 1 WHERE id = ?`, until, r.id);
      return rows;
    });
  }

  finishJob(id: number): void {
    this.db.run(`UPDATE jobs SET done = 1, locked_until = NULL WHERE id = ?`, id);
  }

  releaseJob(id: number, runAt: string): void {
    this.db.run(`UPDATE jobs SET locked_until = NULL, run_at = ? WHERE id = ?`, runAt, id);
  }

  /** Boot: locks held by a dead process are void. */
  clearLocks(): void {
    this.db.run(`UPDATE jobs SET locked_until = NULL WHERE done = 0`);
  }
}
