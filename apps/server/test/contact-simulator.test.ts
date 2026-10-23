import { describe, expect, it } from 'vitest';
import { decide, transcript, type SimInput } from '../src/contact/simulator.js';

const base = (over: Partial<SimInput> = {}): SimInput => ({
  seed: 'inq-1:1',
  attempt: 1,
  questions: ['stock', 'price', 'hours', 'hold'],
  customQuestion: null,
  variant: [],
  productTitle: 'گوشی سامسونگ (چین) A07 4G | حافظه 64 رم 4',
  priceRange: { min: 38_000_000, max: 45_000_000 },
  registered: { price: 40_000_000, fresh: true },
  warranty: null,
  shop: { name: 'فروشگاه ب', hoursKnown: true, closeMin: 21 * 60, middayBreak: null, installmentProviders: ['ترب‌پی'], locationText: null, reportedClosed: false },
  nowMin: 11 * 60,
  weekday: 'sat',
  budgetMax: null,
  scenario: null,
  ...over,
});

describe('contact simulator', () => {
  it('is deterministic: same seed → identical facts and transcript (×3)', () => {
    const runs = [0, 1, 2].map(() => {
      const d = decide(base());
      return JSON.stringify({ d, t: transcript(base(), d) });
    });
    expect(runs[0]).toBe(runs[1]);
    expect(runs[1]).toBe(runs[2]);
  });

  it('different seeds produce varied outcomes with roughly the documented odds', () => {
    const counts: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const d = decide(base({ seed: `x${i}:1` }));
      counts[d.outcome] = (counts[d.outcome] ?? 0) + 1;
    }
    expect(counts.answered! / 2000).toBeGreaterThan(0.6);
    expect(counts.answered! / 2000).toBeLessThan(0.8);
    expect(counts.no_answer! / 2000).toBeGreaterThan(0.12);
    expect(counts.busy! / 2000).toBeGreaterThan(0.05);
  });

  it('DEMO_SCENARIOS: same scenario 3× gives an identical transcript, outcomes by batch order', () => {
    const sc = (index: number, attempt: number, batchOrdinal = 1) =>
      base({ seed: `demo:${batchOrdinal}:${index}:${attempt}`, attempt, scenario: { name: 'demo', batchOrdinal, index } });
    const t = [0, 1, 2].map(() => JSON.stringify(transcript(sc(1, 1), decide(sc(1, 1)))));
    expect(new Set(t).size).toBe(1);

    // #1: no answer → retry → in stock, +4–6 %, held until 18:00
    expect(decide(sc(0, 1)).outcome).toBe('no_answer');
    const r1 = decide(sc(0, 2));
    expect(r1.outcome).toBe('answered');
    expect(r1.result!.stock).toBe('in_stock');
    expect(r1.result!.priceDeltaPct!).toBeGreaterThanOrEqual(3.5);
    expect(r1.result!.priceDeltaPct!).toBeLessThanOrEqual(6.5);
    expect(r1.result!.holdUntil).toBe('18:00');
    // #2: in stock, unchanged price, installment as declared
    const r2 = decide(sc(1, 1));
    expect(r2.result!.stock).toBe('in_stock');
    expect(r2.result!.priceDeltaPct).toBe(0);
    // #3: out of stock
    expect(decide(sc(2, 1)).result!.stock).toBe('out_of_stock');
    // second batch: over budget
    const over = decide({ ...sc(0, 1, 2), budgetMax: 41_000_000 });
    expect(over.result!.overBudget).toBe(true);
    expect(over.result!.price!).toBeGreaterThan(41_000_000);
  });

  it('declared installment providers are reported; transcript keeps the facts', () => {
    const inp = base({ questions: ['stock', 'price', 'installment'], scenario: { name: 'demo', batchOrdinal: 1, index: 1 }, seed: 'demo:1:1:1' });
    const d = decide(inp);
    expect(d.result!.installment).toEqual({ available: true, providers: ['ترب‌پی'], note: null });
    const text = transcript(inp, d).map((l) => l.text).join('\n');
    expect(text).toContain('ترب‌پی');
    expect(text).toContain('Torob in the Loop');
    expect(text).toContain('۴۰ میلیون');
  });

  it('shoe sizes are independent of model stock («۴۲ تمام شده، ۴۱ و ۴۳ داریم»)', () => {
    let sawMissing = false;
    for (let i = 0; i < 60 && !sawMissing; i++) {
      const d = decide(base({ seed: `shoe${i}:1`, variant: [{ key: 'سایز', value: '42' }], scenario: { name: 's', batchOrdinal: 1, index: 1 } }));
      if (d.result?.variantAvailable === false) {
        sawMissing = true;
        expect(d.result.answers![0]!.text).toBe('۴۲ تمام شده، ۴۱ و ۴۳ داریم.');
        expect(d.result.stock).toBe('in_stock');
      }
    }
    expect(sawMissing).toBe(true);
  });

  it('forced call to a shop closed by hours is never picked up', () => {
    expect(decide(base({ forcedWhileClosed: true })).outcome).toBe('closed');
  });
});
