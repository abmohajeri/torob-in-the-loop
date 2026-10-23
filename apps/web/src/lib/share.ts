export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

/** Copy text to the clipboard (async Clipboard API, falling back to a hidden textarea). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy path */
  }
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    ta.style.insetInlineStart = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Native share sheet when available, otherwise copy «text + url» to the clipboard. */
export async function shareOrCopy(data: ShareData): Promise<ShareResult> {
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (nav?.share && (!nav.canShare || nav.canShare(data))) {
    try {
      await nav.share(data);
      return 'shared';
    } catch (e) {
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      // otherwise fall back to copy
    }
  }
  const text = [data.title && !data.text ? data.title : data.text, data.url].filter(Boolean).join('\n');
  return (await copyText(text)) ? 'copied' : 'failed';
}

export const SHARE_TOAST: Record<ShareResult, string | null> = {
  shared: null,
  copied: 'پیوند کپی شد.',
  cancelled: null,
  failed: 'اشتراک‌گذاری ممکن نشد.',
};
