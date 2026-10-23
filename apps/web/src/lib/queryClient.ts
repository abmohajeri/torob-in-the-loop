import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error.js';

/** Retry transient failures (network/5xx/429) at most twice; never retry 4xx validation/not-found errors. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (error instanceof ApiError) {
    if (error.code === 'offline') return false;
    return !error.isClientError;
  }
  // Aborts / unknown runtime errors: one retry is enough.
  return failureCount < 1;
}

export function retryDelay(attempt: number): number {
  return Math.min(800 * 2 ** attempt, 6000);
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
        // Try once even when the browser reports offline: the service worker may answer from cache
        // (plan, shop & mall pages work offline inside malls with poor signal).
        networkMode: 'offlineFirst',
      },
      mutations: {
        retry: false,
        networkMode: 'offlineFirst',
      },
    },
  });
}

/** The app-wide client (created once in main.tsx). */
export const queryClient = createQueryClient();
