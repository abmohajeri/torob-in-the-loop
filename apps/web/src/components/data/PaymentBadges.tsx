import { CreditCard, FileText, Store, Ticket, Truck, CircleHelp } from 'lucide-react';
import { PAYMENT_CHANNEL_LABEL, PROVIDERS, type PaymentInfo, type PaymentOption } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { InfoPopover } from '../ui/InfoPopover.js';
import { Unknown } from './Unknown.js';
import { CHANNEL_SHORT, TEXT_HINT_LABEL } from '../../lib/labels.js';
import { cn } from '../../lib/cn.js';

/** One provider + its information type: «ترب‌پی · پذیرش حضوری» vs «اسنپ‌پی · نحوه پذیرش نامشخص». */
export function PaymentOptionBadge({ option, size = 'md' }: { option: PaymentOption; size?: 'sm' | 'md' }) {
  const label = option.provider === 'other' ? option.label : PROVIDERS[option.provider].label;
  const inPerson = option.channel === 'in_person';
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center overflow-hidden rounded-full border',
        inPerson ? 'border-primary-200 bg-primary-tint' : 'border-line bg-surface-2',
        size === 'sm' ? 'h-6 text-caption' : 'h-7 text-caption',
      )}
      title={PAYMENT_CHANNEL_LABEL[option.channel]}
    >
      <span className={cn('inline-flex items-center gap-1 ps-2 pe-1.5 font-bold', inPerson ? 'text-primary-ink' : 'text-ink-2')}>
        <CreditCard aria-hidden className="size-3.5" />
        {label}
      </span>
      <span
        className={cn(
          'inline-flex h-full items-center gap-1 border-s px-2 font-medium',
          inPerson ? 'border-primary-200 text-primary-ink/85' : 'border-line border-dashed text-muted',
        )}
      >
        {inPerson ? <Store aria-hidden className="size-3" /> : <CircleHelp aria-hidden className="size-3" />}
        {CHANNEL_SHORT[option.channel]}
      </span>
    </span>
  );
}

export interface PaymentBadgesProps {
  payment: PaymentInfo;
  /** Max provider badges before «+N» (default all). */
  max?: number;
  /** Also show text-mined hints («قسطی — در توضیحات فروشنده»). Default true. */
  showHints?: boolean;
  /** Show fast-delivery tri-state (true → badge, null → nothing unless `showUnknown`). Default true. */
  showFastDelivery?: boolean;
  /** Show Kalabarg as explicit unknown with an ask action. */
  showKalabarg?: boolean;
  /** Render «اقساط: ثبت نشده» etc. when nothing is registered. */
  showUnknown?: boolean;
  onAsk?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Seller-declared payment options with their information type (structured Torob data), plus weaker text-mined hints
 * clearly labeled «در توضیحات فروشنده», fast delivery and Kalabarg (never registered → unknown + «بپرس»).
 */
export function PaymentBadges({
  payment,
  max,
  showHints = true,
  showFastDelivery = true,
  showKalabarg,
  showUnknown,
  onAsk,
  size = 'md',
  className,
}: PaymentBadgesProps) {
  const opts = payment.options;
  const shown = max !== undefined ? opts.slice(0, max) : opts;
  const extra = opts.length - shown.length;
  const hints = showHints ? payment.textHints.filter((h) => !(h === 'installment' && payment.installment)) : [];
  const nothing = opts.length === 0 && hints.length === 0;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {shown.map((o, i) => (
        <PaymentOptionBadge key={`${o.provider}-${o.label}-${i}`} option={o} size={size} />
      ))}
      {extra > 0 ? (
        <Badge tone="neutral" size={size === 'sm' ? 'sm' : 'md'}>
          +{new Intl.NumberFormat('fa-IR').format(extra)}
        </Badge>
      ) : null}
      {hints.map((h) => (
        <span key={h} className="inline-flex items-center gap-0.5">
          <Badge tone="neutral" variant="outline" icon={FileText} size={size === 'sm' ? 'sm' : 'md'}>
            {TEXT_HINT_LABEL[h]} · در توضیحات فروشنده
          </Badge>
          <InfoPopover label="منبع این اطلاعات" align="end">
            این مورد از متن توضیحات فروشنده استخراج شده و در اطلاعات ساختاریافته ترب ثبت نشده است؛ پیش از خرید از فروشنده بپرسید.
          </InfoPopover>
        </span>
      ))}
      {showFastDelivery && payment.fastDelivery === true ? (
        <Badge tone="info" icon={Truck} size={size === 'sm' ? 'sm' : 'md'}>
          ارسال فوری
        </Badge>
      ) : null}
      {showUnknown && nothing ? <Unknown label="روش اقساطی ثبت نشده" size="sm" inline onAsk={onAsk} /> : null}
      {showKalabarg ? (
        <span className="inline-flex items-center gap-1">
          <Ticket aria-hidden className="size-3.5 text-faint" />
          <Unknown label="کالابرگ: ثبت نشده" size="sm" inline onAsk={onAsk} />
        </span>
      ) : null}
    </div>
  );
}
