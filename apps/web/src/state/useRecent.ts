/**
 * Recent searches & recently viewed products (home shortcuts, search suggestions).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { cleanFa, normalizeForSearch } from '@titl/shared';
import { persistStorage, STORE_PREFIX } from './storage.js';

export const MAX_RECENT_QUERIES = 10;
export const MAX_RECENT_PRODUCTS = 12;

export interface RecentProduct {
  id: string;
  title: string;
  image: string | null;
  at: string;
}

export interface RecentState {
  queries: string[];
  products: RecentProduct[];
  addQuery: (q: string) => void;
  removeQuery: (q: string) => void;
  addProduct: (p: { id: string; title: string; image: string | null }) => void;
  clear: () => void;
}

export const useRecent = create<RecentState>()(
  persist(
    (set) => ({
      queries: [],
      products: [],
      addQuery: (q) => {
        const display = cleanFa(q);
        const key = normalizeForSearch(display);
        if (!key) return;
        set((s) => ({
          queries: [display, ...s.queries.filter((x) => normalizeForSearch(x) !== key)].slice(0, MAX_RECENT_QUERIES),
        }));
      },
      removeQuery: (q) => {
        const key = normalizeForSearch(q);
        set((s) => ({ queries: s.queries.filter((x) => normalizeForSearch(x) !== key) }));
      },
      addProduct: (p) =>
        set((s) => ({
          products: [{ id: p.id, title: p.title, image: p.image, at: new Date().toISOString() }, ...s.products.filter((x) => x.id !== p.id)].slice(
            0,
            MAX_RECENT_PRODUCTS,
          ),
        })),
      clear: () => set({ queries: [], products: [] }),
    }),
    {
      name: `${STORE_PREFIX}recent`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ queries: s.queries, products: s.products }),
    },
  ),
);
