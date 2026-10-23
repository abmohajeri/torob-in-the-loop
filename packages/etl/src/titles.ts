/**
 * Product display titles (docs/ARCHITECTURE.md §4 rule 5).
 *
 *  catalog `persian_title` → unless it is the redaction placeholder «عنوان حذف‌شده برای انتشار»
 *  → the most frequent non-redacted seller title (title_source 'seller')
 *  → «{category} {brand?}» (title_source 'generated').
 * `title_en`: spec «نام محصول» when it is mostly Latin, else the longest Latin run in the title.
 */
import { cleanFa, normalizeForSearch } from '@titl/shared';

export const REDACTED_TITLE = 'عنوان حذف‌شده برای انتشار';
const REDACTED_NORM = normalizeForSearch(REDACTED_TITLE);

export type TitleSource = 'catalog' | 'seller' | 'generated';

export function isRedacted(title: string | null | undefined): boolean {
  if (!title) return false;
  const n = normalizeForSearch(title);
  return n === REDACTED_NORM || (n.includes('حذف شده') && n.includes('انتشار') && n.length < REDACTED_NORM.length + 6);
}

/** Usable title text: non-empty after cleaning, not redacted, has at least one letter. */
export function usableTitle(t: string | null | undefined): string | null {
  if (!t) return null;
  const c = cleanFa(t);
  if (c.length < 2 || isRedacted(c) || !/\p{L}/u.test(c)) return null;
  return c;
}

/** Most frequent usable seller title (by normalized form); ties → shorter, then lexicographic. */
export function bestSellerTitle(titles: readonly (string | null | undefined)[]): string | null {
  const groups = new Map<string, { display: string; n: number }>();
  for (const t of titles) {
    const c = usableTitle(t);
    if (!c) continue;
    const k = normalizeForSearch(c);
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { display: c, n: 1 });
  }
  let best: { display: string; n: number } | null = null;
  for (const g of groups.values()) {
    if (
      !best ||
      g.n > best.n ||
      (g.n === best.n && (g.display.length < best.display.length || (g.display.length === best.display.length && g.display < best.display)))
    ) {
      best = g;
    }
  }
  return best ? best.display : null;
}

export function chooseTitle(
  catalogTitle: string | null | undefined,
  sellerTitles: readonly (string | null | undefined)[],
  category: string,
  brand: string | null,
): { title: string; source: TitleSource } {
  const c = usableTitle(catalogTitle);
  if (c) return { title: c, source: 'catalog' };
  const s = bestSellerTitle(sellerTitles);
  if (s) return { title: s, source: 'seller' };
  const gen = cleanFa([category, brand].filter(Boolean).join(' ')) || 'کالای بدون عنوان';
  return { title: gen, source: 'generated' };
}

const LATIN_RUN = /[A-Za-z0-9][A-Za-z0-9 .,+\-/&()'"×x]*[A-Za-z0-9)+]/g;

function latinShare(s: string): number {
  const letters = s.match(/\p{L}/gu) ?? [];
  if (!letters.length) return 0;
  return letters.filter((ch) => /[A-Za-z]/.test(ch)).length / letters.length;
}

/** English/Latin name: spec «نام محصول» when mostly Latin, else the longest Latin run of the title. */
export function extractTitleEn(title: string, specName: string | null | undefined): string | null {
  if (specName) {
    const s = cleanFa(specName);
    if (s.length >= 3 && latinShare(s) >= 0.6) return s.slice(0, 160);
  }
  let best: string | null = null;
  for (const m of title.matchAll(LATIN_RUN)) {
    const run = m[0].replace(/[\s(,.\-]+$/, '').trim();
    if ((run.match(/[A-Za-z]/g) ?? []).length < 2) continue;
    if (!best || run.length > best.length) best = run;
  }
  return best ? best.slice(0, 160) : null;
}
