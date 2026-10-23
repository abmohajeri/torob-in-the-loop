import type { ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

/** Hairline separator, optionally with a centered label (e.g. «یا»). */
export function Divider({ label, className, soft }: { label?: ReactNode; className?: string; soft?: boolean }) {
  if (!label) return <hr className={cn('border-0 border-t', soft ? 'border-line-soft' : 'border-line', className)} />;
  return (
    <div role="separator" className={cn('flex items-center gap-3 text-caption font-medium text-faint', className)}>
      <span aria-hidden className="h-px flex-1 bg-line" />
      {label}
      <span aria-hidden className="h-px flex-1 bg-line" />
    </div>
  );
}
