import { Fragment } from 'react';
import { Link } from 'react-router';
import { Building2, ChevronLeft, DoorOpen, Landmark, Layers, Lightbulb, MessageCircleQuestion, Signpost } from 'lucide-react';
import type { InMallLocation } from '@titl/shared';
import { Badge } from '../ui/Badge.js';
import { InfoPopover } from '../ui/InfoPopover.js';
import { CONFIDENCE_META, inMallLine } from '../../lib/labels.js';
import { paths } from '../../lib/paths.js';
import { cn } from '../../lib/cn.js';

export interface InMallGuideProps {
  location: InMallLocation;
  /** line = one compact row (cards) · card = step-by-step wayfinding panel (shop page, plan stops). */
  variant?: 'line' | 'card';
  /** «از فروشگاه آدرس دقیق بپرس». */
  onAsk?: () => void;
  /** Link the mall name to its page (default true in card variant). */
  linkMall?: boolean;
  className?: string;
}

const STEP_ICONS = [Building2, Layers, DoorOpen];

/** Passage → floor → unit wayfinding parsed from the shop's address, with wing/landmark lines and confidence. */
export function InMallGuide({ location, variant = 'card', onAsk, linkMall = true, className }: InMallGuideProps) {
  const conf = CONFIDENCE_META[location.confidence];
  if (variant === 'line') {
    const line = inMallLine(location);
    if (!line) return null;
    return (
      <p className={cn('flex min-w-0 items-center gap-1.5 text-meta text-ink-2', className)}>
        <Building2 aria-hidden className="size-4 shrink-0 text-primary" />
        <span className="truncate">{line}</span>
      </p>
    );
  }

  const steps = location.guide.length ? location.guide : [inMallLine(location) ?? 'نشانی داخل پاساژ ثبت نشده'];
  return (
    <section className={cn('rounded-2xl border border-primary-100 bg-gradient-to-b from-primary-tint to-surface p-3.5', className)} aria-label="راهنمای پیدا کردن فروشگاه">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-meta font-extrabold text-primary-ink">
          <Signpost aria-hidden className="size-4" />
          مسیر داخل پاساژ
        </h4>
        <span className="inline-flex items-center gap-0.5">
          <Badge tone={conf.tone} size="sm">
            {conf.label}
          </Badge>
          <InfoPopover label="دقت نشانی" align="end">
            {conf.hint} این راهنما از متن نشانی فروشنده استخراج شده است.
          </InfoPopover>
        </span>
      </div>

      <ol className="flex flex-wrap items-center gap-1.5">
        {steps.map((step, i) => {
          const Icon = STEP_ICONS[Math.min(i, STEP_ICONS.length - 1)] ?? DoorOpen;
          const isMall = i === 0 && location.mall;
          const content = (
            <>
              <Icon aria-hidden className="size-4 shrink-0 text-primary-strong" />
              <span className="truncate">{step}</span>
            </>
          );
          const pill =
            'inline-flex max-w-full items-center gap-1.5 rounded-xl border border-primary-100 bg-surface px-2.5 py-1.5 text-meta font-bold text-ink shadow-card';
          return (
            <Fragment key={`${i}-${step}`}>
              <li className="max-w-full">
                {isMall && linkMall && location.mall ? (
                  <Link to={paths.mall(location.mall.slug)} className={cn(pill, 'hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-primary')}>
                    {content}
                  </Link>
                ) : (
                  <span className={pill}>{content}</span>
                )}
              </li>
              {i < steps.length - 1 ? (
                <li aria-hidden className="text-primary-300">
                  <ChevronLeft className="size-4" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>

      {location.wing || location.landmark ? (
        <ul className="mt-2.5 flex flex-col gap-1 text-meta text-ink-2">
          {location.wing ? (
            <li className="flex items-start gap-1.5">
              <Signpost aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {location.wing}
            </li>
          ) : null}
          {location.landmark ? (
            <li className="flex items-start gap-1.5">
              <Landmark aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
              {location.landmark}
            </li>
          ) : null}
        </ul>
      ) : null}

      {location.hints?.length ? (
        <ul className="mt-2.5 flex flex-col gap-1 border-t border-dashed border-primary-100 pt-2.5 text-caption text-muted">
          {location.hints.map((h) => (
            <li key={h} className="flex items-start gap-1.5">
              <Lightbulb aria-hidden className="mt-0.5 size-3.5 shrink-0 text-accent" />
              {h}
            </li>
          ))}
        </ul>
      ) : null}

      {onAsk ? (
        <button
          type="button"
          onClick={onAsk}
          className="hit-44 mt-2.5 inline-flex items-center gap-1 rounded-full text-meta font-bold text-accent-strong hover:underline focus-visible:outline-2 focus-visible:outline-primary"
        >
          <MessageCircleQuestion aria-hidden className="size-4" />
          از فروشگاه نشانی دقیق را بپرسید
        </button>
      ) : null}
    </section>
  );
}
