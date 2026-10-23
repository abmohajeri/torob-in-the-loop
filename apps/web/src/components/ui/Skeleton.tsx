import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn.js';

export interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
  /** Shape helper: text line, circle (avatars/icons) or block (images, cards). */
  shape?: 'line' | 'circle' | 'block';
}

/** Shimmering placeholder (decorative; wrap groups in an element with `aria-busy`). */
export function Skeleton({ className, style, shape = 'block' }: SkeletonProps) {
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        'skeleton block',
        shape === 'line' && 'h-3.5 rounded-full',
        shape === 'circle' && 'rounded-full',
        shape === 'block' && 'rounded-xl',
        className,
      )}
    />
  );
}

/** A few text lines of decreasing width. */
export function SkeletonText({ lines = 2, className }: { lines?: number; className?: string }) {
  const widths = ['w-11/12', 'w-8/12', 'w-10/12', 'w-6/12', 'w-9/12'];
  return (
    <span aria-hidden className={cn('flex flex-col gap-2', className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} shape="line" className={widths[i % widths.length]} />
      ))}
    </span>
  );
}

/** Announces a loading region to assistive tech and renders skeleton children. */
export function LoadingRegion({ label = 'در حال بارگذاری…', children, className }: { label?: string; children: ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
