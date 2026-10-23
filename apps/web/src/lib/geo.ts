import type { LatLng } from '@titl/shared';

export type GeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported' | 'insecure';

export const GEO_MESSAGES: Record<GeoErrorCode, string> = {
  denied:
    'اجازه دسترسی به موقعیت داده نشد. می‌توانید از تنظیمات مرورگر اجازه دهید یا محدوده را از فهرست انتخاب کنید.',
  unavailable: 'موقعیت شما در دسترس نیست. دوباره تلاش کنید یا محدوده را دستی انتخاب کنید.',
  timeout: 'دریافت موقعیت بیش از حد طول کشید. دوباره تلاش کنید یا محدوده را دستی انتخاب کنید.',
  unsupported: 'مرورگر شما از تعیین موقعیت پشتیبانی نمی‌کند. لطفاً محدوده را از فهرست انتخاب کنید.',
  insecure: 'تعیین موقعیت فقط در اتصال امن (HTTPS) ممکن است. لطفاً محدوده را از فهرست انتخاب کنید.',
};

export class GeoError extends Error {
  override readonly name = 'GeoError';
  constructor(readonly code: GeoErrorCode) {
    super(GEO_MESSAGES[code]);
  }
}

export interface GeoFix extends LatLng {
  /** Accuracy radius in meters, when reported. */
  accuracy: number | null;
}

export interface GeoOptions {
  timeoutMs?: number;
  highAccuracy?: boolean;
  maximumAgeMs?: number;
  /** Injected for tests. */
  geolocation?: Geolocation | null;
  /** Injected for tests (defaults to window.isSecureContext). */
  secure?: boolean;
}

/** Map a W3C GeolocationPositionError code (1/2/3) to our code. */
export function geoCodeFromPositionError(code: number): GeoErrorCode {
  if (code === 1) return 'denied';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

/**
 * navigator.geolocation as a Promise with Persian errors and a hard timeout
 * (some browsers never call back while the permission prompt is ignored).
 */
export function getCurrentPosition(opts: GeoOptions = {}): Promise<GeoFix> {
  const timeoutMs = opts.timeoutMs ?? 12_000;
  const geolocation =
    opts.geolocation !== undefined ? opts.geolocation : typeof navigator !== 'undefined' ? navigator.geolocation : null;
  const secure = opts.secure ?? (typeof window !== 'undefined' ? window.isSecureContext !== false : true);

  return new Promise<GeoFix>((resolve, reject) => {
    if (!secure) return reject(new GeoError('insecure'));
    if (!geolocation) return reject(new GeoError('unsupported'));
    let settled = false;
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new GeoError('timeout'));
    }, timeoutMs + 3000);
    geolocation.getCurrentPosition(
      (pos) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
        });
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(guard);
        reject(new GeoError(geoCodeFromPositionError(err.code)));
      },
      { enableHighAccuracy: opts.highAccuracy ?? true, timeout: timeoutMs, maximumAge: opts.maximumAgeMs ?? 60_000 },
    );
  });
}

/** Generous bounding box of Tehran (the dataset covers Tehran only). */
export const TEHRAN_BOUNDS = { south: 35.52, north: 35.86, west: 51.08, east: 51.66 } as const;

export function isInTehran(p: LatLng): boolean {
  return p.lat >= TEHRAN_BOUNDS.south && p.lat <= TEHRAN_BOUNDS.north && p.lng >= TEHRAN_BOUNDS.west && p.lng <= TEHRAN_BOUNDS.east;
}
