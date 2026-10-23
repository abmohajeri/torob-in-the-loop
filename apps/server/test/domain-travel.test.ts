import { describe, expect, it } from 'vitest';
import { linesLabel, quickEta, travelEstimate, walkMinutes } from '../src/domain/travel.js';
import { orderPoints, pathKm } from '../src/domain/route.js';

const vanak = { lat: 35.7575, lng: 51.4098 };
const tajrish = { lat: 35.8045, lng: 51.4339 };

describe('travel', () => {
  it('short hop becomes walking', () => {
    const e = travelEstimate(vanak, { lat: 35.7590, lng: 51.4100 }, 'taxi', new Date('2026-10-24T12:00:00+03:30'));
    expect(e.mode).toBe('walk');
    expect(e.note).toContain('پیاده');
  });
  it('taxi slower in rush hour', () => {
    const a = travelEstimate(vanak, tajrish, 'taxi', new Date('2026-10-24T11:00:00+03:30')).minutes;
    const b = travelEstimate(vanak, tajrish, 'taxi', new Date('2026-10-24T18:00:00+03:30')).minutes;
    expect(b).toBeGreaterThanOrEqual(a);
  });
  it('metro without index falls back to taxi with a Persian note', () => {
    const e = travelEstimate(vanak, tajrish, 'metro', new Date(), null);
    expect(e.mode).toBe('taxi');
    expect(e.note).toContain('مترو');
  });
  it('helpers', () => {
    expect(walkMinutes(1)).toBeGreaterThan(5);
    expect(quickEta(0.3, 'taxi', false)).toBe(walkMinutes(0.3));
    expect(linesLabel([{ ref: '1', name: '', color: null } as never, { ref: '4', name: '', color: null } as never])).toBe('خط ۱ و ۴');
  });
  it('route ordering is a nearest-first permutation', () => {
    const pts = [tajrish, vanak, { lat: 35.70, lng: 51.42 }];
    const order = orderPoints(pts, { lat: 35.69, lng: 51.42 });
    expect([...order].sort()).toEqual([0, 1, 2]);
    expect(order[0]).toBe(2);
    expect(pathKm(order.map((i) => pts[i]!), null)).toBeGreaterThan(0);
  });
});
