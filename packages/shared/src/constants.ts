import type {
  AltReason,
  CrowdReport,
  InquiryQuestion,
  InquiryStatus,
  ProviderCode,
  Tone,
  TravelMode,
} from './types.js';

export const APP_NAME = 'Torob in the Loop';
export const APP_TAGLINE = 'دستیار هوشمند خرید حضوری در تهران';

/** Installment / credit providers as registered in shops.payment_options.provider_name. */
export const PROVIDERS: Record<ProviderCode, { label: string; aliases: string[]; description: string; installment: boolean }> = {
  torobpay: {
    label: 'ترب‌پی',
    aliases: ['ترب‌پی', 'ترب پی', 'تربپی', 'torobpay', 'torob pay'],
    description: 'خرید اعتباری و قسطی با ترب‌پی',
    installment: true,
  },
  snapppay: {
    label: 'اسنپ‌پی',
    aliases: ['اسنپ‌پی', 'اسنپ پی', 'اسنپپی', 'snapppay', 'snapp pay', 'اسنپ'],
    description: 'خرید قسطی با اسنپ‌پی',
    installment: true,
  },
  digipay: {
    label: 'دیجی‌پی',
    aliases: ['دیجی پی', 'دیجی‌پی', 'دیجیپی', 'digipay'],
    description: 'خرید اعتباری و قسطی با دیجی‌پی',
    installment: true,
  },
  tara: {
    label: 'تارا',
    aliases: ['تارا', 'tara'],
    description: 'خرید اعتباری با تارا',
    installment: true,
  },
  azkivam: {
    label: 'ازکی‌وام',
    aliases: ['ازکی‌وام', 'ازکی وام', 'ازکیوام', 'azkivam', 'ازکی'],
    description: 'خرید با وام و اعتبار ازکی',
    installment: true,
  },
  other: {
    label: 'سایر',
    aliases: [],
    description: 'روش پرداخت دیگری که فروشنده ثبت کرده',
    installment: false,
  },
};

export const INSTALLMENT_PROVIDERS: ProviderCode[] = ['torobpay', 'snapppay', 'digipay', 'tara', 'azkivam'];

export const PAYMENT_CHANNEL_LABEL = {
  in_person: 'پذیرنده حضوری (اعلام فروشنده)',
  unknown: 'نحوه پذیرش ثبت نشده (حضوری/آنلاین نامشخص)',
} as const;

/** Top-level category groups. Leaf → group mapping lives in packages/etl/data/taxonomy.json. Icons are lucide-react names. */
export const CATEGORY_GROUPS: { id: string; name: string; icon: string }[] = [
  { id: 'mobile', name: 'موبایل و تبلت', icon: 'Smartphone' },
  { id: 'computer', name: 'لپ‌تاپ و کامپیوتر', icon: 'Laptop' },
  { id: 'audio_video', name: 'صوتی، تصویری و دوربین', icon: 'Headphones' },
  { id: 'appliances', name: 'لوازم خانگی برقی', icon: 'Refrigerator' },
  { id: 'lighting', name: 'روشنایی و لوستر', icon: 'Lamp' },
  { id: 'electrical', name: 'تجهیزات برق و الکتریکی', icon: 'Cable' },
  { id: 'security', name: 'دوربین مداربسته و امنیتی', icon: 'Cctv' },
  { id: 'industrial', name: 'صنعتی و تأسیسات', icon: 'Factory' },
  { id: 'tools', name: 'ابزار', icon: 'Wrench' },
  { id: 'fashion', name: 'مد و پوشاک', icon: 'Shirt' },
  { id: 'shoes_bags', name: 'کفش و کیف', icon: 'Footprints' },
  { id: 'watch_jewelry', name: 'ساعت، عینک و زیورآلات', icon: 'Watch' },
  { id: 'beauty', name: 'آرایشی، بهداشتی و عطر', icon: 'Sparkles' },
  { id: 'auto', name: 'خودرو و موتورسیکلت', icon: 'Car' },
  { id: 'home_kitchen', name: 'خانه و آشپزخانه', icon: 'CookingPot' },
  { id: 'medical', name: 'پزشکی و سلامت', icon: 'Stethoscope' },
  { id: 'sports_toys', name: 'ورزش، سفر و سرگرمی', icon: 'Dumbbell' },
  { id: 'office_books', name: 'کتاب، تحریر و اداری', icon: 'BookOpen' },
  { id: 'food', name: 'خوراکی و سوپرمارکت', icon: 'ShoppingBasket' },
  { id: 'other', name: 'سایر', icon: 'Package' },
];

export const TRAVEL_MODE_META: Record<TravelMode, { label: string; icon: string }> = {
  walk: { label: 'پیاده', icon: 'Footprints' },
  metro: { label: 'مترو', icon: 'TrainFront' },
  taxi: { label: 'تاکسی اینترنتی', icon: 'CarTaxiFront' },
  car: { label: 'خودروی شخصی', icon: 'Car' },
};

export const INQUIRY_QUESTION_META: Record<InquiryQuestion, { label: string; ask: string; icon: string }> = {
  stock: { label: 'موجودی', ask: 'این کالا الان موجود است؟', icon: 'PackageCheck' },
  price: { label: 'قیمت به‌روز', ask: 'قیمت امروز چند است؟', icon: 'BadgeDollarSign' },
  hours: { label: 'ساعت کاری امروز', ask: 'امروز تا چه ساعتی باز هستید؟', icon: 'Clock' },
  hold: { label: 'نگه‌داشتن کالا', ask: 'می‌توانید کالا را تا رسیدن من نگه دارید؟', icon: 'Hand' },
  installment: { label: 'خرید قسطی', ask: 'امکان خرید قسطی یا ترب‌پی دارید؟', icon: 'CreditCard' },
  kalabarg: { label: 'کالابرگ', ask: 'کالابرگ قبول می‌کنید؟', icon: 'Ticket' },
  location: { label: 'نشانی دقیق', ask: 'دقیقاً کجای پاساژ هستید؟ طبقه و واحد؟', icon: 'MapPinned' },
  warranty: { label: 'گارانتی', ask: 'گارانتی کالا چیست و چه مدت است؟', icon: 'ShieldCheck' },
  variant: { label: 'رنگ/مدل', ask: 'کدام رنگ یا نسخه (حافظه/مدل) را موجود دارید؟', icon: 'Palette' },
  registry: { label: 'رجیستری', ask: 'گوشی رجیستر شده است؟', icon: 'BadgeCheck' },
  condition: { label: 'نو یا کارکرده', ask: 'کالا آکبند و نو است یا کارکرده؟', icon: 'PackageOpen' },
  cash_vs_installment: { label: 'نقد یا قسط', ask: 'قیمت نقدی و قسطی چه فرقی دارد؟', icon: 'Wallet' },
  return_policy: { label: 'مرجوعی', ask: 'در صورت مشکل امکان تعویض یا مرجوعی دارید؟', icon: 'Undo2' },
  custom: { label: 'سؤال دیگر', ask: '', icon: 'MessageCircleQuestion' },
};

export const DEFAULT_INQUIRY_QUESTIONS: InquiryQuestion[] = ['stock', 'price', 'hours'];

export const INQUIRY_STATUS_META: Record<InquiryStatus, { label: string; tone: Tone; final: boolean }> = {
  queued: { label: 'در صف تماس', tone: 'info', final: false },
  calling: { label: 'در حال شماره‌گیری…', tone: 'info', final: false },
  in_call: { label: 'در حال گفتگو', tone: 'info', final: false },
  answered: { label: 'پاسخ داد', tone: 'good', final: false },
  no_answer: { label: 'پاسخ نداد', tone: 'warn', final: false },
  busy: { label: 'خط اشغال بود', tone: 'warn', final: false },
  closed: { label: 'خارج از ساعت کاری', tone: 'warn', final: false },
  retry_scheduled: { label: 'تماس مجدد زمان‌بندی شد', tone: 'info', final: false },
  awaiting_seller: { label: 'منتظر پاسخ فروشنده', tone: 'info', final: false },
  resolved: { label: 'پاسخ دریافت شد', tone: 'good', final: true },
  unreachable: { label: 'در دسترس نبود', tone: 'bad', final: true },
  cancelled: { label: 'لغو شد', tone: 'info', final: true },
  scheduled_at_open: { label: 'تماس در ساعت بازگشایی', tone: 'info', final: false },
  callback_promised: { label: 'فروشنده قول تماس داد', tone: 'info', final: false },
};

export const ALT_REASON_META: Record<AltReason, { label: string; headline: string }> = {
  closed: { label: 'بسته بود', headline: 'فروشگاه بسته است؟ این‌ها همین حالا باز هستند' },
  out_of_stock: { label: 'موجود نداشت', headline: 'تمام شده بود؟ این فروشگاه‌ها همین کالا را دارند' },
  no_answer: { label: 'جواب نداد', headline: 'فروشنده پاسخ نداد؛ این گزینه‌ها را بررسی کنید' },
  not_found: { label: 'پیدایش نکردم', headline: 'فروشگاه را پیدا نکردید؟ گزینه‌های نزدیک شما' },
  too_expensive: { label: 'گران‌تر بود', headline: 'گران‌تر از انتظار بود؟ گزینه‌های ارزان‌تر' },
  unreachable: { label: 'در دسترس نبود', headline: 'فروشنده در دسترس نبود؛ جایگزین‌های پیشنهادی' },
  over_budget: { label: 'بالاتر از بودجه', headline: 'بالاتر از بودجه بود؟ گزینه‌های داخل بودجهٔ شما' },
  no_installment: { label: 'قسطی نداشت', headline: 'قسطی نداشت؟ فروشگاه‌هایی که اقساط اعلام کرده‌اند' },
};

/** (SV2) Fixed copy for the availability ladder. `{n}` = number of similar models. */
export const AVAILABILITY_LABELS: Record<import('./types.js').Availability, string> = {
  exact: 'همین کالا را ثبت کرده',
  variant: 'نسخهٔ دیگری از همین مدل (حافظه/رنگ/ساخت)',
  similar: '{n} مدل مشابه ثبت کرده — این مدل را ندارد',
  category_only: 'فقط دستهٔ فعالیت اعلام شده؛ کالایی ثبت نکرده',
};

/** (SV9) Persian labels for installment information tiers. */
export const INSTALLMENT_TIER_LABELS: Record<import('./types.js').InstallmentTier, string> = {
  in_person: 'اقساط حضوری (اعلام فروشنده)',
  declared_unknown_channel: 'اقساط اعلام شده (نحوهٔ پذیرش نامشخص)',
  seller_text: 'در توضیحات به اقساط اشاره شده',
  none_recorded: 'اقساطی ثبت نشده — بپرسید',
};

export const REPORT_TYPE_META: Record<CrowdReport['type'], { label: string; icon: string }> = {
  closed: { label: 'بسته بود', icon: 'DoorClosed' },
  not_found: { label: 'پیدا نکردم', icon: 'MapPinOff' },
  price_mismatch: { label: 'قیمت فرق داشت', icon: 'BadgeAlert' },
  out_of_stock: { label: 'موجود نبود', icon: 'PackageX' },
  moved: { label: 'جابه‌جا شده', icon: 'MoveRight' },
};

export const EXAMPLE_QUERIES = [
  'کتونی می‌خوام ولی نمی‌دونم چه مدلی',
  'گوشی سامسونگ قسطی زیر ۲۵ میلیون',
  'هدفون بلوتوثی تا ۳ میلیون نزدیک من',
  'دوربین مداربسته برای مغازه',
  'لوستر برای پذیرایی',
  'ساعت مچی مردانه',
];

/** Default radius used for "nearby" counts when the user hasn't set one. */
export const DEFAULT_NEARBY_KM = 3;

/** Product images are stored compactly in the catalog as `~/<path>`; expand with this prefix. */
export const TOROB_IMAGE_PREFIX = 'https://image.torob.com/base/images/';
