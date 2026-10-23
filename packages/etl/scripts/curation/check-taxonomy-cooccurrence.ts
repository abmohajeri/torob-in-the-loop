/**
 * Second-opinion check for the taxonomy: for every leaf category, look at the shops that carry it
 * (offers.csv) and at what ELSE those shops sell. If most of those shops are dominated by a different
 * group than the one assigned, print the category for manual review. This reflects where people
 * actually buy the item in Tehran (shop specialization), which is what the in-person UX relies on.
 *
 * Usage: npx tsx packages/etl/scripts/curation/check-taxonomy-cooccurrence.ts [--min=0.5] [--all]
 */
import { loadOfferPairs, loadProducts, readDataJson } from './dataset.js';

interface Taxonomy {
  groups: Record<string, string>;
}

const minShare = Number(process.argv.find((a) => a.startsWith('--min='))?.split('=')[1] ?? 0.5);
const showAll = process.argv.includes('--all');

const tax = readDataJson<Taxonomy>('taxonomy.json');
const products = await loadProducts();
const pairs = await loadOfferPairs();
const catOf = new Map(products.map((p) => [p.id, p.category] as const));

// shop → category → offer count
const shopCats = new Map<string, Map<string, number>>();
for (const [pid, sid] of pairs) {
  const cat = catOf.get(pid);
  if (!cat) continue;
  let m = shopCats.get(sid);
  if (!m) shopCats.set(sid, (m = new Map()));
  m.set(cat, (m.get(cat) ?? 0) + 1);
}

/** Dominant group of a shop, excluding one category (so a category doesn't vote for itself). */
function dominantGroup(m: Map<string, number>, exclude: string): string | null {
  const g = new Map<string, number>();
  let total = 0;
  for (const [cat, n] of m) {
    if (cat === exclude) continue;
    const grp = tax.groups[cat] ?? 'other';
    g.set(grp, (g.get(grp) ?? 0) + n);
    total += n;
  }
  if (total < 3) return null;
  let best: string | null = null;
  let bestN = 0;
  for (const [grp, n] of g) if (n > bestN) [best, bestN] = [grp, n];
  return best && bestN / total >= 0.4 ? best : null;
}

const catShops = new Map<string, string[]>();
for (const [sid, m] of shopCats) for (const cat of m.keys()) (catShops.get(cat) ?? catShops.set(cat, []).get(cat)!).push(sid);

const rows: { cat: string; assigned: string; top: string; share: number; shops: number; dist: string }[] = [];
for (const [cat, shops] of catShops) {
  const votes = new Map<string, number>();
  let n = 0;
  for (const sid of shops) {
    const d = dominantGroup(shopCats.get(sid)!, cat);
    if (!d) continue;
    votes.set(d, (votes.get(d) ?? 0) + 1);
    n++;
  }
  if (n < 2) continue;
  const sorted = [...votes].sort((a, b) => b[1] - a[1]);
  const [top, topN] = sorted[0]!;
  const assigned = tax.groups[cat] ?? '(unmapped)';
  const share = topN / n;
  if (showAll || (top !== assigned && share >= minShare)) {
    rows.push({ cat, assigned, top, share, shops: n, dist: sorted.slice(0, 3).map(([g, c]) => `${g}:${c}`).join(' ') });
  }
}
rows.sort((a, b) => b.shops - a.shops);
for (const r of rows) console.log(`${r.cat}\t${r.assigned}\t→ ${r.top} (${Math.round(r.share * 100)}% of ${r.shops} shops)\t${r.dist}`);
console.log(`\n${rows.length} categories flagged (min share ${minShare}).`);
