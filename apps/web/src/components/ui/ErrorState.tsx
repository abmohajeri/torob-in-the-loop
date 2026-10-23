import type { ReactNode } from 'react';
import { CloudOff, RefreshCw, ServerCrash, WifiOff, type LucideIcon } from 'lucide-react';
import { ApiError, errorMessage } from '../../lib/api-error.js';
import { cn } from '../../lib/cn.js';
import { Button } from './Button.js';

export interface ErrorStateProps {
  /** The thrown value (ApiError → its Persian message; anything else → a generic Persian message). */
  error?: unknown;
  title?: ReactNode;
  /** Overrides the message derived from `error`. */
  description?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** Extra next-step actions (e.g. «بازگشت به جستجو»). */
  actions?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}

function iconFor(error: unknown): LucideIcon {
  if (error instanceof ApiError) {
    if (error.code === 'offline') return WifiOff;
    if (error.isNetwork) return CloudOff;
  }
  return ServerCrash;
}

function titleFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'offline') return 'اتصال اینترنت قطع است';
    if (error.isNetwork) return 'ارتباط با سرور برقرار نشد';
    if (error.isNotFound) return 'پیدا نشد';
  }
  return 'مشکلی پیش آمد';
}

/** Error panel with a Persian explanation and a retry action. */
export function ErrorState({ error, title, description, onRetry, retrying, actions, size = 'md', className }: ErrorStateProps) {
  const Icon = iconFor(error);
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center text-center animate-fade-in',
        size === 'sm' ? 'gap-2 px-4 py-5' : 'gap-3 px-5 py-10',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'grid place-items-center rounded-[1.75rem] bg-bad-tint text-bad-ink ring-1 ring-bad-line',
          size === 'sm' ? 'size-12 [&_svg]:size-6' : 'size-16 [&_svg]:size-8',
        )}
      >
        <Icon />
      </span>
      <div className="flex max-w-[22rem] flex-col gap-1">
        <h3 className={cn('font-extrabold text-heading', size === 'sm' ? 'text-body' : 'text-title')}>{title ?? titleFor(error)}</h3>
        <p className="text-meta text-muted">{description ?? errorMessage(error)}</p>
      </div>
      {onRetry || actions ? (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry ? (
            <Button variant="secondary" size="sm" startIcon={RefreshCw} onClick={onRetry} loading={retrying}>
              تلاش دوباره
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
