import { describe, expect, it } from 'vitest';
import { dayHoursLabel, isDayClosed, openStatusAt, shortThursdayClose } from '../src/domain/hours.js';
import { FRI, SAT, THU, hours, tehran } from './helpers/time.js';

const std = hours({ thu: '10:00-14:00', fri: 'closed' });

describe('openStatusAt', () => {
  it('open with Persian closing label', () => {
    const s = openStatusAt(std, tehran(SAT, '12:00'));
    expect(s.state).toBe('open');
    expect(s.closesAt).toBe('21:00');
    expect(s.label).toBe('باز است تا ۲۱:۰۰');
  });

  it('closing soon within 45 minutes', () => {
    const s = openStatusAt(std, tehran(SAT, '20:30'));
    expect(s.state).toBe('closing_soon');
    expect(s.minutesToClose).toBe(30);
    expect(s.label).toContain('۳۰ دقیقه');
  });

  it('opens later today', () => {
    const s = openStatusAt(std, tehran(SAT, '08:00'));
    expect(s.state).toBe('opens_later_today');
    expect(s.opensAt).toBe('10:00');
    expect(s.label).toContain('امروز');
  });

  it('Friday closed → next opening on Saturday', () => {
    const s = openStatusAt(std, tehran(FRI, '12:00'));
    expect(s.state).toBe('closed');
    expect(s.opensDay).toBe('sat');
    expect(s.label).toContain('فردا ۱۰:۰۰');
    expect(s.label.startsWith('بسته')).toBe(true);
  });

  it('Thursday short day: closed in the afternoon, reopens Saturday (Friday closed)', () => {
    expect(openStatusAt(std, tehran(THU, '13:00')).state).toBe('open');
    const s = openStatusAt(std, tehran(THU, '16:00'));
    expect(s.state).toBe('closed');
    expect(s.opensDay).toBe('sat');
    expect(shortThursdayClose(std)).toBe(14 * 60);
    expect(isDayClosed(std, 'fri')).toBe(true);
  });

  it('overnight shift is open after midnight', () => {
    const night = hours({}, '18:00-02:00');
    const s = openStatusAt(night, tehran(SAT, '01:00'));
    expect(s.state === 'open' || s.state === 'closing_soon').toBe(true);
    expect(openStatusAt(night, tehran(SAT, '23:00')).state).toBe('open');
    expect(openStatusAt(night, tehran(SAT, '03:00')).state).toBe('opens_later_today');
  });

  it('split shifts (midday break)', () => {
    const split = hours({}, '10:00-14:00,17:00-21:00');
    expect(openStatusAt(split, tehran(SAT, '15:00')).state).toBe('opens_later_today');
    expect(dayHoursLabel(split, 'sat')).toContain('و');
  });

  it('unknown when no hours or the day is unknown', () => {
    expect(openStatusAt(null, tehran(SAT, '12:00'))).toMatchObject({ state: 'unknown', label: 'ساعت کاری ثبت نشده' });
    expect(openStatusAt(hours({ sat: 'unknown' }), tehran(SAT, '12:00')).state).toBe('unknown');
  });

  it('day labels', () => {
    expect(dayHoursLabel(std, 'fri')).toBe('تعطیل');
    expect(dayHoursLabel(null, 'sat')).toBe('ثبت نشده');
  });
});
