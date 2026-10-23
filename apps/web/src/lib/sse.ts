/**
 * Server-Sent Events utilities.
 *
 *  - `createSSEParser`  incremental WHATWG event-stream parser (handles CR/LF/CRLF split across chunks).
 *  - `streamPost`       POST + streamed SSE response (fetch + ReadableStream) — used by /api/chat.
 *  - `connectEventSource` GET EventSource with our own reconnect/backoff (quiet when the endpoint 404s).
 *
 * All Torob in the Loop streams send `data: <JSON>\n\n` frames and `{type:'ping'}` keep-alives.
 */
import { ApiError, apiErrorFromResponse, networkError } from './api-error.js';

export interface SSEMessage {
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SSEParser {
  /** Feed a decoded text chunk. Complete messages are emitted synchronously. */
  push(chunk: string): void;
  /** End of stream: process a trailing partial line and dispatch any pending data (lenient). */
  flush(): void;
}

export function createSSEParser(onMessage: (msg: SSEMessage) => void): SSEParser {
  let partial = '';
  let skipLF = false;
  let dataLines: string[] = [];
  let eventName = '';
  let lastId: string | undefined;
  let retry: number | undefined;

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = '';
      return;
    }
    const msg: SSEMessage = { event: eventName || 'message', data: dataLines.join('\n') };
    if (lastId !== undefined) msg.id = lastId;
    if (retry !== undefined) msg.retry = retry;
    dataLines = [];
    eventName = '';
    retry = undefined;
    onMessage(msg);
  };

  const processLine = (line: string) => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    let value = idx === -1 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        dataLines.push(value);
        break;
      case 'event':
        eventName = value;
        break;
      case 'id':
        if (!value.includes('\0')) lastId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value);
        break;
      default:
        break;
    }
  };

  return {
    push(chunk: string) {
      let text = chunk;
      if (skipLF && text.startsWith('\n')) text = text.slice(1);
      skipLF = false;
      if (!text) return;
      const all = partial + text;
      const lines = all.split(/\r\n|\r|\n/);
      partial = lines.pop() ?? '';
      // A trailing CR was consumed as a line end; a following LF (next chunk) belongs to it.
      if (all.endsWith('\r')) skipLF = true;
      for (const line of lines) processLine(line);
    },
    flush() {
      if (partial) {
        processLine(partial);
        partial = '';
      }
      dispatch();
    },
  };
}

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'AbortError' : (e as { name?: string } | null)?.name === 'AbortError';
}

export interface StreamPostOptions {
  /** Pass `{type:'ping'}` frames to `onEvent` too (default false). */
  includePings?: boolean;
  headers?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

/**
 * POST JSON and consume an SSE response, calling `onEvent` with each parsed JSON frame.
 * Resolves when the stream ends; rejects with `ApiError` (Persian message) or the AbortError.
 */
export async function streamPost<T = unknown>(
  url: string,
  body: unknown,
  onEvent: (event: T) => void,
  signal?: AbortSignal,
  options: StreamPostOptions = {},
): Promise<void> {
  const doFetch = options.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...options.headers },
      body: JSON.stringify(body),
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (e) {
    if (isAbortError(e)) throw e;
    throw networkError(e);
  }
  if (!res.ok) throw await apiErrorFromResponse(res);
  if (!res.body) throw new ApiError(res.status, 'bad_stream', 'پاسخ جریانی از سرور دریافت نشد.');

  const parser = createSSEParser((msg) => {
    if (!msg.data) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg.data);
    } catch {
      return; // ignore malformed frames
    }
    if (!options.includePings && (parsed as { type?: unknown } | null)?.type === 'ping') return;
    onEvent(parsed as T);
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) parser.push(decoder.decode(value, { stream: true }));
    }
    const tail = decoder.decode();
    if (tail) parser.push(tail);
    parser.flush();
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* already released */
    }
  }
}

export type LiveStatus = 'connecting' | 'open' | 'retrying' | 'unavailable' | 'closed';

export interface ConnectEventSourceOptions<T> {
  onMessage: (data: T) => void;
  onStatus?: (status: LiveStatus) => void;
  /** First retry delay (ms). Doubles per consecutive failure. */
  minDelayMs?: number;
  maxDelayMs?: number;
  /** After this many consecutive failures the status becomes 'unavailable' (still retrying slowly). */
  unavailableAfter?: number;
  /** Injected for tests. */
  EventSourceImpl?: typeof EventSource;
  /** Injected for tests (0..1). */
  random?: () => number;
}

export interface LiveConnection {
  close(): void;
  /** Reconnect now (e.g. tab became visible / network came back). */
  reconnectNow(): void;
}

/** Backoff delay for the n-th consecutive failure (1-based), with ±20% jitter. */
export function backoffDelay(failures: number, minMs: number, maxMs: number, random: () => number = Math.random): number {
  const base = Math.min(maxMs, minMs * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

/**
 * EventSource with explicit reconnect/backoff. We close the native EventSource on every error and
 * schedule our own retry, so a missing endpoint (404 / wrong MIME) results in a few quiet retries
 * that back off up to `maxDelayMs` instead of a tight error loop.
 */
export function connectEventSource<T = unknown>(url: string, opts: ConnectEventSourceOptions<T>): LiveConnection {
  const Impl = opts.EventSourceImpl ?? (typeof EventSource !== 'undefined' ? EventSource : undefined);
  const minDelay = opts.minDelayMs ?? 1500;
  const maxDelay = opts.maxDelayMs ?? 60_000;
  const unavailableAfter = opts.unavailableAfter ?? 3;
  const random = opts.random ?? Math.random;

  let es: EventSource | null = null;
  let closed = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (s: LiveStatus) => opts.onStatus?.(s);

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const open = () => {
    clearTimer();
    if (closed) return;
    if (!Impl) {
      setStatus('unavailable');
      return;
    }
    setStatus(failures === 0 ? 'connecting' : 'retrying');
    const source = new Impl(url);
    es = source;
    source.onopen = () => {
      failures = 0;
      setStatus('open');
    };
    source.onmessage = (e: MessageEvent) => {
      let data: unknown;
      try {
        data = JSON.parse(String(e.data));
      } catch {
        return;
      }
      opts.onMessage(data as T);
    };
    source.onerror = () => {
      if (es !== source) return;
      source.close();
      es = null;
      if (closed) return;
      failures += 1;
      setStatus(failures >= unavailableAfter ? 'unavailable' : 'retrying');
      timer = setTimeout(open, backoffDelay(failures, minDelay, maxDelay, random));
    };
  };

  open();

  return {
    close() {
      closed = true;
      clearTimer();
      es?.close();
      es = null;
      setStatus('closed');
    },
    reconnectNow() {
      if (closed || es) return;
      failures = Math.min(failures, 1);
      open();
    },
  };
}
