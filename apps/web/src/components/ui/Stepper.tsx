import type { ComponentType, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Accessible name, e.g. «شعاع جستجو». */
  label: string;
  /** Display formatter (default: Persian digits). */
  format?: (n: number) => ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

/** Numeric −/+ stepper (spinbutton semantics). Plus sits on the reading-start (right) side. */
export function Stepper({ value, onChange, min = 0, max = Number.MAX_SAFE_INTEGER, step = 1, label, format, size = 'md', className }: StepperProps) {
  const dec = () => onChange(Math.max(min, value - step));
  const inc = () => onChange(Math.min(max, value + step));
  const btn =
    'hit-44 grid shrink-0 place-items-center rounded-xl text-primary-strong press hover:bg-primary-tint disabled:opacity-35 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-primary';
  const box = size === 'sm' ? 'size-8 [&_svg]:size-4' : 'size-10 [&_svg]:size-5';
  return (
    <div
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          e.preventDefault();
          inc();
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
          e.preventDefault();
          dec();
        }
      }}
      className={cn(
        'inline-flex items-center gap-1 rounded-2xl border border-line bg-surface p-1 shadow-card focus-visible:outline-2 focus-visible:outline-primary',
        className,
      )}
    >
      <button type="button" tabIndex={-1} aria-label={`افزایش ${label}`} onClick={inc} disabled={value >= max} className={cn(btn, box)}>
        <Plus aria-hidden />
      </button>
      <span className={cn('num min-w-10 text-center font-extrabold text-ink', size === 'sm' ? 'text-meta' : 'text-body')}>
        {format ? format(value) : formatNumber(value)}
      </span>
      <button type="button" tabIndex={-1} aria-label={`کاهش ${label}`} onClick={dec} disabled={value <= min} className={cn(btn, box)}>
        <Minus aria-hidden />
      </button>
    </div>
  );
}

export interface StepItem {
  title: ReactNode;
  description?: ReactNode;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

/** Numbered vertical step list (e.g. the 4 steps of in-person shopping). */
export function StepList({ steps, className, compact }: { steps: StepItem[]; className?: string; compact?: boolean }) {
  return (
    <ol className={cn('relative flex flex-col', compact ? 'gap-3' : 'gap-4', className)}>
      {steps.map((s, i) => {
        const Icon = s.icon;
        return (
          <li key={i} className="relative flex gap-3">
            {i < steps.length - 1 ? (
              <span aria-hidden className="absolute start-[1.1875rem] top-11 bottom-[-0.75rem] w-px bg-gradient-to-b from-primary-200 to-transparent" />
            ) : null}
            <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-tint text-primary-strong ring-1 ring-primary-100">
              {Icon ? <Icon aria-hidden className="size-5" /> : <span className="num text-meta font-extrabold">{formatNumber(i + 1)}</span>}
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-body font-bold text-ink">
                {Icon ? <span className="num me-1 text-primary-strong">{formatNumber(i + 1)}.</span> : null}
                {s.title}
              </p>
              {s.description ? <p className="text-meta text-muted">{s.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
