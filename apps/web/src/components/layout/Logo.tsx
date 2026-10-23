import { useId } from 'react';
import { APP_NAME } from '@titl/shared';
import { cn } from '../../lib/cn.js';

/** Brand mark: emerald tile with a shopping bag + saffron handle and a location dot (matches public/icon.svg). */
export function LogoMark({ className }: { className?: string }) {
  const gid = `bz-logo-${useId().replace(/:/g, '')}`;
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('size-9 shrink-0', className)}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
      <path d="M24 25v-3.2a8 8 0 0 1 16 0V25" fill="none" stroke="#fbbf24" strokeWidth="4.2" strokeLinecap="round" />
      <path d="M15.5 25.5h33l-2.6 21.8a5 5 0 0 1-5 4.4H23.1a5 5 0 0 1-5-4.4z" fill="#fff" />
      <path d="M32 31.5a6.2 6.2 0 0 0-6.2 6.2c0 4.5 6.2 9.6 6.2 9.6s6.2-5.1 6.2-9.6a6.2 6.2 0 0 0-6.2-6.2z" fill="#047857" />
      <circle cx="32" cy="37.7" r="2.3" fill="#fff" />
    </svg>
  );
}

/** Mark + «Torob in the Loop» wordmark (+ optional tagline). */
export function Logo({ tagline, className, size = 'md' }: { tagline?: boolean; className?: string; size?: 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2', className)}>
      <LogoMark className={size === 'lg' ? 'size-12' : 'size-9'} />
      <span className="flex min-w-0 flex-col leading-none">
        <bdi dir="ltr" className={cn('whitespace-nowrap font-extrabold tracking-tight text-heading', size === 'lg' ? 'text-headline' : 'text-title')}>{APP_NAME}</bdi>
        {tagline ? <span className="mt-1 truncate text-caption font-medium leading-4 text-muted">دستیار هوشمند خرید حضوری در تهران</span> : null}
      </span>
    </span>
  );
}
