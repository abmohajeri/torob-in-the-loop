import { BadgeCheck, Hand, PackageCheck, PackageMinus, PackageX, CircleHelp, type LucideIcon } from 'lucide-react';
import { formatRelative, formatToman, type VerifiedInfo } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { STOCK_META, STOCK_UNVERIFIED_LABEL, VERIFIED_SOURCE_LABEL, formatClockish, priceDeltaLabel, priceDeltaTone } from '../../lib/labels.js';
import { TONE_TEXT } from '../ui/tone.js';
import { cn } from '../../lib/cn.js';

const STOCK_ICON: Record<VerifiedInfo['stock'], LucideIcon> = {
  in_stock: PackageCheck,
  limited: PackageMinus,
  out_of_stock: PackageX,
  unknown: CircleHelp,
};

/** Stock line: verified result, or the honest default «موجودی تأیید نشده». */
export function StockBadge({ verified, size = 'md', className }: { verified?: VerifiedInfo | null; size?: 'sm' | 'md'; className?: string }) {
  if (!verified || verified.stock === 'unknown') {
    return (
      <Badge tone="neutral" variant="outline" icon={CircleHelp} size={size} className={className}>
        {STOCK_UNVERIFIED_LABEL}
      </Badge>
    );
  }
  const meta = STOCK_META[verified.stock];
  return (
    <Badge tone={meta.tone} icon={STOCK_ICON[verified.stock]} size={size} className={className}>
      {meta.label}
    </Badge>
  );
}

export interface VerifiedBadgeProps {
  info: VerifiedInfo;
  /** compact = single pill «قیمت تأییدشده ۲٫۶ میلیون · ۱۰ دقیقه پیش»; full = panel with stock/hold/source. */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Information confirmed by an inquiry (simulated call / seller inbox). Visually distinct (sky-blue, BadgeCheck)
 * from the registered price — it is rendered NEXT TO a PriceTag, never merged into it.
 */
export function VerifiedBadge({ info, variant = 'full', className }: VerifiedBadgeProps) {
  const source = VERIFIED_SOURCE_LABEL[info.source];
  const when = formatRelative(info.at);
  if (variant === 'compact') {
    return (
      <Badge tone="verified" icon={BadgeCheck} className={className}>
        {info.price !== null ? `قیمت تأییدشده ${formatToman(info.price)}` : STOCK_META[info.stock].label} · {when}
      </Badge>
    );
  }
  const delta = priceDeltaLabel(info.priceDeltaPct);
  return (
    <div className={cn('rounded-xl border border-verified-line/70 bg-verified-tint px-3 py-2', className)}>
      <div className="flex items-center gap-1.5 text-caption font-bold text-verified">
        <BadgeCheck aria-hidden className="size-4" />
        <span>تأیید شده</span>
        <span className="font-medium text-verified/85">
          · {source} · {when}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {info.price !== null ? (
          <span className="num text-body font-extrabold text-ink">
            {formatToman(info.price)}
            {delta ? <span className={cn('ms-1.5 text-caption font-bold', TONE_TEXT[priceDeltaTone(info.priceDeltaPct)])}>{delta}</span> : null}
          </span>
        ) : null}
        <StockBadge verified={info} size="sm" />
        {info.holdUntil ? (
          <Badge tone="good" icon={Hand} size="sm">
            نگه می‌دارد تا {formatClockish(info.holdUntil)}
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
