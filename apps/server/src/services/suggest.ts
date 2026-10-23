/**
 * Type-ahead suggestions: categories, brands, malls and top products for a prefix.
 */
import type { SuggestResponse } from '@titl/shared';
import { formatNumber, normalizeForSearch } from '@titl/shared';
import { ftsQuery } from '../domain/nlu.js';
import type { Core } from './core.js';

type Sug = SuggestResponse['suggestions'][number];

export function suggest(core: Core, q: string): SuggestResponse {
  const qn = normalizeForSearch(q).slice(0, 60);
  if (qn.length < 2) return { suggestions: [] };
  const out: Sug[] = [];
  const seen = new Set<string>();
  const push = (s: Sug) => {
    const k = `${s.type}:${s.value}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };

  // categories by alias prefix (prefer the category's own name)
  const cats: { name: string; score: number; count: number }[] = [];
  for (const [alias, e] of core.vocab.catAlias) {
    if (!e.cat || !alias.startsWith(qn)) continue;
    cats.push({ name: e.cat.name, score: (alias === qn ? 2 : 1) + Math.log1p(e.cat.productCount) / 10, count: e.cat.productCount });
  }
  cats.sort((a, b) => b.score - a.score);
  for (const c of cats.slice(0, 6)) {
    if (out.filter((o) => o.type === 'category').length >= 3) break;
    push({ type: 'category', label: c.name, value: c.name, hint: `${formatNumber(c.count)} کالا` });
  }

  // brands
  const brands: { name: string; count: number }[] = [];
  for (const [alias, b] of core.vocab.brandAlias) if (alias.startsWith(qn)) brands.push({ name: b.name, count: b.productCount });
  brands.sort((a, b) => b.count - a.count);
  for (const b of brands.slice(0, 6)) {
    if (out.filter((o) => o.type === 'brand').length >= 2) break;
    push({ type: 'brand', label: b.name, value: b.name, hint: 'برند' });
  }

  // malls
  for (const m of core.malls.values()) {
    if (out.filter((o) => o.type === 'mall').length >= 2) break;
    if (m.shopCount >= 3 && (m.nameNorm.startsWith(qn) || m.nameNorm.includes(` ${qn}`))) {
      push({ type: 'mall', label: m.name, value: m.slug, hint: m.area ?? undefined });
    }
  }

  // products (prefix FTS on the last token)
  const tokens = qn.split(' ');
  const match = ftsQuery(tokens, new Map(), 'and');
  if (match) {
    try {
      const rows = core.db.all<{ id: string; title: string; shop_count: number }>(
        `SELECT p.id, p.title, p.shop_count FROM products_fts JOIN products p ON p.rid = products_fts.rowid
         WHERE products_fts MATCH ? ORDER BY bm25(products_fts, 10.0, 6.0, 4.0, 1.5) - p.popularity * 0.4 LIMIT 5`,
        match,
      );
      for (const r of rows) push({ type: 'product', label: r.title, value: r.id, hint: `${formatNumber(r.shop_count)} فروشنده` });
    } catch {
      /* malformed FTS expression → no product suggestions */
    }
  }
  if (!out.some((o) => o.type === 'query')) push({ type: 'query', label: q.trim(), value: q.trim() });
  return { suggestions: out.slice(0, 12) };
}
