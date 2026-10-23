import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Layers, Search } from 'lucide-react';
import { formatNumber, normalizeForSearch, type MallDetail } from '@titl/shared';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { TextField } from '../ui/TextField.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

export interface FloorDirectoryProps {
  floors: MallDetail['floors'];
  /** Shop to highlight (e.g. the one the user is looking for). */
  highlightShopId?: string | null;
  className?: string;
}

/** Floor-by-floor directory with a quick filter (name / unit). */
export function FloorDirectory({ floors, highlightShopId, className }: FloorDirectoryProps) {
  const [q, setQ] = useState('');
  const nq = normalizeForSearch(q);
  const shown = useMemo(
    () =>
      floors
        .map((f) => ({ ...f, shops: nq ? f.shops.filter((s) => normalizeForSearch(`${s.name} ${s.location.unit ?? ''} ${s.location.plaque ?? ''}`).includes(nq)) : f.shops }))
        .filter((f) => f.shops.length),
    [floors, nq],
  );
  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <TextField label="جستجو در پاساژ" hideLabel placeholder="نام فروشگاه یا شماره واحد" startIcon={Search} value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <p className="text-meta text-muted">فروشگاهی با این مشخصات در این پاساژ ثبت نشده است.</p> : null}
      {shown.map((f) => (
        <section key={f.label} aria-label={f.label}>
          <h3 className="sticky top-[calc(var(--header-h,56px))] z-10 mb-2 flex items-center gap-2 bg-canvas/95 py-1.5 text-body font-extrabold text-heading backdrop-blur">
            <Layers aria-hidden className="size-[1.125rem] text-primary" />
            {f.label}
            <span className="num text-meta font-medium text-muted">({formatNumber(f.shops.length)})</span>
          </h3>
          <ul className="grid grid-cols-1 gap-2">
            {f.shops.map((s) => (
              <li key={s.id}>
                <Link
                  to={paths.shop(s.id)}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border bg-surface px-3 py-2.5 shadow-card press hover:border-primary-200 focus-visible:outline-2 focus-visible:outline-primary',
                    s.id === highlightShopId ? 'border-primary ring-2 ring-primary/25' : 'border-line/80',
                  )}
                >
                  <span className="num grid h-9 min-w-12 shrink-0 place-items-center rounded-lg bg-sunken px-1.5 text-caption font-bold text-ink-2">
                    {s.location.unit ?? s.location.plaque ?? '؟'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-bold text-ink">{s.name}</span>
                    <OpenStatusBadge status={s.openStatus} size="sm" plain />
                  </span>
                  {!s.hasOffers ? <span className="shrink-0 text-caption text-muted">فقط دسته فعالیت</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
