import { beforeEach, describe, expect, it } from 'vitest';
import { useCompare, MAX_COMPARE_PRODUCTS } from '../state/useCompare.js';
import { usePlan, planStopInputs } from '../state/usePlan.js';

describe('useCompare', () => {
  beforeEach(() => useCompare.setState({ items: [], stores: {} }));
  it('caps at 4 products and toggles', () => {
    const s = useCompare.getState();
    for (let i = 0; i < MAX_COMPARE_PRODUCTS; i++) expect(s.toggle({ id: `p${i}`, title: 't', image: null })).toBe('added');
    expect(s.toggle({ id: 'p9', title: 't', image: null })).toBe('full');
    expect(s.toggle({ id: 'p0', title: 't', image: null })).toBe('removed');
    expect(useCompare.getState().items).toHaveLength(3);
  });
  it('caps stores per product', () => {
    const s = useCompare.getState();
    for (const id of ['a', 'b', 'c', 'd']) expect(s.toggleStore('p', id)).toBe('added');
    expect(s.toggleStore('p', 'e')).toBe('full');
    s.clearStores('p');
    expect(useCompare.getState().stores.p).toBeUndefined();
  });
});

describe('usePlan', () => {
  beforeEach(() => usePlan.getState().clear());
  it('adds, dedupes, reorders', () => {
    const s = usePlan.getState();
    expect(s.addStop({ shopId: '1', shopName: 'الف', productId: 'x' })).toBe('added');
    expect(s.addStop({ shopId: '1', shopName: 'الف', productId: 'x' })).toBe('exists');
    s.addStop({ shopId: '2', shopName: 'ب' });
    s.moveStop(1, 0);
    expect(usePlan.getState().stops.map((x) => x.shopId)).toEqual(['2', '1']);
    expect(planStopInputs(usePlan.getState().stops)[1]).toMatchObject({ shopId: '1', productId: 'x' });
  });
});
