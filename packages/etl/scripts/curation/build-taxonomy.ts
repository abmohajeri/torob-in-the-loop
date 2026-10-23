/**
 * Regenerates packages/etl/data/taxonomy.json from the dataset's leaf categories:
 *   groups  ← taxonomy-rules.ts (OVERRIDES + ordered keyword RULES)
 *   aliases ← category-aliases.ts (hand-written colloquial / misspelled / English search aliases)
 *
 * Usage (from repo root):
 *   npx tsx packages/etl/scripts/curation/build-taxonomy.ts [--review=/path/review.tsv] [--dry]
 */
import { writeFileSync } from 'node:fs';
import { CATEGORY_ALIASES } from './category-aliases.js';
import { loadCategoryCounts, writeDataJson } from './dataset.js';
import { classifyCategory, GROUP_IDS, type GroupId } from './taxonomy-rules.js';

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k ?? '', v ?? 'true'] as const;
  }),
);

const counts = await loadCategoryCounts();
const names = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b, 'fa'));

const groups: Record<string, GroupId> = {};
const review: string[] = ['category\tproducts\tgroup\tvia'];
const perGroup = new Map<GroupId, { cats: number; products: number }>();
for (const g of GROUP_IDS) perGroup.set(g, { cats: 0, products: 0 });

for (const name of names) {
  const { group, via } = classifyCategory(name);
  groups[name] = group;
  const n = counts.get(name) ?? 0;
  const s = perGroup.get(group)!;
  s.cats++;
  s.products += n;
  review.push(`${name}\t${n}\t${group}\t${via}`);
}

// Aliases: only for categories that exist in the dataset; warn about stale keys.
const aliases: Record<string, string[]> = {};
const stale: string[] = [];
for (const [cat, list] of Object.entries(CATEGORY_ALIASES)) {
  if (!counts.has(cat)) {
    stale.push(cat);
    continue;
  }
  const uniq = [...new Set(list.map((a) => a.trim()).filter(Boolean))];
  if (uniq.length) aliases[cat] = uniq;
}
// Keep the alias map ordered like groups (by product count) for readable diffs.
const orderedAliases: Record<string, string[]> = {};
for (const name of names) if (aliases[name]) orderedAliases[name] = aliases[name]!;

const taxonomy = { version: 1, groups, aliases: orderedAliases };

console.log(`categories: ${names.length}`);
for (const [g, s] of perGroup) console.log(`  ${g.padEnd(14)} ${String(s.cats).padStart(5)} cats ${String(s.products).padStart(7)} products`);
const others = names.filter((n) => groups[n] === 'other');
console.log(`other: ${others.length} → ${others.join(' | ')}`);
console.log(`aliases: ${Object.keys(orderedAliases).length} categories, ${Object.values(orderedAliases).reduce((a, l) => a + l.length, 0)} aliases`);
if (stale.length) console.log(`WARN stale alias keys (not in dataset): ${stale.join(' | ')}`);

if (args.get('review')) {
  writeFileSync(args.get('review')!, review.join('\n') + '\n');
  console.log(`review written: ${args.get('review')}`);
}
if (args.get('dry') !== 'true') {
  writeDataJson('taxonomy.json', taxonomy);
  console.log('wrote packages/etl/data/taxonomy.json');
}
