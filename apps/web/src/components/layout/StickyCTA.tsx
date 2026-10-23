import { useRef, type ReactNode } from 'react';
import { useCssVarHeight } from '../../lib/useCssVarHeight.js';
import { cn } from '../../lib/cn.js';

export interface StickyCTAProps {
  children: ReactNode;
  /** Sits above the bottom tab bar (default true). Set false on pages without the tab bar. */
  aboveNav?: boolean;
  /** Small line above the buttons (e.g. «۳ فروشگاه انتخاب شده»). */
  note?: ReactNode;
  className?: string;
}

/**
 * Fixed bottom action area (primary next step). Publishes `--cta-h` so the CompareTray stacks above it; the page
 * should add `pb-[var(--cta-h)]` (AppShell already does via `--cta-h`).
 */
export function StickyCTA({ children, aboveNav = true, note, className }: StickyCTAProps) {
  const ref = useRef<HTMLDivElement>(null);
  useCssVarHeight(ref, '--cta-h');
  return (
    <div
      ref={ref}
      className={cn(
        'app-fixed z-30 bg-gradient-to-t from-canvas from-70% to-transparent px-4 pt-5 pb-3',
        aboveNav ? 'bottom-[var(--bottom-ui)]' : 'bottom-0 pb-[calc(0.75rem+var(--safe-bottom))]',
        className,
      )}
    >
      {note ? <p className="mb-2 text-center text-caption text-muted">{note}</p> : null}
      <div className="flex items-center gap-2.5 [&>*]:flex-1">{children}</div>
    </div>
  );
}
