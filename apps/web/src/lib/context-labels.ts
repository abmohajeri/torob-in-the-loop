/**
 * Persian labels for the user's context (context bar chips, sheets, assistant echo).
 */
import {
  PROVIDERS,
  TRAVEL_MODE_META,
  activeConditionCount,
  formatDistance,
  formatTomanShort,
  type UserContext,
} from '@titl/shared';
import { describeVisitAt } from './visit-time.js';

/** «تا ۲۵ میلیون» · «۱۰ تا ۲۵ میلیون» · «از ۵ میلیون» · null when no budget. */
export function budgetLabel(ctx: Pick<UserContext, 'budgetMin' | 'budgetMax'>): string | null {
  const { budgetMin: min, budgetMax: max } = ctx;
  if (min && max) {
    const sameUnit = Math.floor(Math.log10(min) / 3) === Math.floor(Math.log10(max) / 3);
    return sameUnit ? `${formatTomanShort(min, false).replace(/ (میلیون|هزار|میلیارد)$/, '')} تا ${formatTomanShort(max, false)}` : `${formatTomanShort(min, false)} تا ${formatTomanShort(max, false)}`;
  }
  if (max) return `تا ${formatTomanShort(max, false)}`;
  if (min) return `از ${formatTomanShort(min, false)}`;
  return null;
}

/** «تا ۳ کیلومتر» or null. */
export function radiusLabel(ctx: Pick<UserContext, 'maxDistanceKm'>): string | null {
  return ctx.maxDistanceKm ? `تا ${formatDistance(ctx.maxDistanceKm)}` : null;
}

/** «الان» · «امروز ۱۸:۰۰» … */
export function visitLabel(ctx: Pick<UserContext, 'visitAt'>, now: Date = new Date()): string {
  return describeVisitAt(ctx.visitAt, now);
}

export function travelModeLabel(ctx: Pick<UserContext, 'travelMode'>): string | null {
  return ctx.travelMode ? TRAVEL_MODE_META[ctx.travelMode].label : null;
}

/** Active purchase conditions as short Persian labels (order = importance). */
export function conditionLabels(ctx: UserContext): string[] {
  const out: string[] = [];
  if (ctx.providers?.length) out.push(...ctx.providers.map((p) => PROVIDERS[p].label));
  else if (ctx.installment) out.push('قسطی/اعتباری');
  if (ctx.openNow) out.push(ctx.visitAt ? 'باز در زمان مراجعه' : 'باز الان');
  if (ctx.warrantyOnly) out.push('با گارانتی');
  if (ctx.fastDelivery) out.push('ارسال فوری');
  if (ctx.kalabarg) out.push('کالابرگ');
  return out;
}

export { activeConditionCount };

/** True when anything in the context differs from the defaults (for a «پاک کردن همه» affordance). */
export function hasAnyContext(ctx: UserContext): boolean {
  return Boolean(
    ctx.budgetMin ||
      ctx.budgetMax ||
      ctx.maxDistanceKm ||
      ctx.visitAt ||
      ctx.travelMode ||
      activeConditionCount(ctx) > 0,
  );
}

/** One-line summary, e.g. «نزدیک میدان فردوسی · تا ۲۵ میلیون · قسطی · امروز ۱۸:۰۰». */
export function contextSummary(ctx: UserContext, now: Date = new Date()): string {
  const parts: string[] = [];
  if (ctx.location) parts.push(`نزدیک ${ctx.location.label}`);
  const b = budgetLabel(ctx);
  if (b) parts.push(b);
  parts.push(...conditionLabels(ctx));
  if (ctx.visitAt) parts.push(visitLabel(ctx, now));
  const m = travelModeLabel(ctx);
  if (m) parts.push(m);
  return parts.join(' · ');
}
