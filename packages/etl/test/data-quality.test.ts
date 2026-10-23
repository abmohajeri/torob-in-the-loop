/**
 * DT15: rule hit counts of the built catalog stay within ±5 % of the reference counts in
 * docs/DESIGN-REVIEW.md §4.1 (verified against raw.db). Skipped when data/catalog.db is absent.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
const CATALOG = fileURLToPath(new URL('../../../data/catalog.db', import.meta.url));
const full = existsSync(CATALOG) && (() => {
  const db = new DatabaseSync(CATALOG, { readOnly: true });
  const n = (db.prepare('SELECT count(*) AS n FROM products').get() as { n: number }).n;
  db.close();
  return n > 100_000;
})();

const REFERENCE: Record<string, number> = {
  shop_tier_A: 3_792,
  shop_tier_B: 887,
  shop_tier_C: 1_797,
  price_rule_missing: 15_083,
  price_rule_too_low: 1_645,
  price_rule_too_high: 211,
  price_changed_at_null: 769,
  hours_unknown: 2_003,
  hours_placeholder_shifts_dropped: 23_329,
  product_is_replica: 197,
};

(full ? describe : describe.skip)('DT15 data-quality counts (±5 %)', () => {
  const db = new DatabaseSync(CATALOG, { readOnly: true });
  const q = JSON.parse((db.prepare("SELECT value FROM meta WHERE key = 'quality'").get() as { value: string }).value);
  const rules: Record<string, number> = q.offers.rules;
  const dataAsOf = (db.prepare("SELECT value FROM meta WHERE key = 'data_as_of'").get() as { value: string }).value;

  it('dataAsOf ignores literal "null" (DT1)', () => {
    expect(new Date(dataAsOf).toISOString().slice(0, 19)).toBe('2026-10-13T00:02:35');
  });
  for (const [k, ref] of Object.entries(REFERENCE)) {
    it(`${k} ≈ ${ref}`, () => {
      expect(rules[k]).toBeDefined();
      expect(Math.abs(rules[k]! - ref) / ref).toBeLessThanOrEqual(0.05);
    });
  }
  it('counts', () => {
    const n = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(n('SELECT count(*) n FROM shops')).toBe(6_476);
    expect(n('SELECT count(*) n FROM products')).toBe(225_903);
    expect(n('SELECT count(*) n FROM offers')).toBe(331_506);
    expect(n("SELECT count(*) n FROM shops WHERE tier = 'A'")).toBe(3_792);
  });
});
