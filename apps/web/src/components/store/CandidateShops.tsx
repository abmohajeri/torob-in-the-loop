import { Link } from 'react-router';
import { CircleHelp, MessageCircleQuestion } from 'lucide-react';
import { formatNumber, type CandidateShop } from '@titl/shared';
import { OpenStatusBadge } from '../data/OpenStatusBadge.js';
import { DistanceEta } from '../data/DistanceEta.js';
import { InMallGuide } from '../data/InMallGuide.js';
import { Button } from '../ui/Button.js';
import { paths } from '../../lib/paths.js';
import { openAsk } from '../../state/ask.js';
import { cn } from '../../lib/cn.js';
import { askShop } from './askTarget.js';

export interface CandidateShopsProps {
  items: CandidateShop[];
  productId?: string;
  productTitle?: string | null;
  group?: string | null;
  /** Chat preview: fewer rows, no section header text. */
  compact?: boolean;
  limit?: number;
  title?: string;
  className?: string;
}

/**
 * «ممکن است داشته باشند» — shops whose declared activity category matches, with no offer for this item.
 * Dashed section, availability always «نامشخص», primary action «بپرس».
 */
export function CandidateShops({ items, productId, productTitle, group, compact, limit, title = 'ممکن است داشته باشند', className }: CandidateShopsProps) {
  if (!items.length) return null;
  const max = limit ?? (compact ? 3 : items.length);
  const rows = items.slice(0, max);
  const askAll = () => openAsk({ shops: rows.map((c) => askShop(c.shop)), productId, productTitle, group, questions: ['stock', 'price', 'hours'] });
  return (
    <section aria-label={title} className={cn('rounded-2xl border-2 border-dashed border-line bg-surface-2/60 p-3', className)}>
      <header className="mb-2.5 flex items-start gap-2">
        <CircleHelp aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1">
          <h3 className="text-body font-extrabold text-ink">
            {title} <span className="num font-medium text-muted">({formatNumber(items.length)})</span>
          </h3>
          <p className="text-caption leading-5 text-muted">فقط دسته فعالیت ثبت شده — موجودی این کالا نامشخص است؛ از خودشان می‌پرسیم.</p>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.shop.id} className="flex items-start gap-2 rounded-xl border border-dashed border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <Link to={paths.shop(c.shop.id)} className="text-body font-bold text-ink hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-primary">
                {c.shop.name}
              </Link>
              <InMallGuide location={c.shop.location} variant="line" linkMall={false} />
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <OpenStatusBadge status={c.shop.openStatus} size="sm" />
                <DistanceEta distanceKm={c.shop.distanceKm} etaMin={c.shop.etaMin} size="sm" promptLocation={false} />
              </div>
              <p className="mt-1 text-caption text-muted">دسته: {c.matchedCategory}</p>
            </div>
            <Button size="sm" variant="outline" startIcon={MessageCircleQuestion} onClick={() => openAsk({ shops: [askShop(c.shop)], productId, productTitle, group })} aria-label={`از ${c.shop.name} بپرس`}>
              بپرس
            </Button>
          </li>
        ))}
      </ul>
      {rows.length > 1 ? (
        <Button variant="soft" size="sm" fullWidth className="mt-2.5" startIcon={MessageCircleQuestion} onClick={askAll}>
          از هر {formatNumber(rows.length)} فروشگاه بپرس
        </Button>
      ) : null}
    </section>
  );
}
