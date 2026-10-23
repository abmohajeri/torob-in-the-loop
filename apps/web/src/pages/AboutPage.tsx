import { Bot, Boxes, Building2, CalendarDays, Database, FlaskConical, Map as MapIcon, ShieldCheck, Store, Tag, Users } from 'lucide-react';
import { APP_NAME, APP_TAGLINE, formatJalaliDate } from '@titl/shared';
import { PageHeader } from '../components/layout/PageHeader.js';
import { Card } from '../components/ui/Card.js';
import { SectionHeader } from '../components/ui/SectionHeader.js';
import { Badge } from '../components/ui/Badge.js';
import { Skeleton } from '../components/ui/Skeleton.js';
import { CompletenessBars, CoverageTable, RealVsDemo, StatTile, TrustLegend, type CoverageRow } from '../components/about/AboutSections.js';
import { useMeta } from '../lib/queries.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle } from '../lib/hooks.js';

const A07 = 'product_adfdc73bc839d15cd7754318';

/** Snapshot audit numbers (docs/DESIGN-REVIEW.md §4.1, verified against raw.db). */
const COMPLETENESS = [
  { label: 'ساعت کاری ثبت‌شده', pct: 69, note: '۴٬۴۷۱ از ۶٬۴۷۶ فروشگاه؛ بقیه «ساعت کاری ثبت نشده · بپرسیم؟»' },
  { label: 'طبقه در نشانی فروشگاه', pct: 65, note: '۴٬۲۲۴ نشانی «طبقه» دارند؛ ۲٬۳۸۰ «واحد».' },
  { label: 'مشخصات فنی کالا', pct: 64, note: '۸۱٬۳۰۴ کالا هیچ مشخصاتی ندارند.' },
  { label: 'برند ثبت‌شده', pct: 26, note: '۷۴٪ محصولات برند ثبت‌شده ندارند؛ برند را از مشخصات و عنوان حدس زده‌ایم و برچسب می‌زنیم.' },
  { label: 'ارسال فوری (بله یا خیر)', pct: 25, note: 'برای بقیه «نامشخص» است، نه «ندارد».' },
  { label: 'گارانتی ثبت‌شده', pct: 18 },
  { label: 'روش پرداخت ثبت‌شده', pct: 4, note: 'فقط ۲۶۶ فروشگاه؛ ۷۹ فروشگاه پرداخت حضوری را صریح اعلام کرده‌اند.' },
  { label: 'کالابرگ', pct: 0, note: 'هیچ رکوردی ندارد — نتایج را حذف نمی‌کنیم و همیشه از فروشنده می‌پرسیم.' },
];

const FACTS = [
  'قیمت‌ها تا ۲۱ مهر ۱۴۰۵ — سن قیمت نسبت به همین تاریخ سنجیده می‌شود.',
  '۲۱۱ قیمت غیرعادی (بالای ۱۰ میلیارد) و ۱٬۶۴۵ قیمت زیر ۱٬۰۰۰ تومان کنار گذاشته شد.',
  '۸۸۷ فروشگاه فقط دسته فعالیت دارند؛ با برچسب «ممکن است داشته باشند» نشان داده می‌شوند.',
  '۸۴٪ کالاها فقط یک فروشنده دارند؛ برای همین «فروشگاه‌های هم‌دسته» را هم پیشنهاد می‌دهیم.',
  'حدود ۱۰٪ فروشگاه‌های تهران، از مناطق منتخب (فردوسی، شیخ هادی، بهارستان و…).',
];

const COVERAGE: CoverageRow[] = [
  { group: 'چهار گام خرید', feature: 'انتخاب کالا وقتی مدل را نمی‌دانید', how: 'دستیار با چند سؤال کوتاه دامنه را تنگ می‌کند.', to: paths.assistant('کتونی می‌خوام ولی نمی‌دونم چه مدلی') },
  { group: 'چهار گام خرید', feature: 'پیدا کردن فروشنده حضوری', how: 'فروشنده‌ها، محله‌ها، نقشه و فروشگاه‌های هم‌دسته.', to: paths.productStores(A07) },
  { group: 'چهار گام خرید', feature: 'مقایسه فروشگاه‌ها', how: 'ارزان‌ترین، نزدیک‌ترین، دیرتر باز و امتیاز هوشمند.', to: paths.productStores(A07) },
  { group: 'چهار گام خرید', feature: 'هماهنگی و مراجعه', how: 'استعلام تلفنی (شبیه‌سازی)، برنامه بازدید و راهنمای داخل پاساژ.', to: paths.inquiries },
  { group: 'دردهای خرید حضوری', feature: 'قیمت ثبت‌شده قدیمی است', how: 'سن هر قیمت جدا از موجودی نشان داده می‌شود و «بپرس» قیمت امروز را می‌گیرد.', to: paths.product(A07) },
  { group: 'دردهای خرید حضوری', feature: 'رسیدم ولی بسته بود', how: 'باز بودن هنگام رسیدن، و دکمه «بسته بود» برای جایگزین در همان پاساژ.', to: paths.plan },
  { group: 'دردهای خرید حضوری', feature: 'مغازه را در پاساژ پیدا نمی‌کنم', how: 'طبقه و واحد، همسایه‌های همان طبقه و راهنمای طبقه‌به‌طبقه.', to: paths.shop('shop_d31ef83bf64457123dccc6f2') },
  { group: 'دردهای خرید حضوری', feature: 'فقط قسطی می‌خواهم', how: 'روش پرداخت با نوع اطلاعات: حضوری، نامشخص، یا در توضیحات فروشنده.', to: paths.assistant('گوشی سامسونگ قسطی نزدیک جمهوری') },
  { group: 'دردهای خرید حضوری', feature: 'فروشنده جواب نمی‌دهد', how: 'تماس دوباره زمان‌بندی‌شده و صندوق فروشنده.', to: paths.seller },
];

const REAL_VS_DEMO = [
  { topic: 'تماس با فروشگاه', demo: 'تماس شبیه‌سازی می‌شود؛ شماره‌های دیتاست نمایشی است و همه‌جا برچسب «نسخه نمایشی» دارد.', real: 'تماس خودکار صوتی یا پیام در بله؛ فروشنده از پنل فروشنده هم جواب می‌دهد.' },
  { topic: 'پاسخ فروشنده', demo: 'صفحه «پنل فروشنده» واقعاً کار می‌کند و پاسخ آن زنده به خریدار می‌رسد.', real: 'ورود فروشنده با حساب ترب و اعلان روی گوشی.' },
  { topic: 'موقعیت و زمان رسیدن', demo: 'فاصله خط مستقیم با ضریب مسیر و سرعت تخمینی.', real: 'مسیریابی و ترافیک لحظه‌ای از سرویس نقشه.' },
  { topic: 'نام فروشگاه‌ها', demo: 'بیشتر نام‌ها در داده‌های ترب ناشناس‌سازی شده است.', real: 'نام و تابلوی واقعی فروشگاه.' },
];

export default function AboutPage() {
  useDocumentTitle('درباره و شفافیت داده');
  const meta = useMeta();
  const c = meta.data?.catalog;
  return (
    <>
      <PageHeader title="درباره و شفافیت داده" subtitle="داده‌ها چقدر کامل است؟" />
      <div className="flex flex-col gap-6 px-4 pt-2">
        <Card padding="lg" tone="brand">
          <p className="text-headline font-extrabold text-heading">
            <bdi>{APP_NAME}</bdi>
          </p>
          <p className="mt-1 text-body text-ink-2">{APP_TAGLINE} — از انتخاب کالا تا جلوی در مغازه.</p>
          <p className="mt-3 flex items-center gap-2 text-meta text-primary-ink">
            <Users aria-hidden className="size-4" />
            ساخته‌شده در هکاتون ترب، تیم <bdi className="font-bold">Human in the Loop</bdi>
          </p>
          {meta.data ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={meta.data.features.llm ? 'good' : 'neutral'} icon={Bot}>
                {meta.data.features.llm ? 'دستیار: مدل زبانی فعال' : 'دستیار: حالت قواعد (بدون مدل زبانی)'}
              </Badge>
              {meta.data.clock?.demo ? (
                <Badge tone="accent" icon={FlaskConical}>
                  ساعت نمایشی فعال
                </Badge>
              ) : null}
            </div>
          ) : null}
        </Card>

        <section aria-labelledby="stats" className="flex flex-col gap-3">
          <SectionHeader id="stats" icon={Database} title="داده‌های پشت برنامه" subtitle="خروجی ترب از فروشگاه‌های حضوری تهران" />
          {c ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              <StatTile icon={Boxes} value={c.products} label="کالا" />
              <StatTile icon={Tag} value={c.offers} label="پیشنهاد قیمت" />
              <StatTile icon={Store} value={c.shops} label="فروشگاه" />
              <StatTile icon={ShieldCheck} value={c.shopsWithOffers} label="فروشگاه دارای کالا" />
              <StatTile icon={Building2} value={c.malls} label="پاساژ و مجتمع" />
              <StatTile icon={CalendarDays} value={formatJalaliDate(c.dataAsOf)} label="تاریخ داده‌ها" />
            </div>
          ) : (
            <Skeleton className="h-40 w-full rounded-2xl" />
          )}
        </section>

        <section aria-labelledby="complete" className="flex flex-col gap-3">
          <SectionHeader id="complete" icon={Database} title="داده‌ها چقدر کامل است؟" subtitle="سهم رکوردهایی که این اطلاعات را دارند" />
          <Card padding="md">
            <CompletenessBars items={COMPLETENESS} />
          </Card>
          <ul className="flex flex-col gap-1.5">
            {FACTS.map((f) => (
              <li key={f} className="flex items-start gap-2 text-meta leading-6 text-ink-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                {f}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="legend" className="flex flex-col gap-3">
          <SectionHeader id="legend" icon={ShieldCheck} title="این برچسب‌ها یعنی چه؟" />
          <Card padding="md">
            <TrustLegend />
          </Card>
        </section>

        <section aria-labelledby="sim" className="flex flex-col gap-3">
          <SectionHeader id="sim" icon={FlaskConical} title="چه چیزی شبیه‌سازی شده؟" subtitle="امروز در نسخه نمایشی، در برابر نسخه واقعی" />
          <RealVsDemo rows={REAL_VS_DEMO} />
        </section>

        <section id="coverage" aria-labelledby="cov" className="flex scroll-mt-20 flex-col gap-3">
          <SectionHeader id="cov" icon={MapIcon} title="هر نیاز کجا پاسخ داده شده؟" subtitle="روی هر ردیف بزنید و امتحان کنید" />
          <CoverageTable rows={COVERAGE} />
        </section>

        <Card as="section" padding="md" tone="muted" aria-label="منابع">
          <p className="text-meta leading-7 text-ink-2">
            داده کالا و فروشگاه: ترب · نقشه: ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="font-bold text-primary-strong underline-offset-4 hover:underline">
              مشارکت‌کنندگان OpenStreetMap
            </a>{' '}
            · قلم وزیرمتن · آیکون‌ها Lucide.
          </p>
          <p className="mt-1 text-caption text-muted">شماره تلفن‌های این مجموعه‌داده نمایشی است و هیچ تماسی با فروشگاه واقعی برقرار نمی‌شود.</p>
        </Card>
      </div>
    </>
  );
}
