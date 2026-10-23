import { describe, expect, it } from 'vitest';
import { buildUrl } from '../lib/api.js';
import { createSSEParser, backoffDelay, type SSEMessage } from '../lib/sse.js';
import { parseLocaleNumber, formatInputNumber, millionsToToman, tomanToMillions } from '../lib/numbers.js';
import { uuidv4, isValidSessionId } from '../lib/session.js';
import { messageForStatus, errorMessage, ApiError } from '../lib/api-error.js';
import { mergeEvents, upsertInquiry } from '../hooks/useLiveEvents.js';
import { geoCodeFromPositionError, isInTehran } from '../lib/geo.js';

describe('buildUrl', () => {
  it('skips empty values, repeats arrays, encodes booleans', () => {
    const url = buildUrl('/search', { q: 'گوشی', page: 2, nearOnly: true, brand: '', x: undefined, spec: ['a', 'b'], f: false });
    const u = new URL(url, 'http://x');
    expect(u.pathname).toBe('/api/search');
    expect(u.searchParams.get('q')).toBe('گوشی');
    expect(u.searchParams.get('nearOnly')).toBe('1');
    expect(u.searchParams.getAll('spec')).toEqual(['a', 'b']);
    expect(u.searchParams.has('brand')).toBe(false);
    expect(u.searchParams.has('f')).toBe(false);
  });
  it('appends context params', () => {
    const url = buildUrl('/products/1', undefined, { budgetMax: 5_000_000 });
    expect(new URL(url, 'http://x').searchParams.get('bmax')).toBe('5000000');
  });
});

describe('SSE parser', () => {
  it('parses data frames split across chunks and CRLF', () => {
    const out: SSEMessage[] = [];
    const p = createSSEParser((m) => out.push(m));
    p.push('data: {"type":"pi');
    p.push('ng"}\r\n\r');
    p.push('\n: comment\n\nevent: x\ndata: a\ndata: b\n\n');
    expect(out.map((m) => m.data)).toEqual(['{"type":"ping"}', 'a\nb']);
    expect(out[1]?.event).toBe('x');
  });
  it('flushes trailing data', () => {
    const out: SSEMessage[] = [];
    const p = createSSEParser((m) => out.push(m));
    p.push('data: tail');
    p.flush();
    expect(out[0]?.data).toBe('tail');
  });
  it('backs off exponentially with cap', () => {
    const mid = () => 0.5;
    expect(backoffDelay(1, 1000, 30000, mid)).toBe(1000);
    expect(backoffDelay(3, 1000, 30000, mid)).toBe(4000);
    expect(backoffDelay(20, 1000, 30000, mid)).toBe(30000);
  });
});

describe('numbers', () => {
  it('parses Persian digits and separators', () => {
    expect(parseLocaleNumber('۲۵')).toBe(25);
    expect(parseLocaleNumber('۲٫۵')).toBe(2.5);
    expect(parseLocaleNumber('۱۲٬۵۰۰٬۰۰۰')).toBe(12_500_000);
    expect(parseLocaleNumber('abc')).toBeNull();
    expect(parseLocaleNumber('')).toBeNull();
  });
  it('round-trips millions', () => {
    expect(millionsToToman(2.5)).toBe(2_500_000);
    expect(tomanToMillions(2_500_000)).toBe(2.5);
    expect(formatInputNumber(1200)).toBe('۱٬۲۰۰');
  });
});

describe('session & errors & geo', () => {
  it('generates valid uuids', () => {
    const id = uuidv4();
    expect(isValidSessionId(id)).toBe(true);
    expect(isValidSessionId('nope')).toBe(false);
  });
  it('maps status to Persian messages', () => {
    expect(messageForStatus(404).message).toMatch(/[؀-ۿ]/);
    expect(errorMessage(new ApiError(500, 'x', 'پیام'))).toBe('پیام');
  });
  it('geo helpers', () => {
    expect(geoCodeFromPositionError(1)).toBe('denied');
    expect(isInTehran({ lat: 35.7, lng: 51.4 })).toBe(true);
    expect(isInTehran({ lat: 32.6, lng: 51.6 })).toBe(false);
  });
});

describe('live event merging', () => {
  const ev = (id: number) => ({ id, at: '2026-01-01T00:00:00Z', kind: 'status', text: String(id) }) as never;
  it('unions events by id in order', () => {
    expect(mergeEvents([ev(1), ev(3)], [ev(2), ev(3)]).map((e: { id: number }) => e.id)).toEqual([1, 2, 3]);
  });
  it('upserts inquiries', () => {
    const a = { id: 'a', events: [] } as never;
    const b = { id: 'b', events: [] } as never;
    expect(upsertInquiry([a], b).map((i: { id: string }) => i.id)).toEqual(['b', 'a']);
  });
});
