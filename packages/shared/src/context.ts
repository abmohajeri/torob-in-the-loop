import type { ProviderCode, TravelMode, UserContext } from './types.js';

/**
 * Compact, URL-safe encoding of UserContext for GET requests.
 *   lat,lng,loc,locsrc · bmin,bmax · inst · prov (csv) · open · war · fast · kb · km · mode · at
 */
export function contextToParams(ctx: UserContext | undefined, into: URLSearchParams = new URLSearchParams()): URLSearchParams {
  if (!ctx) return into;
  if (ctx.location) {
    into.set('lat', ctx.location.lat.toFixed(6));
    into.set('lng', ctx.location.lng.toFixed(6));
    if (ctx.location.label) into.set('loc', ctx.location.label);
    into.set('locsrc', ctx.location.source);
  }
  if (ctx.budgetMin) into.set('bmin', String(Math.round(ctx.budgetMin)));
  if (ctx.budgetMax) into.set('bmax', String(Math.round(ctx.budgetMax)));
  if (ctx.installment) into.set('inst', '1');
  if (ctx.providers?.length) into.set('prov', ctx.providers.join(','));
  if (ctx.openNow) into.set('open', '1');
  if (ctx.warrantyOnly) into.set('war', '1');
  if (ctx.fastDelivery) into.set('fast', '1');
  if (ctx.kalabarg) into.set('kb', '1');
  if (ctx.maxDistanceKm) into.set('km', String(ctx.maxDistanceKm));
  if (ctx.travelMode) into.set('mode', ctx.travelMode);
  if (ctx.visitAt) into.set('at', ctx.visitAt);
  // (SV6/SV8/SV14) range, priority, needBy, replicas
  if (ctx.range) {
    const r = ctx.range;
    into.set('rk', r.kind);
    if (r.km) into.set('rkm', String(r.km));
    if (r.areas?.length) into.set('rareas', r.areas.join('|'));
    if (r.maxMinutes) into.set('rmin', String(r.maxMinutes));
    if (r.dest) {
      into.set('rdlat', r.dest.lat.toFixed(6));
      into.set('rdlng', r.dest.lng.toFixed(6));
      if (r.dest.label) into.set('rdl', r.dest.label);
    }
  }
  if (ctx.priority && ctx.priority !== 'balanced') into.set('prio', ctx.priority);
  if (ctx.needBy) into.set('needby', ctx.needBy);
  if (ctx.showReplicas) into.set('rep', '1');
  return into;
}

const MODES: TravelMode[] = ['walk', 'metro', 'taxi', 'car'];
const PROVIDER_CODES: ProviderCode[] = ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other'];

function num(v: string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Inverse of contextToParams. Accepts URLSearchParams or a plain record (e.g. Hono c.req.query()). */
export function paramsToContext(input: URLSearchParams | Record<string, string | undefined>): UserContext {
  const get = (k: string) => (input instanceof URLSearchParams ? input.get(k) : input[k]) ?? undefined;
  const ctx: UserContext = {};
  const lat = num(get('lat'));
  const lng = num(get('lng'));
  if (lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    const src = get('locsrc');
    ctx.location = {
      lat,
      lng,
      label: get('loc') ?? 'موقعیت انتخابی',
      source: src === 'gps' || src === 'map' || src === 'place' ? src : 'place',
    };
  }
  const bmin = num(get('bmin'));
  const bmax = num(get('bmax'));
  if (bmin && bmin > 0) ctx.budgetMin = bmin;
  if (bmax && bmax > 0) ctx.budgetMax = bmax;
  if (get('inst') === '1') ctx.installment = true;
  const prov = get('prov');
  if (prov) {
    const list = prov.split(',').filter((p): p is ProviderCode => (PROVIDER_CODES as string[]).includes(p));
    if (list.length) ctx.providers = list;
  }
  if (get('open') === '1') ctx.openNow = true;
  if (get('war') === '1') ctx.warrantyOnly = true;
  if (get('fast') === '1') ctx.fastDelivery = true;
  if (get('kb') === '1') ctx.kalabarg = true;
  const km = num(get('km'));
  if (km && km > 0) ctx.maxDistanceKm = Math.min(km, 60);
  const mode = get('mode');
  if (mode && (MODES as string[]).includes(mode)) ctx.travelMode = mode as TravelMode;
  const at = get('at');
  if (at && !Number.isNaN(new Date(at).getTime())) ctx.visitAt = new Date(at).toISOString();
  const rk = get('rk');
  if (rk === 'radius' || rk === 'areas' || rk === 'time' || rk === 'route') {
    const r: NonNullable<UserContext['range']> = { kind: rk };
    const rkm = num(get('rkm'));
    if (rkm && rkm > 0) r.km = Math.min(rkm, 60);
    const areas = get('rareas');
    if (areas) r.areas = areas.split('|').map((a) => a.trim()).filter(Boolean).slice(0, 12);
    const rmin = num(get('rmin'));
    if (rmin && rmin > 0) r.maxMinutes = Math.min(rmin, 240);
    const dlat = num(get('rdlat'));
    const dlng = num(get('rdlng'));
    if (dlat !== undefined && dlng !== undefined) {
      r.dest = { lat: dlat, lng: dlng };
      const dl = get('rdl');
      if (dl) r.dest.label = dl;
    }
    ctx.range = r;
  }
  const prio = get('prio');
  if (prio === 'balanced' || prio === 'price' || prio === 'time' || prio === 'certainty') ctx.priority = prio;
  const needBy = get('needby');
  if (needBy && !Number.isNaN(new Date(needBy).getTime())) ctx.needBy = new Date(needBy).toISOString();
  if (get('rep') === '1') ctx.showReplicas = true;
  return ctx;
}

/** Number of active "conditions" (for the context-bar badge). */
export function activeConditionCount(ctx: UserContext): number {
  return [ctx.installment, !!ctx.providers?.length, ctx.openNow, ctx.warrantyOnly, ctx.fastDelivery, ctx.kalabarg].filter(Boolean)
    .length;
}
