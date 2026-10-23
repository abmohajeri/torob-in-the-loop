/**
 * «کمکم کن انتخاب کنم» — data-driven discovery questions for a vague need. Every option carries the
 * number of matching products and the SearchRequest patch (and/or UserContext patch) it applies.
 */
import type { DiscoveryOption, DiscoveryQuestion, DiscoveryResponse, UserContext } from '@titl/shared';
import { formatNumber } from '@titl/shared';
import { AUDIENCE_LABEL } from '../domain/nlu-data.js';
import { budgetLabel } from '../domain/price.js';
import type { Core } from './core.js';
import { facetsOf, runSearch } from './search.js';

const TIER_HINT: Record<string, string> = {
  budget: 'اقتصادی‌ترین گزینه‌ها',
  mid: 'بیشتر خریدها در این بازه است',
  premium: 'کیفیت و امکانات بیشتر',
  luxury: 'گران‌ترین مدل‌ها',
};

export function discover(core: Core, input: { q?: string; category?: string }, ctx: UserContext): DiscoveryResponse {
  const q = (input.q ?? '').trim();
  const req = { q, ...(input.category ? { category: input.category } : {}) };
  const run = runSearch(core, req, ctx);
  const facets = facetsOf(core, run);
  const total = run.ranked.length;
  const parsed = run.parsed;
  const questions: DiscoveryQuestion[] = [];

  // dominant category
  const catCounts = new Map<number, number>();
  for (const c of run.ranked) catCounts.set(c.category_id, (catCounts.get(c.category_id) ?? 0) + 1);
  const topCat = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const dominant =
    run.categoryId !== null
      ? core.categories.get(run.categoryId) ?? null
      : topCat && topCat[1] >= total * 0.6
        ? core.categories.get(topCat[0]) ?? null
        : null;

  // 1. category (only when the need is ambiguous)
  if (!dominant && facets.categories.length >= 2) {
    questions.push({
      id: 'category',
      title: 'دنبال کدام نوع کالا هستید؟',
      subtitle: 'با انتخاب دسته، پیشنهادها دقیق‌تر می‌شوند',
      multi: false,
      options: facets.categories.slice(0, 6).map((b) => ({ id: `cat:${b.value}`, label: b.label, count: b.count, patch: { category: b.value } })),
    });
  }

  // 2. budget
  if (parsed.budgetMin === undefined && parsed.budgetMax === undefined && ctx.budgetMax === undefined && facets.priceTiers.length >= 2) {
    questions.push({
      id: 'budget',
      title: 'بودجه‌تان حدوداً چقدر است؟',
      subtitle: 'بازه‌ها از قیمت‌های ثبت‌شده همین کالاها محاسبه شده‌اند',
      multi: false,
      options: facets.priceTiers.map((t) => {
        const o: DiscoveryOption = {
          id: `tier:${t.id}`,
          label: budgetLabel(t.min, t.max),
          hint: TIER_HINT[t.id] ?? '',
          count: t.count,
          patch: {
            ...(t.min !== null ? { priceMin: t.min } : {}),
            ...(t.max !== null ? { priceMax: t.max } : {}),
          },
          contextPatch: { ...(t.min !== null ? { budgetMin: t.min } : {}), ...(t.max !== null ? { budgetMax: t.max } : {}) },
        };
        return o;
      }),
    });
  }

  // 3. brand
  if (!parsed.brand && facets.brands.length >= 2) {
    const opts: DiscoveryOption[] = facets.brands.slice(0, 6).map((b) => ({ id: `brand:${b.value}`, label: b.label, count: b.count, patch: { brand: b.value } }));
    opts.push({ id: 'brand:any', label: 'فرقی نمی‌کند', count: total, patch: {} });
    questions.push({ id: 'brand', title: 'برند خاصی مد نظرتان است؟', multi: false, options: opts });
  }

  // 4. audience
  if (!parsed.audience && facets.audiences.length >= 2) {
    questions.push({
      id: 'audience',
      title: 'برای چه کسی می‌خواهید؟',
      multi: false,
      options: facets.audiences.slice(0, 4).map((a) => ({
        id: `aud:${a.value}`,
        label: AUDIENCE_LABEL[a.value as keyof typeof AUDIENCE_LABEL] ?? a.label,
        count: a.count,
        patch: { audience: a.value as 'men' | 'women' | 'kids' | 'unisex' },
      })),
    });
  }

  // 5. spec facets (one category dominates)
  for (const sf of facets.specs.slice(0, 2)) {
    if (sf.values.length < 2) continue;
    questions.push({
      id: `spec:${sf.key}`,
      title: `${sf.key} مورد نظرتان چیست؟`,
      multi: false,
      options: sf.values.slice(0, 6).map((v) => ({ id: `spec:${sf.key}::${v.value}`, label: v.label, count: v.count, patch: { spec: [`${sf.key}::${v.value}`] } })),
    });
  }

  // 6. shopping conditions
  const cond: DiscoveryOption[] = [];
  if (facets.nearCount !== null && facets.nearCount > 0) {
    cond.push({ id: 'near', label: 'فقط نزدیک من', hint: 'حداقل یک فروشنده در همین اطراف', count: facets.nearCount, patch: { nearOnly: true } });
  }
  if (!ctx.installment && !parsed.installment && facets.installmentCount > 0) {
    cond.push({
      id: 'installment',
      label: 'فقط قسطی',
      hint: 'فروشنده‌هایی که خرید اقساطی ثبت کرده‌اند',
      count: facets.installmentCount,
      patch: {},
      contextPatch: { installment: true },
    });
  }
  if (cond.length) {
    questions.push({ id: 'conditions', title: 'شرط دیگری هم دارید؟', subtitle: 'می‌توانید چند گزینه را انتخاب کنید', multi: true, options: cond });
  }

  const subject = dominant?.name ?? (q || 'کالای مورد نظرتان');
  const intro = total
    ? `برای «${subject}» ${formatNumber(total)} کالا پیدا کردم. با جواب دادن به ${formatNumber(Math.min(2, questions.length) || 1)} سؤال کوتاه، بهترین گزینه‌ها را پیشنهاد می‌دهم.`
    : `برای «${subject}» کالایی پیدا نکردم. لطفاً عبارت دیگری را امتحان کنید.`;
  return {
    category: dominant?.name ?? null,
    categoryGroup: dominant?.groupId ?? parsed.categoryGroup ?? null,
    intro,
    totalProducts: total,
    questions,
  };
}
