import type { ShopLite } from '@titl/shared';
import type { AskShop } from '../../state/ask.js';

/** ShopLite → AskSheet shop entry (closed-now + location confidence drive the question presets). */
export function askShop(shop: ShopLite): AskShop {
  return {
    id: shop.id,
    name: shop.name,
    closedNow: shop.openStatus.state === 'closed' || shop.openStatus.state === 'opens_later_today',
    locationConfidence: shop.location.confidence,
  };
}
