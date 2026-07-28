/**
 * The single transport boundary for backend requests.
 *
 * Views must never call `fetch` directly. They call the typed functions in `endpoints.ts`, which
 * call this module. Request construction, credential handling, and error normalization stay here so
 * components remain independent of transport details.
 *
 * Authentication is an HttpOnly session cookie issued by `POST /api/v1/auth/login`. No token is ever
 * read into or stored by JavaScript, so every request must carry browser credentials.
 */
import { ApiError, apiErrorFromResponse, apiErrorFromThrown } from './errors';

/**
 * Default to a relative base so the browser talks to its own origin and the Vite dev proxy forwards
 * `/api` to the backend. `VITE_API_BASE_URL` overrides it for a non-proxied local integration; it
 * must never contain a developer's absolute filesystem path.
 */
const CONFIGURED_BASE = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = CONFIGURED_BASE && CONFIGURED_BASE.length > 0
  ? CONFIGURED_BASE.replace(/\/+$/, '')
  : '/api/v1';

/**
 * The origin backend-issued URLs resolve against.
 *
 * The backend returns root-relative URLs such as `/api/v1/tasks/{id}/artifacts/{id}/content`. Those
 * already carry the full path from the origin, so they must be resolved against the API origin
 * rather than appended to the API base path. When the base is relative, the page origin is correct
 * and the value stays empty.
 */
const API_ORIGIN = /^https?:\/\//i.test(API_BASE_URL) ? new URL(API_BASE_URL).origin : '';

/**
 * Resolve a backend-issued URL for browser navigation, preview, or download.
 *
 * Only pass URLs the backend produced, such as `Artifact.content_url` and `Artifact.download_url`.
 * Never construct an Artifact location from `storage_relative_path`; that is a host filesystem
 * detail and must not reach the browser.
 */
export function resolveBackendUrl(backendUrl: string): string {
  if (/^https?:\/\//i.test(backendUrl)) return backendUrl;
  return `${API_ORIGIN}${backendUrl}`;
}

export function buildApiUrl(
  path: string,
  query?: Record<string, string | number | boolean | undefined>,
): string {
  const base = `${API_BASE_URL}${path}`;
  if (!query) return base;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const serialized = search.toString();
  return serialized ? `${base}?${serialized}` : base;
}

/**
 * Notified whenever the backend rejects a request with 401.
 *
 * The session lives in an HttpOnly cookie, so the frontend cannot inspect its expiry. A 401 is the
 * only signal that it lapsed or was revoked, and the acceptance gate requires that such a response
 * cannot leave protected data on screen. The auth provider registers here and tears the session
 * down globally rather than each caller handling it.
 */
type UnauthorizedListener = () => void;

let unauthorizedListener: UnauthorizedListener | null = null;

export function setUnauthorizedListener(listener: UnauthorizedListener | null): void {
  unauthorizedListener = listener;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Multipart request body. The browser supplies its boundary header. */
  formData?: FormData;
  query?: Record<string, string | number | boolean | undefined>;
  /**
   * Suppress the global unauthenticated transition for this request. Set it on sign-in, where a 401
   * means "wrong credentials" for a session that never existed, not "the current session lapsed".
   */
  allowUnauthorized?: boolean;
  /**
   * Stable key for a request that can create external work. The backend returns the original
   * resource for a repeated key and reports a conflict when the same key arrives with a different
   * payload, so a retry of one logical submission must reuse the key it started with.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

/**
 * Error localization is backend-owned: the backend localizes `message` from this header while
 * `code` stays stable across languages. The frontend displays the backend message as-is and never
 * translates business errors itself.
 */
const ACCEPT_LANGUAGE = 'zh-CN';

async function performRequest(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Language': ACCEPT_LANGUAGE,
  };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      // Send the HttpOnly session cookie, including when the API base points at another origin.
      credentials: 'include',
      body:
        options.formData ??
        (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: options.signal,
    });
  } catch (cause) {
    throw apiErrorFromThrown(cause);
  }

  if (response.status === 401 && !options.allowUnauthorized) unauthorizedListener?.();
  return response;
}

/** Issue a request and decode the contracted JSON response. */
export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await performRequest(path, options);
  if (!response.ok) throw await apiErrorFromResponse(response);

  if (response.status === 204) return undefined as T;
  try {
    return (await response.json()) as T;
  } catch (cause) {
    throw new ApiError({
      kind: 'malformed',
      status: response.status,
      message: cause instanceof Error ? cause.message : 'Response was not valid JSON.',
      requestId: response.headers.get('x-request-id'),
    });
  }
}

/** Issue a request whose success carries no body. */
export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await performRequest(path, options);
  if (!response.ok) throw await apiErrorFromResponse(response);
}

export interface ArtifactContent {
  blob: Blob;
  /** Media type the backend declared for this Artifact. */
  mediaType: string;
  /** Filename from `Content-Disposition` when the backend supplied one. */
  fileName: string | null;
}

/**
 * Fetch Artifact bytes through a backend-issued URL.
 *
 * A 409 here means the Artifact failed its integrity check or is not in a released state. Surface it
 * as an unavailable result; never fall back to reading the host filesystem.
 */
export async function fetchArtifactContent(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<ArtifactContent> {
  let response: Response;
  try {
    response = await fetch(resolveBackendUrl(backendUrl), {
      headers: { 'Accept-Language': ACCEPT_LANGUAGE },
      credentials: 'include',
      signal,
    });
  } catch (cause) {
    throw apiErrorFromThrown(cause);
  }
  if (!response.ok) throw await apiErrorFromResponse(response);

  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  return {
    blob: await response.blob(),
    mediaType: response.headers.get('content-type') ?? 'application/octet-stream',
    fileName: match ? decodeURIComponent(match[1]) : null,
  };
}
