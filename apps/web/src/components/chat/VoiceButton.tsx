import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '../../lib/api.js';
import { useMeta } from '../../lib/queries.js';
import { Spinner } from '../ui/Spinner.js';
import { cn } from '../../lib/cn.js';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

const SpeechRec = (): (new () => Recognition) | null => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/**
 * Voice input: records with MediaRecorder → POST /api/transcribe when the server has STT; otherwise (or on failure)
 * uses the browser's Web Speech API (fa-IR). Hidden when neither is available.
 */
export function VoiceButton({ onText, onInterim, disabled, className }: { onText: (text: string) => void; onInterim?: (text: string) => void; disabled?: boolean; className?: string }) {
  const { data: meta } = useMeta();
  const [state, setState] = useState<'idle' | 'recording' | 'transcribing'>('idle');
  const recRef = useRef<MediaRecorder | null>(null);
  const speechRef = useRef<Recognition | null>(null);
  const chunks = useRef<Blob[]>([]);
  const canRecord = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;
  const useServer = !!meta?.features.stt && canRecord;
  const available = useServer || !!SpeechRec();

  useEffect(() => () => {
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    speechRef.current?.stop();
  }, []);

  if (!available) return null;

  const startSpeech = () => {
    const Ctor = SpeechRec();
    if (!Ctor) {
      toast.error('تشخیص گفتار در این مرورگر پشتیبانی نمی‌شود.');
      setState('idle');
      return;
    }
    const r = new Ctor();
    r.lang = 'fa-IR';
    r.interimResults = true;
    r.continuous = false;
    let finalText = '';
    r.onresult = (e) => {
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const res = e.results[i]!;
        if (res.isFinal) finalText += res[0]!.transcript;
        else interim += res[0]!.transcript;
      }
      onInterim?.(finalText + interim);
    };
    r.onerror = (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') toast.error('دسترسی به میکروفون ممکن نشد.');
    };
    r.onend = () => {
      setState('idle');
      if (finalText.trim()) onText(finalText.trim());
    };
    speechRef.current = r;
    setState('recording');
    r.start();
  };

  const startRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunks.current = [];
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState('transcribing');
        try {
          const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
          const { text } = await api.transcribe(blob, rec.mimeType.includes('mp4') ? 'voice.mp4' : 'voice.webm');
          if (text?.trim()) onText(text.trim());
          else toast('صدایی تشخیص داده نشد؛ دوباره امتحان کنید.');
        } catch {
          toast.error('تبدیل صدا به متن ممکن نشد؛ لطفاً تایپ کنید.');
        } finally {
          setState('idle');
        }
      };
      recRef.current = rec;
      rec.start();
      setState('recording');
    } catch {
      // Permission denied or unsupported → browser speech as a fallback.
      startSpeech();
    }
  };

  const toggle = () => {
    if (state === 'recording') {
      recRef.current?.state === 'recording' ? recRef.current.stop() : speechRef.current?.stop();
      return;
    }
    if (state === 'idle') void (useServer ? startRecorder() : startSpeech());
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled || state === 'transcribing'}
      aria-label={state === 'recording' ? 'پایان ضبط صدا' : 'گفتن با صدا'}
      aria-pressed={state === 'recording'}
      className={cn(
        'relative grid size-11 shrink-0 place-items-center rounded-full transition-colors press disabled:opacity-50',
        state === 'recording' ? 'bg-bad text-white' : 'bg-primary-tint text-primary-ink hover:bg-primary-100',
        className,
      )}
    >
      {state === 'recording' ? (
        <>
          <span aria-hidden className="absolute inset-0 rounded-full bg-bad/40 motion-safe:animate-live" />
          <Square aria-hidden className="relative size-4 fill-current" />
        </>
      ) : state === 'transcribing' ? (
        <Spinner size="sm" label="در حال تبدیل صدا به متن" />
      ) : (
        <Mic aria-hidden className="size-5" />
      )}
    </button>
  );
}
