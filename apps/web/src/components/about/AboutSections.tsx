import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BadgeCheck, ChevronLeft, CircleHelp, Clock3, type LucideIcon } from 'lucide-react';
import { formatNumber, toPersianDigits } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export interface CompletenessItem {
  label: string;
  /** 0..100 share that IS recorded/available. */
  pct: number;
  note?: string;
}

/** «داده‌ها چقدر کامل است؟» — labelled bars (value always in text, not color only). */
export function CompletenessBars({ items }: { items: CompletenessItem[] }) {
  return (
    <ul className="flex flex-col gap-3.5">
      {items.map((it) => (
        <li key={it.label}>
          <div className="flex items-baseline justify-between gap-3 text-meta">
            <span className="font-medium text-ink">{it.label}</span>
            <span className="num shrink-0 font-bold text-heading">{toPersianDigits(Math.round(it.pct))}٪</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-sunken" role="presentation">
            <div className={cn('h-full rounded-full', it.pct >= 60 ? 'bg-primary' : it.pct >= 25 ? 'bg-warn' : 'bg-accent')} style={{ width: `${Math.max(1.5, it.pct)}%` }} />
          </div>
          {it.note ? <p className="mt-1 text-caption leading-5 text-muted">{it.note}</p> : null}
        </li>
      ))}
    </ul>
  );
}

const LEGEND: { icon: LucideIcon; title: string; body: string; cls: string }[] = [
  { icon: BadgeCheck, title: 'تأییدشده', body: 'از فروشنده پرسیده‌ایم (تماس شبیه‌سازی‌شده یا پاسخ مستقیم فروشنده) — با زمان پاسخ.', cls: 'border-solid border-verified-line bg-verified-tint text-verified' },
  { icon: Clock3, title: 'ثبت‌شده', body: 'اعلام فروشنده در ترب، با سن قیمت؛ ممکن است تغییر کرده باشد.', cls: 'border-solid border-line bg-surface text-ink-2' },
  { icon: CircleHelp, title: 'نامشخص', body: 'در داده‌ها ثبت نشده؛ همیشه کنارش «بپرس» هست. نامشخص یعنی «ندارد» نیست.', cls: 'border-dashed border-line bg-surface-2 text-muted' },
];

export function TrustLegend() {
  return (
    <ul className="flex flex-col gap-2">
      {LEGEND.map((l) => (
        <li key={l.title} className="flex items-start gap-3">
          <span className={cn('inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-caption font-bold', l.cls)}>
            <l.icon aria-hidden className="size-3.5" />
            {l.title}
          </span>
          <span className="text-meta leading-6 text-ink-2">{l.body}</span>
        </li>
      ))}
    </ul>
  );
}

export interface CoverageRow {
  group: string;
  feature: string;
  how: string;
  to: string;
}

/** Requirement → feature → «امتحان کنید» deep link. */
export function CoverageTable({ rows }: { rows: CoverageRow[] }) {
  const groups = [...new Set(rows.map((r) => r.group))];
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g} aria-label={g}>
          <h3 className="mb-2 text-meta font-extrabold text-primary-strong">{g}</h3>
          <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-card">
            {rows
              .filter((r) => r.group === g)
              .map((r) => (
                <li key={r.feature}>
                  <Link to={r.to} className="flex min-h-14 items-center gap-3 px-3.5 py-2.5 press hover:bg-primary-tint/50 focus-visible:outline-2 focus-visible:outline-primary">
                    <span className="min-w-0 flex-1">
                      <span className="block text-body font-bold text-ink">{r.feature}</span>
                      <span className="block text-caption leading-5 text-muted">{r.how}</span>
                    </span>
                    <span className="inline-flex shrink-0 items-center text-caption font-bold text-primary-strong">
                      امتحان کنید
                      <ChevronLeft aria-hidden className="size-4" />
                    </span>
                  </Link>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function StatTile({ value, label, icon: Icon }: { value: number | string; label: ReactNode; icon: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-line/80 bg-surface p-3 shadow-card">
      <Icon aria-hidden className="size-5 text-primary" />
      <p className="num mt-1.5 text-title font-extrabold text-heading">{typeof value === 'number' ? formatNumber(value) : value}</p>
      <p className="text-caption text-muted">{label}</p>
    </div>
  );
}

/** Two-column «امروز در نسخه نمایشی» vs «در نسخه واقعی» rows. */
export function RealVsDemo({ rows }: { rows: { topic: string; demo: string; real: string }[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.topic} className="rounded-2xl border border-line/80 bg-surface p-3.5 shadow-card">
          <p className="text-body font-extrabold text-ink">{r.topic}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-meta leading-6">
            <dt className="font-bold text-accent-ink">الان</dt>
            <dd className="text-ink-2">{r.demo}</dd>
            <dt className="font-bold text-primary-strong">نسخه واقعی</dt>
            <dd className="text-ink-2">{r.real}</dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
