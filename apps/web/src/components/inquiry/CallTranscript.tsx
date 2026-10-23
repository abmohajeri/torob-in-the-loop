import { useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Bot, Store } from 'lucide-react';
import { formatTimeOfDay, type InquiryEvent } from '@titl/shared';
import { usePrefersReducedMotion } from '../../lib/hooks.js';
import { cn } from '../../lib/cn.js';

export interface CallTranscriptProps {
  events: InquiryEvent[];
  /** Show a typing indicator at the end (call in progress). */
  live?: boolean;
  /** Auto-scroll the page to the newest line while live. */
  follow?: boolean;
  className?: string;
}

/** Streaming call transcript: agent (start) vs store (end) bubbles, system/status lines centered. */
export function CallTranscript({ events, live, follow, className }: CallTranscriptProps) {
  const reduced = usePrefersReducedMotion();
  const endRef = useRef<HTMLDivElement>(null);
  const shown = events.filter((e) => e.type !== 'alternatives' && e.text.trim());
  useEffect(() => {
    if (follow && live) endRef.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [shown.length, follow, live, reduced]);

  return (
    <ol className={cn('flex flex-col gap-2.5', className)} aria-label="متن گفتگو">
      {shown.map((e) => {
        const speaker = e.type === 'line' ? (e.speaker ?? 'system') : 'system';
        const anim = reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.25, ease: 'easeOut' as const } };
        if (speaker === 'system')
          return (
            <motion.li key={e.id} {...anim} className="self-center rounded-full bg-sunken px-3 py-1 text-center text-caption text-muted">
              {e.text} <span className="num text-faint">· {formatTimeOfDay(e.at)}</span>
            </motion.li>
          );
        const agent = speaker === 'agent';
        const Icon = agent ? Bot : Store;
        return (
          <motion.li key={e.id} {...anim} className={cn('flex max-w-[88%] items-end gap-2', agent ? 'self-start' : 'self-end flex-row-reverse')}>
            <span aria-hidden className={cn('grid size-7 shrink-0 place-items-center rounded-full', agent ? 'bg-primary-tint text-primary-strong' : 'bg-accent-tint text-accent-strong')}>
              <Icon className="size-4" />
            </span>
            <div className={cn('rounded-2xl px-3 py-2 text-body leading-7', agent ? 'rounded-es-md bg-surface border border-line text-ink' : 'rounded-ee-md bg-primary-strong text-white')}>
              <span className="sr-only">{agent ? 'دستیار: ' : 'فروشنده: '}</span>
              {e.text}
            </div>
          </motion.li>
        );
      })}
      {live ? (
        <li className="flex items-center gap-1.5 self-start ps-9" aria-hidden>
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2 rounded-full bg-primary/60 motion-safe:animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </li>
      ) : null}
      <div ref={endRef} />
    </ol>
  );
}
