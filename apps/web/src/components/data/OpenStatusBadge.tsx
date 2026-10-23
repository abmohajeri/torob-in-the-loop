import { CircleHelp, Clock3, DoorClosed, DoorOpen, Timer, type LucideIcon } from 'lucide-react';
import type { OpenState, OpenStatus } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { OPEN_STATE_TONE } from '../../lib/labels.js';

const ICON: Record<OpenState, LucideIcon> = {
  open: DoorOpen,
  closing_soon: Timer,
  opens_later_today: Clock3,
  closed: DoorClosed,
  unknown: CircleHelp,
};

export interface OpenStatusBadgeProps {
  status: OpenStatus;
  size?: 'sm' | 'md' | 'lg';
  /** Plain text + icon (no pill) for dense rows. */
  plain?: boolean;
  className?: string;
}

/** Open/closed at the visit time, with the server's Persian label («باز است تا ۱۹:۰۰», «ساعت کاری ثبت نشده»…). */
export function OpenStatusBadge({ status, size = 'md', plain, className }: OpenStatusBadgeProps) {
  const Icon = ICON[status.state];
  const tone = OPEN_STATE_TONE[status.state];
  if (plain) {
    const color =
      tone === 'good' ? 'text-good-ink' : tone === 'warn' ? 'text-warn-ink' : tone === 'bad' ? 'text-bad-ink' : tone === 'info' ? 'text-info-ink' : 'text-muted';
    return (
      <span className={`inline-flex items-center gap-1 text-meta font-medium ${color} ${className ?? ''}`}>
        <Icon aria-hidden className="size-4" />
        {status.label}
      </span>
    );
  }
  return (
    <Badge tone={tone} icon={Icon} size={size} variant={status.state === 'unknown' ? 'outline' : 'soft'} className={className}>
      {status.label}
    </Badge>
  );
}
