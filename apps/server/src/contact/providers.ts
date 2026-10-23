/** Verification + crowd-report providers consumed by catalog services (ranking, store cards). */
import { randomUUID } from 'node:crypto';
import type { CrowdReport, InquiryResult, VerifiedInfo } from '@titl/shared';
import type { StateDb } from '../db/state.js';
import { json } from '../db/sqlite.js';
import type { ReportsProvider, VerificationProvider } from '../services/types.js';

const DAY_MS = 24 * 3600_000;

export function createVerification(db: StateDb, now: () => Date): VerificationProvider {
  return {
    latestFor(productId, shopIds) {
      const out = new Map<string, VerifiedInfo>();
      if (!productId || !shopIds.length) return out;
      const since = new Date(now().getTime() - DAY_MS).toISOString();
      const ph = shopIds.map(() => '?').join(',');
      const rows = db.all<{ id: string; shop_id: string; result: string; result_source: string; updated_at: string }>(
        `SELECT i.id, i.shop_id, i.result, i.result_source, i.updated_at
           FROM inquiries i LEFT JOIN inquiry_meta m ON m.inquiry_id = i.id
          WHERE i.product_id = ? AND i.shop_id IN (${ph}) AND i.status = 'resolved' AND i.result IS NOT NULL
            AND i.updated_at >= ? AND (i.result_source != 'seller_inbox' OR coalesce(m.published, 1) = 1)
          ORDER BY i.updated_at DESC`,
        productId,
        ...shopIds,
        since,
      );
      for (const r of rows) {
        const prev = out.get(r.shop_id);
        // CT5: a direct seller answer (within 24 h) ranks above any simulated call; otherwise newest wins.
        if (prev && !(r.result_source === 'seller_inbox' && prev.source !== 'seller_inbox')) continue;
        const res = json<InquiryResult | null>(r.result, null);
        if (!res) continue;
        out.set(r.shop_id, {
          inquiryId: r.id,
          source: r.result_source === 'seller_inbox' ? 'seller_inbox' : r.result_source === 'bale' ? 'bale' : 'simulated_call',
          at: r.updated_at,
          stock: res.stock,
          price: res.price,
          priceDeltaPct: res.priceDeltaPct,
          holdUntil: res.holdUntil,
        });
      }
      return out;
    },
  };
}

export function createReports(db: StateDb, now: () => Date) {
  const provider: ReportsProvider = {
    forShop(shopId, limit = 10) {
      return db
        .all<{ id: string; shop_id: string; type: CrowdReport['type']; note: string | null; created_at: string }>(
          `SELECT id, shop_id, type, note, created_at FROM reports WHERE shop_id = ? ORDER BY created_at DESC LIMIT ?`,
          shopId,
          limit,
        )
        .map((r) => ({ id: r.id, shopId: r.shop_id, type: r.type, note: r.note, at: r.created_at }));
    },
    recentByShops(shopIds, hours = 6) {
      const out = new Map<string, CrowdReport['type'][]>();
      if (!shopIds.length) return out;
      const since = new Date(now().getTime() - hours * 3600_000).toISOString();
      for (let i = 0; i < shopIds.length; i += 500) {
        const chunk = shopIds.slice(i, i + 500);
        const rows = db.all<{ shop_id: string; type: CrowdReport['type'] }>(
          `SELECT shop_id, type FROM reports WHERE shop_id IN (${chunk.map(() => '?').join(',')}) AND created_at >= ? ORDER BY created_at DESC`,
          ...chunk,
          since,
        );
        for (const r of rows) {
          const l = out.get(r.shop_id) ?? [];
          l.push(r.type);
          out.set(r.shop_id, l);
        }
      }
      return out;
    },
  };
  const add = (input: { shopId: string; sessionId: string | null; type: CrowdReport['type']; note: string | null }): CrowdReport => {
    const id = randomUUID();
    const at = now().toISOString();
    const note = input.note?.trim().slice(0, 500) || null;
    db.run(`INSERT INTO reports (id, shop_id, session_id, type, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`, id, input.shopId, input.sessionId, input.type, note, at);
    return { id, shopId: input.shopId, type: input.type, note, at };
  };
  return { provider, add };
}
