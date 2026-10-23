import type { ReactNode } from 'react';
import { Drawer } from 'vaul';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn.js';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  /** Sticky footer (primary action). Gets safe-area padding. */
  footer?: ReactNode;
  /** auto = fit content (≤ 85dvh) · tall = 85dvh · full = 94dvh */
  size?: 'auto' | 'tall' | 'full';
  /** Visually hide the header text (still announced). */
  hideHeader?: boolean;
  /** Sheet inside another sheet. */
  nested?: boolean;
  /** Prevent swipe/overlay dismiss (e.g. while submitting). */
  dismissible?: boolean;
  className?: string;
  bodyClassName?: string;
}

const HEIGHT = {
  auto: 'max-h-[85dvh]',
  tall: 'h-[85dvh]',
  full: 'h-[94dvh]',
} as const;

/**
 * Bottom sheet (vaul Drawer → Radix Dialog: focus trap, Esc, aria-modal). RTL, constrained to the app column,
 * drag-to-dismiss with a visible handle and an explicit close button (no swipe-only interaction).
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  children,
  footer,
  size = 'auto',
  hideHeader,
  nested,
  dismissible = true,
  className,
  bodyClassName,
}: SheetProps) {
  const Root = nested ? Drawer.NestedRoot : Drawer.Root;
  return (
    <Root open={open} onOpenChange={onOpenChange} dismissible={dismissible} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-scrim backdrop-blur-[2px]" />
        <Drawer.Content
          dir="rtl"
          // No description → drop Radix's aria-describedby link (avoids an a11y warning).
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'app-fixed bottom-0 z-50 flex flex-col rounded-t-[1.75rem] bg-surface shadow-sheet outline-none',
            HEIGHT[size],
            className,
          )}
        >
          <div aria-hidden className="mx-auto mt-2.5 h-1.5 w-11 shrink-0 rounded-full bg-line" />
          <header className={cn('flex shrink-0 items-start gap-3 px-5 pt-3 pb-3', hideHeader && 'sr-only')}>
            {Icon ? (
              <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-2xl bg-primary-tint text-primary-strong">
                <Icon aria-hidden className="size-5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <Drawer.Title className="text-title font-extrabold text-heading">{title}</Drawer.Title>
              {description ? <Drawer.Description className="mt-0.5 text-meta text-muted">{description}</Drawer.Description> : null}
            </div>
            <Drawer.Close
              aria-label="بستن"
              className="hit-44 -me-1 grid size-9 shrink-0 place-items-center rounded-full bg-sunken/70 text-ink-2 press hover:bg-sunken focus-visible:outline-2 focus-visible:outline-primary"
            >
              <X aria-hidden className="size-[1.125rem]" />
            </Drawer.Close>
          </header>
          <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5', bodyClassName)}>{children}</div>
          {footer ? (
            <footer className="shrink-0 border-t border-line-soft bg-surface px-5 pt-3 pb-[calc(0.75rem+var(--safe-bottom))]">{footer}</footer>
          ) : (
            <div aria-hidden className="h-[var(--safe-bottom)] shrink-0" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Root>
  );
}
