/**
 * CT1 follow-up digest: a rules composer that turns a settled batch into one assistant chat message.
 * «نتیجه پیگیری ۳ فروشگاه:\n• …\nپیشنهاد من: …»
 */
import type { Inquiry } from '@titl/shared';
import { formatClock, formatNumber, formatTomanShort } from '@titl/shared';
import { dayClock, deltaText, stockText } from './templates.js';
import { hashSeed } from './prng.js';

const fa = (n: number) => formatNumber(n);

export interface Digest {
  text: string;
  quickReplies: { label: string; message: string }[];
  /** Stable hash of the facts (not the wording of times) to avoid duplicate digests. */
  hash: string;
}

function altCount(i: Inquiry): { k: number; samePassage: boolean } {
  const a = i.alternatives;
  if (!a) return { k: 0, samePassage: false };
  if (a.samePassage.length) return { k: a.samePassage.length, samePassage: true };
  return { k: a.sameProduct.length + a.similarProducts.length, samePassage: false };
}

function lineFor(i: Inquiry, now: Date): string {
  const name = i.shop.name;
  const r = i.result;
  const nextAt = i.nextAttemptAt ? new Date(i.nextAttemptAt) : null;
  const shopperNow = now; // nextAttemptAt is already in the shopper clock
  switch (i.status) {
    case 'resolved': {
      if (!r) return `• ${name}: پاسخ گرفته شد`;
      const src = i.resultSource === 'seller_inbox' ? ' (پاسخ مستقیم فروشنده)' : '';
      if (r.stock === 'out_of_stock') {
        const { k, samePassage } = altCount(i);
        return `• ${name}${src}: تمام کرده بود${k ? `؛ ${fa(k)} جایگزین${samePassage ? ' در همین پاساژ' : ''} پیدا کردم` : ''}`;
      }
      const parts: string[] = [stockText(r.stock)];
      if (r.price !== null) {
        const d = deltaText(r.priceDeltaPct);
        parts.push(d ? `${formatTomanShort(r.price, false)} (${d})` : formatTomanShort(r.price, false));
      }
      let s = `• ${name}${src}: ${parts.join('، ')}`;
      if (r.overBudget) {
        const { k } = altCount(i);
        s += ` — بیش از بودجهٔ شما${k ? `؛ ${fa(k)} گزینهٔ دیگر پیدا کردم` : ''}`;
      } else if (r.holdUntil) s += ` — تا ${formatClock(r.holdUntil)} نگه می‌دارد`;
      return s;
    }
    case 'retry_scheduled':
      return `• ${name}: جواب نداد؛ ${nextAt ? dayClock(nextAt, shopperNow) : 'کمی بعد'} دوباره تماس می‌گیرم`;
    case 'scheduled_at_open':
      return `• ${name}: الان بسته است؛ تماس ${nextAt ? dayClock(nextAt, shopperNow) : 'در اولین ساعت کاری'} انجام می‌شود`;
    case 'callback_promised':
      return `• ${name}: گفت خودش خبر می‌دهد؛ اگر نشد ${nextAt ? dayClock(nextAt, shopperNow) : 'بعداً'} دوباره تماس می‌گیرم`;
    case 'unreachable': {
      const { k, samePassage } = altCount(i);
      return `• ${name}: در دسترس نبود${k ? `؛ ${fa(k)} جایگزین${samePassage ? ' در همین پاساژ' : ''} پیدا کردم` : ''}`;
    }
    case 'awaiting_seller':
      return `• ${name}: منتظر پاسخ فروشنده`;
    case 'cancelled':
      return `• ${name}: لغو شد`;
    default:
      return `• ${name}: در حال پیگیری`;
  }
}

export function composeDigest(items: Inquiry[], opts: { update: boolean; now: Date }): Digest {
  const list = [...items].sort((a, b) => (a.batchIndex ?? 0) - (b.batchIndex ?? 0));
  const n = list.length;
  const header = opts.update ? `به‌روزرسانی پیگیری ${fa(n)} فروشگاه:` : `نتیجه پیگیری ${fa(n)} فروشگاه:`;
  const lines = list.map((i) => lineFor(i, opts.now));

  const good = list.filter(
    (i) => i.status === 'resolved' && i.result && i.result.stock !== 'out_of_stock' && i.result.stock !== 'unknown' && i.result.price !== null && !i.result.overBudget,
  );
  // Seller-inbox answers rank above simulated ones at equal price.
  good.sort(
    (a, b) =>
      a.result!.price! - b.result!.price! ||
      (a.resultSource === 'seller_inbox' ? -1 : 0) - (b.resultSource === 'seller_inbox' ? -1 : 0) ||
      (a.shop.etaMin ?? 999) - (b.shop.etaMin ?? 999),
  );
  const best = good[0] ?? null;
  let rec: string;
  if (best) {
    const why = good.length > 1 ? 'ارزان‌ترین گزینهٔ تأییدشده' : 'تنها گزینهٔ تأییدشدهٔ موجود';
    const eta = best.shop.etaMin != null ? ` و حدود ${fa(Math.round(best.shop.etaMin))} دقیقه تا شما` : '';
    const hold = best.result!.holdUntil ? `؛ تا ${formatClock(best.result!.holdUntil)} نگه می‌دارد` : '';
    rec = `پیشنهاد من: ${best.shop.name} — ${why}${eta}${hold}.`;
  } else if (list.some((i) => ['retry_scheduled', 'scheduled_at_open', 'callback_promised'].includes(i.status))) {
    rec = 'هنوز گزینهٔ تأییدشده‌ای ندارم؛ پیگیری ادامه دارد و نتیجه را همین‌جا خبر می‌دهم.';
  } else {
    rec = 'گزینهٔ تأییدشدهٔ موجودی پیدا نشد؛ جایگزین‌ها را ببینید یا از فروشگاه‌های دیگر بپرسیم.';
  }
  const simulated = list.some((i) => i.simulated && i.resultSource !== 'seller_inbox');
  const footer = simulated ? '(تماس‌ها شبیه‌سازی‌شده‌اند · نسخه نمایشی)' : '';
  const text = [header, ...lines, rec, footer].filter(Boolean).join('\n');

  const quickReplies: { label: string; message: string }[] = [];
  if (best) {
    const m = `برنامهٔ رفتن به ${best.shop.name} را بچین`;
    quickReplies.push({ label: m, message: m });
  }
  if (list.some((i) => i.alternatives && (i.alternatives.sameProduct.length || i.alternatives.samePassage.length)))
    quickReplies.push({ label: 'از جایگزین‌ها هم بپرس', message: 'از جایگزین‌ها هم بپرس' });
  if (list.some((i) => i.status === 'retry_scheduled' || i.status === 'callback_promised'))
    quickReplies.push({ label: 'منتظر تماس دوم بمان', message: 'منتظر تماس دوم بمان' });
  if (list.some((i) => i.status === 'scheduled_at_open'))
    quickReplies.push({ label: 'فروشگاه باز دیگری پیدا کن', message: 'یک فروشگاه باز دیگر که همین کالا را دارد پیدا کن' });

  const factKey = list.map((i) => `${i.id}:${i.status}:${i.result?.summary ?? ''}:${i.resultSource ?? ''}`).join('|');
  return { text, quickReplies, hash: String(hashSeed(factKey)) };
}

export function composeFirstMiss(shopName: string, when: string): string {
  return `${shopName} جواب نداد؛ ${when} دوباره تماس می‌گیرم. بقیهٔ تماس‌ها در جریان است.`;
}
