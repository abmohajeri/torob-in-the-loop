import { describe, expect, it } from 'vitest';
import { parseWeeklyHours, timeToSeconds } from '../src/hours.js';

const day = (status: string, ...shifts: [string, string][]) => ({
  status,
  shifts: shifts.map(([s, e]) => ({ start_time: s, end_time: e })),
});

describe('parseWeeklyHours', () => {
  it('returns null hours for {} and non-objects', () => {
    expect(parseWeeklyHours({}).hours).toBeNull();
    expect(parseWeeklyHours({}).declared).toBe(false);
    expect(parseWeeklyHours(null).hours).toBeNull();
    expect(parseWeeklyHours([]).hours).toBeNull();
  });

  it('maps declared / closed / unsupported and drops 00:00–00:00 placeholders', () => {
    const r = parseWeeklyHours({
      sat: day('declared', ['10:00:00', '19:00:00']),
      sun: day('declared', ['10:00:00', '14:00:00'], ['16:00:00', '20:00:00']),
      mon: day('declared', ['00:00:00', '00:00:00']),
      tue: day('unsupported', ['08:00:00', '08:00:00']),
      fri: day('closed', ['00:00:00', '00:00:00']),
    });
    expect(r.declared).toBe(true);
    expect(r.suspicious).toBe(false);
    const days = r.hours!.days;
    expect(days.map((d) => d.day)).toEqual(['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri']);
    expect(days[0]).toEqual({ day: 'sat', status: 'open', shifts: [{ start: '10:00', end: '19:00' }] });
    expect(days[1]!.shifts).toHaveLength(2);
    expect(days[2]!.status).toBe('unknown');
    expect(days[3]!.status).toBe('unknown');
    expect(days[4]!.status).toBe('unknown'); // missing key
    expect(days[6]!.status).toBe('closed');
    expect(r.stats.placeholderShifts).toBe(1);
    expect(r.stats.unsupportedDays).toBe(1);
  });

  it('flags the real «02:00–08:00» schedule as suspicious', () => {
    // real shops.csv row: only thursday declared 02:00–08:00, other days unsupported 08:00–08:00
    const r = parseWeeklyHours({
      fri: day('closed', ['00:00:00', '00:00:00']),
      mon: day('unsupported', ['08:00:00', '08:00:00']),
      thu: day('declared', ['02:00:00', '08:00:00']),
    });
    expect(r.declared).toBe(true);
    expect(r.suspicious).toBe(true);
    expect(r.flags).toContain('early_start');
  });

  it('treats end <= start as an overnight shift and merges overlaps', () => {
    const r = parseWeeklyHours({ sat: day('declared', ['18:00:00', '02:00:00']), sun: day('declared', ['09:00', '13:00'], ['12:00', '17:00']) });
    expect(r.hours!.days[0]!.shifts).toEqual([{ start: '18:00', end: '02:00' }]);
    expect(r.stats.overnightShifts).toBe(1);
    expect(r.hours!.days[1]!.shifts).toEqual([{ start: '09:00', end: '17:00' }]);
  });

  it('flags short shifts and very long days', () => {
    expect(parseWeeklyHours({ sat: day('declared', ['10:00', '10:30']) }).flags).toContain('short_shift');
    expect(parseWeeklyHours({ sat: day('declared', ['06:00', '00:30']) }).flags).toContain('long_day');
  });

  it('a schedule with only closed / placeholder days is not declared', () => {
    const r = parseWeeklyHours({ fri: day('closed', ['00:00:00', '00:00:00']), sat: day('declared', ['00:00:00', '00:00:00']) });
    expect(r.hours).toBeNull();
    expect(r.stats.noOpenDay).toBe(true);
  });

  it('parses time strings', () => {
    expect(timeToSeconds('09:30:15')).toBe(9 * 3600 + 30 * 60 + 15);
    expect(timeToSeconds('9:05')).toBe(9 * 3600 + 5 * 60);
    expect(timeToSeconds('x')).toBeNull();
    expect(timeToSeconds(5)).toBeNull();
  });
});
