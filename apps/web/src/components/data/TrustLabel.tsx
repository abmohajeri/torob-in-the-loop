import { useState } from 'react';
import { BadgeCheck, CircleHelp, Clock3, Info, MessageCircleQuestion, Tag } from 'lucide-react';
import { formatNumber, formatRelative, formatTimeOfDay, formatTomanShort, type StoreOffer } from '@titl/shared';
import { Sheet } from '../ui/Sheet.js';
import { priceDeltaLabel } from '../../lib/labels.js';
import { cn } from '../../lib/cn.js';

/**
 * W7 trust language — three SHAPES, never color alone:
 *   verified   → solid fill + BadgeCheck («تأییدشده تلفنی ۱۰:۴۲»)
 *   registered → outline + Clock («ثبت‌شده ۹ روز پیش»)
 *   unknown    → dashed + question mark, always paired with «بپرس»
 */
export type TrustKind = 'verified' | 'registered' | 'unknown';

const SHAPE: Record<TrustKind, string> = {
  verified: 'border border-transparent bg-verified text-white',
  registered: 'border border-line bg-surface text-ink-2',
  unknown: 'border border-dashed border-faint bg-surface text-muted',
};
const ICON = { verified: BadgeCheck, registered: Clock3, unknown: CircleHelp } as const;

export function TrustLabel({ kind, children, className }: { kind: TrustKind; children: React.ReactNode; className?: string }) {
  const Icon = ICON[kind];
  return (
    <span className={cn('inline-flex h-6 max-w-full items-center gap-1 rounded-full px-2 text-caption font-medium whitespace-nowrap', SHAPE[kind], className)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

/** «۳ مورد نامشخص · بپرسیم؟» — combines all unknowns into one tappable chip. */
export function UnknownsChip({ items, onAsk, className }: { items: string[]; onAsk?: () => void; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'hit-44 inline-flex h-7 items-center gap-1 rounded-full border border-dashed border-faint bg-surface px-2.5 text-caption font-medium text-ink-2 press hover:border-primary hover:text-primary-strong',
          className,
        )}
      >
        <CircleHelp aria-hidden className="size-3.5" />
        {formatNumber(items.length)} مورد نامشخص · بپرسیم؟
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="این موارد در داده‌ها ثبت نشده" icon={CircleHelp} description="ثبت نشدن یعنی «نمی‌دانیم»، نه «ندارد». می‌توانیم از فروشگاه بپرسیم.">
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it} className="flex items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2.5 text-body text-ink-2">
              <CircleHelp aria-hidden className="size-4 text-muted" />
              {it}
            </li>
          ))}
        </ul>
        {onAsk ? (
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onAsk();
            }}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-accent-strong font-bold text-white press"
          >
            <MessageCircleQuestion aria-hidden className="size-5" /> همه را از فروشگاه بپرس
          </button>
        ) : null}
      </Sheet>
    </>
  );
}

/** Unknown facts of one offer (stock is unverified by default; Kalabarg is never registered). */
export function offerUnknowns(o: StoreOffer, opts: { kalabarg?: boolean } = {}): string[] {
  const out: string[] = [];
  if (!o.verified) out.push('موجودی: تأیید نشده');
  if (o.price.status !== 'ok') out.push('قیمت روز');
  if (o.shop.openStatus.state === 'unknown') out.push('ساعت کاری');
  if (!o.shop.payment.installment && !o.shop.payment.textHints.includes('installment')) out.push('امکان خرید قسطی');
  if (!o.warranty) out.push('گارانتی');
  if (opts.kalabarg) out.push('کالابرگ');
  return out;
}

/** One-line trust summary for an offer's price: verified beats registered; registered shows its age. */
export function PriceTrustLine({ offer, className }: { offer: StoreOffer; className?: string }) {
  const v = offer.verified;
  const p = offer.price;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      {v && v.price ? (
        <>
          {p.price ? (
            <span className="num text-caption text-muted">
              <span className="line-through">{formatTomanShort(p.price)}</span> ثبت‌شده {p.changedAt ? formatRelative(p.changedAt) : ''}
            </span>
          ) : null}
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="num text-title font-extrabold text-ink">{formatTomanShort(v.price)}</span>
            <TrustLabel kind="verified">
              تأییدشده {v.source === 'seller_inbox' ? 'توسط فروشنده' : 'تلفنی'} {formatTimeOfDay(v.at)}
              {priceDeltaLabel(v.priceDeltaPct) ? ` (${priceDeltaLabel(v.priceDeltaPct)})` : ''}
            </TrustLabel>
          </span>
          {v.stock === 'in_stock' ? (
            <span className="text-caption font-medium text-good-ink">موجود{v.holdUntil ? ` — نگه‌داری تا ${v.holdUntil}` : ''}</span>
          ) : null}
        </>
      ) : p.status === 'ok' && p.price ? (
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="num text-title font-extrabold text-ink">{formatTomanShort(p.price)}</span>
          <TrustLabel kind="registered">ثبت‌شده {p.changedAt ? formatRelative(p.changedAt) : 'بدون تاریخ'}</TrustLabel>
        </span>
      ) : (
        <TrustLabel kind="unknown">{p.status === 'suspicious' ? 'قیمت غیرعادی ثبت شده' : 'قیمت ثبت نشده'}</TrustLabel>
      )}
    </div>
  );
}

const TITLE_TAGS: [RegExp, string][] = [
  [/طرح|غیر ?اصل|کپی|های ?کپی/, 'طرح (غیراصل)'],
  [/کارکرده|دست ?دوم/, 'کارکرده'],
  [/استوک/, 'استوک'],
  [/نات ?اکتیو|not ?active/i, 'نات‌اکتیو'],
  [/رجیستر/, 'رجیستر شده'],
  [/همراه شارژر|با شارژر/, 'همراه شارژر'],
];

/** Offer flags parsed from seller-written titles, labelled «طبق عنوان فروشنده». */
export function titleTags(titles: string[]): string[] {
  const joined = titles.join(' | ');
  return TITLE_TAGS.filter(([re]) => re.test(joined)).map(([, l]) => l);
}

export function SellerTitleTags({ titles, className }: { titles: string[]; className?: string }) {
  const tags = titleTags(titles);
  if (!tags.length) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span className="text-caption text-muted">طبق عنوان فروشنده:</span>
      {tags.map((t) => (
        <span key={t} className="inline-flex h-6 items-center gap-1 rounded-full border border-warn-line bg-warn-tint px-2 text-caption font-medium text-warn-ink">
          <Tag aria-hidden className="size-3" />
          {t}
        </span>
      ))}
    </div>
  );
}

/** «این برچسب‌ها یعنی چه؟» — tap sheet (no hover tooltips). */
export function TrustLegendButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn('hit-44 inline-flex items-center gap-1 text-caption font-medium text-primary-strong underline-offset-4 hover:underline', className)}>
        <Info aria-hidden className="size-3.5" />
        این برچسب‌ها یعنی چه؟
      </button>
      <Sheet open={open} onOpenChange={setOpen} title="این برچسب‌ها یعنی چه؟" icon={Info}>
        <ul className="space-y-4 text-body text-ink-2">
          <li className="space-y-1.5">
            <TrustLabel kind="verified">تأییدشده تلفنی ۱۰:۴۲</TrustLabel>
            <p>همین امروز با تماس یا پاسخ خود فروشنده تأیید شده است. فقط این برچسب سبز/آبی پررنگ است.</p>
          </li>
          <li className="space-y-1.5">
            <TrustLabel kind="registered">ثبت‌شده ۹ روز پیش</TrustLabel>
            <p>فروشنده این را در ترب ثبت کرده؛ ممکن است تغییر کرده باشد. سن اطلاعات همیشه کنارش نوشته می‌شود.</p>
          </li>
          <li className="space-y-1.5">
            <TrustLabel kind="unknown">نامشخص</TrustLabel>
            <p>در داده‌ها ثبت نشده — یعنی نمی‌دانیم، نه اینکه ندارد. با «بپرس» از فروشگاه می‌پرسیم.</p>
          </li>
        </ul>
      </Sheet>
    </>
  );
}
