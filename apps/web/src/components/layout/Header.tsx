import { Link } from 'react-router';
import { ChevronDown, LocateFixed, MapPin, Sparkles } from 'lucide-react';
import { Badge } from '../ui/Badge.js';
import { Logo } from './Logo.js';
import { useContextStore } from '../../state/useContextStore.js';
import { useUi } from '../../state/useUi.js';
import { useMeta } from '../../lib/queries.js';
import { cn } from '../../lib/cn.js';

/** Location chip: «نزدیک فردوسی» or a call to set it. Opens the location sheet. */
export function LocationChip({ className }: { className?: string }) {
  const location = useContextStore((s) => s.ctx.location);
  const openSheet = useUi((s) => s.openSheet);
  return (
    <button
      type="button"
      onClick={() => openSheet('location')}
      className={cn(
        'hit-44 inline-flex h-9 max-w-[11.5rem] min-w-0 items-center gap-1.5 rounded-full border ps-2.5 pe-2 text-meta font-medium press',
        location ? 'border-line bg-surface text-ink' : 'border-accent-200 bg-accent-tint text-accent-ink',
        className,
      )}
      aria-label={location ? `محدوده: ${location.label} — تغییر` : 'تعیین موقعیت'}
    >
      {location?.source === 'gps' ? (
        <LocateFixed aria-hidden className="size-4 shrink-0 text-primary" />
      ) : (
        <MapPin aria-hidden className={cn('size-4 shrink-0', location ? 'text-primary' : 'text-accent')} />
      )}
      <span className="truncate">{location ? location.label : 'کجا هستید؟'}</span>
      <ChevronDown aria-hidden className="size-3.5 shrink-0 text-faint" />
    </button>
  );
}

/** «دستیار هوشمند» when the LLM is on, «حالت پایه» otherwise (rule-based fallback); hidden until /api/meta answers. */
export function AssistantModeBadge({ className }: { className?: string }) {
  const { data } = useMeta();
  if (!data) return null;
  return data.features.llm ? (
    <Badge tone="primary" icon={Sparkles} size="sm" className={className} title="پاسخ‌ها با هوش مصنوعی ساخته می‌شوند">
      هوشمند
    </Badge>
  ) : (
    <Badge tone="neutral" size="sm" className={className} title="دستیار بدون مدل زبانی و با قواعد ثابت پاسخ می‌دهد">
      حالت پایه
    </Badge>
  );
}

/** Sticky app header: logo · mode badge · location chip. */
export function Header({ className }: { className?: string }) {
  return (
    <header className={cn('sticky top-0 z-30 bg-canvas/85 pt-safe backdrop-blur-md', className)}>
      <div className="flex h-[var(--header-h)] items-center gap-2 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-1.5 rounded-xl focus-visible:outline-2 focus-visible:outline-primary" aria-label="Torob in the Loop — خانه">
          <Logo tagline />
        </Link>
        <AssistantModeBadge className="mt-0.5 hidden min-[420px]:inline-flex" />
        <div className="ms-auto min-w-0">
          <LocationChip />
        </div>
      </div>
    </header>
  );
}
