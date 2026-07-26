/**
 * Shared read hook for a single backend resource.
 *
 * Keeps the loading, empty, error, and reload branches identical across screens and guarantees that
 * a failed request produces an error state rather than stale or invented data. In-flight requests
 * are aborted when the caller unmounts or the key changes, so a slow response cannot overwrite a
 * newer one.
 */
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiErrorFromThrown } from './errors';

export type ApiResourceState<T> =
  | { status: 'loading'; data: null; error: null }
  | { status: 'ready'; data: T; error: null }
  | { status: 'error'; data: null; error: ApiError };

export interface ApiResource<T> {
  state: ApiResourceState<T>;
  /** Refetch from the backend. */
  reload: () => void;
  /** Replace the held value with one already returned by the backend, without a refetch. */
  set: (data: T) => void;
}

export function useApiResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): ApiResource<T> {
  const [state, setState] = useState<ApiResourceState<T>>({
    status: 'loading',
    data: null,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  // The loader closes over caller state, so it is intentionally keyed by the caller's deps.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const runLoad = useCallback(load, deps);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    setState({ status: 'loading', data: null, error: null });
    runLoad(controller.signal)
      .then((data) => {
        if (active) setState({ status: 'ready', data, error: null });
      })
      .catch((cause: unknown) => {
        const error = apiErrorFromThrown(cause);
        // An aborted request was superseded or unmounted; it is not a failure to show.
        if (active && error.kind !== 'aborted') {
          setState({ status: 'error', data: null, error });
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [runLoad, reloadToken]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);
  const set = useCallback((data: T) => setState({ status: 'ready', data, error: null }), []);

  return { state, reload, set };
}
