/**
 * Opening-hours logic (pure). Shops register a weekly schedule (`WeeklyHours`, Iranian week sat→fri,
 * up to two shifts per day). We "compile" it once into merged minute-of-week intervals so that
 * status checks for thousands of shops per request stay cheap, and so overnight shifts
 * (e.g. 18:00–02:00) and 24/7 schedules (00:00–23:59 every day) are handled uniformly.
 */
import type { DayHours, DayKey, OpenState, OpenStatus, WeeklyHours } from '@titl/shared';
import {
  DAY_NAMES_FA,
  DAY_ORDER,
  formatClock,
  formatNumber,
  hhmmToMinutes,
  minutesToHHMM,
  tehranParts,
  type TehranParts,
} from '@titl/shared';

export const CLOSING_SOON_MIN = 45;
const DAY_MIN = 1440;
const WEEK_MIN = DAY_MIN * 7;
/** Shifts that touch within this many minutes are merged (23:59 → 00:00 of the next day). */
const CONTIGUOUS_GAP = 1;

export interface CompiledHours {
  declared: boolean;
  suspicious: boolean;
  /** Merged [start, end) intervals in minutes since Saturday 00:00 of the PREVIOUS week (3-week window). */
  intervals: [number, number][];
  /** Per day (DAY_ORDER index): status as registered. */
  dayStatus: DayHours['status'][];
  /** The registered schedule (for labels). */
  hours: WeeklyHours;
}

/** Light status (no Persian label) for filtering thousands of shops quickly. */
export interface StateAt {
  state: OpenState;
  /** Absolute minute-of-week (window coordinates) when the current interval ends. */
  closesAbs?: number;
  /** Absolute minute-of-week (window coordinates) of the next opening. */
  opensAbs?: number;
  minutesToClose?: number;
  /** True when the shop is open around the clock for the whole week. */
  allDay?: boolean;
  /** Next opening is unknown because some day in between has no registered hours. */
  reopenUnknown?: boolean;
}

export function dayIndex(day: DayKey): number {
  return DAY_ORDER.indexOf(day);
}

/** Minute of the Iranian week (Saturday 00:00 = 0) for Tehran wall-clock parts. */
export function minuteOfWeek(p: Pick<TehranParts, 'weekday' | 'minutes'>): number {
  return dayIndex(p.weekday) * DAY_MIN + p.minutes;
}

function shiftMinutes(s: { start: string; end: string }): [number, number] | null {
  if (!s.start || !s.end) return null;
  const a = hhmmToMinutes(s.start);
  let b = hhmmToMinutes(s.end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a === b) return null; // placeholder 00:00–00:00 or zero-length
  if (b < a) b += DAY_MIN; // overnight shift ends the next day
  return [a, b];
}

/**
 * Normalize whatever the catalog stored into a WeeklyHours with all 7 days present.
 * Missing days are `unknown`; 'open' days without valid shifts become 'unknown' as well.
 */
export function normalizeHours(h: WeeklyHours | null | undefined): WeeklyHours | null {
  if (!h || !Array.isArray(h.days)) return null;
  const byDay = new Map<DayKey, DayHours>();
  for (const d of h.days) if (d && DAY_ORDER.includes(d.day)) byDay.set(d.day, d);
  const days: DayHours[] = DAY_ORDER.map((day) => {
    const d = byDay.get(day);
    if (!d) return { day, status: 'unknown', shifts: [] };
    const shifts = (d.shifts ?? []).filter((s) => s && shiftMinutes(s));
    if (d.status === 'open' && shifts.length === 0) return { day, status: 'unknown', shifts: [] };
    return { day, status: d.status, shifts: d.status === 'open' ? shifts : [] };
  });
  return { declared: h.declared !== false, suspicious: !!h.suspicious, days };
}

export function compileHours(raw: WeeklyHours | null | undefined): CompiledHours | null {
  const hours = normalizeHours(raw);
  if (!hours || !hours.declared) return null;
  const list: [number, number][] = [];
  hours.days.forEach((d, i) => {
    if (d.status !== 'open') return;
    for (const s of d.shifts) {
      const m = shiftMinutes(s);
      if (!m) continue;
      // three copies: previous week, this week, next week (handles wrap-around overnight shifts)
      for (const w of [0, 1, 2]) list.push([w * WEEK_MIN + i * DAY_MIN + m[0], w * WEEK_MIN + i * DAY_MIN + m[1]]);
    }
  });
  list.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const iv of list) {
    const last = merged[merged.length - 1];
    if (last && iv[0] <= last[1] + CONTIGUOUS_GAP) last[1] = Math.max(last[1], iv[1]);
    else merged.push([iv[0], iv[1]]);
  }
  return { declared: true, suspicious: hours.suspicious, intervals: merged, dayStatus: hours.days.map((d) => d.status), hours };
}

/** Status at a minute-of-week (0 … 10079), without labels. */
export function stateAt(ch: CompiledHours | null, mow: number): StateAt {
  if (!ch) return { state: 'unknown' };
  const m = mow + WEEK_MIN; // window coordinates (middle week)
  for (const [s, e] of ch.intervals) {
    if (s <= m && m < e) {
      const minutesToClose = e - m;
      const allDay = minutesToClose >= WEEK_MIN - CONTIGUOUS_GAP * 2;
      return {
        state: !allDay && minutesToClose <= CLOSING_SOON_MIN ? 'closing_soon' : 'open',
        closesAbs: e,
        minutesToClose,
        allDay,
      };
    }
  }
  const today = Math.floor(mow / DAY_MIN);
  if (ch.dayStatus[today] === 'unknown' || ch.dayStatus[today] === undefined) return { state: 'unknown' };
  const next = ch.intervals.find(([s]) => s > m);
  if (!next) {
    // closed today and no registered opening during the week
    return { state: 'closed', reopenUnknown: ch.dayStatus.some((s) => s === 'unknown') };
  }
  const nextDayAbs = Math.floor(next[0] / DAY_MIN); // window day index
  const todayAbs = Math.floor(m / DAY_MIN);
  if (nextDayAbs === todayAbs) return { state: 'opens_later_today', opensAbs: next[0] };
  // any day in between without registered hours → we cannot promise the reopening time
  for (let d = todayAbs + 1; d < nextDayAbs; d++) {
    if (ch.dayStatus[d % 7] === 'unknown') return { state: 'closed', reopenUnknown: true };
  }
  return { state: 'closed', opensAbs: next[0] };
}

function clockOf(abs: number): string {
  return minutesToHHMM(abs % DAY_MIN);
}

function dayKeyOfAbs(abs: number): DayKey {
  return DAY_ORDER[Math.floor(abs / DAY_MIN) % 7]!;
}

/** Persian label for a "closes at" moment relative to the current window minute. */
function closesLabel(closesAbs: number, nowAbs: number): string {
  const dayDiff = Math.floor(closesAbs / DAY_MIN) - Math.floor(nowAbs / DAY_MIN);
  const clock = formatClock(clockOf(closesAbs));
  if (dayDiff <= 0) return `باز است تا ${clock}`;
  const mins = closesAbs % DAY_MIN;
  if (dayDiff === 1 && mins <= 6 * 60) return mins === 0 ? 'باز است تا نیمه‌شب' : `باز است تا ${clock} بامداد`;
  if (dayDiff === 1) return `باز است تا فردا ${clock}`;
  return `باز است تا ${DAY_NAMES_FA[dayKeyOfAbs(closesAbs)]} ${clock}`;
}

/** Full OpenStatus with Persian label, given precomputed Tehran parts of the moment. */
export function statusFromParts(ch: CompiledHours | null, parts: TehranParts, atIso: string): OpenStatus {
  if (!ch) return { state: 'unknown', label: 'ساعت کاری ثبت نشده', at: atIso };
  const mow = minuteOfWeek(parts);
  const nowAbs = mow + WEEK_MIN;
  const s = stateAt(ch, mow);
  switch (s.state) {
    case 'open':
    case 'closing_soon': {
      if (s.allDay) return { state: 'open', label: 'شبانه‌روزی باز است', at: atIso };
      const closesAt = clockOf(s.closesAbs!);
      const minutesToClose = s.minutesToClose!;
      const label =
        s.state === 'closing_soon' ? `${formatNumber(minutesToClose)} دقیقه تا بسته شدن` : closesLabel(s.closesAbs!, nowAbs);
      return { state: s.state, label, closesAt, minutesToClose, at: atIso };
    }
    case 'opens_later_today': {
      const opensAt = clockOf(s.opensAbs!);
      const wait = s.opensAbs! - nowAbs;
      const label =
        wait <= 60
          ? `${formatNumber(wait)} دقیقه دیگر باز می‌شود (${formatClock(opensAt)})`
          : `امروز ساعت ${formatClock(opensAt)} باز می‌شود`;
      return { state: 'opens_later_today', label, opensAt, opensDay: parts.weekday, at: atIso };
    }
    case 'closed': {
      if (s.opensAbs === undefined) {
        const label = s.reopenUnknown ? 'بسته — زمان بازگشایی ثبت نشده' : 'بسته است';
        return { state: 'closed', label, at: atIso };
      }
      const opensAt = clockOf(s.opensAbs);
      const opensDay = dayKeyOfAbs(s.opensAbs);
      const dayDiff = Math.floor(s.opensAbs / DAY_MIN) - Math.floor(nowAbs / DAY_MIN);
      const when = dayDiff === 1 ? 'فردا' : DAY_NAMES_FA[opensDay];
      return { state: 'closed', label: `بسته — ${when} ${formatClock(opensAt)} باز می‌شود`, opensAt, opensDay, at: atIso };
    }
    default: {
      const today = ch.dayStatus[dayIndex(parts.weekday)];
      return { state: 'unknown', label: today === 'unknown' ? 'ساعت کاری امروز ثبت نشده' : 'ساعت کاری ثبت نشده', at: atIso };
    }
  }
}

/** Open status of a schedule at a moment (Tehran wall clock). */
export function openStatusAt(hours: WeeklyHours | CompiledHours | null | undefined, at: Date | string = new Date()): OpenStatus {
  const d = typeof at === 'string' ? new Date(at) : at;
  const ch = hours && 'intervals' in hours ? hours : compileHours(hours ?? null);
  return statusFromParts(ch, tehranParts(d), d.toISOString());
}

/** True when the state counts as "open at the visit time" for hard filters. */
export function isOpenState(state: OpenState): boolean {
  return state === 'open' || state === 'closing_soon';
}

/** Shifts of a given day as «۱۰:۰۰ تا ۱۹:۰۰» / «۱۰:۰۰–۱۴:۰۰ و ۱۶:۰۰–۲۱:۰۰» / «تعطیل» / «ثبت نشده». */
export function dayHoursLabel(hours: WeeklyHours | null | undefined, day: DayKey): string {
  const h = normalizeHours(hours);
  if (!h || !h.declared) return 'ثبت نشده';
  const d = h.days[dayIndex(day)];
  if (!d || d.status === 'unknown') return 'ثبت نشده';
  if (d.status === 'closed') return 'تعطیل';
  const parts = d.shifts.map((s) => {
    const end = hhmmToMinutes(s.end);
    const endLabel = end === 0 ? '۲۴:۰۰' : formatClock(s.end);
    return d.shifts.length === 1 ? `${formatClock(s.start)} تا ${endLabel}` : `${formatClock(s.start)}–${endLabel}`;
  });
  return parts.join(' و ');
}

/** Hours label for the Tehran day of `at`. */
export function hoursTodayLabel(hours: WeeklyHours | null | undefined, at: Date | string = new Date()): string {
  return dayHoursLabel(hours, tehranParts(at).weekday);
}

/** Latest closing minute (of day, may exceed 1440 for overnight) on a given day, or null. */
export function dayCloseMinutes(hours: WeeklyHours | null | undefined, day: DayKey): number | null {
  const h = normalizeHours(hours);
  const d = h?.days[dayIndex(day)];
  if (!d || d.status !== 'open') return null;
  let max: number | null = null;
  for (const s of d.shifts) {
    const m = shiftMinutes(s);
    if (m && (max === null || m[1] > max)) max = m[1];
  }
  return max;
}

/** Typical weekday (sat–wed) closing minute: the most common value, or null. */
export function typicalCloseMinutes(hours: WeeklyHours | null | undefined): number | null {
  const counts = new Map<number, number>();
  for (const day of ['sat', 'sun', 'mon', 'tue', 'wed'] as DayKey[]) {
    const c = dayCloseMinutes(hours, day);
    if (c !== null) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [m, n] of counts) if (n > bestN || (n === bestN && best !== null && m > best)) [best, bestN] = [m, n];
  return best;
}

/** Thursday closes at least an hour earlier than the usual weekday closing → the minute it closes, else null. */
export function shortThursdayClose(hours: WeeklyHours | null | undefined): number | null {
  const thu = dayCloseMinutes(hours, 'thu');
  const usual = typicalCloseMinutes(hours);
  if (thu === null || usual === null) return null;
  return thu <= usual - 60 ? thu : null;
}

export function isDayClosed(hours: WeeklyHours | null | undefined, day: DayKey): boolean {
  const h = normalizeHours(hours);
  return h?.days[dayIndex(day)]?.status === 'closed';
}

/** Day has more than one shift (e.g. a midday break). */
export function hasMiddayBreak(hours: WeeklyHours | null | undefined, day: DayKey): boolean {
  const h = normalizeHours(hours);
  return (h?.days[dayIndex(day)]?.shifts.length ?? 0) > 1;
}

/** Minutes from `at` until the shop closes (only when open at `at`), else null. */
export function minutesUntilClose(ch: CompiledHours | null, at: Date | string): number | null {
  const s = stateAt(ch, minuteOfWeek(tehranParts(at)));
  if (!isOpenState(s.state) || s.allDay) return s.allDay ? Number.POSITIVE_INFINITY : null;
  return s.minutesToClose ?? null;
}
