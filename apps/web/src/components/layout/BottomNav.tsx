import { useEffect } from 'react';
import { useKeyboardOpen } from '../../lib/hooks.js';
import { NavLink } from 'react-router';
import { BellRing, MessageCircleMore, Route, Search, type LucideIcon } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { useActiveInquiryCount } from '../../lib/queries.js';
import { usePlan } from '../../state/usePlan.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  badge?: number;
  live?: boolean;
}

/** Bottom tab bar: دستیار · جستجو · پیگیری‌ها (live count) · برنامه. Safe-area aware, constrained to the app column. */
export function BottomNav({ className }: { className?: string }) {
  const active = useActiveInquiryCount();
  const stops = usePlan((s) => s.stops.length);
  const keyboard = useKeyboardOpen();
  // W1: the tab bar hides while the on-screen keyboard is open; fixed bars fall back to the safe area.
  useEffect(() => {
    const root = document.documentElement.style;
    if (keyboard) root.setProperty('--bottom-ui', 'var(--safe-bottom)');
    else root.removeProperty('--bottom-ui');
    return () => {
      root.removeProperty('--bottom-ui');
    };
  }, [keyboard]);
  const items: NavItem[] = [
    { to: paths.home, label: 'دستیار', icon: MessageCircleMore, end: true },
    { to: paths.search(), label: 'جستجو', icon: Search },
    { to: paths.inquiries, label: 'پیگیری‌ها', icon: BellRing, badge: active, live: active > 0 },
    { to: paths.plan, label: 'برنامه', icon: Route, badge: stops },
  ];
  if (keyboard) return null;
  return (
    <nav
      aria-label="بخش‌های اصلی"
      className={cn('app-fixed bottom-0 z-40 border-t border-line-soft bg-surface/92 pb-safe shadow-nav backdrop-blur-md', className)}
    >
      <ul className="grid h-[var(--nav-h)] grid-cols-4">
        {items.map((it) => (
          <li key={it.label}>
            <NavLink
              to={it.to}
              end={it.end}
              className={({ isActive }) =>
                cn(
                  'group relative flex h-full flex-col items-center justify-center gap-0.5 text-caption font-medium press focus-visible:outline-none',
                  isActive ? 'text-primary-strong' : 'text-faint hover:text-ink-2',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'relative grid h-8 w-14 place-items-center rounded-full transition-colors duration-200 group-focus-visible:outline-2 group-focus-visible:outline-primary',
                      isActive && 'bg-primary-tint',
                    )}
                  >
                    <it.icon aria-hidden className={cn('size-[1.375rem]', isActive && 'icon-bold')} />
                    {it.badge ? (
                      <span className="absolute -top-1 end-1.5 grid h-[1.125rem] min-w-[1.125rem] place-items-center rounded-full bg-accent-strong px-1 text-[0.6875rem] leading-none font-bold text-white ring-2 ring-surface num">
                        {it.live ? <span aria-hidden className="absolute inset-0 rounded-full bg-accent animate-live" /> : null}
                        <span className="relative">{it.badge > 9 ? '+۹' : formatNumber(it.badge)}</span>
                      </span>
                    ) : null}
                  </span>
                  <span className={cn(isActive && 'font-bold')}>{it.label}</span>
                  {it.badge ? <span className="sr-only">{`(${formatNumber(it.badge)} مورد)`}</span> : null}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
