import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, RotateCcw, Sparkles, Square, Undo2 } from 'lucide-react';
import { formatNumber, type UserContext } from '@titl/shared';
import { VoiceButton } from './VoiceButton.js';
import { BlockRenderer } from '../blocks/BlockRenderer.js';
import { useCssVarHeight } from '../../lib/useCssVarHeight.js';
import { budgetLabel } from '../../lib/context-labels.js';
import { describeVisitAt } from '../../lib/visit-time.js';
import type { ChatTurn } from '../../state/useChat.js';
import { cn } from '../../lib/cn.js';

/** Three-dot typing indicator (static dots under reduced motion). */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 rounded-full bg-primary motion-safe:animate-bounce" style={{ animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}

/** Persian description of an assistant context patch: «قسطی» را روشن کرد … */
export function describePatch(p: Partial<UserContext>): string {
  const parts: string[] = [];
  if (p.installment !== undefined) parts.push(p.installment ? '«قسطی» را روشن کرد' : '«قسطی» را خاموش کرد');
  if (p.budgetMax !== undefined || p.budgetMin !== undefined) parts.push(`بودجه را «${budgetLabel(p) ?? 'بدون محدودیت'}» گذاشت`);
  if (p.location) parts.push(`محدوده را «${p.location.label}» گذاشت`);
  if (p.openNow) parts.push('«فقط بازها» را روشن کرد');
  if (p.visitAt) parts.push(`زمان مراجعه را «${describeVisitAt(p.visitAt)}» گذاشت`);
  if (p.maxDistanceKm) parts.push(`شعاع را ${formatNumber(p.maxDistanceKm)} کیلومتر کرد`);
  if (p.kalabarg) parts.push('«کالابرگ» را اضافه کرد');
  if (p.warrantyOnly) parts.push('«فقط با گارانتی» را روشن کرد');
  return parts.length ? `دستیار ${parts.join('، ')}` : 'دستیار شرایط جستجو را به‌روز کرد';
}

export function ChatMessage({ turn, onSend, onUndoContext, busy }: { turn: ChatTurn; onSend: (m: string) => void; onUndoContext: () => void; busy: boolean }) {
  if (turn.role === 'user') {
    return (
      <div className="flex animate-rise-in justify-start">
        <div className="flex max-w-[85%] items-end gap-2">
          <p className="rounded-2xl rounded-ss-md bg-primary-strong px-4 py-2.5 text-body text-white shadow-card">{turn.text}</p>
        </div>
      </div>
    );
  }
  const empty = !turn.text && !turn.blocks.length;
  return (
    <div className="flex animate-rise-in flex-col gap-3" aria-busy={turn.streaming}>
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary-tint text-primary">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          {turn.contextChange ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary-200 bg-primary-tint/70 px-3 py-1.5 text-caption text-primary-ink motion-safe:animate-flash">
              {describePatch(turn.contextChange.patch)}
              <button type="button" onClick={onUndoContext} className="hit-44 inline-flex items-center gap-1 font-bold underline-offset-4 hover:underline">
                <Undo2 aria-hidden className="size-3.5" /> برگرداندن
              </button>
            </p>
          ) : null}
          {turn.text ? <p className="whitespace-pre-wrap text-body leading-7 text-ink">{turn.text}</p> : null}
          {turn.streaming && (turn.status || empty) ? (
            <p className="flex items-center gap-2 text-meta text-muted" role="status">
              <TypingDots />
              {turn.status ?? 'در حال فکر کردن…'}
            </p>
          ) : null}
          {turn.error ? (
            <p role="alert" className="rounded-xl border border-bad-line bg-bad-tint px-3 py-2 text-meta text-bad-ink">
              {turn.error}
            </p>
          ) : null}
        </div>
      </div>
      {turn.blocks.map((b, i) => (
        <div key={i} className="animate-rise-in">
          <BlockRenderer block={b} onSend={onSend} disabled={busy} />
        </div>
      ))}
      {turn.mode === 'local' && !turn.streaming ? (
        <p className="text-caption text-muted">حالت پایه: دستیار هوشمند در دسترس نبود و نتایج مستقیم از جستجو آمد.</p>
      ) : null}
    </div>
  );
}

export interface ComposerProps {
  onSend: (message: string) => void;
  onStop: () => void;
  onReset?: () => void;
  busy: boolean;
  initial?: string;
}

/** Fixed composer above the tab bar: text + voice + send/stop. Publishes `--cta-h`. */
export function Composer({ onSend, onStop, onReset, busy, initial = '' }: ComposerProps) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useCssVarHeight(ref, '--cta-h');
  useEffect(() => setText(initial), [initial]);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!text.trim() || busy) return;
    onSend(text);
    setText('');
  };

  return (
    <div ref={ref} className="app-fixed bottom-[var(--bottom-ui)] z-30 bg-gradient-to-t from-canvas from-75% to-transparent px-3 pt-4 pb-2">
      <form onSubmit={submit} className="flex items-end gap-2 rounded-3xl border border-line bg-surface p-1.5 shadow-raised focus-within:border-primary">
        {onReset ? (
          <button type="button" onClick={onReset} aria-label="گفتگوی تازه" className="grid size-11 shrink-0 place-items-center rounded-full text-muted hover:bg-sunken press">
            <RotateCcw aria-hidden className="size-5" />
          </button>
        ) : null}
        <label htmlFor="chat-input" className="sr-only">
          پیام به دستیار
        </label>
        <textarea
          id="chat-input"
          ref={inputRef}
          rows={1}
          value={text}
          enterKeyHint="send"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          placeholder="چه می‌خواهید؟ مثلاً گوشی قسطی"
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-body leading-6 text-ink outline-none [field-sizing:content]"
        />
        <VoiceButton
          disabled={busy}
          onInterim={setText}
          onText={(t) => {
            setText('');
            onSend(t);
          }}
        />
        {busy ? (
          <button type="button" onClick={onStop} aria-label="توقف پاسخ" className="grid size-11 shrink-0 place-items-center rounded-full bg-ink-2 text-white press">
            <Square aria-hidden className="size-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="ارسال"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-strong text-white shadow-glow-accent press disabled:bg-sunken disabled:text-faint disabled:shadow-none"
          >
            <ArrowUp aria-hidden className="size-5" />
          </button>
        )}
      </form>
    </div>
  );
}
