/**
 * Full-text index rows (docs/ARCHITECTURE.md §4 rule 22). Every column holds normalizeForSearch() text.
 *
 *   title    display title
 *   brand    brand display name + English name + aliases (fa/en)
 *   category leaf category + group name + taxonomy aliases
 *   extra    model, English title, ≤ 5 distinct seller titles, short spec values — capped, and reduced to
 *            UNIQUE tokens that do not already occur in `title` (keeps the index small; FTS queries in the
 *            server are token/prefix based, never phrase queries spanning `extra`).
 */
import { normalizeForSearch } from '@titl/shared';
import type { SpecTuple } from './specs.js';

export const FTS_MAX_SELLER_TITLES = 5;
export const FTS_MAX_SPEC_CHARS = 200;
export const FTS_MAX_EXTRA_TOKENS = 80;

export interface FtsInput {
  title: string;
  brandName: string | null;
  brandEn: string | null;
  brandAliases: readonly string[];
  categoryName: string;
  groupName: string;
  categoryAliases: readonly string[];
  model: string | null;
  titleEn: string | null;
  sellerTitles: readonly (string | null | undefined)[];
  specs: readonly SpecTuple[];
}

export interface FtsRow {
  title: string;
  brand: string;
  category: string;
  extra: string;
}

/** Keys whose values add nothing to text search (long free text, dates, sizes in numbers only…). */
const SKIP_SPEC_KEYS = /(نام محصول|توضیح|تاریخ|ابعاد|وزن|ویژگی|امکانات|محتویات|اقلام|سایر|لینک|بارکد|شناسه|سریال)/;

function uniqueTokens(parts: readonly string[], exclude: ReadonlySet<string>, max: number): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    for (const t of normalizeForSearch(p).split(' ')) {
      if (!t || exclude.has(t) || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
      if (out.length >= max) return out.join(' ');
    }
  }
  return out.join(' ');
}

/** Short, search-worthy spec values in order, up to `FTS_MAX_SPEC_CHARS` characters in total. */
export function specSearchText(specs: readonly SpecTuple[]): string {
  const vals: string[] = [];
  let len = 0;
  for (const [key, value] of specs) {
    if (SKIP_SPEC_KEYS.test(key)) continue;
    if (value.length > 40) continue;
    if (/^[\d\s.,/×x*\-+]+$/i.test(value)) continue; // bare numbers / dimensions
    if (len + value.length > FTS_MAX_SPEC_CHARS) break;
    vals.push(value);
    len += value.length + 1;
  }
  return vals.join(' ');
}

export function buildFtsRow(input: FtsInput): FtsRow {
  const title = normalizeForSearch(input.title);
  const titleTokens = new Set(title.split(' ').filter(Boolean));

  const brand = uniqueTokens(
    [input.brandName ?? '', input.brandEn ?? '', ...(input.brandName ? input.brandAliases : [])],
    new Set(),
    40,
  );
  const category = uniqueTokens([input.categoryName, input.groupName, ...input.categoryAliases], new Set(), 60);

  const sellers: string[] = [];
  const seenSeller = new Set<string>();
  for (const s of input.sellerTitles) {
    if (!s) continue;
    const n = normalizeForSearch(s).slice(0, 160);
    if (!n || n === title || seenSeller.has(n)) continue;
    seenSeller.add(n);
    sellers.push(n);
    if (sellers.length >= FTS_MAX_SELLER_TITLES) break;
  }
  const extra = uniqueTokens(
    [input.model ?? '', input.titleEn ?? '', ...sellers, specSearchText(input.specs)],
    titleTokens,
    FTS_MAX_EXTRA_TOKENS,
  );
  return { title, brand, category, extra };
}
