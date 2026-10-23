import { createJSONStorage, type StateStorage } from 'zustand/middleware';

/** In-memory StateStorage (private mode / blocked storage / tests). */
export function memoryStorage(): StateStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

let fallback: StateStorage | null = null;

/** localStorage when usable, otherwise a process-wide memory fallback (never throws). */
export function safeLocalStorage(): StateStorage {
  try {
    if (typeof localStorage !== 'undefined') {
      const probe = '__bz_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return localStorage;
    }
  } catch {
    /* blocked */
  }
  fallback ??= memoryStorage();
  return fallback;
}

/** JSON storage for zustand `persist` with the safe fallback. */
export const persistStorage = createJSONStorage(() => safeLocalStorage());

/** localStorage key prefix for every persisted store. */
export const STORE_PREFIX = 'bz.';
