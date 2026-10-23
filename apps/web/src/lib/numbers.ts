import { toLatinDigits } from '@titl/shared';

const faGrouped = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 2 });

/**
 * Parse a number typed by a Persian user: Persian/Arabic/Latin digits, `٬`/`,` thousands separators,
 * `.`/`٫`/`/` as decimal separator (Persian keyboards produce `/` or `٫`). Returns null for empty/invalid.
 *   «۲۵» → 25 · «۲٫۵» → 2.5 · «۱۲٬۵۰۰٬۰۰۰» → 12500000 · «12,500» → 12500 · «abc» → null
 */
export function parseLocaleNumber(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  let s = toLatinDigits(String(input)).trim();
  if (!s) return null;
  s = s.replace(/[٬,\s]/g, '').replace(/[٫/]/g, '.');
  // Keep only the first decimal point.
  const firstDot = s.indexOf('.');
  if (firstDot !== -1) s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, '');
  if (!/^-?\d*\.?\d*$/.test(s) || s === '.' || s === '-' || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Persian digits with grouping, for showing a parsed value back inside an input. */
export function formatInputNumber(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '';
  return faGrouped.format(n);
}

/** Million Toman ↔ Toman (budgets are typed in «میلیون تومان»). Rounds to whole Toman. */
export const millionsToToman = (m: number): number => Math.round(m * 1_000_000);
export const tomanToMillions = (t: number): number => Math.round((t / 1_000_000) * 100) / 100;

/** Clamp helper. */
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
