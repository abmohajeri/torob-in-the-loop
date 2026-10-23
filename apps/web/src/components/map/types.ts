import type { LatLng } from '@titl/shared';

/** shop = round pin · price = pill with a short price («۴۲.۵ م») · mall = building pin · stop = numbered plan stop. */
export type MapMarkerKind = 'shop' | 'price' | 'mall' | 'stop';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind?: MapMarkerKind;
  /** Accessible / tooltip label (shop name). */
  label?: string;
  /** Text inside a price pill or the stop number (already formatted, Persian digits). */
  text?: string;
  /** Emphasised (selected / best pick). */
  selected?: boolean;
  /** Muted (e.g. closed at visit time). */
  dimmed?: boolean;
}

export interface LazyMapProps {
  markers?: MapMarker[];
  /** «You are here» dot. */
  user?: LatLng | null;
  /** Initial center (defaults: user → markers → /api/meta center → Tehran). */
  center?: LatLng;
  zoom?: number;
  /** Fit the view to markers (+ user) on load and when the marker set changes. Default true. */
  fit?: boolean;
  onMarkerClick?: (marker: MapMarker) => void;
  /** Tap-to-pick mode (location sheet «انتخاب روی نقشه»): shows a pin at the picked point. */
  onPick?: (p: LatLng) => void;
  picked?: LatLng | null;
  /** Polyline through these points (visit plan route). */
  route?: LatLng[];
  /** Tailwind height class, default h-64. */
  className?: string;
  /** Accessible description of the map. */
  label?: string;
  interactive?: boolean;
}

export const TEHRAN_CENTER: LatLng = { lat: 35.6997, lng: 51.4053 };
export const DEFAULT_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const DEFAULT_ATTRIBUTION = '© OpenStreetMap';
