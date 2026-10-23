import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { formatTimeOfDay, toPersianDigits } from '@titl/shared';
import { InfoPopover } from '../ui/InfoPopover.js';
import { cn } from '../../lib/cn.js';
import { SIMULATED_WHY } from './meta.js';

/** «تماس شبیه‌سازی‌شده · نسخه نمایشی» + «چرا؟» (tap, not hover). */
export function SimulatedPill({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      <span className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-accent-200 bg-accent-tint px-2 text-caption font-medium text-accent-ink">
        <FlaskConical aria-hidden className="size-3.5" />
        تماس شبیه‌سازی‌شده · نسخه نمایشی
      </span>
      <InfoPopover title="چرا شبیه‌سازی؟" label="چرا تماس شبیه‌سازی شده است؟">
        {SIMULATED_WHY}
      </InfoPopover>
    </span>
  );
}

/** Ticks every second while `active` (countdowns). */
export function useTick(active: boolean, ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/** «۲:۵۹» from milliseconds (never negative). */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
  return toPersianDigits(body);
}

/** «ساعت ۱۶:۴۲ (۲:۵۹)» — a scheduled moment plus a live countdown. */
export function Countdown({ at, className }: { at: string; className?: string }) {
  const now = useTick(true);
  const ms = new Date(at).getTime() - now;
  return (
    <span className={cn('num', className)}>
      {formatTimeOfDay(at)}
      {ms > 0 ? <span className="text-muted"> ({formatCountdown(ms)})</span> : null}
    </span>
  );
}
