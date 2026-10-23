import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, BadgeCheck, Clock, CreditCard, Hand, MapPinned, MessageSquareText, PackageCheck, PackageMinus, PackageX, ShieldCheck, Ticket } from 'lucide-react';
import { formatPercent, formatToman, formatTomanShort, type Inquiry, type InquiryResult } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { Unknown } from '../data/Unknown.js';
import { formatClockish } from '../../lib/labels.js';
import { cn } from '../../lib/cn.js';

export const STOCK_RESULT = {
  in_stock: { label: 'موجود · تأییدشده', tone: 'good', icon: PackageCheck },
  limited: { label: 'موجودی محدود · تأییدشده', tone: 'warn', icon: PackageMinus },
  out_of_stock: { label: 'موجود نیست', tone: 'bad', icon: PackageX },
  unknown: { label: 'موجودی نامشخص', tone: 'neutral', icon: PackageMinus },
} as const;

const SOURCE_LABEL: Record<string, string> = {
  simulated_call: 'تأییدشده تلفنی (شبیه‌سازی)',
  seller_inbox: 'پاسخ مستقیم فروشنده',
  bale: 'پاسخ فروشنده در بله',
};

export function priceDeltaChip(pct: number | null | undefined): { text: string; tone: 'good' | 'warn' | 'neutral' } | null {
  if (pct === null || pct === undefined) return null;
  if (Math.abs(pct) < 0.5) return { text: 'همان قیمت ثبت‌شده', tone: 'neutral' };
  return pct > 0
    ? { text: `${formatPercent(Math.abs(pct), false)} گران‌تر از قیمت ثبت‌شده`, tone: 'warn' }
    : { text: `${formatPercent(Math.abs(pct), false)} ارزان‌تر از قیمت ثبت‌شده`, tone: 'good' };
}

/** Compact result chips for a board card: stock · price (Δ vs registered) · hold. */
export function ResultChips({ result, className }: { result: InquiryResult; className?: string }) {
  const s = STOCK_RESULT[result.stock];
  const delta = priceDeltaChip(result.priceDeltaPct);
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <Badge tone={s.tone} variant={result.stock === 'in_stock' ? 'solid' : 'soft'} icon={s.icon}>
        {s.label}
      </Badge>
      {result.price !== null ? (
        <Badge tone={delta?.tone === 'warn' ? 'accent' : 'neutral'} icon={delta ? (delta.tone === 'warn' ? ArrowUp : delta.tone === 'good' ? ArrowDown : undefined) : undefined}>
          <span className="num">{formatTomanShort(result.price)}</span>
          {delta && delta.tone !== 'neutral' ? <span className="num"> · {formatPercent(Math.abs(result.priceDeltaPct ?? 0), false)}</span> : null}
        </Badge>
      ) : null}
      {result.holdUntil ? (
        <Badge tone="verified" icon={Hand}>
          نگه می‌دارند تا <span className="num">{formatClockish(result.holdUntil)}</span>
        </Badge>
      ) : null}
    </div>
  );
}

function Row({ icon: Icon, label, children }: { icon: typeof Clock; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <Icon aria-hidden className="mt-0.5 size-[1.125rem] shrink-0 text-primary" />
      <dt className="w-24 shrink-0 text-meta text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-body text-ink">{children}</dd>
    </div>
  );
}

/** Full answer card: stock · price vs registered · hours · hold · installment · kalabarg · location · warranty · custom. */
export function InquiryResultView({ inquiry }: { inquiry: Inquiry }) {
  const r = inquiry.result;
  if (!r) return null;
  const s = STOCK_RESULT[r.stock];
  const registered = inquiry.registeredPrice?.price ?? null;
  const delta = priceDeltaChip(r.priceDeltaPct);
  const asked = new Set<string>(inquiry.questions);
  const unknown = <Unknown size="sm" label="فروشنده نگفت" />;
  return (
    <section aria-labelledby="inq-result" className="rounded-2xl border border-primary-200 bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="inq-result" className="text-title font-extrabold text-heading">
          نتیجه استعلام
        </h2>
        <Badge tone={inquiry.resultSource === 'seller_inbox' ? 'good' : 'verified'} icon={BadgeCheck}>
          {SOURCE_LABEL[inquiry.resultSource ?? inquiry.channel] ?? 'تأییدشده'}
        </Badge>
      </div>
      <p className="mt-2 text-body leading-7 text-ink">{r.summary}</p>
      <dl className="mt-2 divide-y divide-line-soft">
        <Row icon={s.icon} label="موجودی">
          <Badge tone={s.tone} icon={s.icon}>
            {s.label}
          </Badge>
        </Row>
        {asked.has('price') || r.price !== null ? (
          <Row icon={ArrowUp} label="قیمت امروز">
            {r.price !== null ? (
              <div className="flex flex-col gap-0.5">
                <span className="num text-title font-extrabold">{formatToman(r.price)}</span>
                {registered !== null ? (
                  <span className="text-meta text-muted">
                    قیمت ثبت‌شده در ترب: <s className="num">{formatToman(registered)}</s>
                  </span>
                ) : null}
                {delta ? <span className={cn('text-meta font-medium', delta.tone === 'warn' ? 'text-accent-ink' : delta.tone === 'good' ? 'text-good-ink' : 'text-muted')}>{delta.text}</span> : null}
              </div>
            ) : (
              unknown
            )}
          </Row>
        ) : null}
        {asked.has('hours') || r.hoursToday ? <Row icon={Clock} label="ساعت امروز">{r.hoursToday ? <span className="num">{r.hoursToday}</span> : unknown}</Row> : null}
        {asked.has('hold') || r.holdUntil ? (
          <Row icon={Hand} label="نگه‌داشتن">
            {r.holdUntil ? (
              <span>
                تا ساعت <span className="num font-bold">{formatClockish(r.holdUntil)}</span> نگه می‌دارند
              </span>
            ) : (
              unknown
            )}
          </Row>
        ) : null}
        {asked.has('installment') || r.installment ? (
          <Row icon={CreditCard} label="قسطی">
            {r.installment ? (
              <span>
                {r.installment.available ? `دارد${r.installment.providers.length ? ` (${r.installment.providers.join('، ')})` : ''}` : 'ندارد (طبق پاسخ فروشنده)'}
                {r.installment.note ? <span className="block text-meta text-muted">{r.installment.note}</span> : null}
              </span>
            ) : (
              unknown
            )}
          </Row>
        ) : null}
        {asked.has('kalabarg') ? (
          <Row icon={Ticket} label="کالابرگ">
            {r.kalabarg === null ? unknown : r.kalabarg ? 'قبول می‌کنند' : 'قبول نمی‌کنند (طبق پاسخ فروشنده)'}
          </Row>
        ) : null}
        {asked.has('location') || r.locationHint ? <Row icon={MapPinned} label="نشانی دقیق">{r.locationHint ?? unknown}</Row> : null}
        {asked.has('warranty') || r.warranty ? <Row icon={ShieldCheck} label="گارانتی">{r.warranty ?? unknown}</Row> : null}
        {inquiry.customQuestion ? (
          <Row icon={MessageSquareText} label="سؤال شما">
            <span className="block text-meta text-muted">{inquiry.customQuestion}</span>
            {r.answerToCustom ?? unknown}
          </Row>
        ) : null}
      </dl>
    </section>
  );
}
