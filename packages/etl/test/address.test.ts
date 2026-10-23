import { describe, expect, it } from 'vitest';
import { floorLabelFor, mallKey, mallSkeleton, parseAddress } from '../src/address.js';

// All addresses below are real strings from shops.csv.
describe('parseAddress — in-mall location', () => {
  it('parses the canonical «mall، floor، unit» form', () => {
    const a = parseAddress('خیابان جمهوری، نبش شیخ هادی، پاساژ علالدین 2، طبقه 6، واحد 622');
    expect(a.mall?.name).toBe('پاساژ علالدین ۲');
    expect(a.mall?.kind).toBe('passage');
    expect(a.floorNum).toBe(6);
    expect(a.floorLabel).toBe('طبقه ششم');
    expect(a.unit).toBe('۶۲۲');
    expect(a.landmark).toBe('نبش شیخ هادی');
    expect(a.confidence).toBe('high');
  });

  it('treats a mall after «روبروی» as a landmark, not the shop mall', () => {
    const a = parseAddress('بلوار جمهوری اسلامی، بعد از حافظ، روبروی پاساژ چارسو، پاساژ نادری، طبقه منفی ۲، واحد ۱۹');
    expect(a.mall?.name).toBe('پاساژ نادری');
    expect(a.floorNum).toBe(-2);
    expect(a.floorLabel).toBe('زیرزمین دوم');
    expect(a.unit).toBe('۱۹');
    expect(a.landmark).toBe('روبه‌روی پاساژ چارسو');
  });

  it('handles «طبقه منفی یک» and «طبقه ۲-» basements', () => {
    expect(parseAddress('میدان فردوسی، پاساژ تجارت جهانی فردوسی، طبقه منفی یک').floorNum).toBe(-1);
    const b = parseAddress('خیابان جمهوری، پاساژ علاءالدین، طبقه ۲-، روبروی پلاک سنگی، پلاک ۱۴۹');
    expect(b.floorNum).toBe(-2);
    expect(b.plaque).toBe('۱۴۹');
    expect(b.landmark).toBe('روبه‌روی پلاک سنگی');
  });

  it('keeps the «3/1» floor label and parses alphanumeric units', () => {
    const a = parseAddress('خیابان فردوسی، نرسیده به میدان فردوسی، پاساژ تجارت جهانی، طبقه 3/1، واحد B12');
    expect(a.floorNum).toBe(3);
    expect(a.floorLabel).toBe('طبقه ۳/۱');
    expect(a.unit).toBe('B12');
    expect(a.landmark).toBe('نرسیده به میدان فردوسی');
  });

  it('accepts the «طیقه» typo', () => {
    const a = parseAddress('خیابان فردوسی، خیابان صا‌دق، پاساژ مروارید، طیقه هفتم، واحد ۷۰۲');
    expect(a.floorNum).toBe(7);
    expect(a.unit).toBe('۷۰۲');
  });

  it('keeps «طبقه آخر» as a label without a number, plus corridor and «۴/۱۶۵» plaque', () => {
    const a = parseAddress('خیابان‌ فردوسی، خیابان‌ باربد، پاساژ بهار، راهروی جنوبی، طبقه آخر،پلاک ۴/۱۶۵');
    expect(a.mall?.name).toBe('پاساژ بهار');
    expect(a.floorLabel).toBe('طبقه آخر');
    expect(a.floorNum).toBeNull();
    expect(a.plaque).toBe('۴/۱۶۵');
    expect(a.wing).toBe('راهروی جنوبی');
    expect(a.confidence).toBe('high');
  });

  it('parses «پلاک C13» in a «مرکز خرید»', () => {
    const a = parseAddress('خیابان جمهوری، تقاطع خیابان حافظ، مرکز خرید چارسو، طبقه اول، پلاک C13');
    expect(a.mall?.kind).toBe('mall');
    expect(a.mall?.key).toBe('چارسو');
    expect(a.floorNum).toBe(1);
    expect(a.plaque).toBe('C13');
  });

  it('parses «لاین راست طبقه دوم» glued in one segment', () => {
    const a = parseAddress('خیابان جمهوری اسلامی، خیابان لاله زار، بین کوچه اتحادیه و مهران، پاساژ ایران، لاین راست طبقه دوم، پلاک ۳۰');
    expect(a.mall?.name).toBe('پاساژ ایران');
    expect(a.wing).toBe('لاین راست');
    expect(a.floorNum).toBe(2);
    expect(a.plaque).toBe('۳۰');
  });

  it('parses «مرکز خرید تندیس، طبقه ششم، بخش غربی»', () => {
    const a = parseAddress('میدان تجریش، خیابان فناخسرو، مرکز خرید تندیس، طبقه ششم، بخش غربی');
    expect(a.mall?.name).toBe('مرکز خرید تندیس');
    expect(a.floorNum).toBe(6);
    expect(a.wing).toBe('بخش غربی');
    expect(a.confidence).toBe('medium');
  });

  it('unwraps parenthesized unit codes «واحد (26A)»', () => {
    const a = parseAddress('جنوب به شمال، خیابان فردوسی، نرسیده به میدان، مجتمع تجارت جهانی فردوسی، طبقه منفی یک، واحد (26A)');
    expect(a.unit).toBe('26A');
    expect(a.mall?.kind).toBe('complex');
    expect(a.confidence).toBe('high');
  });

  it('reads the Arabic decimal sign in «پلاک ۷۱٫۱»', () => {
    const a = parseAddress('خیابان جمهوری، خیابان حافظ، پاساژ علاءالدین، طبقه منفی یک، پلاک ۷۱٫۱');
    expect(a.plaque).toBe('۷۱/۱');
  });

  it('recognizes glued / variant mall prefixes', () => {
    expect(parseAddress('میدان فردوسی، بین گل پرور و میدان فردوسی، مرکز تجارت جهانی فردوسی، طبقه منفی یک، پلاک 23B').mall?.key).toBe(
      'تجارت جهانی فردوسی',
    );
    expect(parseAddress('خیابان ولیعصر، مرکزتجاری سبحان، طبقه زیرزمین').mall?.key).toBe('سبحان');
    expect(parseAddress('ساختمان الومینیم طبقه نهم واحد۹۴۶').unit).toBe('۹۴۶');
  });

  it('parses «مجتمع کوروش مال» with «(B۱)» annotation', () => {
    const a = parseAddress('بزرگراه ستاری، مجتمع کوروش مال، طبقه منفی یک (B۱)، پلاک ۱۲۶');
    expect(a.mall?.key).toBe('کوروش');
    expect(a.floorNum).toBe(-1);
    expect(a.plaque).toBe('۱۲۶');
  });

  it('handles همکف and زیرزمین without «طبقه»', () => {
    expect(parseAddress('پاساژ رضا، همکف، پلاک ۱۲').floorNum).toBe(0);
    expect(parseAddress('پاساژ رضا، زیرزمین دوم، پلاک ۱۲').floorNum).toBe(-2);
  });

  it('returns low confidence for street-only addresses and empty input', () => {
    const a = parseAddress('سعادت آباد، میدان کتاب، بلوار منفردنیاکی (کوهستان)، روبروی مجتمع کوهستان');
    expect(a.mall).toBeNull();
    expect(a.landmark).toContain('مجتمع کوهستان');
    expect(a.confidence).toBe('low');
    expect(parseAddress(null).confidence).toBe('low');
    expect(parseAddress('').mall).toBeNull();
  });

  it('handles Arabic ي/ك and mixed digits', () => {
    const a = parseAddress('خيابان جمهوري، پاساژ كيان، طبقه ٢، واحد 1۲');
    expect(a.mall?.name).toBe('پاساژ کیان');
    expect(a.floorNum).toBe(2);
    expect(a.unit).toBe('۱۲');
  });
});

describe('mall keys', () => {
  it('folds spelling variance of علاءالدین', () => {
    const k1 = mallKey('پاساژ علاءالدین');
    const k2 = mallKey('پاساژ علالدین');
    expect(mallSkeleton(k1)).toBe(mallSkeleton(k2));
    expect(mallKey('پاساژ علاالدین یک')).toBe(mallKey('پاساژ علاالدین'));
    expect(mallKey('پاساژ علاءالدین ۲')).not.toBe(mallKey('پاساژ علاءالدین'));
  });

  it('labels floors canonically', () => {
    expect(floorLabelFor(0)).toBe('همکف');
    expect(floorLabelFor(-1)).toBe('زیرزمین اول');
    expect(floorLabelFor(3)).toBe('طبقه سوم');
    expect(floorLabelFor(22)).toBe('طبقه ۲۲');
  });
});
