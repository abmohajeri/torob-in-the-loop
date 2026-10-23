import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know our custom theme scales (styles/index.css), otherwise e.g. `text-meta`
 * (a font size) is mistaken for a text color and silently dropped when combined with `text-ink`.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'meta', 'body', 'title', 'headline', 'display'],
      shadow: ['card', 'raised', 'float', 'nav', 'header', 'sheet', 'glow', 'glow-accent'],
      animate: ['fade-in', 'rise-in', 'pop-in', 'slide-up', 'shimmer', 'live', 'flash', 'progress'],
      ease: ['snappy', 'out-soft'],
      radius: ['4xl'],
    },
  },
});

/** Compose class names (clsx) and resolve Tailwind conflicts (last one wins). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
