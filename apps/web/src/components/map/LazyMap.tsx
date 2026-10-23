import { lazy, Suspense } from 'react';
import { MapPinned } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import type { LazyMapProps } from './types.js';

export * from './types.js';

const LeafletMap = lazy(() => import('./LeafletMap.js'));

/** Placeholder with the same footprint while Leaflet downloads. */
export function MapFallback({ className }: { className?: string }) {
  return (
    <div className={cn('grid place-items-center rounded-2xl skeleton', className ?? 'h-64')} role="status" aria-label="در حال بارگذاری نقشه">
      <span className="flex items-center gap-2 text-meta text-muted">
        <MapPinned aria-hidden className="size-5 text-primary" /> در حال بارگذاری نقشه…
      </span>
    </div>
  );
}

/**
 * Map (Leaflet, lazy). Markers: shop pins, price pills, mall pins, numbered stops; user dot; optional tap-to-pick
 * and route polyline. Tiles come from `/api/meta` (`map.tileUrl`).
 */
export function LazyMap(props: LazyMapProps) {
  return (
    <Suspense fallback={<MapFallback className={props.className} />}>
      <LeafletMap {...props} />
    </Suspense>
  );
}
