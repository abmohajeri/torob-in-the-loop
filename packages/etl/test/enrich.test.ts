import { describe, expect, it } from 'vitest';
import { parseAddress } from '../src/address.js';
import { detectAudience } from '../src/audience.js';
import { addBrandObservation, buildBrandIndex, newBrandStats } from '../src/brands.js';
import { nul, numField, parseJsonField } from '../src/csv.js';
import { clusterMalls, type MallMember } from '../src/malls.js';
import { cleanStationName } from '../src/metro.js';
import { parseTriState } from '../src/shops.js';
import { FacetPlanner, compactSpecs, facetValues, normalizeFacetValue } from '../src/specs.js';
import { createTaxonomy } from '../src/taxonomy.js';
import { normalizeForSearch } from '@titl/shared';

function member(idx: number, address: string, lat: number, lng: number): MallMember {
  const a = parseAddress(address);
  if (!a.mall) throw new Error(`no mall in ${address}`);
  return { idx, lat, lng, area: 'شیخ هادی', mention: a.mall, floorNum: a.floorNum, floorLabel: a.floorLabel };
}

describe('clusterMalls', () => {
  it('merges spelling variants (علاءالدین ≈ علالدین) within 250 m', () => {
    const ms = [
      member(0, 'خیابان جمهوری، پاساژ علاءالدین، طبقه ۲، واحد ۲۰۱', 35.6955, 51.4052),
      member(1, 'جمهوری، پاساژ علالدین، طبقه همکف، پلاک ۱۲', 35.6957, 51.4054),
      member(2, 'جمهوری، پاساژ علاالدین، طبقه منفی یک', 35.6956, 51.4051),
    ];
    const cs = clusterMalls(ms);
    expect(cs).toHaveLength(1);
    expect(cs[0]!.members.sort()).toEqual([0, 1, 2]);
  });

  it('keeps numbered sibling passages (علالدین ۲) apart', () => {
    const ms = [
      member(0, 'پاساژ علالدین، طبقه ۲', 35.6955, 51.4052),
      member(1, 'پاساژ علالدین 2، طبقه 6، واحد 622', 35.6956, 51.4053),
    ];
    expect(clusterMalls(ms)).toHaveLength(2);
  });

  it('splits same-name malls far apart', () => {
    const ms = [member(0, 'پاساژ نور، طبقه اول', 35.70, 51.40), member(1, 'پاساژ نور، طبقه اول', 35.80, 51.45)];
    expect(clusterMalls(ms)).toHaveLength(2);
  });
});

describe('brands', () => {
  const stats = newBrandStats();
  for (let i = 0; i < 5; i++) addBrandObservation(stats, 'سامسونگ', 'گوشی موبایل', 'mobile');
  addBrandObservation(stats, 'نایکی', 'کتانی و کفش اسپرت', 'shoes_bags');
  const idx = buildBrandIndex([{ name: 'نایکی', en: 'Nike', aliases: ['نایک', 'nike'] }], stats);

  it('infers a brand from the title inside a compatible category', () => {
    expect(idx.infer(normalizeForSearch('گوشی موبايل سامسونگ Galaxy A55'), 'گوشی موبایل', 'mobile')?.name).toBe('سامسونگ');
    expect(idx.infer(normalizeForSearch('کتانی Nike ایرمکس'), 'کتانی و کفش اسپرت', 'shoes_bags')?.nameEn).toBe('Nike');
  });

  it('refuses incompatible categories', () => {
    expect(idx.infer(normalizeForSearch('قاب سامسونگ'), 'کیف زنانه', 'shoes_bags')).toBeNull();
  });
});

describe('specs', () => {
  it('compacts, cleans Arabic letters and drops empty values', () => {
    const c = compactSpecs([
      { key: 'نام محصول', section: 'مشخصات کلی', value: 'Galaxy A55' },
      { key: 'حافظه داخلي', section: 'حافظه', value: '256 گیگابایت' },
      { key: 'رنگ', section: 'مشخصات کلی', value: '-' },
    ]);
    expect(c.productName).toBe('Galaxy A55');
    expect(c.specs).toEqual([['نام محصول', 'Galaxy A55'], ['حافظه داخلی', '256 گیگابایت', 'حافظه']]);
  });

  it('normalizes facet values', () => {
    expect(normalizeFacetValue('۱۲۸ گیگ')).toBe('128 GB');
    expect(normalizeFacetValue('بله')).toBe('دارد');
    expect(facetValues('مشکی، سفید')).toEqual(['مشکی', 'سفید']);
  });

  it('plans facets only for well-covered low-cardinality keys', () => {
    const p = new FacetPlanner();
    for (let i = 0; i < 10; i++) p.addProduct('گوشی موبایل', [['حافظه داخلی', i % 2 ? '128 GB' : '256 GB'], ['ابعاد', `${i}x${i}`]]);
    expect(p.plan().get('گوشی موبایل')).toEqual(['حافظه داخلی']);
  });
});

describe('audience', () => {
  it('detects audience in fashion-like groups only', () => {
    expect(detectAudience('shoes_bags', 'کتانی مردانه نایکی')).toBe('men');
    expect(detectAudience('shoes_bags', 'کتانی اسپرت مردانه و زنانه')).toBe('unisex');
    expect(detectAudience('fashion', 'تیشرت بچگانه دخترانه')).toBe('kids');
    expect(detectAudience('mobile', 'گوشی زنانه')).toBeNull();
  });
});

describe('small parsers', () => {
  it('csv nulls & numbers', () => {
    expect(nul('null')).toBeNull();
    expect(nul('')).toBeNull();
    expect(numField('7.2e17')).toBe(7.2e17);
    expect(parseJsonField('not json', [])).toEqual([]);
  });
  it('fast-delivery tri-state', () => {
    expect(parseTriState('true')).toBe(1);
    expect(parseTriState('false')).toBe(0);
    expect(parseTriState('null')).toBeNull();
  });
  it('metro station names', () => {
    expect(cleanStationName('ایستگاه مترو میدان ولیعصر')).toBe('میدان ولیعصر');
  });
  it('taxonomy falls back to other for unknown leaves and bad group ids', () => {
    const t = createTaxonomy({ version: 1, groups: { 'گوشی موبایل': 'mobile', 'چیز': 'nope' }, aliases: { 'گوشی موبایل': ['گوشی', 'م'] } });
    expect(t.group('گوشی موبایل')).toEqual({ id: 'mobile', source: 'taxonomy' });
    expect(t.group('چیز').id).toBe('other');
    expect(t.group('ناشناخته')).toEqual({ id: 'other', source: 'default' });
    expect(t.aliases('گوشی موبایل')).toEqual(['گوشی']);
  });
});
