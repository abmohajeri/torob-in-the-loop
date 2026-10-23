import { Megaphone } from 'lucide-react';
import { REPORT_TYPE_META, formatNumber, formatRelative, type CrowdReport } from '@titl/shared';
import { DynamicIcon } from '../../lib/icons.js';

/** Recent buyer reports («۲ نفر در ۳ ساعت گذشته گزارش دادند بسته است»). */
export function ShopReports({ reports }: { reports: CrowdReport[] }) {
  if (!reports.length) return <p className="text-meta text-muted">هنوز گزارشی از خریداران ثبت نشده است.</p>;
  const closed = reports.filter((r) => r.type === 'closed' && Date.now() - new Date(r.at).getTime() < 3 * 3600_000);
  return (
    <div className="flex flex-col gap-2">
      {closed.length ? (
        <p className="flex items-center gap-2 rounded-xl bg-warn-tint px-3 py-2 text-meta font-medium text-warn-ink">
          <Megaphone aria-hidden className="size-4" />
          {formatNumber(closed.length)} نفر در ۳ ساعت گذشته گزارش دادند بسته است
        </p>
      ) : null}
      <ul className="flex flex-col divide-y divide-line-soft">
        {reports.slice(0, 6).map((r) => (
          <li key={r.id} className="flex items-start gap-2 py-2 text-meta">
            <DynamicIcon name={REPORT_TYPE_META[r.type]?.icon} aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
            <span className="flex-1 text-ink">
              {REPORT_TYPE_META[r.type]?.label ?? r.type}
              {r.note ? <span className="block text-caption text-muted">{r.note}</span> : null}
            </span>
            <span className="text-caption text-faint">{formatRelative(r.at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
