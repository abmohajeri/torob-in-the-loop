import { Suspense, type ReactNode } from 'react';
import { Outlet, ScrollRestoration, useMatches } from 'react-router';
import { Toaster } from 'sonner';
import { WifiOff } from 'lucide-react';
import { Header } from './Header.js';
import { ContextBar } from './ContextBar.js';
import { BottomNav } from './BottomNav.js';
import { DesktopSidePanel } from './DesktopSidePanel.js';
import { ContextSheets } from './sheets/ContextSheets.js';
import { GlobalSheets } from '../inquiry/GlobalSheets.js';
import { CompareTray } from '../product/CompareTray.js';
import { Spinner } from '../ui/Spinner.js';
import { useLiveEvents } from '../../hooks/useLiveEvents.js';
import { useSessionId } from '../../lib/session.js';
import { useOnlineStatus, useScrollDirection } from '../../lib/hooks.js';
import { cn } from '../../lib/cn.js';

/**
 * Per-route chrome, declared on the route's `handle` (see router.tsx):
 *   header: 'app' = logo + location chip (+ ContextBar when `contextBar`) · 'none' = the page renders its own PageHeader
 *   nav: bottom tab bar (default true)
 */
export interface ShellHandle {
  header?: 'app' | 'none';
  contextBar?: boolean;
  nav?: boolean;
}

export function useShellHandle(): Required<ShellHandle> {
  const matches = useMatches();
  let h: ShellHandle = {};
  for (const m of matches) if (m.handle && typeof m.handle === 'object') h = { ...h, ...(m.handle as ShellHandle) };
  return { header: h.header ?? 'none', contextBar: h.contextBar ?? false, nav: h.nav ?? true };
}

function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-warn-tint px-4 py-1.5 text-caption font-medium text-warn-ink">
      <WifiOff aria-hidden className="size-3.5" /> اتصال اینترنت برقرار نیست؛ اطلاعات ذخیره‌شده را نشان می‌دهیم.
    </div>
  );
}

export function PageFallback() {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <Spinner size="lg" />
    </div>
  );
}

/** Centered mobile app column (full width on phones, 440 px framed on desktop). */
export function AppFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'relative mx-auto min-h-dvh w-full max-w-[var(--app-max)] bg-canvas md:shadow-[0_0_0_1px_rgb(15_23_42/0.05),0_30px_80px_-30px_rgb(15_23_42/0.35)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Root layout: header/context bar, routed page, bottom nav, compare tray, context sheets, toasts, live events. */
export function AppShell() {
  const shell = useShellHandle();
  const sessionId = useSessionId();
  useLiveEvents(sessionId);
  const scrollDir = useScrollDirection();

  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 hidden khatam-bg md:block" />
      <DesktopSidePanel />
      <AppFrame>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-xl focus:bg-surface focus:px-4 focus:py-2">
          پرش به محتوا
        </a>
        <OfflineBanner />
        {shell.header === 'app' ? (
          <div
            className={cn(
              'sticky top-0 z-30 bg-canvas/90 backdrop-blur-md transition-transform duration-200 ease-out motion-reduce:transition-none',
              scrollDir === 'down' && '-translate-y-full',
            )}
          >
            <Header className="static bg-transparent backdrop-blur-none" />
            {shell.contextBar ? <ContextBar /> : null}
          </div>
        ) : null}
        <main id="main" className={cn(shell.nav ? 'pb-[calc(var(--bottom-ui)+var(--cta-h,0px)+var(--tray-h,0px)+1rem)]' : 'pb-[calc(var(--cta-h,0px)+var(--safe-bottom)+1rem)]')}>
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
        <CompareTray />
        {shell.nav ? <BottomNav /> : null}
      </AppFrame>
      <ContextSheets />
      <GlobalSheets />
      <Toaster dir="rtl" position="top-center" richColors closeButton={false} offset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} mobileOffset={{ top: 'calc(env(safe-area-inset-top, 0px) + 12px)' }} />
      <ScrollRestoration />
    </>
  );
}
