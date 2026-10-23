import { Link, useLocation } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { BellRing, MapPinned, MessageCircleMore, Route, Smartphone } from 'lucide-react';
import { EXAMPLE_QUERIES, formatNumber } from '@titl/shared';
import { Logo } from './Logo.js';
import { useMeta } from '../../lib/queries.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

const STEPS = [
  { icon: MessageCircleMore, title: 'بگویید چه می‌خواهید', body: 'به زبان خودتان؛ با بودجه، شرایط خرید و زمان مراجعه.' },
  { icon: MapPinned, title: 'نزدیک‌ترین فروشگاه‌ها', body: 'قیمت ثبت‌شده، تازگی داده، ساعت کاری و آدرس داخل پاساژ.' },
  { icon: BellRing, title: 'قبل از رفتن، می‌پرسیم', body: 'موجودی و قیمت روز را از فروشنده استعلام می‌کنیم.' },
  { icon: Route, title: 'یک مسیر، چند فروشگاه', body: 'برنامه بازدید با ترتیب بهینه و جایگزین آماده.' },
];

/**
 * Desktop (≥ 1024 px) companion panel beside the centered app column: product intro, 4-step explainer,
 * QR code to continue on a phone, and demo prompts.
 */
export function DesktopSidePanel({ className }: { className?: string }) {
  const { data: meta } = useMeta();
  const { pathname, search } = useLocation();
  const url = typeof window !== 'undefined' ? `${window.location.origin}${pathname}${search}` : '';
  const examples = (meta?.examples?.length ? meta.examples : EXAMPLE_QUERIES).slice(0, 3);

  return (
    <aside
      aria-label="معرفی Torob in the Loop"
      className={cn(
        'fixed inset-y-0 z-10 hidden overflow-y-auto scrollbar-none py-10 lg:block',
        'right-[calc(50%+var(--app-max)/2+3rem)] w-[min(24rem,calc(50%-var(--app-max)/2-5rem))]',
        className,
      )}
    >
      <div className="flex min-h-full flex-col justify-center gap-7">
        <div>
          <Logo size="lg" tagline />
          <p className="mt-4 text-body leading-8 text-ink-2">
            برای خرید حضوری در تهران، قبل از راه افتادن بدانید <strong className="text-heading">کجا</strong>،{' '}
            <strong className="text-heading">چند</strong> و <strong className="text-heading">کی</strong> بروید.
          </p>
          {meta ? (
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                { k: 'فروشگاه', v: meta.catalog.shopsWithOffers },
                { k: 'کالا', v: meta.catalog.products },
                { k: 'پیشنهاد قیمت', v: meta.catalog.offers },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl bg-surface/80 px-3 py-2.5 shadow-card">
                  <dt className="text-caption text-muted">{s.k}</dt>
                  <dd className="text-title font-extrabold text-primary-strong num">{formatNumber(s.v)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-surface text-primary-strong shadow-card">
                <s.icon aria-hidden className="size-5" />
                <span className="absolute -top-1.5 -start-1.5 grid size-5 place-items-center rounded-full bg-accent-strong text-[0.6875rem] font-bold text-white num">
                  {formatNumber(i + 1)}
                </span>
              </span>
              <div>
                <p className="text-body font-bold text-heading">{s.title}</p>
                <p className="text-meta text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-4 rounded-3xl bg-surface p-4 shadow-raised">
          <div className="rounded-2xl border border-line-soft bg-white p-2">
            <QRCodeSVG value={url || 'https://torob-in-the-loop.ir'} size={104} fgColor="#064e3b" level="M" aria-label="کد QR این صفحه" role="img" />
          </div>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-body font-bold text-heading">
              <Smartphone aria-hidden className="size-[1.125rem] text-primary" /> روی گوشی ادامه دهید
            </p>
            <p className="mt-1 text-meta text-muted">با دوربین گوشی اسکن کنید؛ Torob in the Loop برای استفاده در مسیر خرید طراحی شده است.</p>
          </div>
        </div>

        <div>
          <p className="mb-2 text-meta font-bold text-ink-2">امتحان کنید</p>
          <ul className="space-y-1.5">
            {examples.map((q) => (
              <li key={q}>
                <Link
                  to={paths.assistant(q)}
                  className="block rounded-xl px-3 py-2 text-meta text-primary-ink hover:bg-surface/80 focus-visible:outline-2 focus-visible:outline-primary"
                >
                  «{q}»
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
