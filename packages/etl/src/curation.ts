/**
 * Loader for the curated JSON inputs in packages/etl/data (written by the curation engineer).
 * Every file is optional: a missing / malformed / partial file yields sensible defaults and a warning,
 * so the catalog can always be built.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { warn } from './log.js';

export interface TaxonomyFile {
  version?: number;
  /** leaf category name (exactly as in dataset) → group id */
  groups: Record<string, string>;
  /** leaf category name → colloquial search aliases */
  aliases: Record<string, string[]>;
}

export interface BrandEntry {
  name: string;
  en?: string | null;
  aliases?: string[];
}

export interface PlaceEntry {
  id: string;
  name: string;
  kind: 'landmark' | 'area';
  lat: number;
  lng: number;
  subtitle?: string | null;
  weight?: number;
}

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  members?: { type: string; ref: number; role?: string }[];
}

export interface CurationData {
  taxonomy: TaxonomyFile;
  synonyms: Record<string, string[]>;
  brands: BrandEntry[];
  places: PlaceEntry[];
  osm: { stations: OsmElement[]; routes: OsmElement[]; routeNodes: OsmElement[] };
  /** Which files were found and used (for the data report). */
  files: Record<string, 'ok' | 'missing' | 'invalid'>;
}

function readJson(dir: string, name: string, files: CurationData['files']): unknown {
  const p = join(dir, name);
  if (!existsSync(p)) {
    files[name] = 'missing';
    warn(`curation file ${name} not found — using defaults`);
    return undefined;
  }
  try {
    const v = JSON.parse(readFileSync(p, 'utf8')) as unknown;
    files[name] = 'ok';
    return v;
  } catch (e) {
    files[name] = 'invalid';
    warn(`curation file ${name} is not valid JSON (${(e as Error).message}) — using defaults`);
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr) : isStr(v) ? [v] : []);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parseTaxonomy(raw: unknown): TaxonomyFile {
  const out: TaxonomyFile = { version: 1, groups: {}, aliases: {} };
  if (!isRecord(raw)) return out;
  if (finite(raw.version)) out.version = raw.version;
  if (isRecord(raw.groups)) {
    for (const [k, v] of Object.entries(raw.groups)) if (isStr(v)) out.groups[k] = v.trim();
  }
  if (isRecord(raw.aliases)) {
    for (const [k, v] of Object.entries(raw.aliases)) {
      const list = strList(v);
      if (list.length) out.aliases[k] = list;
    }
  }
  return out;
}

export function parseSynonyms(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isRecord(raw)) return out;
  // Accept both { term: [...] } and { synonyms: { term: [...] } }.
  const src = isRecord(raw.synonyms) ? raw.synonyms : raw;
  for (const [k, v] of Object.entries(src)) {
    if (k === 'version' || k === '$comment' || k.startsWith('_')) continue;
    const list = strList(v);
    if (list.length) out[k] = list;
  }
  return out;
}

export function parseBrands(raw: unknown): BrandEntry[] {
  const list = isRecord(raw) && Array.isArray(raw.brands) ? raw.brands : Array.isArray(raw) ? raw : [];
  const out: BrandEntry[] = [];
  for (const b of list) {
    if (!isRecord(b) || !isStr(b.name)) continue;
    out.push({ name: b.name.trim(), en: isStr(b.en) ? b.en.trim() : null, aliases: strList(b.aliases) });
  }
  return out;
}

export function parsePlaces(raw: unknown): PlaceEntry[] {
  const list = isRecord(raw) && Array.isArray(raw.places) ? raw.places : Array.isArray(raw) ? raw : [];
  const out: PlaceEntry[] = [];
  for (const p of list) {
    if (!isRecord(p) || !isStr(p.id) || !isStr(p.name) || !finite(p.lat) || !finite(p.lng)) continue;
    // Sanity: Tehran-ish bounding box.
    if (p.lat < 35.4 || p.lat > 36.0 || p.lng < 51.0 || p.lng > 51.8) {
      warn(`places.json: «${p.name}» (${p.id}) has coordinates outside Tehran — skipped`);
      continue;
    }
    out.push({
      id: p.id.trim(),
      name: p.name.trim(),
      kind: p.kind === 'area' ? 'area' : 'landmark',
      lat: p.lat,
      lng: p.lng,
      subtitle: isStr(p.subtitle) ? p.subtitle.trim() : null,
      weight: finite(p.weight) ? p.weight : 0.5,
    });
  }
  return out;
}

function osmElements(raw: unknown): OsmElement[] {
  if (!isRecord(raw) || !Array.isArray(raw.elements)) return [];
  return raw.elements.filter((e): e is OsmElement => isRecord(e) && typeof e.type === 'string' && finite(e.id));
}

export function loadCuration(dir: string): CurationData {
  const files: CurationData['files'] = {};
  const taxonomy = parseTaxonomy(readJson(dir, 'taxonomy.json', files));
  const synonyms = parseSynonyms(readJson(dir, 'synonyms.json', files));
  const brands = parseBrands(readJson(dir, 'brands.json', files));
  const places = parsePlaces(readJson(dir, 'places.json', files));
  const stations = osmElements(readJson(dir, 'osm/metro.json', files));
  const routes = osmElements(readJson(dir, 'osm/routes.json', files));
  const routeNodes = osmElements(readJson(dir, 'osm/route_nodes.json', files));
  return { taxonomy, synonyms, brands, places, osm: { stations, routes, routeNodes }, files };
}
