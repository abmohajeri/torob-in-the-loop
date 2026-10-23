import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Send } from 'lucide-react';
import { formatRelative, formatTimeOfDay, formatToman, toPersianDigits, type Inquiry, type SellerReplyRequest } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { Button } from '../ui/Button.js';
import { TextField } from '../ui/TextField.js';
import { api, errorMessage } from '../../lib/api.js';
import { qk } from '../../lib/queryKeys.js';
import { formatInputNumber, parseLocaleNumber } from '../../lib/numbers.js';
import { cn } from '../../lib/cn.js';
import { questionMeta, statusMeta } from '../inquiry/meta.js';

function Choice({ selected, onClick, children, tone = 'primary' }: { selected: boolean; onClick: () => void; children: ReactNode; tone?: 'primary' | 'bad' }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'h-11 cursor-pointer rounded-xl border px-3.5 text-body font-bold press transition-colors focus-visible:outline-2 focus-visible:outline-primary',
        selected ? (tone === 'bad' ? 'border-bad bg-bad-tint text-bad-ink' : 'border-primary-strong bg-primary-strong text-white') : 'border-line bg-surface text-ink hover:border-primary-200',
      )}
    >
      {children}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-meta font-bold text-ink-2">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

/** One buyer question for a seller with ONE-TAP replies (≥44 px): stock · price · hold · installment · kalabarg. */
export function SellerInquiryCard({ inquiry: i, shopId }: { inquiry: Inquiry; shopId: string }) {
  const qc = useQueryClient();
  const asked = new Set<string>(i.questions);
  const answered = !!i.result && i.resultSource === 'seller_inbox';
  const [stock, setStock] = useState<SellerReplyRequest['stock'] | null>(null);
  const [priceMode, setPriceMode] = useState<'same' | 'new' | null>(null);
  const [price, setPrice] = useState('');
  const [hold, setHold] = useState<string | null | 'no'>(null);
  const [inst, setInst] = useState<boolean | null>(null);
  const [kala, setKala] = useState<boolean | null>(null);
  const registered = i.registeredPrice?.price ?? null;
  const newPrice = parseLocaleNumber(price);

  const send = useMutation({
    mutationFn: () => {
      const body: SellerReplyRequest = { stock: stock!, publish: true };
      if (priceMode === 'same') {
        body.samePrice = true;
        if (registered !== null) body.price = registered;
      }
      if (priceMode === 'new' && newPrice) body.price = newPrice;
      if (hold && hold !== 'no') body.holdUntil = hold;
      if (inst !== null) body.installment = inst;
      if (kala !== null) body.kalabarg = kala;
      if (hold === 'no') body.note = 'کالا را نگه نمی‌داریم';
      return api.sellerReply(shopId, i.id, body);
    },
    onSuccess: (inq) => {
      qc.setQueryData<{ inquiries: Inquiry[] }>(qk.sellerInquiries(shopId), (old) => (old ? { inquiries: old.inquiries.map((x) => (x.id === i.id ? (inq ?? x) : x)) } : old));
      void qc.invalidateQueries({ queryKey: qk.sellerInquiries(shopId) });
      toast.success('پاسخ برای مشتری ارسال شد.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const valid = !!stock && (priceMode !== 'new' || !!newPrice);
  const sm = statusMeta(i.status);

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-line/80 bg-surface p-4 shadow-card">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-extrabold leading-7 text-ink">{i.product?.title ?? 'پرسش عمومی'}</h3>
          <p className="text-caption text-muted">
            {formatRelative(i.createdAt)} · ساعت <span className="num">{formatTimeOfDay(i.createdAt)}</span>
          </p>
        </div>
        <Badge tone={answered ? 'good' : sm.tone} icon={answered ? CheckCircle2 : Clock} size="sm">
          {answered ? 'پاسخ داده شد' : 'منتظر پاسخ شما'}
        </Badge>
      </header>
      {registered !== null ? (
        <p className="rounded-xl bg-surface-2 px-3 py-2 text-meta text-ink-2">
          قیمت ثبت‌شده شما: <b className="num text-ink">{formatToman(registered)}</b>
          {i.registeredPrice?.changedAt ? <span className="text-muted"> · {formatRelative(i.registeredPrice.changedAt)}</span> : null}
        </p>
      ) : null}
      <ul className="flex flex-wrap gap-1.5" aria-label="سؤال‌های مشتری">
        {i.questions.map((q) => {
          const m = questionMeta(q);
          return (
            <li key={q} className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-tint px-2.5 text-caption font-medium text-accent-ink">
              <m.icon aria-hidden className="size-3.5" />
              {q === 'custom' && i.customQuestion ? i.customQuestion : m.label}
            </li>
          );
        })}
      </ul>

      {answered ? (
        <p className="flex items-start gap-2 rounded-xl bg-primary-tint px-3 py-2.5 text-meta leading-6 text-primary-ink">
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          {i.result!.summary || 'پاسخ شما ثبت شد.'} این پاسخ تا ۲۴ ساعت با برچسب «پاسخ مستقیم فروشنده» به خریداران نشان داده می‌شود.
        </p>
      ) : (
        <>
          <Group label="موجودی">
            <Choice selected={stock === 'in_stock'} onClick={() => setStock('in_stock')}>
              موجود است
            </Choice>
            <Choice selected={stock === 'limited'} onClick={() => setStock('limited')}>
              موجودی محدود
            </Choice>
            <Choice selected={stock === 'out_of_stock'} onClick={() => setStock('out_of_stock')} tone="bad">
              تمام شده
            </Choice>
          </Group>
          {stock !== 'out_of_stock' && (asked.has('price') || registered !== null) ? (
            <Group label="قیمت">
              {registered !== null ? (
                <Choice selected={priceMode === 'same'} onClick={() => setPriceMode('same')}>
                  همان قیمت
                </Choice>
              ) : null}
              <Choice selected={priceMode === 'new'} onClick={() => setPriceMode('new')}>
                قیمت جدید…
              </Choice>
              {priceMode === 'new' ? (
                <TextField
                  label="قیمت جدید (تومان)"
                  inputMode="numeric"
                  autoFocus
                  value={price}
                  onChange={(e) => setPrice(formatInputNumber(parseLocaleNumber(e.target.value)))}
                  containerClassName="w-full"
                  hint={newPrice ? formatToman(newPrice) : 'ارقام فارسی یا انگلیسی'}
                />
              ) : null}
            </Group>
          ) : null}
          {stock !== 'out_of_stock' && asked.has('hold') ? (
            <Group label="نگه‌داشتن کالا برای مشتری">
              {['17:00', '18:00', '19:00'].map((h) => (
                <Choice key={h} selected={hold === h} onClick={() => setHold(h)}>
                  تا <span className="num">{toPersianDigits(h.slice(0, 2))}</span>
                </Choice>
              ))}
              <Choice selected={hold === 'no'} onClick={() => setHold('no')}>
                نگه نمی‌داریم
              </Choice>
            </Group>
          ) : null}
          {asked.has('installment') ? (
            <Group label="خرید قسطی">
              <Choice selected={inst === true} onClick={() => setInst(true)}>
                داریم
              </Choice>
              <Choice selected={inst === false} onClick={() => setInst(false)}>
                نداریم
              </Choice>
            </Group>
          ) : null}
          {asked.has('kalabarg') ? (
            <Group label="کالابرگ">
              <Choice selected={kala === true} onClick={() => setKala(true)}>
                قبول می‌کنیم
              </Choice>
              <Choice selected={kala === false} onClick={() => setKala(false)}>
                قبول نمی‌کنیم
              </Choice>
            </Group>
          ) : null}
          <Button size="lg" fullWidth startIcon={Send} disabled={!valid} loading={send.isPending} onClick={() => send.mutate()}>
            ارسال پاسخ
          </Button>
          {i.registeredPrice?.ageDays && i.registeredPrice.ageDays > 7 ? (
            <p className="text-caption leading-5 text-muted">
              قیمت شما در ترب {i.registeredPrice.ageDays.toLocaleString('fa-IR')} روز است به‌روز نشده؛ این پاسخ تا ۲۴ ساعت به‌عنوان قیمت تأییدشده نمایش داده می‌شود.
            </p>
          ) : null}
        </>
      )}
    </article>
  );
}
