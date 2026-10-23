/**
 * Inquiry display metadata kept local to the inquiry components, so the UI stays correct even while the shared
 * constants are still catching up with new contract values (scheduled_at_open, callback_promised, registry, …).
 */
import {
  BadgeDollarSign,
  CalendarClock,
  CircleCheck,
  CircleSlash,
  Clock,
  CreditCard,
  Hand,
  Hourglass,
  Layers,
  MapPinned,
  MessageCircleQuestion,
  PackageCheck,
  PhoneCall,
  PhoneForwarded,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  Repeat2,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Ticket,
  Undo2,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeTone } from '../ui/Badge.js';
import type { Inquiry, InquiryQuestion, InquiryStatus } from '@titl/shared';

export interface QuestionMeta {
  label: string;
  ask: string;
  icon: LucideIcon;
}

export const QUESTION_META: Record<InquiryQuestion, QuestionMeta> = {
  stock: { label: 'موجودی', ask: 'این کالا الان موجود است؟', icon: PackageCheck },
  price: { label: 'قیمت امروز', ask: 'قیمت امروز چند است؟', icon: BadgeDollarSign },
  hours: { label: 'ساعت کاری امروز', ask: 'امروز تا چه ساعتی باز هستید؟', icon: Clock },
  hold: { label: 'نگه‌داشتن کالا', ask: 'می‌توانید کالا را تا رسیدن من نگه دارید؟', icon: Hand },
  installment: { label: 'قسطی / ترب‌پی', ask: 'امکان خرید قسطی یا ترب‌پی دارید؟', icon: CreditCard },
  kalabarg: { label: 'کالابرگ', ask: 'کالابرگ قبول می‌کنید؟', icon: Ticket },
  location: { label: 'نشانی دقیق', ask: 'دقیقاً کجای پاساژ هستید؟ طبقه و واحد؟', icon: MapPinned },
  warranty: { label: 'گارانتی', ask: 'گارانتی کالا چیست و چه مدت است؟', icon: ShieldCheck },
  variant: { label: 'سایز / رنگ / مدل', ask: 'همین مدل با سایز یا رنگ مورد نظر من موجود است؟', icon: Layers },
  registry: { label: 'رجیستری', ask: 'رجیستر شده و قابل فعال‌سازی است؟', icon: ScanLine },
  condition: { label: 'آکبند / اصل بودن', ask: 'آکبند و اصل است؟', icon: Sparkles },
  cash_vs_installment: { label: 'فرق نقد و قسط', ask: 'قیمت نقد و قسط چقدر فرق دارد؟', icon: Wallet },
  return_policy: { label: 'امکان تعویض', ask: 'امکان تعویض یا مرجوعی دارید؟', icon: Undo2 },
  custom: { label: 'سؤال دلخواه', ask: '', icon: MessageCircleQuestion },
};

export const questionMeta = (q: string): QuestionMeta =>
  (QUESTION_META as Record<string, QuestionMeta>)[q] ?? { label: q, ask: q, icon: MessageCircleQuestion };

export type InquiryPhase = 'live' | 'waiting' | 'done' | 'failed';

export interface StatusMeta {
  label: string;
  tone: BadgeTone;
  icon: LucideIcon;
  phase: InquiryPhase;
}

export const STATUS_META: Record<InquiryStatus, StatusMeta> = {
  queued: { label: 'در صف تماس', tone: 'info', icon: Hourglass, phase: 'live' },
  calling: { label: 'در حال شماره‌گیری…', tone: 'accent', icon: PhoneForwarded, phase: 'live' },
  in_call: { label: 'در حال گفتگو', tone: 'accent', icon: PhoneCall, phase: 'live' },
  answered: { label: 'پاسخ داد', tone: 'good', icon: PhoneIncoming, phase: 'live' },
  no_answer: { label: 'پاسخ نداد', tone: 'warn', icon: PhoneMissed, phase: 'waiting' },
  busy: { label: 'خط اشغال بود', tone: 'warn', icon: PhoneMissed, phase: 'waiting' },
  closed: { label: 'خارج از ساعت کاری', tone: 'warn', icon: PhoneOff, phase: 'waiting' },
  retry_scheduled: { label: 'تماس دوباره زمان‌بندی شد', tone: 'info', icon: Repeat2, phase: 'waiting' },
  awaiting_seller: { label: 'منتظر پاسخ فروشنده', tone: 'info', icon: Hourglass, phase: 'waiting' },
  scheduled_at_open: { label: 'تماس هنگام باز شدن', tone: 'info', icon: CalendarClock, phase: 'waiting' },
  callback_promised: { label: 'فروشنده قول تماس داد', tone: 'info', icon: CalendarClock, phase: 'waiting' },
  resolved: { label: 'پاسخ دریافت شد', tone: 'good', icon: CircleCheck, phase: 'done' },
  unreachable: { label: 'در دسترس نبود', tone: 'bad', icon: PhoneOff, phase: 'failed' },
  cancelled: { label: 'لغو شد', tone: 'neutral', icon: CircleSlash, phase: 'failed' },
};

export const statusMeta = (s: string): StatusMeta =>
  (STATUS_META as Record<string, StatusMeta>)[s] ?? { label: s, tone: 'neutral', icon: Hourglass, phase: 'waiting' };

export const isFinal = (i: Pick<Inquiry, 'status'>) => {
  const p = statusMeta(i.status).phase;
  return p === 'done' || p === 'failed';
};

export const SIMULATED_WHY =
  'شماره‌های دیتاست ترب نمایشی است. در نسخه واقعی همین گفتگو با تماس خودکار یا پیام در بله انجام می‌شود و فروشنده‌ها از صفحه فروشنده هم جواب می‌دهند.';
export const PRIVACY_LINE = 'این سؤال‌ها را از طرف شما می‌پرسم؛ نام و شماره شما گفته نمی‌شود.';
