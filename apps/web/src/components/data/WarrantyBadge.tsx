import { BadgeCheck, Repeat2, ShieldCheck, ShieldOff, ShieldQuestion, ScanEye, Shield, type LucideIcon } from 'lucide-react';
import type { WarrantyInfo } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { WARRANTY_TONE } from '../../lib/labels.js';

const ICON: Record<WarrantyInfo['kind'], LucideIcon> = {
  company: ShieldCheck,
  test_delivery: ScanEye,
  authenticity: BadgeCheck,
  exchange: Repeat2,
  none: ShieldOff,
  other: Shield,
};

export interface WarrantyBadgeProps {
  warranty: WarrantyInfo | null;
  /** Render «گارانتی ثبت نشده» for null (default true). */
  showUnknown?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

/** Warranty as registered by the seller («۱۸ ماه گارانتی شرکتی», «تست و تحویل در حضور مشتری»…). */
export function WarrantyBadge({ warranty, showUnknown = true, size = 'md', className }: WarrantyBadgeProps) {
  if (!warranty) {
    if (!showUnknown) return null;
    return (
      <Badge tone="neutral" variant="outline" icon={ShieldQuestion} size={size} className={className}>
        گارانتی ثبت نشده
      </Badge>
    );
  }
  return (
    <Badge tone={WARRANTY_TONE[warranty.kind]} icon={ICON[warranty.kind]} size={size} className={className}>
      {warranty.label}
    </Badge>
  );
}
