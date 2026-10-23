/**
 * Weekly opening hours → shared `WeeklyHours` (docs/ARCHITECTURE.md §4 rule 10).
 *
 * Raw shape (shops.weekly_hours): `{ "sat": { "status": "declared"|"closed"|"unsupported",
 *   "shifts": [{ "start_time": "09:00:00", "end_time": "18:00:00" }, …] }, … }` or `{}`.
 *
 *  - `00:00:00–00:00:00` (and any zero/sub-minute shift such as `00:00:00–00:00:01`) is an empty
 *    placeholder and is dropped. `unsupported` days and declared days without a real shift → unknown.
 *  - end ≤ start → the shift ends on the next day (overnight).
 *  - overlapping / touching / duplicated shifts are merged.
 *  - `suspicious` when any shift starts before 06:00 or after 23:00, lasts < 1 h, or a day totals > 18 h.
 */
import type { DayHours, DayKey, WeeklyHours } from '@titl/shared';
import { DAY_ORDER, minutesToHHMM } from '@titl/shared';

export type HoursFlag = 'early_start' | 'late_start' | 'short_shift' | 'long_day' | 'all_day' | 'second_shift_early';

export interface ParsedHours {
  hours: (WeeklyHours & { flags: HoursFlag[] }) | null;
  declared: boolean;
  suspicious: boolean;
  flags: HoursFlag[];
  stats: {
    placeholderShifts: number;
    mergedShifts: number;
    unsupportedDays: number;
    overnightShifts: number;
    /** Raw schedule present but no day with a real opening shift. */
    noOpenDay: boolean;
  };
}

interface RawShift {
  start_time?: unknown;
  end_time?: unknown;
}
interface RawDay {
  status?: unknown;
  shifts?: unknown;
}

const EARLY_START_MIN = 6 * 60;
const LATE_START_MIN = 23 * 60;
const SHORT_SHIFT_MIN = 60;
const LONG_DAY_MIN = 18 * 60;

/** "09:30:15" | "09:30" → seconds since midnight, or null. */
export function timeToSeconds(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3] ?? 0);
  if (h > 24 || min > 59 || s > 59) return null;
  return h * 3600 + min * 60 + s;
}

interface Span {
  start: number; // minutes
  end: number; // minutes, may exceed 1440 for overnight shifts
}

function parseDay(day: DayKey, raw: RawDay | undefined, stats: ParsedHours['stats']): { out: DayHours; spans: Span[] } {
  const status = typeof raw?.status === 'string' ? raw.status : null;
  if (status === 'closed') return { out: { day, status: 'closed', shifts: [] }, spans: [] };
  if (status !== 'declared') {
    if (status === 'unsupported') stats.unsupportedDays++;
    return { out: { day, status: 'unknown', shifts: [] }, spans: [] };
  }
  const spans: Span[] = [];
  const shifts = Array.isArray(raw?.shifts) ? (raw!.shifts as RawShift[]) : [];
  for (const sh of shifts) {
    const s = timeToSeconds(sh?.start_time);
    const e = timeToSeconds(sh?.end_time);
    if (s === null || e === null) continue;
    if (Math.abs(e - s) < 60) {
      stats.placeholderShifts++;
      continue;
    }
    const start = Math.floor(s / 60);
    let end = Math.floor(e / 60);
    if (end <= start) {
      end += 1440;
      stats.overnightShifts++;
    }
    spans.push({ start, end });
  }
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Span[] = [];
  for (const sp of spans) {
    const last = merged[merged.length - 1];
    if (last && sp.start <= last.end) {
      last.end = Math.max(last.end, sp.end);
      stats.mergedShifts++;
    } else merged.push({ ...sp });
  }
  if (merged.length === 0) return { out: { day, status: 'unknown', shifts: [] }, spans: [] };
  return {
    out: {
      day,
      status: 'open',
      shifts: merged.map((m) => ({ start: minutesToHHMM(m.start), end: minutesToHHMM(m.end) })),
    },
    spans: merged,
  };
}

export function parseWeeklyHours(raw: unknown): ParsedHours {
  const stats: ParsedHours['stats'] = {
    placeholderShifts: 0,
    mergedShifts: 0,
    unsupportedDays: 0,
    overnightShifts: 0,
    noOpenDay: false,
  };
  const empty: ParsedHours = { hours: null, declared: false, suspicious: false, flags: [], stats };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return empty;
  const obj = raw as Record<string, RawDay>;
  if (Object.keys(obj).length === 0) return empty;

  const days: DayHours[] = [];
  const flags = new Set<HoursFlag>();
  for (const day of DAY_ORDER) {
    const { out, spans } = parseDay(day, obj[day], stats);
    days.push(out);
    let total = 0;
    for (const [i, sp] of spans.entries()) {
      const dur = sp.end - sp.start;
      // DT4: a second shift that starts before 06:00 is almost certainly a data-entry error
      if (i > 0 && sp.start < EARLY_START_MIN) flags.add('second_shift_early');
      total += dur;
      if (sp.start < EARLY_START_MIN) flags.add('early_start');
      if (sp.start > LATE_START_MIN) flags.add('late_start');
      if (dur < SHORT_SHIFT_MIN) flags.add('short_shift');
      if (dur >= 1439) flags.add('all_day');
    }
    if (total > LONG_DAY_MIN) flags.add('long_day');
  }
  const declared = days.some((d) => d.status === 'open');
  if (!declared) {
    stats.noOpenDay = true;
    return empty;
  }
  const flagList = [...flags];
  return {
    hours: { declared: true, suspicious: flagList.length > 0, days, flags: flagList },
    declared: true,
    suspicious: flagList.length > 0,
    flags: flagList,
    stats,
  };
}
