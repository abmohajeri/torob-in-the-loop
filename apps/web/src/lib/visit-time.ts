/**
 * Visit-time helpers («زمان مراجعه»). The context stores an ISO instant (UTC); the UI speaks Tehran wall clock.
 */
import {
  DAY_NAMES_FA,
  formatClock,
  hhmmToMinutes,
  minutesToHHMM,
  tehranInstant,
  tehranParts,
  type DayKey,
  type UserContext,
} from '@titl/shared';

/** A visit time this far in the past is treated as "now" (the user just didn't update it). */
export const VISIT_GRACE_MIN = 10;

/** Tehran calendar-day difference between two instants (0 = same day, 1 = tomorrow…). */
export function tehranDayOffset(target: Date, now: Date): number {
  const a = tehranParts(now);
  const b = tehranParts(target);
  const da = Date.UTC(a.year, a.month - 1, a.day);
  const db = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((db - da) / 86_400_000);
}

/** ISO instant for a Tehran wall-clock time today (0) or tomorrow (1). */
export function visitAtFor(dayOffset: number, hhmm: string, now: Date = new Date()): string {
  return tehranInstant(now, hhmmToMinutes(hhmm), dayOffset).toISOString();
}

export function isVisitAtPast(iso: string | undefined, now: Date = new Date(), graceMin = VISIT_GRACE_MIN): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return true;
  return t < now.getTime() - graceMin * 60_000;
}

/** The context actually sent to the API: a stale `visitAt` (in the past) falls back to "now". */
export function effectiveContext(ctx: UserContext, now: Date = new Date()): UserContext {
  if (ctx.visitAt && isVisitAtPast(ctx.visitAt, now)) {
    const { visitAt: _drop, ...rest } = ctx;
    return rest;
  }
  return ctx;
}

/** Persian label: «الان» · «امروز ۱۸:۰۰» · «فردا ۱۰:۳۰» · «شنبه ۱۰:۰۰». */
export function describeVisitAt(iso: string | undefined, now: Date = new Date()): string {
  if (!iso || isVisitAtPast(iso, now)) return 'الان';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'الان';
  const p = tehranParts(d);
  const clock = formatClock(minutesToHHMM(p.minutes));
  const offset = tehranDayOffset(d, now);
  if (offset === 0) return `امروز ${clock}`;
  if (offset === 1) return `فردا ${clock}`;
  return `${DAY_NAMES_FA[p.weekday]} ${clock}`;
}

export interface VisitDay {
  offset: 0 | 1;
  label: string;
  weekday: DayKey;
  weekdayLabel: string;
  /** Selectable times "HH:MM" (Tehran). */
  times: string[];
  isFriday: boolean;
}

const TOMORROW_TIMES = ['10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

/**
 * Quick choices for the visit-time sheet: today's remaining whole hours (from the next full hour, up to 22:00)
 * and a fixed set for tomorrow.
 */
export function visitDays(now: Date = new Date()): VisitDay[] {
  const today = tehranParts(now);
  const startHour = today.minute > 0 ? today.hour + 1 : today.hour;
  const todayTimes: string[] = [];
  for (let h = Math.max(startHour, 9); h <= 22 && todayTimes.length < 6; h++) todayTimes.push(minutesToHHMM(h * 60));
  const tomorrowDate = tehranInstant(now, 12 * 60, 1);
  const tomorrow = tehranParts(tomorrowDate);
  return [
    {
      offset: 0,
      label: 'امروز',
      weekday: today.weekday,
      weekdayLabel: DAY_NAMES_FA[today.weekday],
      times: todayTimes,
      isFriday: today.weekday === 'fri',
    },
    {
      offset: 1,
      label: 'فردا',
      weekday: tomorrow.weekday,
      weekdayLabel: DAY_NAMES_FA[tomorrow.weekday],
      times: TOMORROW_TIMES,
      isFriday: tomorrow.weekday === 'fri',
    },
  ];
}

/** Tehran "HH:MM" of an ISO instant (for pre-selecting the current choice). */
export function hhmmOf(iso: string): string {
  return minutesToHHMM(tehranParts(new Date(iso)).minutes);
}
