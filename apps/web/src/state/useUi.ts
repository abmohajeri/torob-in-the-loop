/**
 * Ephemeral UI state (not persisted): which context sheet is open, live-connection status, compare-tray visibility.
 */
import { create } from 'zustand';
import type { LiveStatus } from '../lib/sse.js';

export type ContextSheetId = 'location' | 'radius' | 'budget' | 'conditions' | 'visitTime' | 'travelMode';

export interface UiState {
  sheet: ContextSheetId | null;
  openSheet: (id: ContextSheetId) => void;
  closeSheet: () => void;
  /** Live events (SSE) connection status — 'unavailable' while the backend endpoint is missing. */
  live: LiveStatus;
  setLive: (s: LiveStatus) => void;
  /** CompareTray currently shown (shell lifts sticky CTAs above it). */
  trayVisible: boolean;
  setTrayVisible: (v: boolean) => void;
}

export const useUi = create<UiState>()((set) => ({
  sheet: null,
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: null }),
  live: 'connecting',
  setLive: (live) => set({ live }),
  trayVisible: false,
  setTrayVisible: (trayVisible) => set({ trayVisible }),
}));

/** Imperative helper for non-React callers: `openContextSheet('budget')`. */
export const openContextSheet = (id: ContextSheetId) => useUi.getState().openSheet(id);
