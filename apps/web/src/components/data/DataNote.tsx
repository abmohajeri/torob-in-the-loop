import type { ReactNode } from 'react';
import { Info, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface DataNoteProps {
  children: ReactNode;
  icon?: LucideIcon;
  tone?: 'neutral' | 'info' | 'warn';
  /** boxed = soft panel; plain = footnote text. */
  variant?: 'plain' | 'boxed';
  className?: string;
}

const TONE = {
  neutral: 'text-muted [&_svg]:text-faint',
  info: 'text-info-ink [&_svg]:text-info',
  warn: 'text-warn-ink [&_svg]:text-warn',
} as const;

const BOX = {
  neutral: 'bg-surface-2 border-line-soft',
  info: 'bg-info-tint border-info-line',
  warn: 'bg-warn-tint border-warn-line',
} as const;

/** Small transparency footnote («نام فروشگاه‌ها در داده‌های ترب ناشناس‌سازی شده است»…). */
export function DataNote({ children, icon: Icon = Info, tone = 'neutral', variant = 'plain', className }: DataNoteProps) {
  return (
    <p
      className={cn(
        'flex items-start gap-1.5 text-caption leading-relaxed',
        TONE[tone],
        variant === 'boxed' && cn('rounded-xl border px-3 py-2', BOX[tone]),
        className,
      )}
    >
      <Icon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** Canonical transparency copy (PRD §3.10) — reuse so wording stays consistent across pages. */
export const DATA_NOTES = {
  anonymizedNames: 'نام بیشتر فروشگاه‌ها در داده‌های ترب برای انتشار ناشناس‌سازی شده است.',
  fakePhones: 'شماره تلفن‌های این مجموعه‌داده نمایشی است؛ تماس‌ها شبیه‌سازی می‌شوند.',
  registeredPrice: 'قیمت‌ها همان قیمت ثبت‌شده فروشنده در ترب است و ممکن است تغییر کرده باشد.',
  categoryOnly: 'این فروشگاه‌ها فقط در دسته فعالیت مرتبط ثبت شده‌اند؛ موجودی این کالا نامشخص است.',
  kalabarg: 'کالابرگ در داده‌های ترب ثبت نشده است؛ از فروشنده می‌پرسیم.',
  estimates: 'فاصله و زمان رسیدن تخمینی است و ترافیک لحظه‌ای را در نظر نمی‌گیرد.',
  inferredBrand: 'برند از روی عنوان کالا تشخیص داده شده است.',
  redactedTitle: 'عنوان اصلی این کالا برای انتشار حذف شده؛ عنوان فروشنده نمایش داده می‌شود.',
  simulatedCall: 'تماس شبیه‌سازی‌شده — نسخه نمایشی',
} as const;
