/**
 * Per-shop field parsing (docs/ARCHITECTURE.md §4 rules 13, 16, 17).
 *  - contacts: `[{"channel":"phone","display_number":"۰۲۱…"}]` → first phone (display form, as registered)
 *  - phone_kind: mobile when it starts with ۰۹ / 09 / +989, else landline (all numbers are fake in the dataset)
 *  - instagram: `{"handle": "...", "profile_url": "..."}` → handle + URL
 *  - name_is_real: instagram or website present (dataset README)
 *  - supports_fast_delivery: tri-state true / false / null
 */
import { cleanFa, toLatinDigits } from '@titl/shared';
import { nul, parseJsonField } from './csv.js';

export type PhoneKind = 'mobile' | 'landline';

export interface ParsedContact {
  phone: string | null;
  phoneKind: PhoneKind | null;
}

export function phoneKindOf(phone: string): PhoneKind {
  const d = toLatinDigits(phone).replace(/[^\d+]/g, '');
  return /^(09|\+989|00989|989)/.test(d) ? 'mobile' : 'landline';
}

export function parseContacts(raw: string | null | undefined): ParsedContact {
  const list = parseJsonField<unknown>(raw, []);
  if (!Array.isArray(list)) return { phone: null, phoneKind: null };
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const o = c as Record<string, unknown>;
    const num = typeof o.display_number === 'string' ? o.display_number.trim() : '';
    if (!num) continue;
    return { phone: num, phoneKind: phoneKindOf(num) };
  }
  return { phone: null, phoneKind: null };
}

export interface ParsedInstagram {
  handle: string | null;
  url: string | null;
}

export function parseInstagram(raw: string | null | undefined): ParsedInstagram {
  const s = nul(raw);
  if (s === null) return { handle: null, url: null };
  const v = parseJsonField<unknown>(s, null);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const handle = typeof o.handle === 'string' && o.handle.trim() ? o.handle.trim().replace(/^@/, '') : null;
    let url = typeof o.profile_url === 'string' && o.profile_url.trim() ? o.profile_url.trim() : null;
    if (!url && handle) url = `https://www.instagram.com/${handle}/`;
    return { handle, url };
  }
  // plain handle or URL
  const m = /instagram\.com\/([A-Za-z0-9_.]+)/.exec(s);
  if (m) return { handle: m[1]!, url: s.trim() };
  const h = s.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_.]+$/.test(h) ? { handle: h, url: `https://www.instagram.com/${h}/` } : { handle: null, url: null };
}

export function parseWebsite(raw: string | null | undefined): string | null {
  const s = nul(raw)?.trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

export function parseTriState(raw: string | null | undefined): 0 | 1 | null {
  const s = nul(raw)?.trim().toLowerCase();
  if (s === 'true' || s === '1') return 1;
  if (s === 'false' || s === '0') return 0;
  return null;
}

/** Declared activity categories (JSON string[]), cleaned & de-duplicated, order kept. */
export function parseCategoryNames(raw: string | null | undefined): string[] {
  const v = parseJsonField<unknown>(raw, []);
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const c of v) {
    if (typeof c !== 'string') continue;
    const t = c.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Display shop name. */
export function shopName(raw: string | null | undefined): string {
  return cleanFa(nul(raw) ?? '') || 'فروشگاه بدون نام';
}
