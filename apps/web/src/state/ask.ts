/**
 * Global AskSheet («از فروشگاه‌ها بپرس») state. Any page/component opens it with `openAsk({...})`;
 * the sheet itself is mounted once in the app shell (components/inquiry/GlobalSheets).
 */
import { create } from 'zustand';
import type { InquiryQuestion } from '@titl/shared';

export interface AskShop {
  id: string;
  name: string;
  /** Shop is closed right now → call is scheduled at opening (copy only; the server decides). */
  closedNow?: boolean;
  /** In-mall location confidence; low/medium → «نشانی دقیق» is pre-selected. */
  locationConfidence?: 'high' | 'medium' | 'low';
}

export interface AskTarget {
  shops: AskShop[];
  productId?: string;
  productTitle?: string | null;
  /** Product category group (for contextual question presets, e.g. mobile → رجیستری). */
  group?: string | null;
  /** Pre-selected questions (defaults: stock + price, plus context-driven ones). */
  questions?: InquiryQuestion[];
  /** Prefilled custom question. */
  custom?: string;
}

interface AskState {
  open: boolean;
  target: AskTarget | null;
  openAsk: (target: AskTarget) => void;
  close: () => void;
}

export const useAsk = create<AskState>()((set) => ({
  open: false,
  target: null,
  openAsk: (target) => set({ open: true, target }),
  close: () => set({ open: false }),
}));

export const openAsk = (target: AskTarget) => useAsk.getState().openAsk(target);
