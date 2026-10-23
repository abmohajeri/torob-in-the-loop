import { useEffect, useRef, useState } from 'react';
import { CalendarClock, CreditCard, MapPin, Plus, SlidersHorizontal, Wallet, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { ChipScroller } from '../ui/Chip.js';
import { useUserContext } from '../../state/useContextStore.js';
import { useUi } from '../../state/useUi.js';
import type { ContextSheetId } from '../../state/useUi.js';
import { activeConditionCount, budgetLabel, radiusLabel, visitLabel } from '../../lib/context-labels.js';
import { isVisitAtPast } from '../../lib/visit-time.js';
import { useNow } from '../../lib/hooks.js';
import { cn } from '../../lib/cn.js';

/** One context value chip. Unset = ghost «+ بودجه»; changes pulse once (e.g. when the assistant sets it). */
function ValueChip({ icon: Icon, value, ghost, sheet, label }: { icon: LucideIcon; value: string | null; ghost: string; sheet: ContextSheetId; label: string }) {
  const openSheet = useUi((s) => s.openSheet);
  const prev = useRef(value);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (prev.current !== value) {
      prev.current = value;
      setPulse((p) => p + 1);
    }
  }, [value]);
  const set = value !== null;
  return (
    <button
      key={pulse}
      type="button"
      onClick={() => openSheet(sheet)}
      aria-label={set ? `${label}: ${value} — تغییر` : `افزودن ${label}`}
      className={cn(
        'hit-44 inline-flex h-8 shrink-0 items-center gap-1 rounded-full border px-3 text-caption font-medium whitespace-nowrap press',
        set ? 'border-primary/60 bg-primary-tint text-primary-ink' : 'border-dashed border-faint/70 bg-transparent text-muted hover:border-primary hover:text-primary-strong',
        pulse > 0 && 'motion-safe:animate-flash',
      )}
    >
      {set ? <Icon aria-hidden className="size-3.5" /> : <Plus aria-hidden className="size-3.5" />}
      {set ? value : ghost}
    </button>
  );
}

/**
 * W1 context row: compact value chips «فردوسی · ۳ کیلومتر» «تا ۴۵ میلیون» «قسطی +۱» «شنبه ۱۱:۰۰»; unset values show as
 * ghosts («+ بودجه»). Each opens its sheet. Hides with the header on scroll down (AppShell).
 */
export function ContextBar({ className }: { className?: string }) {
  const ctx = useUserContext();
  const now = useNow(60_000);
  const conds = activeConditionCount(ctx);
  const budget = budgetLabel(ctx);
  const radius = radiusLabel(ctx);
  const visitSet = !!ctx.visitAt && !isVisitAtPast(ctx.visitAt, now);
  const area = ctx.location ? [ctx.location.label, radius?.replace(/^تا /, '')].filter(Boolean).join(' · ') : radius;
  const condLabel = conds ? (ctx.installment ? `قسطی${conds > 1 ? ` +${formatNumber(conds - 1)}` : ''}` : `${formatNumber(conds)} شرط`) : null;

  return (
    <div className={cn('px-4 pb-2', className)}>
      <ChipScroller label="شرایط جستجوی شما">
        <ValueChip icon={MapPin} sheet="location" label="محدوده" value={area ?? null} ghost="محدوده" />
        <ValueChip icon={Wallet} sheet="budget" label="بودجه" value={budget} ghost="بودجه" />
        <ValueChip icon={ctx.installment ? CreditCard : SlidersHorizontal} sheet="conditions" label="شرایط خرید" value={condLabel} ghost="قسطی، گارانتی…" />
        <ValueChip icon={CalendarClock} sheet="visitTime" label="زمان مراجعه" value={visitSet ? visitLabel(ctx, now) : null} ghost="زمان مراجعه" />
      </ChipScroller>
    </div>
  );
}
