/**
 * The user's shopping context (context bar): location, budget, purchase conditions, visit time, travel mode,
 * radius. Persisted to localStorage. Every API call that depends on it reads `useEffectiveContext()`.
 */
import { useMemo } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ProviderCode, TravelMode, UserContext } from '@titl/shared';
import { contextKey } from '../lib/queryKeys.js';
import { effectiveContext } from '../lib/visit-time.js';
import { persistStorage, STORE_PREFIX } from './storage.js';

export type ContextLocation = NonNullable<UserContext['location']>;

const PROVIDER_ORDER: ProviderCode[] = ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other'];

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * Canonical form: drop empty/false/invalid values, swap inverted budgets, dedupe & order providers,
 * providers ⇒ installment. Pure — unit-tested.
 */
export function normalizeContext(input: UserContext): UserContext {
  const out: UserContext = {};
  const loc = input.location;
  if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng) && Math.abs(loc.lat) <= 90 && Math.abs(loc.lng) <= 180) {
    out.location = { lat: loc.lat, lng: loc.lng, label: loc.label?.trim() || 'موقعیت انتخابی', source: loc.source };
  }
  let min = isPos(input.budgetMin) ? Math.round(input.budgetMin) : undefined;
  let max = isPos(input.budgetMax) ? Math.round(input.budgetMax) : undefined;
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined) out.budgetMin = min;
  if (max !== undefined) out.budgetMax = max;
  const providers = PROVIDER_ORDER.filter((p) => input.providers?.includes(p));
  if (providers.length) out.providers = providers;
  if (input.installment || providers.length) out.installment = true;
  if (input.openNow) out.openNow = true;
  if (input.warrantyOnly) out.warrantyOnly = true;
  if (input.fastDelivery) out.fastDelivery = true;
  if (input.kalabarg) out.kalabarg = true;
  if (isPos(input.maxDistanceKm)) out.maxDistanceKm = Math.min(60, input.maxDistanceKm);
  if (input.travelMode) out.travelMode = input.travelMode;
  if (input.visitAt && !Number.isNaN(new Date(input.visitAt).getTime())) out.visitAt = new Date(input.visitAt).toISOString();
  return out;
}

export interface ContextState {
  ctx: UserContext;
  setLocation: (location: ContextLocation | undefined) => void;
  setBudget: (min: number | undefined, max: number | undefined) => void;
  setInstallment: (on: boolean) => void;
  toggleProvider: (code: ProviderCode) => void;
  setProviders: (codes: ProviderCode[]) => void;
  setOpenNow: (on: boolean) => void;
  setWarrantyOnly: (on: boolean) => void;
  setFastDelivery: (on: boolean) => void;
  setKalabarg: (on: boolean) => void;
  /** ISO instant; `undefined` = now. */
  setVisitAt: (iso: string | undefined) => void;
  setTravelMode: (mode: TravelMode | undefined) => void;
  setMaxDistanceKm: (km: number | undefined) => void;
  /** Merge a patch (e.g. assistant `context` event). Keys explicitly set to `undefined`/`null` are removed. */
  patch: (patch: Partial<UserContext>) => void;
  /** Clear purchase conditions (installment, providers, open, warranty, fast delivery, kalabarg). */
  resetConditions: () => void;
  /** Clear everything except the location. */
  resetFilters: () => void;
  reset: () => void;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set) => {
      const update = (fn: (c: UserContext) => UserContext) => set((s) => ({ ctx: normalizeContext(fn(s.ctx)) }));
      return {
        ctx: {},
        setLocation: (location) => update((c) => ({ ...c, location })),
        setBudget: (budgetMin, budgetMax) => update((c) => ({ ...c, budgetMin, budgetMax })),
        setInstallment: (on) => update((c) => ({ ...c, installment: on, providers: on ? c.providers : undefined })),
        toggleProvider: (code) =>
          update((c) => {
            const has = c.providers?.includes(code) ?? false;
            const providers = has ? (c.providers ?? []).filter((p) => p !== code) : [...(c.providers ?? []), code];
            return { ...c, providers, installment: providers.length > 0 ? true : c.installment };
          }),
        setProviders: (codes) => update((c) => ({ ...c, providers: codes })),
        setOpenNow: (on) => update((c) => ({ ...c, openNow: on })),
        setWarrantyOnly: (on) => update((c) => ({ ...c, warrantyOnly: on })),
        setFastDelivery: (on) => update((c) => ({ ...c, fastDelivery: on })),
        setKalabarg: (on) => update((c) => ({ ...c, kalabarg: on })),
        setVisitAt: (visitAt) => update((c) => ({ ...c, visitAt })),
        setTravelMode: (travelMode) => update((c) => ({ ...c, travelMode })),
        setMaxDistanceKm: (maxDistanceKm) => update((c) => ({ ...c, maxDistanceKm })),
        patch: (p) =>
          update((c) => {
            const next: Record<string, unknown> = { ...c };
            for (const [k, v] of Object.entries(p)) {
              if (v === undefined || v === null) delete next[k];
              else next[k] = v;
            }
            return next as UserContext;
          }),
        resetConditions: () =>
          update((c) => ({
            ...c,
            installment: undefined,
            providers: undefined,
            openNow: undefined,
            warrantyOnly: undefined,
            fastDelivery: undefined,
            kalabarg: undefined,
          })),
        resetFilters: () => update((c) => ({ location: c.location })),
        reset: () => set({ ctx: {} }),
      };
    },
    {
      name: `${STORE_PREFIX}context`,
      version: 1,
      storage: persistStorage,
      partialize: (s) => ({ ctx: s.ctx }),
      merge: (persisted, current) => ({
        ...current,
        ctx: normalizeContext(((persisted as { ctx?: UserContext } | undefined)?.ctx ?? {}) as UserContext),
      }),
    },
  ),
);

/** Raw stored context. */
export const useUserContext = () => useContextStore((s) => s.ctx);

/** Context as sent to the API (stale visit time → now). Memoized per context object. */
export function useEffectiveContext(): UserContext {
  const ctx = useUserContext();
  return useMemo(() => effectiveContext(ctx), [ctx]);
}

/** `{ ctx, ctxKey }` — use `ctxKey` inside query keys (see lib/queryKeys.ts). */
export function useContextQuery(): { ctx: UserContext; ctxKey: string } {
  const ctx = useEffectiveContext();
  return useMemo(() => ({ ctx, ctxKey: contextKey(ctx) }), [ctx]);
}

/** Non-hook access (event handlers, agent stream). */
export const getUserContext = (): UserContext => effectiveContext(useContextStore.getState().ctx);
