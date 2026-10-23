/**
 * Audience from title / category words (docs/ARCHITECTURE.md §4 rule 8). Only for groups where it matters.
 *   «مردانه و زنانه», «زنانه و مردانه», «یونیسکس», both words present → unisex
 *   بچگانه / کودک / نوزاد / نوجوان → kids        مردانه / پسرانه → men        زنانه / دخترانه → women
 */
import type { Audience } from '@titl/shared';
import { normalizeForSearch } from '@titl/shared';

export const AUDIENCE_GROUPS = new Set(['fashion', 'shoes_bags', 'watch_jewelry', 'beauty', 'sports_toys']);

const has = (text: string, words: readonly string[]) => words.some((w) => text.includes(` ${w} `));

const UNISEX = ['یونیسکس', 'unisex', 'اسپرت مردانه و زنانه'];
const KIDS = ['بچگانه', 'بچه گانه', 'کودک', 'کودکان', 'نوزاد', 'نوزادی', 'نوجوان', 'kids'];
const MEN = ['مردانه', 'پسرانه', 'آقایان', 'اقایان'];
const WOMEN = ['زنانه', 'دخترانه', 'بانوان', 'خانم ها'];

export function detectAudience(groupId: string, title: string, category = ''): Audience | null {
  if (!AUDIENCE_GROUPS.has(groupId)) return null;
  const text = ` ${normalizeForSearch(`${title} ${category}`)} `;
  if (has(text, UNISEX)) return 'unisex';
  const men = has(text, MEN);
  const women = has(text, WOMEN);
  if (has(text, KIDS)) return 'kids';
  if (men && women) return 'unisex';
  if (men) return 'men';
  if (women) return 'women';
  return null;
}
