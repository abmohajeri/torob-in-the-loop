/** Short grounded AI verdict for the product-comparison page (fast model, ≤ 120 words). */
import type { CompareProductsResponse, UserContext } from '@titl/shared';
import type { LlmClient } from './llm.js';
import { contextLine } from './prompt.js';

export async function compareVerdict(
  llm: LlmClient,
  model: string,
  data: CompareProductsResponse,
  ctx: UserContext,
  signal?: AbortSignal,
): Promise<string | null> {
  if (data.products.length < 2) return null;
  const compact = {
    products: data.products.map((p, i) => ({
      n: i + 1,
      title: p.title.slice(0, 60),
      price: [p.priceMin, p.priceMax],
      sellers: p.sellerCount,
      near: p.sellersNearby,
      installment_sellers: p.installmentSellers,
      freshness: p.freshness,
    })),
    rows: data.rows.filter((r) => r.differs).slice(0, 12).map((r) => ({ k: r.key, v: r.values })),
  };
  const res = await llm.complete(
    {
      model,
      temperature: 0.2,
      maxTokens: 350,
      messages: [
        {
          role: 'system',
          content:
            'You are «دستیار Torob in the Loop». Write a Persian verdict (≤ 120 words, 2–4 short sentences) comparing these products for an IN-PERSON shopper in Tehran. Use ONLY the given data; prices are registered (not verified) prices. Say which fits which need and the key trade-off. Persian digits, correct half-spaces, no lists, no markdown.',
        },
        { role: 'user', content: `User context: ${contextLine(ctx)}\nData: ${JSON.stringify(compact).slice(0, 4000)}` },
      ],
    },
    signal,
  );
  const t = res.content.trim();
  return t ? t.slice(0, 900) : null;
}
