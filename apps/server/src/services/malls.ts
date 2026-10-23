/**
 * Mall / passage pages: shops grouped by floor, categories present, metro, practical tips.
 */
import type { FacetBucket, MallDetail, UserContext } from '@titl/shared';
import { DAY_ORDER, formatClock, formatNumber, inTrafficZone, minutesToHHMM } from '@titl/shared';
import { floorLabelOf, floorSortKey, unitSortKey } from '../domain/mall.js';
import { isDayClosed, shortThursdayClose } from '../domain/hours.js';
import { linesLabel } from '../domain/travel.js';
import type { Core, MallRec, ShopRec } from './core.js';
import { resolveCtx, toShopLite } from './context.js';

export function mallBySlugOrId(core: Core, slugOrId: string): MallRec | undefined {
  const bySlug = core.mallsBySlug.get(slugOrId) ?? core.mallsBySlug.get(decodeURIComponent(slugOrId));
  if (bySlug) return bySlug;
  if (/^\d+$/.test(slugOrId)) return core.malls.get(Number(slugOrId));
  // slugs end with "-<id>"
  const m = /-(\d+)$/.exec(slugOrId);
  return m ? core.malls.get(Number(m[1])) : undefined;
}

export function getMall(core: Core, slugOrId: string, ctx: UserContext): MallDetail | null {
  const mall = mallBySlugOrId(core, slugOrId);
  if (!mall) return null;
  const rc = resolveCtx(ctx);
  const shops: ShopRec[] = core.mallShops.get(mall.id) ?? [];
  const byFloor = new Map<number | null, ShopRec[]>();
  for (const s of shops) {
    const l = byFloor.get(s.floorNum) ?? [];
    l.push(s);
    byFloor.set(s.floorNum, l);
  }
  const floors = [...byFloor.entries()]
    .sort((a, b) => floorSortKey(a[0]) - floorSortKey(b[0]))
    .map(([num, list]) => {
      const sorted = [...list].sort(
        (a, b) => (b.offerCount > 0 ? 1 : 0) - (a.offerCount > 0 ? 1 : 0) || unitSortKey(a.unit, a.plaque) - unitSortKey(b.unit, b.plaque),
      );
      const declared = mall.floors.find((f) => f.num === num)?.label;
      return {
        floorNum: num,
        label: num === null ? 'طبقه نامشخص' : declared ?? floorLabelOf(num),
        shops: sorted.map((s) => toShopLite(core, rc, s)),
      };
    });

  const catCount = new Map<string, number>();
  for (const s of shops) for (const c of s.categories) catCount.set(c, (catCount.get(c) ?? 0) + 1);
  const categories: FacetBucket[] = [...catCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c, n]) => ({ value: c, label: c, count: n }));

  const nearbyMetro = core.metro.nearest(mall, 3, 2);
  return {
    mall: {
      id: mall.id,
      slug: mall.slug,
      name: mall.name,
      kind: mall.kind,
      area: mall.area,
      lat: mall.lat,
      lng: mall.lng,
      shopCount: shops.length || mall.shopCount,
    },
    floors,
    categories,
    nearbyMetro,
    inTrafficZone: inTrafficZone(mall),
    tips: mallTips(mall, shops, floors.map((f) => f.floorNum), nearbyMetro),
  };
}

function mallTips(mall: MallRec, shops: ShopRec[], floorNums: (number | null)[], metro: MallDetail['nearbyMetro']): string[] {
  const tips: string[] = [];
  const known = floorNums.filter((n): n is number => n !== null);
  if (known.length >= 2) {
    const lo = Math.min(...known);
    const hi = Math.max(...known);
    tips.push(`فروشگاه‌های ثبت‌شده از ${floorLabelOf(lo)} تا ${floorLabelOf(hi)} پخش شده‌اند؛ پیش از رفتن طبقه و واحد را یادداشت کنید.`);
  }
  const withHours = shops.filter((s) => s.hoursDeclared);
  if (shops.length) {
    if (withHours.length >= 3) {
      const friClosed = withHours.filter((s) => isDayClosed(s.hours, 'fri')).length;
      if (friClosed >= withHours.length * 0.6) tips.push('بیشتر فروشگاه‌های این مجموعه جمعه‌ها تعطیل‌اند.');
      const thu = withHours.map((s) => shortThursdayClose(s.hours)).filter((m): m is number => m !== null);
      if (thu.length >= withHours.length * 0.4) {
        const sorted = [...thu].sort((a, b) => a - b);
        const med = sorted[Math.floor(sorted.length / 2)]!;
        tips.push(`پنجشنبه‌ها بسیاری از فروشگاه‌ها زودتر می‌بندند (معمولاً حدود ساعت ${formatClock(minutesToHHMM(med))}).`);
      }
    }
    const unknownHours = shops.length - withHours.length;
    if (unknownHours > 0) tips.push(`${formatNumber(unknownHours)} فروشگاه ساعت کاری ثبت نکرده‌اند؛ پیش از رفتن بپرسید.`);
  }
  const m = metro[0];
  if (m && m.distanceKm <= 1.2) {
    const lines = linesLabel(m.lines);
    tips.push(`نزدیک‌ترین مترو: ایستگاه ${m.name}${lines ? ` (${lines})` : ''} — حدود ${formatNumber(m.walkMin)} دقیقه پیاده.`);
  }
  if (inTrafficZone(mall)) tips.push('این مجموعه در محدوده تقریبی طرح ترافیک است؛ با مترو یا تاکسی بیایید.');
  void DAY_ORDER;
  return tips;
}
