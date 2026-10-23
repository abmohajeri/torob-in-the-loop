import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2, Crosshair, LocateFixed, Map as MapIcon, MapPin, Search, TrainFront, X } from 'lucide-react';
import { formatNumber, type LatLng, type Place } from '@titl/shared';
import { Sheet } from '../../ui/Sheet.js';
import { Button } from '../../ui/Button.js';
import { TextField } from '../../ui/TextField.js';
import { Segmented } from '../../ui/Tabs.js';
import { Spinner } from '../../ui/Spinner.js';
import { DataNote } from '../../data/DataNote.js';
import { LazyMap } from '../../map/LazyMap.js';
import { useContextStore } from '../../../state/useContextStore.js';
import { api } from '../../../lib/api.js';
import { getCurrentPosition, GeoError, GEO_MESSAGES, isInTehran } from '../../../lib/geo.js';
import { useDebouncedValue } from '../../../lib/hooks.js';
import { useMeta } from '../../../lib/queries.js';
import { FALLBACK_AREAS } from '../../../lib/fallback-areas.js';
import { cn } from '../../../lib/cn.js';

const PLACE_ICON = { area: MapPin, landmark: MapPin, metro: TrainFront, mall: Building2 } as const;

const RADIUS_OPTIONS = [
  { value: '1', label: '۱ کیلومتر' },
  { value: '3', label: '۳ کیلومتر' },
  { value: '5', label: '۵ کیلومتر' },
  { value: '10', label: '۱۰ کیلومتر' },
  { value: 'any', label: 'همه‌جا' },
] as const;
type RadiusValue = (typeof RADIUS_OPTIONS)[number]['value'];

/**
 * «کجا هستید؟» — GPS, place search (/api/places), popular areas (/api/meta or the dataset fallback), map pick,
 * and the search radius.
 */
export function LocationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const location = useContextStore((s) => s.ctx.location);
  const maxKm = useContextStore((s) => s.ctx.maxDistanceKm);
  const setLocation = useContextStore((s) => s.setLocation);
  const setMaxDistanceKm = useContextStore((s) => s.setMaxDistanceKm);
  const [q, setQ] = useState('');
  const [locating, setLocating] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [picked, setPicked] = useState<LatLng | null>(null);
  const debounced = useDebouncedValue(q.trim(), 250);
  const { data: meta } = useMeta();

  const places = useQuery({
    queryKey: ['places', debounced],
    queryFn: ({ signal }) => api.places(debounced, 8, signal),
    enabled: open && debounced.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const areas = (meta?.areas?.length ? meta.areas : FALLBACK_AREAS).slice(0, 12);

  const choose = (p: { lat: number; lng: number; name: string }, source: 'place' | 'gps' | 'map') => {
    setLocation({ lat: p.lat, lng: p.lng, label: p.name, source });
    setQ('');
    onOpenChange(false);
    toast.success(`محدوده روی «${p.name}» تنظیم شد.`);
  };

  const useGps = async () => {
    setLocating(true);
    try {
      const fix = await getCurrentPosition();
      if (!isInTehran(fix)) toast.warning('به نظر می‌رسد بیرون از تهران هستید؛ داده‌های ما فقط فروشگاه‌های تهران را پوشش می‌دهد.');
      let label = 'موقعیت فعلی من';
      try {
        const place = await api.reversePlace(fix);
        if (place?.name) label = `نزدیک ${place.name}`;
      } catch {
        /* reverse geocoding is optional */
      }
      choose({ lat: fix.lat, lng: fix.lng, name: label }, 'gps');
    } catch (e) {
      toast.error(e instanceof GeoError ? e.message : GEO_MESSAGES.unavailable);
    } finally {
      setLocating(false);
    }
  };

  const radiusValue: RadiusValue = maxKm ? ((RADIUS_OPTIONS.find((o) => o.value === String(maxKm))?.value ?? 'any') as RadiusValue) : 'any';

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="کجا هستید؟" description="فروشگاه‌ها را بر اساس فاصله از این نقطه مرتب می‌کنیم." icon={MapPin} size="tall">
      <div className="space-y-5">
        {location ? (
          <div className="flex items-center gap-3 rounded-2xl border border-primary-100 bg-primary-tint px-3.5 py-2.5">
            <MapPin aria-hidden className="size-5 text-primary-strong" />
            <div className="min-w-0 flex-1">
              <p className="text-caption text-primary-ink/80">محدوده فعلی</p>
              <p className="truncate text-body font-bold text-primary-ink">{location.label}</p>
            </div>
            <Button variant="ghost" size="sm" startIcon={X} onClick={() => setLocation(undefined)}>
              حذف
            </Button>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="primary" size="lg" startIcon={LocateFixed} loading={locating} onClick={useGps} className="text-meta">
            موقعیت فعلی من
          </Button>
          <Button variant="secondary" size="lg" startIcon={MapIcon} onClick={() => setMapOpen(true)} className="text-meta">
            انتخاب روی نقشه
          </Button>
        </div>

        <div>
          <TextField
            label="جستجوی محله، مترو یا پاساژ"
            hideLabel
            placeholder="مثلاً میدان ولیعصر، پاساژ علاءالدین…"
            startIcon={Search}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
            end={places.isFetching ? <Spinner size="sm" label={null} /> : null}
          />
          {debounced.length >= 2 ? (
            <ul className="mt-2 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface" aria-live="polite">
              {places.isError ? (
                <li className="px-4 py-3 text-meta text-muted">جستجوی مکان فعلاً در دسترس نیست؛ از محدوده‌های پرفروشگاه زیر انتخاب کنید.</li>
              ) : places.data && places.data.length === 0 ? (
                <li className="px-4 py-3 text-meta text-muted">مکانی با این نام پیدا نکردیم.</li>
              ) : (
                places.data?.map((p: Place) => {
                  const Icon = PLACE_ICON[p.kind];
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => choose(p, 'place')}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-start hover:bg-primary-tint/60 focus-visible:bg-primary-tint focus-visible:outline-none"
                      >
                        <Icon aria-hidden className="size-[1.125rem] text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-body font-medium">{p.name}</span>
                          {p.subtitle ? <span className="block truncate text-caption text-muted">{p.subtitle}</span> : null}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          ) : null}
        </div>

        <section aria-labelledby="loc-areas">
          <h3 id="loc-areas" className="mb-2 text-meta font-bold text-ink-2">
            محدوده‌های پرفروشگاه
          </h3>
          <div className="flex flex-wrap gap-2">
            {areas.map((a) => (
              <button
                key={a.name}
                type="button"
                onClick={() => choose(a, 'place')}
                className={cn(
                  'hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-meta font-medium press',
                  location?.label === a.name ? 'border-primary/70 bg-primary-tint text-primary-ink' : 'border-line bg-surface text-ink-2 hover:border-primary-200',
                )}
              >
                {a.name}
                <span className="text-caption text-faint num">{formatNumber(a.shopCount)}</span>
              </button>
            ))}
          </div>
          <DataNote className="mt-2">عدد کنار هر محدوده، تعداد فروشگاه‌های ثبت‌شده در داده‌های ترب است.</DataNote>
        </section>

        <section aria-labelledby="loc-radius">
          <h3 id="loc-radius" className="mb-2 text-meta font-bold text-ink-2">
            حداکثر فاصله
          </h3>
          <Segmented
            label="حداکثر فاصله"
            size="sm"
            fullWidth
            options={RADIUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            value={radiusValue}
            onChange={(v) => setMaxDistanceKm(v === 'any' ? undefined : Number(v))}
          />
        </section>
      </div>

      <Sheet
        nested
        open={mapOpen}
        onOpenChange={setMapOpen}
        title="انتخاب روی نقشه"
        description="روی نقشه بزنید تا نقطه انتخاب شود."
        icon={Crosshair}
        size="full"
        footer={
          <Button
            fullWidth
            size="lg"
            disabled={!picked}
            onClick={() => {
              if (!picked) return;
              setMapOpen(false);
              choose({ ...picked, name: 'نقطه انتخابی روی نقشه' }, 'map');
            }}
          >
            همین‌جا را انتخاب کن
          </Button>
        }
        bodyClassName="px-0 pb-0"
      >
        {mapOpen ? (
          <LazyMap
            className="h-full min-h-[50dvh] rounded-none"
            center={picked ?? location ?? undefined}
            zoom={13}
            fit={false}
            onPick={setPicked}
            picked={picked}
            user={location?.source === 'gps' ? location : null}
            label="نقشه برای انتخاب موقعیت"
          />
        ) : null}
      </Sheet>
    </Sheet>
  );
}
