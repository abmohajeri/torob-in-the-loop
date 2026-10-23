/**
 * Tehran metro stations & lines from OpenStreetMap (docs/ARCHITECTURE.md §4 rule 19).
 * © OpenStreetMap contributors, ODbL — credited in the About page.
 *
 *  - stations: nodes tagged railway=station (subway), excluding construction; names cleaned
 *    («ایستگاه مترو …» dropped), same-name nodes within 300 m merged;
 *  - lines: subway route relations; their stop/platform members (route_nodes.json) are matched to
 *    stations by normalized name, else by proximity (≤ 350 m).
 */
import { cleanFa, haversineKm, normalizeForSearch } from '@titl/shared';
import type { OsmElement } from './curation.js';

export interface MetroLine {
  ref: string;
  color: string;
}

export interface MetroStation {
  id: number;
  name: string;
  nameEn: string | null;
  lat: number;
  lng: number;
  lines: MetroLine[];
}

/** Line colours (OSM hex wins; these cover named colours / missing tags). */
const LINE_COLORS: Record<string, string> = {
  '1': '#E0001F',
  '2': '#2F4389',
  '3': '#67C5F5',
  '4': '#F8E100',
  '5': '#007E46',
  '6': '#EF639F',
  '7': '#7F0B85',
};
const NAMED: Record<string, string> = { red: '#E0001F', blue: '#2F4389', yellow: '#F8E100', green: '#007E46', pink: '#EF639F', purple: '#7F0B85' };

export function cleanStationName(name: string): string {
  return cleanFa(name)
    .replace(/^ایستگاه\s+(?:قطار\s+شهری|مترو|متروی)\s+/, '')
    .replace(/^ایستگاه\s+/, '')
    .replace(/^مترو\s+/, '')
    .replace(/\s+(?:metro\s+station|station)$/i, '')
    .trim();
}

function stationKey(name: string): string {
  return normalizeForSearch(cleanStationName(name)).replace(/\s+/g, '');
}

function lineRef(tags: Record<string, string>): string | null {
  const raw = tags.ref ?? tags.name ?? '';
  const m = /(\d+)/.exec(normalizeForSearch(raw));
  return m ? m[1]! : null;
}

function lineColor(ref: string, colour: string | undefined): string {
  if (colour && /^#[0-9a-f]{6}$/i.test(colour)) return colour.toUpperCase();
  if (colour && NAMED[colour.toLowerCase()]) return NAMED[colour.toLowerCase()]!;
  return LINE_COLORS[ref] ?? '#64748B';
}

export function buildMetro(stationsRaw: readonly OsmElement[], routes: readonly OsmElement[], routeNodes: readonly OsmElement[]): MetroStation[] {
  const stations: (MetroStation & { key: string; n: number })[] = [];
  for (const e of stationsRaw) {
    const t = e.tags ?? {};
    if (e.type !== 'node' || t.railway !== 'station' || typeof e.lat !== 'number' || typeof e.lon !== 'number') continue;
    if (t.construction || t['railway:construction']) continue;
    const name = cleanStationName(t['name:fa'] ?? t.name ?? '');
    if (!name) continue;
    const key = stationKey(name);
    const dup = stations.find((s) => s.key === key && haversineKm(s, { lat: e.lat!, lng: e.lon! }) <= 0.3);
    if (dup) {
      dup.lat = (dup.lat * dup.n + e.lat) / (dup.n + 1);
      dup.lng = (dup.lng * dup.n + e.lon) / (dup.n + 1);
      dup.n++;
      continue;
    }
    stations.push({ id: e.id, name, nameEn: t['name:en'] ? cleanFa(t['name:en']) : null, lat: e.lat, lng: e.lon, lines: [], key, n: 1 });
  }

  const nodeById = new Map<number, OsmElement>();
  for (const n of routeNodes) if (n.type === 'node') nodeById.set(n.id, n);
  for (const n of stationsRaw) if (n.type === 'node' && !nodeById.has(n.id)) nodeById.set(n.id, n);

  const byKey = new Map<string, (typeof stations)[number][]>();
  for (const s of stations) {
    const l = byKey.get(s.key) ?? [];
    l.push(s);
    byKey.set(s.key, l);
  }

  for (const r of routes) {
    const t = r.tags ?? {};
    if (r.type !== 'relation' || (t.route && t.route !== 'subway')) continue;
    const ref = lineRef(t);
    if (!ref) continue;
    const color = lineColor(ref, t.colour);
    for (const m of r.members ?? []) {
      if (m.type !== 'node') continue;
      const node = nodeById.get(m.ref);
      if (!node || typeof node.lat !== 'number' || typeof node.lon !== 'number') continue;
      const p = { lat: node.lat, lng: node.lon };
      const nm = node.tags?.['name:fa'] ?? node.tags?.name ?? '';
      let station: (typeof stations)[number] | null = null;
      if (nm) {
        const cands = byKey.get(stationKey(nm)) ?? [];
        station = cands.sort((a, b) => haversineKm(a, p) - haversineKm(b, p))[0] ?? null;
        if (station && haversineKm(station, p) > 2) station = null;
      }
      if (!station) {
        let best = Infinity;
        for (const s of stations) {
          const d = haversineKm(s, p);
          if (d <= 0.35 && d < best) {
            best = d;
            station = s;
          }
        }
      }
      if (station && !station.lines.some((l) => l.ref === ref)) station.lines.push({ ref, color });
    }
  }
  for (const s of stations) s.lines.sort((a, b) => Number(a.ref) - Number(b.ref));
  return stations
    .map(({ key: _k, n: _n, ...s }) => ({ ...s, lat: Math.round(s.lat * 1e6) / 1e6, lng: Math.round(s.lng * 1e6) / 1e6 }))
    .sort((a, b) => a.id - b.id);
}
