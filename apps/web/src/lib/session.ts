import { useState } from 'react';

/** localStorage key of the anonymous session id (inquiries, chat history, live events). */
export const SESSION_KEY = 'bz.sessionId';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cached: string | null = null;

/** RFC 4122 v4 UUID (crypto.randomUUID when available). */
export function uuidv4(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isValidSessionId(id: string | null | undefined): id is string {
  return !!id && UUID_RE.test(id);
}

/** Stable anonymous session id, persisted in localStorage (falls back to in-memory when storage is blocked). */
export function getSessionId(): string {
  if (cached) return cached;
  let id: string | null = null;
  try {
    id = localStorage.getItem(SESSION_KEY);
  } catch {
    id = null;
  }
  if (!isValidSessionId(id)) {
    id = uuidv4();
    try {
      localStorage.setItem(SESSION_KEY, id);
    } catch {
      /* private mode / blocked storage: keep in memory */
    }
  }
  cached = id;
  return id;
}

/** React hook: the same session id for the lifetime of the app. */
export function useSessionId(): string {
  return useState(getSessionId)[0];
}

/** Test helper. */
export function __resetSessionCache(): void {
  cached = null;
}
