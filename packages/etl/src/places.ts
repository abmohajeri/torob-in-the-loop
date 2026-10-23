/**
 * Location-picker gazetteer (docs/ARCHITECTURE.md §4 rule 20): dataset areas, metro stations,
 * malls with ≥ 5 shops and curated landmarks/neighbourhoods (data/places.json).
 * `weight` orders suggestions (higher first); names are matched with `name_norm`.
 */
import { normalizeForSearch, toPersianDigits } from '@titl/shared';
import type { PlaceEntry } from './curation.js';
import type { MetroStation } from './metro.js';

export interface PlaceRow {
  id: string;
  name: string;
  nameNorm: string;
  kind: 'area' | 'landmark' | 'metro' | 'mall';
  lat: number;
  lng: number;
  subtitle: string | null;
  weight: number;
}

const KIND_FA: Record<string, string> = {
  passage: 'پاساژ',
  complex: 'مجتمع تجاری',
  mall: 'مرکز خرید',
  bazaar: 'بازار',
  sara: 'سرا',
  building: 'ساختمان تجاری',
  tower: 'برج تجاری',
};

export function buildPlaces(input: {
  areas: { name: string; lat: number; lng: number; shopCount: number }[];
  metro: MetroStation[];
  malls: { slug: string; name: string; kind: string; area: string | null; lat: number; lng: number; shopCount: number }[];
  curated: PlaceEntry[];
}): PlaceRow[] {
  const rows: PlaceRow[] = [];
  const maxArea = Math.max(1, ...input.areas.map((a) => a.shopCount));
  for (const a of input.areas) {
    rows.push({
      id: `area:${a.name}`,
      name: a.name,
      nameNorm: normalizeForSearch(a.name),
      kind: 'area',
      lat: a.lat,
      lng: a.lng,
      subtitle: `محدوده با ${toPersianDigits(a.shopCount)} فروشگاه`,
      weight: Math.round((0.6 + 0.4 * Math.log1p(a.shopCount) / Math.log1p(maxArea)) * 1000) / 1000,
    });
  }
  for (const s of input.metro) {
    const lines = s.lines.map((l) => toPersianDigits(l.ref)).join('، ');
    rows.push({
      id: `metro:${s.id}`,
      name: `ایستگاه مترو ${s.name}`,
      nameNorm: normalizeForSearch(`${s.name} مترو`),
      kind: 'metro',
      lat: s.lat,
      lng: s.lng,
      subtitle: lines ? `مترو — خط ${lines}` : 'ایستگاه مترو',
      weight: 0.6,
    });
  }
  const maxMall = Math.max(1, ...input.malls.map((m) => m.shopCount));
  for (const m of input.malls) {
    if (m.shopCount < 5) continue;
    rows.push({
      id: `mall:${m.slug}`,
      name: m.name,
      nameNorm: normalizeForSearch(m.name),
      kind: 'mall',
      lat: m.lat,
      lng: m.lng,
      subtitle: [KIND_FA[m.kind] ?? 'مرکز خرید', m.area, `${toPersianDigits(m.shopCount)} فروشگاه`].filter(Boolean).join(' · '),
      weight: Math.round((0.4 + 0.4 * Math.log1p(m.shopCount) / Math.log1p(maxMall)) * 1000) / 1000,
    });
  }
  const seen = new Set(rows.map((r) => r.id));
  for (const p of input.curated) {
    const id = `${p.kind}:${p.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    rows.push({
      id,
      name: p.name,
      nameNorm: normalizeForSearch(p.name),
      kind: p.kind,
      lat: p.lat,
      lng: p.lng,
      subtitle: p.subtitle ?? null,
      weight: typeof p.weight === 'number' ? p.weight : 0.5,
    });
  }
  return rows;
}
