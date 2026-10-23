/**
 * Payment options & text hints (docs/ARCHITECTURE.md §4 rules 13–14).
 *
 *  - provider names are mapped with shared PROVIDERS[*].aliases (spacing/ZWNJ-insensitive);
 *    anything else (incl. junk such as a shop name typed as provider) → 'other' with its label kept;
 *  - channel is kept exactly as registered ('in_person' | 'unknown' — the «information type»);
 *  - min/max price 0 → null (unknown);
 *  - text hints are a weaker signal mined from seller-written text (offer + warranty descriptions).
 */
import type { PaymentChannel, PaymentInfo, PaymentOption, ProviderCode } from '@titl/shared';
import { PROVIDERS, cleanFa, normalizeForSearch } from '@titl/shared';

export type TextHint = PaymentInfo['textHints'][number];

const squash = (s: string) => normalizeForSearch(s).replace(/\s+/g, '');

const ALIAS_TO_CODE: Map<string, ProviderCode> = (() => {
  const m = new Map<string, ProviderCode>();
  for (const [code, meta] of Object.entries(PROVIDERS) as [ProviderCode, (typeof PROVIDERS)[ProviderCode]][]) {
    if (code === 'other') continue;
    for (const a of [meta.label, ...meta.aliases]) m.set(squash(a), code);
  }
  return m;
})();

export function providerCode(name: string | null | undefined): ProviderCode {
  if (!name) return 'other';
  return ALIAS_TO_CODE.get(squash(name)) ?? 'other';
}

function priceOrNull(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export interface ParsedPayments {
  options: PaymentOption[];
  installment: boolean;
  torobPayInPerson: boolean;
  /** Registered provider names that did not map to a known provider (report). */
  unknownNames: string[];
}

export function parsePayments(raw: unknown): ParsedPayments {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const options: PaymentOption[] = [];
  const unknownNames: string[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.provider_name === 'string' ? cleanFa(o.provider_name) : '';
    if (!name) continue;
    const provider = providerCode(name);
    if (provider === 'other') unknownNames.push(name);
    const channel: PaymentChannel = o.channel === 'in_person' ? 'in_person' : 'unknown';
    const key = `${provider}|${provider === 'other' ? name : ''}|${channel}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({
      provider,
      label: name,
      channel,
      minPrice: priceOrNull(o.min_price_toman),
      maxPrice: priceOrNull(o.max_price_toman),
    });
  }
  // stable, useful order: known installment providers first (in_person before unknown), then others
  const order: ProviderCode[] = ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam', 'other'];
  options.sort(
    (a, b) =>
      order.indexOf(a.provider) - order.indexOf(b.provider) ||
      (a.channel === b.channel ? 0 : a.channel === 'in_person' ? -1 : 1) ||
      a.label.localeCompare(b.label),
  );
  const installment = options.some((o) => PROVIDERS[o.provider].installment);
  const torobPayInPerson = options.some((o) => o.provider === 'torobpay' && o.channel === 'in_person');
  return { options, installment, torobPayInPerson, unknownNames };
}

// ───────────────────────── text hints ─────────────────────────

const HINT_RULES: [TextHint, RegExp][] = [
  ['installment', /(قسط|اقساط)/],
  // «چک» as a whole word only (not «کوچک», «چکش», «چکمه»)
  // DT6: standalone چک/چکی (covers «با چک», «فروش چکی», «چک صیادی»); ZWNJ counts as part of a word
  ['cheque', /(^|[^\p{L}\u200c])(چک|چکی)(?=$|[^\p{L}\u200c])/u],
  ['fast_delivery', /ارسال\s*(?:\u200c)?\s*فوری/],
  ['pay_on_delivery', /پرداخت\s*(?:درب|در)\s*(?:\u200c)?\s*محل/],
];

/** Hints mentioned in seller-written text (descriptions). Order follows HINT_RULES. */
export function mineTextHints(...texts: (string | null | undefined)[]): TextHint[] {
  const joined = texts.filter(Boolean).map((t) => cleanFa(t)).join(' \n ');
  if (!joined) return [];
  const out: TextHint[] = [];
  for (const [hint, re] of HINT_RULES) if (re.test(joined)) out.push(hint);
  return out;
}

/** Union of hint lists in canonical order. */
export function unionHints(lists: Iterable<readonly TextHint[]>): TextHint[] {
  const set = new Set<TextHint>();
  for (const l of lists) for (const h of l) set.add(h);
  return HINT_RULES.map(([h]) => h).filter((h) => set.has(h));
}
