/**
 * Leaf category → category group + search aliases (docs/ARCHITECTURE.md §4 rule 7).
 *
 * Source: packages/etl/data/taxonomy.json (curated). Graceful defaults:
 *  - a leaf missing from the file → group 'other' (counted in the report);
 *  - a group id that is not one of shared CATEGORY_GROUPS → 'other' (warned);
 *  - activity categories that shops declare but no product uses (not in the taxonomy) inherit the group
 *    most often co-declared with them by the same shops (majority vote, deterministic tie-break).
 */
import { CATEGORY_GROUPS, normalizeForSearch } from '@titl/shared';
import type { TaxonomyFile } from './curation.js';
import { warn } from './log.js';

export const GROUP_IDS = new Set(CATEGORY_GROUPS.map((g) => g.id));
export const GROUP_NAME = new Map(CATEGORY_GROUPS.map((g) => [g.id, g.name]));

export type GroupSource = 'taxonomy' | 'cooccurrence' | 'default';

export interface Taxonomy {
  /** Group for a leaf category plus where that decision came from. */
  group(name: string): { id: string; source: GroupSource };
  /** Normalized, de-duplicated search aliases for a leaf category. */
  aliases(name: string): string[];
  /** Register inferred groups (co-occurrence) for categories absent from the taxonomy file. */
  setInferred(name: string, groupId: string): void;
  has(name: string): boolean;
}

export function createTaxonomy(file: TaxonomyFile): Taxonomy {
  const groups = new Map<string, string>();
  const badGroups = new Map<string, number>();
  for (const [leaf, gid] of Object.entries(file.groups)) {
    const key = leaf.trim();
    if (GROUP_IDS.has(gid)) groups.set(key, gid);
    else {
      badGroups.set(gid, (badGroups.get(gid) ?? 0) + 1);
      groups.set(key, 'other');
    }
  }
  for (const [gid, n] of badGroups) warn(`taxonomy.json: unknown group id «${gid}» used by ${n} categories → 'other'`);

  const aliasMap = new Map<string, string[]>();
  for (const [leaf, list] of Object.entries(file.aliases)) {
    const norm = [...new Set(list.map((a) => normalizeForSearch(a)).filter((a) => a.length >= 2))];
    if (norm.length) aliasMap.set(leaf.trim(), norm);
  }
  const inferred = new Map<string, string>();

  return {
    group(name) {
      const g = groups.get(name);
      if (g) return { id: g, source: 'taxonomy' };
      const i = inferred.get(name);
      if (i) return { id: i, source: 'cooccurrence' };
      return { id: 'other', source: 'default' };
    },
    aliases(name) {
      return aliasMap.get(name) ?? [];
    },
    setInferred(name, groupId) {
      if (!groups.has(name) && GROUP_IDS.has(groupId)) inferred.set(name, groupId);
    },
    has(name) {
      return groups.has(name);
    },
  };
}

/**
 * Majority-vote group inference for categories the taxonomy does not know, using the other categories
 * declared by the same shops. Returns name → group id for every inferable category ('other' votes ignored).
 */
export function inferGroupsByCooccurrence(
  shopCategoryLists: readonly (readonly string[])[],
  known: (name: string) => string | null,
): Map<string, string> {
  const votes = new Map<string, Map<string, number>>();
  for (const list of shopCategoryLists) {
    const knownGroups: string[] = [];
    const unknown: string[] = [];
    for (const c of list) {
      const g = known(c);
      if (g === null) unknown.push(c);
      else if (g !== 'other') knownGroups.push(g);
    }
    if (!unknown.length || !knownGroups.length) continue;
    for (const u of unknown) {
      let m = votes.get(u);
      if (!m) votes.set(u, (m = new Map()));
      for (const g of knownGroups) m.set(g, (m.get(g) ?? 0) + 1);
    }
  }
  const out = new Map<string, string>();
  for (const [name, m] of votes) {
    let best: string | null = null;
    let bestN = 0;
    for (const [g, n] of [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      if (n > bestN) {
        best = g;
        bestN = n;
      }
    }
    if (best) out.set(name, best);
  }
  return out;
}
