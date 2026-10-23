/**
 * Small, dependency-free React hooks shared across the app.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { APP_NAME } from '@titl/shared';

function subscribeMedia(query: string) {
  return (onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const mql = window.matchMedia(query);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  };
}

/** `true` while the media query matches (SSR/test-safe: `false`). */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback((cb: () => void) => subscribeMedia(query)(cb), [query]);
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

/** Desktop layout (centered app column + side panels). */
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const useIsDesktop = () => useMediaQuery(DESKTOP_QUERY);
export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

/** Debounced copy of a value (e.g. search-as-you-type, 200–300 ms). */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

function subscribeOnline(cb: () => void) {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
}

/** Browser online status (`navigator.onLine`). */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Current time, re-rendering every `intervalMs` (relative times, «۵ دقیقه پیش», open/closed states). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Sets `document.title` to «{title} | Torob in the Loop» while mounted. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} | ${APP_NAME}` : `${APP_NAME} — دستیار خرید حضوری تهران`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}

/** Close on outside pointer-down / Escape (popovers, menus). */
export function useDismiss<T extends HTMLElement>(open: boolean, onDismiss: () => void) {
  const ref = useRef<T | null>(null);
  const latest = useRef(onDismiss);
  latest.current = onDismiss;
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) latest.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') latest.current();
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return ref;
}

/** Run once the browser is idle (prefetch lazy chunks without competing with first paint). */
export function onIdle(cb: () => void, timeoutMs = 2500): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (w.requestIdleCallback) {
    const id = w.requestIdleCallback(cb, { timeout: timeoutMs });
    return () => w.cancelIdleCallback?.(id);
  }
  const t = setTimeout(cb, 600);
  return () => clearTimeout(t);
}

/** On-screen keyboard heuristic: the visual viewport shrank by > 150 px (mobile browsers). */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const on = () => setOpen(window.innerHeight - vv.height > 150);
    vv.addEventListener('resize', on);
    return () => vv.removeEventListener('resize', on);
  }, []);
  return open;
}

/** 'down' after scrolling down past `threshold` px, 'up' when scrolling up (hide-on-scroll chrome). */
export function useScrollDirection(threshold = 72): 'up' | 'down' {
  const [dir, setDir] = useState<'up' | 'down'>('up');
  useEffect(() => {
    let last = window.scrollY;
    let ticking = false;
    const on = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (Math.abs(y - last) > 8) {
          setDir(y > last && y > threshold ? 'down' : 'up');
          last = y;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, [threshold]);
  return dir;
}
