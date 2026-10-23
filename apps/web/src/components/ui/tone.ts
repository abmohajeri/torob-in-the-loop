import { AlertTriangle, CircleCheck, CircleX, Info, type LucideIcon } from 'lucide-react';
import type { Tone } from '@titl/shared';

/** Badge/chip tones: the shared semantic `Tone` plus brand & neutral roles. */
export type BadgeTone = 'neutral' | 'primary' | 'accent' | 'verified' | Tone;

/** Soft (tinted) surfaces — text contrast ≥ 4.5:1 on every tint (see styles/index.css). */
export const TONE_SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-surface-2 text-ink-2 border-line',
  primary: 'bg-primary-tint text-primary-ink border-primary-200',
  accent: 'bg-accent-tint text-accent-ink border-accent-200',
  verified: 'bg-verified-tint text-verified border-verified-line',
  good: 'bg-good-tint text-good-ink border-good-line',
  info: 'bg-info-tint text-info-ink border-info-line',
  warn: 'bg-warn-tint text-warn-ink border-warn-line',
  bad: 'bg-bad-tint text-bad-ink border-bad-line',
};

export const TONE_SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-ink-2 text-white border-transparent',
  primary: 'bg-primary-strong text-white border-transparent',
  accent: 'bg-accent-strong text-white border-transparent',
  verified: 'bg-verified text-white border-transparent',
  good: 'bg-good-ink text-white border-transparent',
  info: 'bg-info-ink text-white border-transparent',
  warn: 'bg-warn-ink text-white border-transparent',
  bad: 'bg-bad-ink text-white border-transparent',
};

export const TONE_OUTLINE: Record<BadgeTone, string> = {
  neutral: 'bg-transparent text-ink-2 border-line',
  primary: 'bg-transparent text-primary-strong border-primary-200',
  accent: 'bg-transparent text-accent-strong border-accent-200',
  verified: 'bg-transparent text-verified border-verified-line',
  good: 'bg-transparent text-good-ink border-good-line',
  info: 'bg-transparent text-info-ink border-info-line',
  warn: 'bg-transparent text-warn-ink border-warn-line',
  bad: 'bg-transparent text-bad-ink border-bad-line',
};

/** Icon/text color only (inline status text). */
export const TONE_TEXT: Record<BadgeTone, string> = {
  neutral: 'text-muted',
  primary: 'text-primary-strong',
  accent: 'text-accent-strong',
  verified: 'text-verified',
  good: 'text-good-ink',
  info: 'text-info-ink',
  warn: 'text-warn-ink',
  bad: 'text-bad-ink',
};

/** Default icon per semantic tone (status is never conveyed by color alone). */
export const TONE_ICON: Record<Tone, LucideIcon> = {
  good: CircleCheck,
  info: Info,
  warn: AlertTriangle,
  bad: CircleX,
};
