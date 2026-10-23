/**
 * Live events (SSE `GET /api/events?sessionId=`): inquiry progress, call transcript lines, notifications.
 *  - updates the React Query cache in place (inquiry detail + session list) → pages re-render live;
 *  - when an inquiry gets a result, invalidates product/compare/shop queries (verified info flows back);
 *  - shows notifications as sonner toasts (with a «مشاهده» action when a link is given);
 *  - reconnects with backoff and stays QUIET when the endpoint is missing (backend not deployed yet).
 */
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { INQUIRY_STATUS_META, type Inquiry, type InquiryEvent, type LiveEvent } from '@titl/shared';
import { api } from '../lib/api.js';
import { qk } from '../lib/queryKeys.js';
import { connectEventSource } from '../lib/sse.js';
import { useUi } from '../state/useUi.js';

type NotificationEvent = Extract<LiveEvent, { type: 'notification' }>;

/** Union of two event lists by id (server may resend full or partial histories), ordered by id. */
export function mergeEvents(a: InquiryEvent[], b: InquiryEvent[]): InquiryEvent[] {
  if (!a.length) return b;
  if (!b.length) return a;
  const byId = new Map<number, InquiryEvent>();
  for (const e of a) byId.set(e.id, e);
  for (const e of b) byId.set(e.id, e);
  return [...byId.values()].sort((x, y) => x.id - y.id);
}

/** Newer inquiry snapshot wins, but never lose transcript lines we already streamed. */
export function mergeInquiry(old: Inquiry | undefined, incoming: Inquiry): Inquiry {
  if (!old) return incoming;
  return { ...incoming, events: mergeEvents(old.events, incoming.events) };
}

/** Insert or replace an inquiry in a list (newest first for inserts). */
export function upsertInquiry(list: Inquiry[], incoming: Inquiry): Inquiry[] {
  const idx = list.findIndex((i) => i.id === incoming.id);
  if (idx === -1) return [incoming, ...list];
  const next = list.slice();
  next[idx] = mergeInquiry(list[idx], incoming);
  return next;
}

/** Append one streamed transcript/status line (idempotent). */
export function appendLine(inquiry: Inquiry, event: InquiryEvent): Inquiry {
  if (inquiry.events.some((e) => e.id === event.id)) return inquiry;
  return { ...inquiry, events: mergeEvents(inquiry.events, [event]) };
}

export interface LiveDeps {
  qc: QueryClient;
  sessionId: string;
  notify?: (n: NotificationEvent) => void;
}

/** Applies one live event to the query cache. Exported for tests. */
export function handleLiveEvent(ev: LiveEvent, { qc, sessionId, notify }: LiveDeps): void {
  switch (ev.type) {
    case 'inquiry.updated': {
      const inq = ev.inquiry;
      const prev = qc.getQueryData<Inquiry>(qk.inquiry(inq.id));
      qc.setQueryData<Inquiry>(qk.inquiry(inq.id), (old) => mergeInquiry(old, inq));
      qc.setQueryData<{ inquiries: Inquiry[] }>(qk.inquiries(sessionId), (old) =>
        old ? { inquiries: upsertInquiry(old.inquiries, inq) } : old,
      );
      const becameFinal = INQUIRY_STATUS_META[inq.status].final && prev?.status !== inq.status;
      const gotResult = !!inq.result && !prev?.result;
      if (becameFinal || gotResult) {
        if (inq.product) void qc.invalidateQueries({ queryKey: qk.productAll(inq.product.id) });
        void qc.invalidateQueries({ queryKey: qk.compareAll() });
        void qc.invalidateQueries({ queryKey: qk.shopAll(inq.shop.id) });
      }
      break;
    }
    case 'inquiry.line': {
      qc.setQueryData<Inquiry>(qk.inquiry(ev.inquiryId), (old) => (old ? appendLine(old, ev.event) : old));
      qc.setQueryData<{ inquiries: Inquiry[] }>(qk.inquiries(sessionId), (old) =>
        old ? { inquiries: old.inquiries.map((i) => (i.id === ev.inquiryId ? appendLine(i, ev.event) : i)) } : old,
      );
      break;
    }
    case 'notification':
      notify?.(ev);
      break;
    case 'ping':
      break;
    default:
      break;
  }
}

/** Shows a live notification as a toast. */
export function toastNotification(n: NotificationEvent, go: (link: string) => void): void {
  const show =
    n.tone === 'good' ? toast.success : n.tone === 'warn' ? toast.warning : n.tone === 'bad' ? toast.error : toast.info;
  show(n.title, {
    id: n.id,
    description: n.body,
    duration: 7000,
    action: n.link ? { label: 'مشاهده', onClick: () => go(n.link!) } : undefined,
  });
}

export function useLiveEvents(sessionId: string, options: { enabled?: boolean } = {}): void {
  const enabled = options.enabled ?? true;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const navRef = useRef(navigate);
  navRef.current = navigate;
  const setLive = useUi((s) => s.setLive);

  useEffect(() => {
    if (!enabled || !sessionId || typeof window === 'undefined') return;
    let hadOpen = false;
    const conn = connectEventSource<LiveEvent>(api.eventsUrl(sessionId), {
      onMessage: (ev) =>
        handleLiveEvent(ev, {
          qc,
          sessionId,
          notify: (n) => toastNotification(n, (link) => navRef.current(link)),
        }),
      onStatus: (status) => {
        setLive(status);
        if (status === 'open') {
          // Reconnected after a drop: catch up on anything we missed.
          if (hadOpen) void qc.invalidateQueries({ queryKey: qk.inquiriesAll() });
          hadOpen = true;
        }
      },
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') conn.reconnectNow();
    };
    const onOnline = () => conn.reconnectNow();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      conn.close();
    };
  }, [enabled, sessionId, qc, setLive]);
}
