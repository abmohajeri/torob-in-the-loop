import { useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router';
import { CalendarCheck, MessageCircleQuestion, MessagesSquare, Search, ShieldCheck, Sparkles, Store } from 'lucide-react';
import { EXAMPLE_QUERIES, formatNumber } from '@titl/shared';
import { ChatMessage, Composer } from '../components/chat/Chat.js';
import { StepList } from '../components/ui/Stepper.js';
import { dayGreeting } from '../components/data/VisitTimeBanner.js';
import { useChat } from '../state/useChat.js';
import { useMeta } from '../lib/queries.js';
import { iconByName } from '../lib/icons.js';
import { paths } from '../lib/paths.js';
import { useDocumentTitle, useNow, usePrefersReducedMotion } from '../lib/hooks.js';

const STEPS = [
  { title: 'بگویید چه می‌خواهید', description: 'با متن یا صدا؛ حتی اگر مدل دقیقش را نمی‌دانید.', icon: MessagesSquare },
  { title: 'فروشگاه‌های نزدیک را ببینید', description: 'با قیمت ثبت‌شده، تاریخ آن و باز بودن در زمان مراجعه.', icon: Store },
  { title: 'قبل از رفتن بپرسید', description: 'موجودی، قیمت روز و قسطی را از فروشگاه می‌پرسیم.', icon: MessageCircleQuestion },
  { title: 'با برنامه بروید', description: 'مسیر چند فروشگاه، طبقه و واحد داخل پاساژ.', icon: CalendarCheck },
];

function EmptyHome({ onSend }: { onSend: (m: string) => void }) {
  const { data: meta } = useMeta();
  const now = useNow(60_000);
  const examples = (meta?.examples?.length ? meta.examples : EXAMPLE_QUERIES).slice(0, 5);
  return (
    <div className="flex flex-col gap-6 px-4 pt-3">
      <section>
        <p className="text-meta font-medium text-primary-strong">{dayGreeting(now)}</p>
        <h1 className="mt-1 text-display font-extrabold text-heading">امروز دنبال چه می‌گردید؟</h1>
        <p className="mt-1 text-body text-ink-2">
          از بین {meta ? formatNumber(meta.catalog.shopsWithOffers) : '…'} فروشگاه حضوری تهران، نزدیک‌ترین و مطمئن‌ترین را پیدا می‌کنیم.
        </p>
      </section>

      <section aria-labelledby="examples-h">
        <h2 id="examples-h" className="mb-2 flex items-center gap-1.5 text-meta font-bold text-ink-2">
          <Sparkles aria-hidden className="size-4 text-accent" /> امتحان کنید
        </h2>
        <ul className="flex flex-col gap-2">
          {examples.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => onSend(ex)}
                className="press flex min-h-12 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-2.5 text-start text-body text-ink shadow-card hover:border-primary-200"
              >
                <Search aria-hidden className="size-4 shrink-0 text-primary" />
                {ex}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {meta?.categoryGroups.length ? (
        <section aria-labelledby="cats-h">
          <h2 id="cats-h" className="mb-2 text-meta font-bold text-ink-2">
            دسته‌ها
          </h2>
          <div className="grid grid-cols-4 gap-2">
            {meta.categoryGroups.slice(0, 8).map((g) => {
              const Icon = iconByName(g.icon);
              return (
                <Link
                  key={g.id}
                  to={paths.search(undefined, { group: g.id })}
                  className="press flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-2 text-center shadow-card hover:border-primary-200"
                >
                  <span className="grid size-9 place-items-center rounded-xl bg-primary-tint text-primary-strong">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="line-clamp-2 text-caption font-medium leading-4 text-ink">{g.name}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="how-h" className="rounded-3xl border border-line bg-surface p-4 shadow-card">
        <h2 id="how-h" className="mb-4 text-title font-bold text-heading">
          خرید حضوری در ۴ قدم
        </h2>
        <StepList steps={STEPS} compact />
      </section>

      <p className="flex gap-2 rounded-2xl bg-primary-tint/70 px-4 py-3 text-meta text-primary-ink">
        <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0" />
        قیمت‌ها همان چیزی است که فروشنده در ترب ثبت کرده، همراه تاریخ ثبت. هر چیزی که ثبت نشده را «نامشخص» نشان می‌دهیم و
        می‌پرسیم — رتبه‌بندی تبلیغاتی نیست.
        {/* TODO: link to /about «داده‌ها چقدر کامل است؟» */}
      </p>
    </div>
  );
}

/** Assistant home: empty state (examples, categories, 4 steps) → streaming conversation with UI blocks. */
export default function HomePage() {
  useDocumentTitle('دستیار خرید');
  const turns = useChat((s) => s.turns);
  const busy = useChat((s) => s.busy);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const reset = useChat((s) => s.reset);
  const undoContext = useChat((s) => s.undoContext);
  const [params, setParams] = useSearchParams();
  const endRef = useRef<HTMLDivElement>(null);
  const reduced = usePrefersReducedMotion();
  const lastLen = turns.length;

  // Deep link: /?q=… sends once.
  useEffect(() => {
    const q = params.get('q');
    if (q) {
      setParams({}, { replace: true });
      void send(q);
    }
  }, [params, send, setParams]);

  useEffect(() => {
    if (lastLen) endRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [lastLen, reduced]);

  return (
    <>
      {turns.length === 0 ? (
        <EmptyHome onSend={(m) => void send(m)} />
      ) : (
        <div className="flex flex-col gap-5 px-4 pt-3" aria-live="polite" aria-relevant="additions">
          <h1 className="sr-only">گفتگو با دستیار خرید</h1>
          {turns.map((t) => (
            <ChatMessage key={t.id} turn={t} busy={busy} onSend={(m) => void send(m)} onUndoContext={() => undoContext(t.id)} />
          ))}
          <div ref={endRef} />
        </div>
      )}
      <Composer busy={busy} onSend={(m) => void send(m)} onStop={stop} onReset={turns.length ? reset : undefined} />
    </>
  );
}
