import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { cn } from '../../lib/cn.js';

export interface SegmentOption<V extends string> {
  value: V;
  label: ReactNode;
  icon?: LucideIcon;
  /** Optional count bubble (e.g. number of stores). */
  count?: number;
  disabled?: boolean;
}

/** Roving focus for a horizontal group in RTL: ArrowLeft = next, ArrowRight = previous. */
function useRovingKeys<V extends string>(options: SegmentOption<V>[], value: V, onChange: (v: V) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const enabled = options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
    const cur = enabled.findIndex(({ o }) => o.value === value);
    let next = -1;
    if (e.key === 'ArrowLeft') next = (cur + 1) % enabled.length;
    else if (e.key === 'ArrowRight') next = (cur - 1 + enabled.length) % enabled.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = enabled.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const target = enabled[next];
    if (!target) return;
    onChange(target.o.value);
    refs.current[target.i]?.focus();
  };
  return { refs, onKeyDown };
}

export interface SegmentedProps<V extends string> {
  options: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Accessible name of the group, e.g. «مرتب‌سازی». */
  label: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

/**
 * Segmented control (single choice, e.g. sort «هوشمند · ارزان‌ترین · نزدیک‌ترین»). Radio-group semantics,
 * arrow-key navigation (RTL aware), ≥ 44px hit area.
 */
export function Segmented<V extends string>({ options, value, onChange, label, size = 'md', fullWidth, className }: SegmentedProps<V>) {
  const { refs, onKeyDown } = useRovingKeys(options, value, onChange);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl bg-sunken/80 p-1 scrollbar-none',
        fullWidth && 'flex w-full',
        className,
      )}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'hit-44 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl font-bold whitespace-nowrap',
              'transition-[background-color,color,box-shadow] duration-200 ease-snappy focus-visible:outline-2 focus-visible:outline-primary',
              'disabled:opacity-40',
              size === 'sm' ? 'h-8 px-3 text-caption [&_svg]:size-3.5' : 'h-9 px-3.5 text-meta [&_svg]:size-4',
              fullWidth && 'flex-1',
              on ? 'bg-surface text-primary-strong shadow-card' : 'text-muted hover:text-ink-2',
            )}
          >
            {Icon ? <Icon aria-hidden /> : null}
            {o.label}
            {o.count !== undefined ? (
              <span className={cn('num text-caption font-medium', on ? 'text-primary-ink/80' : 'text-faint')}>
                {formatNumber(o.count)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TabsProps<V extends string> {
  tabs: SegmentOption<V>[];
  value: V;
  onChange: (value: V) => void;
  label: string;
  /** Prefix for the `aria-controls` ids; panels should use `tabPanelId(idBase, value)`. */
  idBase?: string;
  className?: string;
  sticky?: boolean;
}

export const tabPanelId = (idBase: string, value: string) => `${idBase}-panel-${value}`;
export const tabId = (idBase: string, value: string) => `${idBase}-tab-${value}`;

/** Underlined tabs for switching page sections (e.g. «فروشنده‌ها · مشخصات · محله‌ها»). */
export function Tabs<V extends string>({ tabs, value, onChange, label, idBase, className, sticky }: TabsProps<V>) {
  const autoId = useId();
  const base = idBase ?? `tabs${autoId.replace(/:/g, '')}`;
  const { refs, onKeyDown } = useRovingKeys(tabs, value, onChange);
  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn(
        'flex items-stretch gap-1 overflow-x-auto border-b border-line scrollbar-none',
        sticky && 'sticky top-[var(--sticky-top,0px)] z-20 bg-canvas/95 backdrop-blur',
        className,
      )}
    >
      {tabs.map((t, i) => {
        const on = t.value === value;
        const Icon = t.icon;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={tabId(base, t.value)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={tabPanelId(base, t.value)}
            tabIndex={on ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'relative inline-flex h-11 shrink-0 items-center gap-1.5 px-3 text-meta font-bold whitespace-nowrap',
              'transition-colors duration-200 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary [&_svg]:size-4',
              on ? 'text-primary-strong' : 'text-muted hover:text-ink-2',
            )}
          >
            {Icon ? <Icon aria-hidden /> : null}
            {t.label}
            {t.count !== undefined ? (
              <span
                className={cn(
                  'num grid h-5 min-w-5 place-items-center rounded-full px-1 text-caption leading-none',
                  on ? 'bg-primary-tint text-primary-ink' : 'bg-sunken text-muted',
                )}
              >
                {formatNumber(t.count)}
              </span>
            ) : null}
            <span
              aria-hidden
              className={cn(
                'absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-primary transition-[opacity,transform] duration-200 ease-snappy',
                on ? 'opacity-100' : 'scale-x-50 opacity-0',
              )}
            />
          </button>
        );
      })}
    </div>
  );
}
