import { AlertTriangle } from 'lucide-react';
import { DAY_NAMES_FA, formatClock, tehranParts, type WeeklyHours } from '@titl/shared';
import { Unknown } from '../data/Unknown.js';
import { cn } from '../../lib/cn.js';

export interface HoursTableProps {
  hours: WeeklyHours | null;
  /** Visit moment (ISO) — its weekday is highlighted. Default: now. */
  at?: string;
  onAsk?: () => void;
  className?: string;
}

/** Weekly hours, Saturday first, visit day highlighted, labelled «اعلام فروشنده». Unknown ≠ closed. */
export function HoursTable({ hours, at, onAsk, className }: HoursTableProps) {
  if (!hours || !hours.declared || !hours.days.length)
    return <Unknown label="ساعت کاری ثبت نشده" why="فروشنده ساعت کاری اعلام نکرده است." onAsk={onAsk} askLabel="بپرس" className={className} />;
  const today = tehranParts(at ?? new Date()).weekday;
  return (
    <div className={className}>
      {hours.suspicious ? (
        <p className="mb-2 flex items-start gap-1.5 text-caption text-warn-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          بخشی از ساعت‌های ثبت‌شده غیرعادی است؛ پیش از رفتن بپرسید.
        </p>
      ) : null}
      <table className="w-full text-meta">
        <caption className="sr-only">ساعت کاری هفتگی (اعلام فروشنده)</caption>
        <tbody>
          {hours.days.map((d) => {
            const isToday = d.day === today;
            return (
              <tr key={d.day} className={cn(isToday && 'bg-primary-tint font-bold text-primary-ink')}>
                <th scope="row" className="rounded-s-lg px-2.5 py-1.5 text-start font-medium">
                  {DAY_NAMES_FA[d.day]}
                  {isToday ? <span className="ms-1 text-caption font-medium">(روز مراجعه)</span> : null}
                </th>
                <td className="num rounded-e-lg px-2.5 py-1.5 text-end">
                  {d.status === 'closed' ? (
                    <span className="text-bad-ink">تعطیل</span>
                  ) : d.status === 'unknown' || !d.shifts.length ? (
                    <span className="text-muted">نامشخص</span>
                  ) : (
                    d.shifts.map((s) => `${formatClock(s.start)} تا ${formatClock(s.end)}`).join(' · ')
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
