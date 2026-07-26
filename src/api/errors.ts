/**
 * Normalization of the backend's contracted error envelope.
 *
 * The backend returns `{ code, message, request_id, details? }` for every failure it owns. This
 * module preserves those values instead of replacing them with invented frontend text, so the UI
 * can show the real product error and the request ID stays available for backend correlation.
 */
import type { ErrorEnvelope } from './types';

/** Failure categories the UI branches on. Not a backend contract. */
export type ApiErrorKind =
  /** The backend answered with a contracted error envelope. */
  | 'api'
  /** The request never produced a usable response (offline, DNS, proxy down, CORS). */
  | 'network'
  /** The response arrived but could not be parsed as the contracted shape. */
  | 'malformed'
  /** The caller aborted the request. */
  | 'aborted';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, or 0 when no response was received. */
  readonly status: number;
  /** Backend machine-readable code, null when the failure was not a contracted envelope. */
  readonly code: string | null;
  readonly requestId: string | null;
  readonly details: unknown;

  constructor(init: {
    kind: ApiErrorKind;
    status: number;
    message: string;
    code?: string | null;
    requestId?: string | null;
    details?: unknown;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code ?? null;
    this.requestId = init.requestId ?? null;
    this.details = init.details;
  }

  /** True when the session is missing, expired, or revoked. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }

  /** True when the resource exists but the current owner may not reach it. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  /**
   * True for state, version, idempotency, integrity, and release-state conflicts. The UI must show
   * the backend message rather than retrying with different values.
   */
  get isConflict(): boolean {
    return this.status === 409;
  }
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    typeof candidate.request_id === 'string'
  );
}

/**
 * Build an `ApiError` from a failed response, preferring the contracted envelope. FastAPI's own
 * validation failures use `{ detail: ... }` rather than the product envelope, so that shape is
 * recognized separately instead of being flattened into a generic message.
 */
export async function apiErrorFromResponse(response: Response): Promise<ApiError> {
  const requestId = response.headers.get('x-request-id');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError({
      kind: 'api',
      status: response.status,
      message: response.statusText || `Request failed with status ${response.status}`,
      requestId,
    });
  }

  if (isErrorEnvelope(body)) {
    return new ApiError({
      kind: 'api',
      status: response.status,
      message: body.message,
      code: body.code,
      requestId: body.request_id ?? requestId,
      details: body.details,
    });
  }

  const detail = (body as { detail?: unknown } | null)?.detail;
  return new ApiError({
    kind: 'api',
    status: response.status,
    message:
      typeof detail === 'string'
        ? detail
        : response.statusText || `Request failed with status ${response.status}`,
    requestId,
    details: detail ?? body,
  });
}

/** Wrap a thrown transport failure without inventing a backend code. */
export function apiErrorFromThrown(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  if (cause instanceof DOMException && cause.name === 'AbortError') {
    return new ApiError({ kind: 'aborted', status: 0, message: 'Request aborted.' });
  }
  return new ApiError({
    kind: 'network',
    status: 0,
    message: cause instanceof Error ? cause.message : 'Network request failed.',
  });
}

/**
 * Message for display. Falls back to a transport-level description only when the backend produced
 * no message of its own.
 */
export function describeApiError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === 'network') {
      return `无法连接到服务端：${error.message}`;
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return '发生未知错误。';
}
