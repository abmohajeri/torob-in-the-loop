/**
 * Visit plan («برنامه بازدید») stops the user collected from cards, comparisons and inquiry results.
 * The server optimizes the order (`POST /api/plan`); this store only keeps the selection + preferences.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PlanStopInput, TravelMode, VisitPlan } from '@titl/shared';
import { persistStorage, STORE_PREFIX } from './storage.js';

/** The plan optimizer handles up to 8 stops. */
export const MAX_PLAN_STOPS = 8;

export interface PlanStopItem {
  shopId: string;
  productId?: string;
  /** Display snapshot so the plan list renders before the API answers (and offline). */
  shopName: string;
  productTitle?: string | null;
  mallName?: string | null;
  addedAt: string;
}

export type AddStopResult = 'added' | 'exists' | 'full';

const sameStop = (a: { shopId: string; productId?: string }, b: { shopId: string; productId?: string }) =>
  a.shopId === b.shopId && (a.productId ?? null) === (b.productId ?? null);

export interface PlanState {
  stops: PlanStopItem[];
  mode?: TravelMode;
  /** ISO; undefined = leave now. */
  departAt?: string;
  /** Keep the user's order instead of optimizing. */
  keepOrder: boolean;
  /** Last plan returned by the server (offline fallback for the plan page). */
  lastPlan: VisitPlan | null;
  addStop: (stop: Omit<PlanStopItem, 'addedAt'>) => AddStopResult;
  removeStop: (shopId: string, productId?: string) => void;
  moveStop: (from: number, to: number) => void;
  clear: () => void;
  setMode: (mode: TravelMode | undefined) => void;
  setDepartAt: (iso: string | undefined) => void;
  setKeepOrder: (keep: boolean) => void;
  setLastPlan: (plan: VisitPlan | null) => void;
}

export const usePlan = create<PlanState>()(
  persist(
    (set, get) => ({
      stops: [],
      keepOrder: false,
      lastPlan: null,
      addStop: (stop) => {
        const { stops } = get();
        if (stops.some((s) => sameStop(s, stop))) return 'exists';
        if (stops.length >= MAX_PLAN_STOPS) return 'full';
        set({ stops: [...stops, { ...stop, addedAt: new Date().toISOString() }] });
        return 'added';
      },
      removeStop: (shopId, productId) => set((s) => ({ stops: s.stops.filter((x) => !sameStop(x, { shopId, productId })) })),
      moveStop: (from, to) =>
        set((s) => {
          if (from === to || from < 0 || to < 0 || from >= s.stops.length || to >= s.stops.length) return s;
          const next = [...s.stops];
          const [item] = next.splice(from, 1);
          if (item) next.splice(to, 0, item);
          return { stops: next };
        }),
      clear: () => set({ stops: [], lastPlan: null }),
      setMode: (mode) => set({ mode }),
      setDepartAt: (departAt) => set({ departAt }),
      setKeepOrder: (keepOrder) => set({ keepOrder }),
      setLastPlan: (lastPlan) => set({ lastPlan }),
    }),
    {
      name: `${STORE_PREFIX}plan`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ stops: s.stops, mode: s.mode, departAt: s.departAt, keepOrder: s.keepOrder, lastPlan: s.lastPlan }),
    },
  ),
);

/** Stops in API shape. */
export function planStopInputs(stops: PlanStopItem[]): PlanStopInput[] {
  return stops.map((s) => (s.productId ? { shopId: s.shopId, productId: s.productId } : { shopId: s.shopId }));
}

export const useIsInPlan = (shopId: string, productId?: string) =>
  usePlan((s) => s.stops.some((x) => sameStop(x, { shopId, productId })));

export const PLAN_TOAST: Record<AddStopResult, string> = {
  added: 'به برنامه بازدید اضافه شد.',
  exists: 'این فروشگاه از قبل در برنامه بازدید شماست.',
  full: 'برنامه بازدید حداکثر ۸ توقف دارد؛ یکی را حذف کنید.',
};
