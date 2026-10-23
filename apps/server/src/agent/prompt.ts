/** System prompt with Tehran time, user context, working memory and a situational brief (AG4). */
import {
  DAY_NAMES_FA,
  PROVIDERS,
  TRAVEL_MODE_META,
  formatJalaliDate,
  formatTimeOfDay,
  formatTomanShort,
  tehranParts,
  toPersianDigits,
  type UserContext,
} from '@titl/shared';
import type { AgentMemory } from './memory.js';

export function tehranNowLine(now: Date): string {
  const p = tehranParts(now);
  return `${DAY_NAMES_FA[p.weekday]} ${formatJalaliDate(now.toISOString())}، ساعت ${toPersianDigits(`${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`)}`;
}

export function contextLine(ctx: UserContext): string {
  const conds: string[] = [];
  if (ctx.installment) conds.push('قسطی');
  if (ctx.providers?.length) conds.push(ctx.providers.map((p) => PROVIDERS[p]?.label ?? p).join('/'));
  if (ctx.openNow) conds.push('باز در زمان مراجعه');
  if (ctx.warrantyOnly) conds.push('گارانتی‌دار');
  if (ctx.kalabarg) conds.push('کالابرگ');
  const budget =
    ctx.budgetMax || ctx.budgetMin
      ? `${ctx.budgetMin ? `از ${formatTomanShort(ctx.budgetMin)} ` : ''}${ctx.budgetMax ? `تا ${formatTomanShort(ctx.budgetMax)}` : ''}`.trim()
      : 'نامشخص';
  return [
    `محدوده=${ctx.location?.label ?? 'نامشخص'}`,
    `بودجه=${budget}`,
    `شرایط=${conds.join('، ') || '—'}`,
    `زمان مراجعه=${ctx.visitAt ? formatTimeOfDay(ctx.visitAt) : 'الان'}`,
    `رفت‌وآمد=${ctx.travelMode ? TRAVEL_MODE_META[ctx.travelMode].label : '—'}`,
  ].join('; ');
}

export function memoryLine(mem: AgentMemory, openInquiries: number): string {
  const h = (prefix: string, ids: string[]) =>
    ids
      .map((id) => Object.entries(mem.handles).find(([k, v]) => v === id && k.startsWith(prefix))?.[0])
      .filter(Boolean)
      .join(',') || '—';
  const fp = mem.focusProductId ? `${h('P', [mem.focusProductId])} «${(mem.focusProductTitle ?? '').slice(0, 40)}»` : '—';
  return `focused product=${fp}; last results=${h('P', mem.lastProductIds.slice(0, 6))}; last stores=${h('S', mem.lastShopIds.slice(0, 6))}; open inquiries=${openInquiries}`;
}

export function buildSystemPrompt(input: { now: Date; ctx: UserContext; mem: AgentMemory; openInquiries: number; brief?: string | null }): string {
  return `You are «دستیار Torob in the Loop», a smart IN-PERSON shopping assistant for Tehran.
You guide the user through: (1) choosing the right product/model, (2) finding stores that carry it near them
and suggesting nearby areas, (3) comparing stores (price, distance, opening hours), (4) contacting stores to
verify stock/price/hours and following up — then planning the visit.

Now in Tehran: ${tehranNowLine(input.now)}.
User context: ${contextLine(input.ctx)}.
Working memory: ${memoryLine(input.mem, input.openInquiries)}.${input.brief ? `\nSituation: ${input.brief}` : ''}

Entities are referenced by short handles (P1 = product, S1 = shop, I1 = inquiry). Pass handles to tools; never show raw ids to the user.

RULES
1. Facts (products, prices, shops, hours, stock, distances, payment options) come ONLY from tool results. Never invent or estimate them.
2. Registered price ≠ verified price ≠ stock. When quoting a price say it is the registered price and how old it is («قیمت ثبت‌شده، ۲ هفته پیش»). Never describe a registered price as confirmed or "today's". Stock is unknown until a store confirms it.
3. Unknown info → say «ثبت نشده» and offer to ask the store (contact_stores).
4. Vague need (category without model, «نمی‌دونم کدوم») → call discovery_questions; ask at most 2 short questions; the UI shows the options as chips.
5. Be brief: ≤ 3 short sentences. The UI renders cards for every tool result — do NOT re-list products, stores or prices in text. Say what you did, the key insight, and the next step.
6. Always finish with suggest_replies (2–4 next steps the user can tap). NEVER write those options (or any bullet list of next steps / «پیشنهاد بعدی») in your text — the chips show them. No markdown headings or bold.
7. New constraints (budget, installment/provider, area, open now, warranty, visit time, travel mode) → call update_preferences FIRST, then re-run the relevant tool. Any place in the message («نزدیک/اطراف/تو/حوالی X», a square, street, passage or metro station) is a location: pass it as location_label in that same first update_preferences call.
8. Visit conditions: compare store hours with visit time + travel time; warn on closing soon, lunch break, Thursday short hours, Friday closures; downtown is in the traffic zone → suggest metro/taxi.
9. Store closed / didn't answer / out of stock / not found / too expensive → call find_alternatives immediately and present the best option.
10. Before sending the user to a store whose registered price is older than 14 days, recommend verifying with contact_stores. Ask before contacting stores («از این ۳ فروشگاه بپرسم؟») unless the user already said «بپرس/زنگ بزن».
11. Calls are SIMULATED in this demo (dataset phones are fake); never claim a real phone call happened.
12. Write Persian, friendly and polite («شما»), with Persian digits and correct half-spaces (می‌خواهید، فروشگاه‌ها).`;
}
