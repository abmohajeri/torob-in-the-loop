import type { DayKey } from './types.js';

/** Iranian week order (Saturday first). */
export const DAY_ORDER: DayKey[] = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];

export const DAY_NAMES_FA: Record<DayKey, string> = {
  sat: 'شنبه',
  sun: 'یکشنبه',
  mon: 'دوشنبه',
  tue: 'سه‌شنبه',
  wed: 'چهارشنبه',
  thu: 'پنجشنبه',
  fri: 'جمعه',
};

export const TEHRAN_TZ = 'Asia/Tehran';
/** Iran has had no DST since 2022: fixed UTC+03:30. */
export const TEHRAN_OFFSET_MIN = 210;

const WEEKDAY_MAP: Record<string, DayKey> = {
  Sat: 'sat',
  Sun: 'sun',
  Mon: 'mon',
  Tue: 'tue',
  Wed: 'wed',
  Thu: 'thu',
  Fri: 'fri',
};

export interface TehranParts {
  year: number;
  month: number;
  day: number;
  weekday: DayKey;
  hour: number;
  minute: number;
  /** Minutes since local midnight. */
  minutes: number;
}

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TEHRAN_TZ,
  hour12: false,
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

/** Wall-clock parts of a moment in Tehran. */
export function tehranParts(date: Date | string = new Date()): TehranParts {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(d)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  const minute = Number(parts.minute);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: WEEKDAY_MAP[parts.weekday ?? 'Sat'] ?? 'sat',
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

/** "19:30" → 1170. Accepts "19:30:00". */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m ?? 0);
}

/** 1170 → "19:30" (wraps past midnight). */
export function minutesToHHMM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Next day key in the week. */
export function nextDay(day: DayKey, offset = 1): DayKey {
  const i = DAY_ORDER.indexOf(day);
  return DAY_ORDER[(((i + offset) % 7) + 7) % 7]!;
}

/**
 * The UTC instant for a Tehran wall-clock time `minutesOfDay` on the Tehran date of `base`
 * plus `dayOffset` days.
 */
export function tehranInstant(base: Date | string, minutesOfDay: number, dayOffset = 0): Date {
  const p = tehranParts(base);
  const utcMidnight = Date.UTC(p.year, p.month - 1, p.day + dayOffset);
  return new Date(utcMidnight + (minutesOfDay - TEHRAN_OFFSET_MIN) * 60_000);
}

export function addMinutes(date: Date | string, minutes: number): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Date(d.getTime() + minutes * 60_000);
}

/** Rush hours in Tehran (approx.): 07:00–10:00 and 16:00–20:00, Sat–Wed. */
export function isRushHour(date: Date | string = new Date()): boolean {
  const p = tehranParts(date);
  if (p.weekday === 'fri') return false;
  return (p.minutes >= 420 && p.minutes < 600) || (p.minutes >= 960 && p.minutes < 1200);
}
