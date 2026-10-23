/**
 * Service worker registration (production only — see main.tsx). When a new version is waiting, offers a
 * one-tap refresh instead of silently reloading mid-task.
 */
import { toast } from 'sonner';

export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  const start = () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        const promptUpdate = (worker: ServiceWorker) => {
          toast.info('نسخه تازه‌ای از Torob in the Loop آماده است.', {
            id: 'sw-update',
            duration: Infinity,
            action: {
              label: 'به‌روزرسانی',
              onClick: () => worker.postMessage({ type: 'SKIP_WAITING' }),
            },
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(installing);
          });
        });
        // Check for updates when the app comes back to the foreground.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        });
      })
      .catch(() => {
        /* SW is progressive enhancement; ignore failures (e.g. private mode). */
      });

    // First install (clients.claim) also fires controllerchange — only reload when replacing an active worker.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}
