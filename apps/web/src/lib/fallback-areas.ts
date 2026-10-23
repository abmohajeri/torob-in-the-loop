/**
 * Offline / backend-not-ready fallback for «محدوده‌های پرفروشگاه»: the 12 largest `location_label` areas of the Torob
 * dataset with their shop counts and centroid coordinates (average of shop lat/lon), computed from shops.csv.
 * The live list comes from `GET /api/meta` (`areas`) and always wins when available.
 */
export interface FallbackArea {
  name: string;
  lat: number;
  lng: number;
  shopCount: number;
}

export const FALLBACK_AREAS: FallbackArea[] = [
  { name: 'فردوسی', shopCount: 3282, lat: 35.69305, lng: 51.4202 },
  { name: 'شیخ هادی', shopCount: 1587, lat: 35.6946, lng: 51.40875 },
  { name: 'بهارستان', shopCount: 616, lat: 35.69176, lng: 51.42568 },
  { name: 'آسمان', shopCount: 151, lat: 35.77746, lng: 51.35373 },
  { name: 'باغ فیض', shopCount: 107, lat: 35.73955, lng: 51.31562 },
  { name: 'ایرانشهر', shopCount: 99, lat: 35.71144, lng: 51.42163 },
  { name: 'سنائی', shopCount: 96, lat: 35.71919, lng: 51.42236 },
  { name: 'سهروردی', shopCount: 82, lat: 35.7212, lng: 51.42998 },
  { name: 'تجریش', shopCount: 76, lat: 35.80607, lng: 51.43001 },
  { name: 'جنت آباد جنوبی', shopCount: 68, lat: 35.73824, lng: 51.30956 },
  { name: 'امجدیه', shopCount: 54, lat: 35.71524, lng: 51.42842 },
  { name: 'آذربایجان', shopCount: 51, lat: 35.69452, lng: 51.40386 },
];
