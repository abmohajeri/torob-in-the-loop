import type { DayHours, DayKey, WeeklyHours } from '@titl/shared';

/** Tehran wall-clock instant (Tehran is UTC+03:30 year-round). 2026-10-24 is a Saturday, 10-22 Thursday, 10-23 Friday. */
export function tehran(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+03:30`);
}

export const SAT = '2026-10-24';
export const SUN = '2026-10-25';
export const THU = '2026-10-22';
export const FRI = '2026-10-23';

const DAYS: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

/** Weekly hours from a compact spec: day → "10:00-19:00" | "10:00-14:00,16:00-21:00" | "closed" | "unknown". */
export function hours(spec: Partial<Record<DayKey, string>>, def = '10:00-21:00'): WeeklyHours {
  const days: DayHours[] = DAYS.map((day) => {
    const v = spec[day] ?? def;
    if (v === 'closed' || v === 'unknown') return { day, status: v, shifts: [] };
    return {
      day,
      status: 'open',
      shifts: v.split(',').map((s) => {
        const [start, end] = s.split('-') as [string, string];
        return { start, end };
      }),
    };
  });
  return { declared: true, suspicious: false, days };
}
