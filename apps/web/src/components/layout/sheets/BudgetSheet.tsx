import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { Sheet } from '../../ui/Sheet.js';
import { Button } from '../../ui/Button.js';
import { TextField } from '../../ui/TextField.js';
import { Chip } from '../../ui/Chip.js';
import { useContextStore } from '../../../state/useContextStore.js';
import { formatInputNumber, millionsToToman, parseLocaleNumber, tomanToMillions } from '../../../lib/numbers.js';
import { budgetLabel } from '../../../lib/context-labels.js';

/** Presets in million toman (min, max). */
export const BUDGET_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: 'تا ۵ میلیون', max: 5 },
  { label: '۵ تا ۱۵ میلیون', min: 5, max: 15 },
  { label: '۱۵ تا ۳۰ میلیون', min: 15, max: 30 },
  { label: '۳۰ تا ۶۰ میلیون', min: 30, max: 60 },
  { label: 'بیش از ۶۰ میلیون', min: 60 },
];

/** Parses the two inputs (million toman; Persian/Arabic/Latin digits) → toman, or an error message. */
export function parseBudgetInputs(minText: string, maxText: string): { min?: number; max?: number; error?: string } {
  const min = minText.trim() ? parseLocaleNumber(minText) : null;
  const max = maxText.trim() ? parseLocaleNumber(maxText) : null;
  if ((minText.trim() && min === null) || (maxText.trim() && max === null)) return { error: 'لطفاً فقط عدد وارد کنید.' };
  if (min !== null && min < 0) return { error: 'بودجه نمی‌تواند منفی باشد.' };
  if (min !== null && max !== null && min > max) return { error: 'حداقل بودجه از حداکثر بیشتر است.' };
  return { min: min ? millionsToToman(min) : undefined, max: max ? millionsToToman(max) : undefined };
}

export function BudgetSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const ctxMin = useContextStore((s) => s.ctx.budgetMin);
  const ctxMax = useContextStore((s) => s.ctx.budgetMax);
  const setBudget = useContextStore((s) => s.setBudget);
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');

  useEffect(() => {
    if (!open) return;
    setMinText(ctxMin ? formatInputNumber(tomanToMillions(ctxMin)) : '');
    setMaxText(ctxMax ? formatInputNumber(tomanToMillions(ctxMax)) : '');
  }, [open, ctxMin, ctxMax]);

  const parsed = parseBudgetInputs(minText, maxText);
  const preview = parsed.error ? null : budgetLabel({ budgetMin: parsed.min, budgetMax: parsed.max });

  const apply = () => {
    if (parsed.error) return;
    setBudget(parsed.min, parsed.max);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="بودجه شما"
      description="کالاها و فروشگاه‌های داخل بودجه را جلوتر نشان می‌دهیم."
      icon={Wallet}
      footer={
        <div className="flex gap-2.5">
          <Button
            variant="ghost"
            size="lg"
            onClick={() => {
              setBudget(undefined, undefined);
              onOpenChange(false);
            }}
          >
            بدون محدودیت
          </Button>
          <Button size="lg" fullWidth onClick={apply} disabled={!!parsed.error}>
            {preview ? `اعمال: ${preview}` : 'اعمال'}
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label="بازه‌های پیشنهادی">
          {BUDGET_PRESETS.map((p) => {
            const selected = (p.min ? millionsToToman(p.min) : undefined) === ctxMin && (p.max ? millionsToToman(p.max) : undefined) === ctxMax;
            return (
              <Chip
                key={p.label}
                selected={selected}
                onClick={() => {
                  setBudget(p.min ? millionsToToman(p.min) : undefined, p.max ? millionsToToman(p.max) : undefined);
                  onOpenChange(false);
                }}
              >
                {p.label}
              </Chip>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="از"
            inputMode="decimal"
            placeholder="۰"
            value={minText}
            onChange={(e) => setMinText(e.target.value)}
            end={<span className="text-caption text-muted whitespace-nowrap">میلیون تومان</span>}
            className="num"
          />
          <TextField
            label="تا"
            inputMode="decimal"
            placeholder="مثلاً ۲۵"
            value={maxText}
            onChange={(e) => setMaxText(e.target.value)}
            end={<span className="text-caption text-muted whitespace-nowrap">میلیون تومان</span>}
            className="num"
            onKeyDown={(e) => e.key === 'Enter' && apply()}
          />
        </div>
        {parsed.error ? (
          <p role="alert" className="text-meta font-medium text-bad-ink">
            {parsed.error}
          </p>
        ) : (
          <p className="text-caption text-muted">می‌توانید اعداد را فارسی یا انگلیسی بنویسید؛ مثلاً ۲۵ یا ۲۵٫۵.</p>
        )}
      </div>
    </Sheet>
  );
}
