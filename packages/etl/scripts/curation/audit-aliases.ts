/**
 * Audit category aliases: lists alias phrases that map to several leaf categories, flagging those that
 * span different category groups (potential relevance drift), and top categories without aliases.
 *
 * Usage (from repo root): npx tsx packages/etl/scripts/curation/audit-aliases.ts [--top=450]
 */
import { normalizeForSearch } from '@titl/shared';
import { CATEGORY_ALIASES } from './category-aliases.js';
import { loadCategoryCounts } from './dataset.js';
import { classifyCategory } from './taxonomy-rules.js';

const top = Number(process.argv.find((a) => a.startsWith('--top='))?.slice(6) ?? 450);

const byAlias = new Map<string, Set<string>>();
for (const [cat, list] of Object.entries(CATEGORY_ALIASES)) {
  for (const a of list) {
    const k = normalizeForSearch(a);
    if (!byAlias.has(k)) byAlias.set(k, new Set());
    byAlias.get(k)!.add(cat);
  }
}
const lines: string[] = [];
for (const [a, cats] of byAlias) {
  if (cats.size < 2) continue;
  const groups = new Set([...cats].map((c) => classifyCategory(c).group));
  lines.push(`${groups.size > 1 ? 'XGROUP' : 'same  '} ${a} => ${[...cats].map((c) => `${c}(${classifyCategory(c).group})`).join(' | ')}`);
}
lines.sort();
console.log(lines.join('\n'));

const counts = await loadCategoryCounts();
const names = [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
const missing = names.slice(0, top).filter((n) => !CATEGORY_ALIASES[n]);
console.log(`\ntop ${top} categories without aliases: ${missing.length}`);
for (const n of missing) console.log(`  ${n}\t${counts.get(n)}`);
