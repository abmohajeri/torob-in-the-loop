import { CalendarClock, CircleHelp, DoorOpen } from 'lucide-react';
import { DAY_NAMES_FA, DAY_ORDER, formatClock, formatNumber, tehranParts, type OpenStatus } from '@titl/shared';
import { OpenStatusBadge } from './OpenStatusBadge.js';
import { Button } from '../ui/Button.js';
import { useContextStore } from '../../state/useContextStore.js';
import { describeVisitAt, isVisitAtPast, visitAtFor } from '../../lib/visit-time.js';
import { useNow } from '../../lib/hooks.js';
import { cn } from '../../lib/cn.js';

const isClosed = (s: OpenStatus) => s.state === 'closed' || s.state === 'opens_later_today';

/** Next sensible morning visit (10:00, skipping Friday) → { iso, label }. */
export function nextMorningVisit(now: Date = new Date()): { iso: string; label: string } {
  const p = tehranParts(now);
  let offset = p.minutes < 9 * 60 ? 0 : 1;
  let day = DAY_ORDER[(DAY_ORDER.indexOf(p.weekday) + offset) % 7]!;
  if (day === 'fri') {
    offset += 1;
    day = 'sat';
  }
  const iso = visitAtFor(offset, '10:00', now);
  const dayLabel = offset === 0 ? 'امروز' : offset === 1 ? 'فردا' : DAY_NAMES_FA[day];
  return { iso, label: `${dayLabel} ${formatClock('10:00')}` };
}

/** Day-aware greeting for the Home hero («عصر پنجشنبه بخیر»…). */
export function dayGreeting(now: Date = new Date()): string {
  const p = tehranParts(now);
  const h = Math.floor(p.minutes / 60);
  const part = h < 12 ? 'صبح' : h < 17 ? 'ظهر' : h < 20 ? 'عصر' : 'شب';
  const day = DAY_NAMES_FA[p.weekday];
  if (p.weekday === 'fri') return `${part} جمعه بخیر — بسیاری از پاساژها امروز تعطیل‌اند`;
  if (h >= 21) return `${part} ${day} بخیر — بیشتر فروشگاه‌ها بسته‌اند؛ برای فردا برنامه بچینیم`;
  return `${part} ${day} بخیر`;
}

/**
 * W8 banner: when many stores are closed at the visit time, say so in one line and offer the two fixes:
 * [شنبه ۱۰:۰۰] (move the visit) · [فقط بازهای الان (۷)] (filter).
 */
export function VisitTimeBanner({ statuses, onOnlyOpen, className }: { statuses: OpenStatus[]; onOnlyOpen?: () => void; className?: string }) {
  const now = useNow(60_000);
  const visitAt = useContextStore((s) => s.ctx.visitAt);
  const setVisitAt = useContextStore((s) => s.setVisitAt);
  const setOpenNow = useContextStore((s) => s.setOpenNow);
  const total = statuses.length;
  const closed = statuses.filter(isClosed).length;
  if (total < 3 || closed / total < 0.4) return null;
  const open = total - closed;
  const p = tehranParts(now);
  const at = visitAt && !isVisitAtPast(visitAt, now) ? describeVisitAt(visitAt, now) : `الان ${DAY_NAMES_FA[p.weekday]} ساعت ${formatClock(`${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`)} است`;
  const next = nextMorningVisit(now);
  return (
    <section role="status" className={cn('rounded-2xl border border-warn-line bg-warn-tint p-3.5', className)}>
      <p className="flex gap-2 text-meta leading-6 text-ink">
        <CalendarClock aria-hidden className="mt-0.5 size-5 shrink-0 text-warn-ink" />
        <span>
          {visitAt ? `برای ${at}` : at} و <b className="num">{formatNumber(closed)}</b> از <span className="num">{formatNumber(total)}</span> فروشگاه بسته‌اند. برای {next.label} برنامه بچینم؟
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" startIcon={CalendarClock} onClick={() => setVisitAt(next.iso)}>
          {next.label}
        </Button>
        {open > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            startIcon={DoorOpen}
            onClick={() => {
              setOpenNow(true);
              onOnlyOpen?.();
            }}
          >
            فقط بازها ({formatNumber(open)})
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** Open status at the visit time; unknown hours become «ساعت کاری ثبت نشده · بپرسیم؟». */
export function VisitOpenBadge({ status, onAsk, className }: { status: OpenStatus; onAsk?: () => void; className?: string }) {
  if (status.state === 'unknown' && onAsk) {
    return (
      <button
        type="button"
        onClick={onAsk}
        className={cn('hit-44 inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-faint px-2 text-caption font-medium text-muted hover:text-primary-strong', className)}
      >
        <CircleHelp aria-hidden className="size-3.5" />
        ساعت کاری ثبت نشده · بپرسیم؟
      </button>
    );
  }
  const label = status.minutesToClose != null && status.state === 'closing_soon' ? `${formatNumber(status.minutesToClose)} دقیقه تا بسته شدن` : status.label;
  return <OpenStatusBadge status={{ ...status, label }} size="sm" className={className} />;
}
