import { useLayoutEffect, type RefObject } from 'react';

/**
 * While mounted, publishes the element's height as a CSS variable on <html> (e.g. `--cta-h`), so other fixed
 * layers (compare tray, toasts) and the page's bottom padding can stack above it without overlap.
 */
export function useCssVarHeight(ref: RefObject<HTMLElement | null>, name: `--${string}`, enabled = true): void {
  useLayoutEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    if (!enabled || !el) {
      root.style.removeProperty(name);
      return;
    }
    const set = () => root.style.setProperty(name, `${Math.ceil(el.getBoundingClientRect().height)}px`);
    set();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(set) : null;
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.style.removeProperty(name);
    };
  }, [ref, name, enabled]);
}
