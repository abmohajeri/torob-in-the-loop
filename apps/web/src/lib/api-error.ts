/** Typed API error with a user-facing Persian message. */
export class ApiError extends Error {
  override readonly name = 'ApiError';

  constructor(
    /** HTTP status; 0 for network/timeout errors. */
    readonly status: number,
    /** Server error code (e.g. `not_found`, `validation_error`) or a client code (`network`, `timeout`). */
    readonly code: string,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }

  get isNetwork(): boolean {
    return this.code === 'network' || this.code === 'timeout' || this.code === 'offline';
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /** 4xx (except 408/429) — retrying won't help. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429;
  }
}

export const API_MESSAGES = {
  offline: 'اتصال اینترنت برقرار نیست. پس از اتصال دوباره تلاش کنید.',
  network: 'ارتباط با سرور برقرار نشد. لطفاً اتصال خود را بررسی کنید و دوباره تلاش کنید.',
  timeout: 'پاسخ سرور بیش از حد طول کشید. لطفاً دوباره تلاش کنید.',
  notFound: 'موردی که دنبالش بودید پیدا نشد.',
  rateLimited: 'تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.',
  unavailable: 'سرور موقتاً در دسترس نیست. چند لحظه دیگر دوباره تلاش کنید.',
  server: 'خطای غیرمنتظره‌ای در سرور رخ داد. لطفاً دوباره تلاش کنید.',
  badRequest: 'درخواست معتبر نبود. لطفاً ورودی‌ها را بررسی کنید.',
  badResponse: 'پاسخ نامعتبری از سرور دریافت شد.',
  generic: 'خطایی رخ داد. لطفاً دوباره تلاش کنید.',
} as const;

function isOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function networkError(cause?: unknown): ApiError {
  return isOffline()
    ? new ApiError(0, 'offline', API_MESSAGES.offline, cause)
    : new ApiError(0, 'network', API_MESSAGES.network, cause);
}

/** Fallback Persian message for an HTTP status without a JSON error body. */
export function messageForStatus(status: number): { code: string; message: string } {
  if (status === 404) return { code: 'not_found', message: API_MESSAGES.notFound };
  if (status === 429) return { code: 'rate_limited', message: API_MESSAGES.rateLimited };
  if (status === 408) return { code: 'timeout', message: API_MESSAGES.timeout };
  if (status >= 500) return { code: status === 500 ? 'unavailable' : 'server_error', message: API_MESSAGES.unavailable };
  if (status >= 400) return { code: 'bad_request', message: API_MESSAGES.badRequest };
  return { code: 'http_error', message: API_MESSAGES.generic };
}

/** Build an ApiError from a non-OK response, preferring the server's `{ error: { code, message } }`. */
export async function apiErrorFromResponse(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const err = (body as { error?: { code?: unknown; message?: unknown } } | null)?.error;
  if (err && typeof err.message === 'string' && err.message.trim()) {
    return new ApiError(res.status, typeof err.code === 'string' ? err.code : 'http_error', err.message, body);
  }
  const fallback = messageForStatus(res.status);
  return new ApiError(res.status, fallback.code, fallback.message, body);
}

/** Persian, user-presentable message for any thrown value. */
export function errorMessage(error: unknown, fallback: string = API_MESSAGES.generic): string {
  if (!error) return fallback;
  if (error instanceof ApiError) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    // Only surface messages that are already Persian (ours); hide raw English runtime errors.
    if (typeof msg === 'string' && /[؀-ۿ]/.test(msg)) return msg;
  }
  return fallback;
}
