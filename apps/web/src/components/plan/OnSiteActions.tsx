import { DoorClosed, MapPinOff, PackageX, TrendingUp } from 'lucide-react';
import type { AltReason, PlanStop } from '@titl/shared';
import { openAlternatives } from '../../state/alt.js';

const ACTIONS: { reason: AltReason; label: string; icon: typeof DoorClosed }[] = [
  { reason: 'closed', label: 'بسته بود', icon: DoorClosed },
  { reason: 'not_found', label: 'پیدایش نکردم', icon: MapPinOff },
  { reason: 'out_of_stock', label: 'موجود نداشت', icon: PackageX },
  { reason: 'too_expensive', label: 'گران‌تر بود', icon: TrendingUp },
];

/** On-site 2×2 grid of 56 px buttons → AlternativesSheet (distance measured from this shop; swap in plan). */
export function OnSiteActions({ stop }: { stop: PlanStop }) {
  return (
    <div>
      <p className="mb-2 text-meta font-bold text-ink">مشکلی پیش آمد؟</p>
      <div className="grid grid-cols-2 gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.reason}
            type="button"
            onClick={() =>
              openAlternatives({
                reason: a.reason,
                productId: stop.product?.id,
                productTitle: stop.product?.title,
                shopId: stop.shop.id,
                shopName: stop.shop.name,
                origin: { lat: stop.shop.lat, lng: stop.shop.lng },
                registeredPrice: stop.offer?.price.price ?? null,
                replaceInPlan: true,
              })
            }
            className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-line bg-surface text-body font-bold text-ink shadow-card press transition-colors hover:border-accent-200 hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-primary"
          >
            <a.icon aria-hidden className="size-5 text-accent-strong" />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
