/**
 * Shared React Query hooks used by the shell (pages define their own with `qk` + `api`).
 */
import { useQuery } from '@tanstack/react-query';
import { INQUIRY_STATUS_META, type Inquiry } from '@titl/shared';
import { api } from './api.js';
import { qk } from './queryKeys.js';
import { getSessionId } from './session.js';

/** App metadata (catalog stats, areas, providers, map tiles, LLM mode). Cached for 30 min. */
export function useMeta() {
  return useQuery({
    queryKey: qk.meta(),
    queryFn: ({ signal }) => api.meta(signal),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    retry: 1,
  });
}

/** This session's inquiries (kept fresh by live events). Quietly empty when the backend is unavailable. */
export function useSessionInquiries(enabled = true) {
  const sessionId = getSessionId();
  return useQuery({
    queryKey: qk.inquiries(sessionId),
    queryFn: ({ signal }) => api.inquiries(sessionId, signal),
    staleTime: 30_000,
    retry: false,
    enabled,
    select: (data) => data.inquiries,
  });
}

export const isInquiryActive = (i: Pick<Inquiry, 'status'>) => !INQUIRY_STATUS_META[i.status].final;

/** Number of in-progress inquiries (bottom-nav live badge). */
export function useActiveInquiryCount(): number {
  const { data } = useSessionInquiries();
  return data ? data.filter(isInquiryActive).length : 0;
}
