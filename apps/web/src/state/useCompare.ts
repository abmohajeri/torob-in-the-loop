/**
 * Comparison selections: up to 4 products (shown in the floating CompareTray) and, per product, up to 4 stores.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage, STORE_PREFIX } from './storage.js';

export const MAX_COMPARE_PRODUCTS = 4;
export const MAX_COMPARE_STORES = 4;

export interface CompareItem {
  id: string;
  title: string;
  image: string | null;
}

export type ToggleResult = 'added' | 'removed' | 'full';

export interface CompareState {
  items: CompareItem[];
  /** productId → selected shop ids (≤ 4). */
  stores: Record<string, string[]>;
  toggle: (item: CompareItem) => ToggleResult;
  remove: (id: string) => void;
  clear: () => void;
  toggleStore: (productId: string, shopId: string) => ToggleResult;
  clearStores: (productId: string) => void;
}

export const useCompare = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      stores: {},
      toggle: (item) => {
        const { items } = get();
        if (items.some((i) => i.id === item.id)) {
          set({ items: items.filter((i) => i.id !== item.id) });
          return 'removed';
        }
        if (items.length >= MAX_COMPARE_PRODUCTS) return 'full';
        set({ items: [...items, { id: item.id, title: item.title, image: item.image }] });
        return 'added';
      },
      remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
      clear: () => set({ items: [] }),
      toggleStore: (productId, shopId) => {
        const current = get().stores[productId] ?? [];
        if (current.includes(shopId)) {
          set((s) => ({ stores: { ...s.stores, [productId]: current.filter((x) => x !== shopId) } }));
          return 'removed';
        }
        if (current.length >= MAX_COMPARE_STORES) return 'full';
        set((s) => ({ stores: { ...s.stores, [productId]: [...current, shopId] } }));
        return 'added';
      },
      clearStores: (productId) =>
        set((s) => {
          const { [productId]: _drop, ...rest } = s.stores;
          return { stores: rest };
        }),
    }),
    {
      name: `${STORE_PREFIX}compare`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ items: s.items, stores: s.stores }),
    },
  ),
);

/** Is this product selected for comparison? */
export const useIsComparing = (id: string) => useCompare((s) => s.items.some((i) => i.id === id));

/** Selected store ids for one product. */
const EMPTY: string[] = [];
export const useComparedStores = (productId: string) => useCompare((s) => s.stores[productId] ?? EMPTY);

/** Persian toast copy for a toggle result. */
export const COMPARE_TOAST: Record<ToggleResult, string> = {
  added: 'به فهرست مقایسه اضافه شد.',
  removed: 'از فهرست مقایسه حذف شد.',
  full: 'حداکثر ۴ مورد را می‌توانید با هم مقایسه کنید.',
};
