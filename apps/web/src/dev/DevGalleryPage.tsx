/**
 * /_dev — living component gallery with real-dataset samples (src/dev/fixtures.ts). Used for visual QA screenshots
 * and as a reference for page engineers.
 */
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeftRight,
  Bell,
  CalendarClock,
  ChevronLeft,
  CreditCard,
  Heart,
  MapPin,
  MessageCircleMore,
  PhoneCall,
  Plus,
  Route,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
} from 'lucide-react';
import { formatTomanShort } from '@titl/shared';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  InfoPopover,
  RemovableChip,
  SectionHeader,
  Segmented,
  Skeleton,
  SkeletonText,
  Spinner,
  StepList,
  Stepper,
  Switch,
  Tabs,
  TextField,
  ToggleRow,
} from '../components/ui/index.js';
import {
  DATA_NOTES,
  DataNote,
  DistanceEta,
  FreshnessBadge,
  InMallGuide,
  OpenStatusBadge,
  PaymentBadges,
  PriceTag,
  ReasonChips,
  StockBadge,
  Unknown,
  VerifiedBadge,
  WarrantyBadge,
} from '../components/data/index.js';
import { ProductCard, ProductCardSkeleton, ProductGrid } from '../components/product/index.js';
import { StoreOfferCard, StoreOfferCardSkeleton } from '../components/store/index.js';
import { ContextBar } from '../components/layout/ContextBar.js';
import { Header } from '../components/layout/Header.js';
import { PageHeader } from '../components/layout/PageHeader.js';
import { ComingSoon } from '../components/layout/ComingSoon.js';
import { LazyMap, type MapMarker } from '../components/map/LazyMap.js';
import { ApiError } from '../lib/api-error.js';
import { useUi, type ContextSheetId } from '../state/useUi.js';
import { useDocumentTitle } from '../lib/hooks.js';
import {
  LOC_CHARSOO_C21,
  LOC_LOW,
  OFFER_BEST,
  OFFER_CLOSED,
  OFFER_CLOSING,
  OFFER_MISSING_PRICE,
  OFFER_STALE,
  OFFER_SUSPICIOUS,
  OFFERS,
  OPEN_STATUSES,
  PAYMENT_IN_PERSON,
  PAYMENT_OPAL,
  PRODUCTS,
  PRODUCT_A57,
  VERIFIED_SAMPLE,
  WARRANTY_18,
  WARRANTY_AUTH,
} from './fixtures.js';

function Block({ id, title, children, note }: { id: string; title: string; children: ReactNode; note?: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 px-4 py-5">
      <h2 id={`${id}-h`} className="mb-1 text-title font-extrabold text-heading">
        {title}
      </h2>
      {note ? <p className="mb-3 text-caption text-muted">{note}</p> : <div className="mb-3" />}
      <div className="space-y-3">{children}</div>
    </section>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap items-center gap-2">{children}</div>;

const ask = () => toast.info('در نسخه کامل، از فروشگاه استعلام می‌گیریم.');

const SECTIONS = [
  ['ui', 'پایه'],
  ['data', 'داده و اعتماد'],
  ['product', 'کالا'],
  ['store', 'فروشگاه'],
  ['map', 'نقشه'],
  ['layout', 'چیدمان'],
] as const;

export default function DevGalleryPage() {
  useDocumentTitle('گالری اجزا');
  const [seg, setSeg] = useState<'smart' | 'price' | 'distance'>('smart');
  const [tab, setTab] = useState<'stores' | 'specs' | 'areas'>('stores');
  const [on, setOn] = useState(true);
  const [n, setN] = useState(3);
  const [sel, setSel] = useState(true);
  const [picked, setPicked] = useState<string | null>(OFFER_BEST.shop.id);
  const openSheet = useUi((s) => s.openSheet);

  const markers: MapMarker[] = OFFERS.slice(0, 3).map((o) => ({
    id: o.shop.id,
    lat: o.shop.lat,
    lng: o.shop.lng,
    kind: 'price',
    label: o.shop.name,
    text: formatTomanShort(o.price.price, false),
    selected: picked === o.shop.id,
    dimmed: o.shop.openStatus.state === 'closed',
  }));

  return (
    <div>
      <PageHeader
        title="گالری اجزا"
        subtitle="نمونه‌ها از داده‌های واقعی ترب"
        actions={<IconButton icon={Share2} label="اشتراک‌گذاری" />}
      >
        <nav aria-label="بخش‌های گالری" className="flex gap-1.5 overflow-x-auto scrollbar-none px-4 pb-2">
          {SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="shrink-0 rounded-full bg-surface px-3 py-1 text-caption font-medium text-ink-2 shadow-card">
              {label}
            </a>
          ))}
        </nav>
      </PageHeader>

      {/* ───────────── UI ───────────── */}
      <Block id="ui" title="دکمه‌ها" note="Button · ButtonLink · IconButton — ارتفاع ۴۴ پیکسل، فشردن با بازخورد">
        <Row>
          <Button startIcon={Search}>جستجو</Button>
          <Button variant="accent" startIcon={PhoneCall}>
            استعلام از فروشگاه‌ها
          </Button>
        </Row>
        <Row>
          <Button variant="secondary">ثانویه</Button>
          <Button variant="outline" endIcon={ChevronLeft}>
            ادامه
          </Button>
          <Button variant="soft">نرم</Button>
          <Button variant="ghost">بی‌قاب</Button>
        </Row>
        <Row>
          <Button size="sm" startIcon={Plus}>
            کوچک
          </Button>
          <Button size="lg" loading>
            در حال ارسال
          </Button>
          <Button variant="danger" size="sm">
            لغو استعلام
          </Button>
          <Button variant="link">پیوند</Button>
        </Row>
        <Row>
          <IconButton icon={Heart} label="ذخیره" />
          <IconButton icon={Share2} label="اشتراک" variant="secondary" />
          <IconButton icon={MapPin} label="نقشه" variant="soft" />
          <IconButton icon={Bell} label="اعلان‌ها" variant="secondary" badge={3} />
          <IconButton icon={Plus} label="افزودن" variant="primary" round />
          <IconButton icon={PhoneCall} label="تماس" variant="accent" size="lg" />
        </Row>
      </Block>

      <Block id="chips" title="چیپ‌ها و نشان‌ها" note="Chip (انتخابی / بازکننده) · RemovableChip · Badge با رنگ‌های معنایی">
        <Row>
          <Chip selected={sel} onClick={() => setSel(!sel)}>
            قسطی
          </Chip>
          <Chip icon={Wallet} active trailing={<ChevronLeft aria-hidden className="size-3.5" />}>
            تا ۲۵ میلیون
          </Chip>
          <Chip icon={CreditCard} count={2}>
            شرایط خرید
          </Chip>
          <Chip tone="accent" icon={Sparkles}>
            پیشنهاد دستیار
          </Chip>
          <Chip size="sm">کوچک</Chip>
        </Row>
        <Row>
          <RemovableChip onRemove={() => {}} removeLabel="حذف برند">
            برند: سامسونگ
          </RemovableChip>
          <RemovableChip onRemove={() => {}} removeLabel="حذف محدوده" icon={MapPin}>
            نزدیک فردوسی
          </RemovableChip>
        </Row>
        <Row>
          <Badge>خنثی</Badge>
          <Badge tone="primary" icon={Sparkles}>
            اصلی
          </Badge>
          <Badge tone="accent">تأکیدی</Badge>
          <Badge tone="good" icon={ShieldCheck}>
            خوب
          </Badge>
          <Badge tone="info">اطلاع</Badge>
          <Badge tone="warn">هشدار</Badge>
          <Badge tone="bad">نامطلوب</Badge>
          <Badge tone="verified" dot>
            تأییدشده
          </Badge>
          <Badge tone="primary" variant="solid">
            توپر
          </Badge>
          <Badge tone="bad" variant="outline">
            خط‌دار
          </Badge>
        </Row>
      </Block>

      <Block id="controls" title="کنترل‌ها" note="Segmented · Tabs · Switch · ToggleRow · Stepper · TextField · InfoPopover">
        <Segmented
          label="مرتب‌سازی"
          value={seg}
          onChange={setSeg}
          fullWidth
          options={[
            { value: 'smart', label: 'هوشمند', icon: Sparkles },
            { value: 'price', label: 'ارزان‌ترین' },
            { value: 'distance', label: 'نزدیک‌ترین' },
          ]}
        />
        <Card padding="none">
          <Tabs
            label="بخش‌های کالا"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'stores', label: 'فروشگاه‌ها', count: 25 },
              { value: 'specs', label: 'مشخصات' },
              { value: 'areas', label: 'محدوده‌ها' },
            ]}
          />
        </Card>
        <Card padding="sm">
          <ToggleRow icon={CreditCard} title="خرید قسطی / اعتباری" description="فروشگاه‌هایی که روش پرداخت اعتباری دارند." checked={on} onCheckedChange={setOn} />
        </Card>
        <Row>
          <Switch checked={on} onCheckedChange={setOn} label="باز در زمان مراجعه" />
          <Stepper value={n} onChange={setN} min={1} max={10} label="شعاع جستجو" format={(v) => `${v.toLocaleString('fa-IR')} کیلومتر`} />
          <InfoPopover title="تازگی قیمت">قیمت‌ها بر اساس آخرین تغییر ثبت‌شده در ترب دسته‌بندی می‌شوند.</InfoPopover>
        </Row>
        <TextField label="حداکثر بودجه" placeholder="مثلاً ۲۵" inputMode="decimal" end={<span className="text-caption text-muted">میلیون تومان</span>} hint="اعداد فارسی یا انگلیسی" />
        <TextField label="جستجو" hideLabel startIcon={Search} placeholder="گوشی سامسونگ A57 نزدیک فردوسی" error="لطفاً حداقل دو حرف بنویسید." />
      </Block>

      <Block id="states" title="وضعیت‌ها" note="Skeleton · Spinner · EmptyState · ErrorState · StepList · SectionHeader · Divider">
        <Card>
          <div className="flex items-center gap-3">
            <Skeleton shape="circle" className="size-12" />
            <div className="flex-1">
              <SkeletonText lines={2} />
            </div>
            <Spinner />
          </div>
        </Card>
        <Card padding="none">
          <EmptyState
            icon={Store}
            title="فروشگاهی با این شرایط پیدا نشد"
            description="۵ فروشگاه با فیلترهای شما حذف شدند. شعاع را بیشتر کنید یا یکی از شرایط را بردارید."
            actions={
              <Row>
                <Button size="sm">تا ۱۰ کیلومتر</Button>
                <Button size="sm" variant="secondary">
                  حذف «قسطی»
                </Button>
              </Row>
            }
          />
        </Card>
        <Card padding="none">
          <ErrorState error={new ApiError(0, 'network', 'اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید.')} onRetry={() => {}} size="sm" />
        </Card>
        <Card>
          <SectionHeader title="مراحل خرید حضوری" icon={Route} count={4} more={{ to: '/about' }} />
          <StepList
            steps={[
              { title: 'بگویید چه می‌خواهید', description: 'با بودجه و شرایط خرید' },
              { title: 'فروشگاه‌های نزدیک را ببینید', description: 'با قیمت ثبت‌شده و تازگی' },
              { title: 'قبل از رفتن بپرسید', description: 'موجودی و قیمت روز' },
            ]}
          />
          <Divider label="یا" className="my-3" />
          <p className="text-meta text-muted">جداکننده با برچسب</p>
        </Card>
      </Block>

      {/* ───────────── DATA ───────────── */}
      <Block id="data" title="قیمت و تأیید" note="PriceTag (ثبت‌شده) و VerifiedBadge (تأییدشده) همیشه جدا از هم">
        <Card>
          <PriceTag price={OFFER_BEST.price} verified={VERIFIED_SAMPLE} size="lg" />
        </Card>
        <div className="grid grid-cols-2 gap-3">
          <Card padding="sm">
            <PriceTag price={OFFER_STALE.price} priceMax={OFFER_STALE.priceMax} onAsk={ask} size="sm" />
          </Card>
          <Card padding="sm">
            <PriceTag price={OFFER_MISSING_PRICE.price} onAsk={ask} size="sm" />
          </Card>
        </div>
        <Card padding="sm">
          <PriceTag price={OFFER_SUSPICIOUS.price} onAsk={ask} size="sm" />
        </Card>
        <VerifiedBadge info={VERIFIED_SAMPLE} variant="compact" />
        <Row>
          <StockBadge verified={VERIFIED_SAMPLE} />
          <StockBadge verified={{ ...VERIFIED_SAMPLE, stock: 'out_of_stock' }} />
          <StockBadge verified={null} />
        </Row>
        <Row>
          {(['fresh', 'recent', 'stale', 'very_stale', 'unknown'] as const).map((f) => (
            <FreshnessBadge key={f} freshness={f} />
          ))}
          <FreshnessBadge freshness="recent" changedAt={OFFER_BEST.price.changedAt} variant="short" explain />
        </Row>
      </Block>

      <Block id="trust" title="ساعت، پرداخت، گارانتی، نامشخص">
        <Row>
          {OPEN_STATUSES.map((s) => (
            <OpenStatusBadge key={s.state} status={s} />
          ))}
        </Row>
        <Card padding="sm" className="space-y-2">
          <PaymentBadges payment={PAYMENT_OPAL} showKalabarg onAsk={ask} />
          <Divider soft />
          <PaymentBadges payment={PAYMENT_IN_PERSON} />
          <Divider soft />
          <PaymentBadges payment={OFFER_BEST.shop.payment} showUnknown onAsk={ask} />
        </Card>
        <Row>
          <WarrantyBadge warranty={WARRANTY_18} />
          <WarrantyBadge warranty={WARRANTY_AUTH} />
          <WarrantyBadge warranty={null} />
        </Row>
        <Unknown label="موجودی نامشخص" why="فروشنده موجودی را در ترب ثبت نمی‌کند" onAsk={ask} />
        <p className="text-body">
          کالابرگ: <Unknown inline size="sm" why="در داده‌های ترب ثبت نشده" onAsk={ask} />
        </p>
        <ReasonChips reasons={OFFER_BEST.reasons.concat(OFFER_STALE.reasons)} max={4} />
        <Row>
          <DistanceEta distanceKm={0.4} etaMin={6} mode="walk" />
          <DistanceEta distanceKm={11.3} etaMin={38} mode="taxi" />
          <DistanceEta distanceKm={null} etaMin={null} />
        </Row>
        <InMallGuide location={LOC_CHARSOO_C21} variant="card" onAsk={ask} />
        <InMallGuide location={LOC_LOW} variant="card" onAsk={ask} />
        <InMallGuide location={LOC_CHARSOO_C21} variant="line" />
        <DataNote>{DATA_NOTES.anonymizedNames}</DataNote>
        <DataNote tone="info" variant="boxed">
          {DATA_NOTES.registeredPrice}
        </DataNote>
        <DataNote tone="warn" variant="boxed">
          {DATA_NOTES.kalabarg}
        </DataNote>
      </Block>

      {/* ───────────── PRODUCT ───────────── */}
      <Block id="product" title="کارت کالا" note="ProductCard (grid / list) · ProductCardSkeleton · CompareToggle">
        <ProductGrid>
          {PRODUCTS.map((p, i) => (
            <ProductCard key={p.id} product={p} priority={i < 2} />
          ))}
        </ProductGrid>
        <ProductCard product={PRODUCT_A57} layout="list" />
        <ProductGrid>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </ProductGrid>
        <ProductCardSkeleton layout="list" />
      </Block>

      {/* ───────────── STORE ───────────── */}
      <Block id="store" title="کارت فروشگاه" note="StoreOfferCard — بهترین گزینه، رو به تعطیلی، بسته، قیمت قدیمی">
        <StoreOfferCard offer={OFFER_BEST} productId={PRODUCT_A57.id} productTitle={PRODUCT_A57.title} highlight selectable selected onAsk={ask} />
        <StoreOfferCard offer={OFFER_CLOSING} productId={PRODUCT_A57.id} productTitle={PRODUCT_A57.title} selectable onAsk={ask} />
        <StoreOfferCard offer={OFFER_CLOSED} productId={PRODUCT_A57.id} productTitle={PRODUCT_A57.title} onAsk={ask} compact />
        <StoreOfferCard offer={OFFER_STALE} productId="product_92ac53fa75e18e8e73f20b56" productTitle="هدفون بلوتوثی انکر Soundcore R50i مدل A3949" mode="taxi" onAsk={ask} />
        <StoreOfferCardSkeleton />
      </Block>

      {/* ───────────── MAP ───────────── */}
      <Block id="map" title="نقشه" note="LazyMap — Leaflet با بارگذاری تنبل، پین قیمت، موقعیت کاربر">
        <LazyMap
          markers={markers}
          user={{ lat: 35.6932, lng: 51.4152 }}
          onMarkerClick={(m) => setPicked(m.id)}
          className="h-72"
          label="فروشگاه‌های گوشی سامسونگ A57 روی نقشه"
        />
      </Block>

      {/* ───────────── LAYOUT ───────────── */}
      <Block id="layout" title="چیدمان" note="Header · ContextBar · برگه‌های پایینی · ComingSoon">
        <Card padding="none" className="overflow-hidden">
          <Header className="static" />
          <ContextBar />
        </Card>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['location', 'محدوده', MapPin],
              ['budget', 'بودجه', Wallet],
              ['conditions', 'شرایط خرید', CreditCard],
              ['visitTime', 'زمان مراجعه', CalendarClock],
              ['travelMode', 'رفت‌وآمد', Route],
            ] as [ContextSheetId, string, typeof MapPin][]
          ).map(([id, label, icon]) => (
            <Button key={id} variant="secondary" startIcon={icon} onClick={() => openSheet(id)}>
              {label}
            </Button>
          ))}
          <Button variant="soft" startIcon={MessageCircleMore} onClick={() => toast.success('استعلام برای ۳ فروشگاه ارسال شد.', { description: 'نتیجه را در «پیگیری‌ها» می‌بینید.' })}>
            نمونه اعلان
          </Button>
        </div>
        <ComingSoon icon={ArrowLeftRight} title="مقایسه کالاها" />
      </Block>
    </div>
  );
}
