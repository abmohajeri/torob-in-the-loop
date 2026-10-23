import { useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ArrowLeftRight, X } from 'lucide-react';
import { formatNumber } from '@titl/shared';
import { Button } from '../ui/Button.js';
import { MAX_COMPARE_PRODUCTS, useCompare } from '../../state/useCompare.js';
import { paths } from '../../lib/paths.js';
import { useCssVarHeight } from '../../lib/useCssVarHeight.js';
import { cn } from '../../lib/cn.js';

/**
 * Floating comparison bar (above the tab bar / sticky CTA) while ≥ 1 product is selected.
 * Thumbnails · «۲ از ۴ کالا» · «مقایسه» (enabled from 2) · clear. Hidden on the compare pages themselves.
 */
export function CompareTray({ className }: { className?: string }) {
  const items = useCompare((s) => s.items);
  const remove = useCompare((s) => s.remove);
  const clear = useCompare((s) => s.clear);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const visible = items.length > 0 && !pathname.startsWith('/compare') && !pathname.startsWith('/seller') && pathname !== '/_dev';
  useCssVarHeight(ref, '--tray-h', visible);
  if (!visible) return null;
  const canCompare = items.length >= 2;
  return (
    <div
      ref={ref}
      className={cn('app-fixed z-30 px-3 pb-2 bottom-[calc(var(--bottom-ui)+var(--cta-h,0px))] animate-slide-up', className)}
      role="region"
      aria-label="فهرست مقایسه"
    >
      <div className="flex items-center gap-2.5 rounded-2xl border border-primary-800/20 bg-primary-950/95 p-2 ps-2.5 text-white shadow-float backdrop-blur">
        <ul className="flex shrink-0 -space-x-2 space-x-reverse">
          {items.map((it) => (
            <li key={it.id} className="relative">
              <button
                type="button"
                onClick={() => remove(it.id)}
                aria-label={`حذف «${it.title}» از مقایسه`}
                className="group relative grid size-10 place-items-center overflow-hidden rounded-xl border-2 border-primary-950 bg-white focus-visible:outline-2 focus-visible:outline-primary-300"
              >
                {it.image ? <img src={it.image} alt="" className="size-full object-contain p-0.5" loading="lazy" referrerPolicy="no-referrer" /> : <span className="text-caption text-muted">—</span>}
                <span className="absolute inset-0 grid place-items-center bg-primary-950/70 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  <X aria-hidden className="size-4" />
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-meta font-bold">
            <span className="num">{formatNumber(items.length)}</span> کالا برای مقایسه
          </p>
          <p className="text-caption text-primary-100/80">{canCompare ? `حداکثر ${formatNumber(MAX_COMPARE_PRODUCTS)} کالا` : 'یک کالای دیگر انتخاب کنید'}</p>
        </div>
        <button
          type="button"
          onClick={clear}
          aria-label="پاک کردن فهرست مقایسه"
          className="hit-44 grid size-9 shrink-0 place-items-center rounded-xl text-primary-100/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-primary-300"
        >
          <X aria-hidden className="size-[1.125rem]" />
        </button>
        <Button
          size="sm"
          variant="accent"
          startIcon={ArrowLeftRight}
          disabled={!canCompare}
          onClick={() => navigate(paths.compare(items.map((i) => i.id)))}
          className="shadow-none"
        >
          مقایسه
        </Button>
      </div>
    </div>
  );
}
