/**
 * «بپرس» helpers — every ask button opens Web B's global AskSheet (state/ask.ts → components/inquiry/AskSheet).
 */
import type { InquiryQuestion, ShopLite, StoreOffer } from '@titl/shared';
import { openAsk, type AskShop } from '../state/ask.js';

export function askShopOf(shop: ShopLite): AskShop {
  return {
    id: shop.id,
    name: shop.name,
    closedNow: shop.openStatus.state === 'closed' || shop.openStatus.state === 'opens_later_today',
    locationConfidence: shop.location.confidence,
  };
}

export function askStores(
  offers: (StoreOffer | ShopLite)[],
  product?: { id: string; title?: string | null; categoryGroup?: string | null } | null,
  questions?: InquiryQuestion[],
): void {
  openAsk({
    shops: offers.map((o) => askShopOf('shop' in o ? o.shop : o)),
    productId: product?.id,
    productTitle: product?.title ?? null,
    group: product?.categoryGroup ?? null,
    questions,
  });
}
