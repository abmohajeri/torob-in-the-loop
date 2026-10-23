/**
 * Global AlternativesSheet state («بسته بود؟ / موجود نداشت؟ …»). Opened from plan on-site actions,
 * inquiry results and shop pages; mounted once in the shell (components/inquiry/GlobalSheets).
 */
import { create } from 'zustand';
import type { AltReason, LatLng } from '@titl/shared';

export interface AltTarget {
  reason: AltReason;
  productId?: string;
  productTitle?: string | null;
  shopId?: string;
  shopName?: string;
  /** Measure distances from the failed shop (on-site). */
  origin?: LatLng;
  /** Registered price at the failed shop (for the «گران‌تر بود» tip). */
  registeredPrice?: number | null;
  /** When set, each same-product alternative gets a «جایگزین کن در برنامه» action. */
  replaceInPlan?: boolean;
}

interface AltState {
  open: boolean;
  target: AltTarget | null;
  openAlt: (target: AltTarget) => void;
  close: () => void;
}

export const useAlt = create<AltState>()((set) => ({
  open: false,
  target: null,
  openAlt: (target) => set({ open: true, target }),
  close: () => set({ open: false }),
}));

export const openAlternatives = (target: AltTarget) => useAlt.getState().openAlt(target);
