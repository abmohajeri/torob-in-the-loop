import { Check, Route } from 'lucide-react';
import { TRAVEL_MODE_META, type TravelMode } from '@titl/shared';
import { Sheet } from '../../ui/Sheet.js';
import { DataNote } from '../../data/DataNote.js';
import { useContextStore } from '../../../state/useContextStore.js';
import { TRAVEL_MODE_ICON } from '../../../lib/icons.js';
import { cn } from '../../../lib/cn.js';

const MODES: { mode: TravelMode; hint: string }[] = [
  { mode: 'walk', hint: 'برای فاصله‌های کوتاه داخل یک راسته' },
  { mode: 'metro', hint: 'مناسب مرکز شهر و ساعت شلوغی' },
  { mode: 'taxi', hint: 'اسنپ، تپسی و…' },
  { mode: 'car', hint: 'با در نظر گرفتن طرح ترافیک و پارکینگ' },
];

/** «نحوه رفت‌وآمد» — used for ETA and route planning. */
export function TravelModeSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const mode = useContextStore((s) => s.ctx.travelMode);
  const setTravelMode = useContextStore((s) => s.setTravelMode);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="چطور می‌روید؟" description="زمان رسیدن و ترتیب مسیر را با همین حساب می‌کنیم." icon={Route}>
      <div role="radiogroup" aria-label="نحوه رفت‌وآمد" className="space-y-2">
        {MODES.map(({ mode: m, hint }) => {
          const Icon = TRAVEL_MODE_ICON[m];
          const on = (mode ?? 'walk') === m && (mode !== undefined || m === 'walk');
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setTravelMode(m);
                onOpenChange(false);
              }}
              className={cn(
                'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-4 py-2.5 text-start press',
                on ? 'border-primary/70 bg-primary-tint' : 'border-line bg-surface hover:border-primary-200',
              )}
            >
              <span className={cn('grid size-10 place-items-center rounded-xl', on ? 'bg-primary-strong text-white' : 'bg-sunken text-ink-2')}>
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-bold text-ink">{TRAVEL_MODE_META[m].label}</span>
                <span className="block text-caption text-muted">{hint}</span>
              </span>
              {on ? <Check aria-hidden className="size-5 text-primary-strong" /> : null}
            </button>
          );
        })}
      </div>
      <DataNote className="mt-3">زمان‌ها تخمینی‌اند و ترافیک لحظه‌ای را در نظر نمی‌گیرند.</DataNote>
    </Sheet>
  );
}
