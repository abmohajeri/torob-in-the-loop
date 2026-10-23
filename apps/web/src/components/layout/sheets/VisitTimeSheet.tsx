import { useState, useEffect } from 'react';
import { CalendarClock, Zap } from 'lucide-react';
import { formatClock } from '@titl/shared';
import { Sheet } from '../../ui/Sheet.js';
import { Button } from '../../ui/Button.js';
import { Chip } from '../../ui/Chip.js';
import { Segmented } from '../../ui/Tabs.js';
import { DataNote } from '../../data/DataNote.js';
import { useContextStore } from '../../../state/useContextStore.js';
import { hhmmOf, isVisitAtPast, tehranDayOffset, visitAtFor, visitDays } from '../../../lib/visit-time.js';

/** «کی می‌روید؟» — now / today at / tomorrow at. Used to compute «باز در زمان مراجعه». */
export function VisitTimeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const visitAt = useContextStore((s) => s.ctx.visitAt);
  const setVisitAt = useContextStore((s) => s.setVisitAt);
  const now = new Date();
  const days = visitDays(now);
  const current = visitAt && !isVisitAtPast(visitAt, now) ? visitAt : undefined;
  const [day, setDay] = useState<'0' | '1'>('0');

  useEffect(() => {
    if (open) setDay(current && tehranDayOffset(new Date(current), new Date()) === 1 ? '1' : '0');
  }, [open, current]);

  const selectedDay = days[Number(day)] ?? days[0]!;
  const currentHHMM = current ? hhmmOf(current) : null;
  const currentOffset = current ? tehranDayOffset(new Date(current), now) : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="کی مراجعه می‌کنید؟" description="باز یا بسته بودن فروشگاه‌ها را برای همان زمان حساب می‌کنیم." icon={CalendarClock}>
      <div className="space-y-5">
        <Button
          variant={current ? 'secondary' : 'soft'}
          size="lg"
          fullWidth
          startIcon={Zap}
          onClick={() => {
            setVisitAt(undefined);
            onOpenChange(false);
          }}
          aria-pressed={!current}
        >
          همین الان
        </Button>
        <Segmented
          label="روز مراجعه"
          fullWidth
          value={day}
          onChange={setDay}
          options={days.map((d) => ({ value: String(d.offset) as '0' | '1', label: `${d.label} (${d.weekdayLabel})` }))}
        />
        {selectedDay.times.length ? (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="ساعت مراجعه">
            {selectedDay.times.map((t) => (
              <Chip
                key={t}
                size="lg"
                className="justify-center num"
                selected={currentOffset === selectedDay.offset && currentHHMM === t}
                onClick={() => {
                  setVisitAt(visitAtFor(selectedDay.offset, t));
                  onOpenChange(false);
                }}
              >
                {formatClock(t)}
              </Chip>
            ))}
          </div>
        ) : (
          <p className="rounded-2xl bg-sunken px-4 py-3 text-meta text-muted">امروز ساعت دیگری باقی نمانده؛ «فردا» را انتخاب کنید.</p>
        )}
        {selectedDay.isFriday ? <DataNote tone="warn">جمعه بسیاری از پاساژها تعطیل یا نیمه‌وقت هستند.</DataNote> : null}
      </div>
    </Sheet>
  );
}
