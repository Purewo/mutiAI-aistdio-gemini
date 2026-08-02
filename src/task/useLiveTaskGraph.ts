/**
 * Live read-only Task Graph Projection.
 *
 * The graph endpoint is the only source of nodes and edges. Task and Case SSE streams are
 * change notifications: after a material event we read the persisted projection again. A small
 * visibility-aware poll remains in place to discover a newly-created task-linked Case, because a
 * Case can be opened by coordination work without changing the Task resource itself.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getTaskGraph } from '../api/endpoints';
import { ApiError, apiErrorFromThrown } from '../api/errors';
import { CoordinationEventLog, streamCoordinationEvents } from '../api/events';
import type { TaskGraphProjection } from '../api/types';
import type { ConnectionStatus } from '../components/states';

const DISCOVERY_INTERVAL_MS = 10_000;
const CASE_RECONNECT_DELAY_MS = 5_000;
const MAX_CASE_FAILURES = 5;

function backoffMs(failures: number): number {
  return Math.min(CASE_RECONNECT_DELAY_MS * 2 ** Math.max(0, failures - 1), 30_000);
}

function isTerminalCaseStatus(status: string): boolean {
  return status === 'resolved' || status === 'abandoned';
}

interface LiveTaskGraphState {
  status: 'loading' | 'ready' | 'error';
  projection: TaskGraphProjection | null;
  error: ApiError | null;
  /** Transport status for the background notification/discovery loop, never graph truth. */
  connection: ConnectionStatus;
  refreshing: boolean;
}

export interface LiveTaskGraphApi extends LiveTaskGraphState {
  refresh: () => Promise<TaskGraphProjection>;
  retry: () => void;
}

export function useLiveTaskGraph(taskId: string, revisionKey?: string | null): LiveTaskGraphApi {
  const [state, setState] = useState<LiveTaskGraphState>({
    status: 'loading',
    projection: null,
    error: null,
    connection: 'connecting',
    refreshing: false,
  });
  const mounted = useRef(true);
  const taskIdRef = useRef(taskId);
  const projectionRef = useRef<TaskGraphProjection | null>(null);
  const requestRef = useRef<Promise<TaskGraphProjection> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const caseLogs = useRef(new Map<string, CoordinationEventLog>());
  const caseAbort = useRef(new Map<string, AbortController>());
  const caseTimers = useRef(new Map<string, number>());
  const caseFailures = useRef(new Map<string, number>());
  const [retryToken, setRetryToken] = useState(0);

  const patch = useCallback((update: Partial<LiveTaskGraphState>) => {
    if (mounted.current) setState((current) => ({ ...current, ...update }));
  }, []);

  const refresh = useCallback(async (): Promise<TaskGraphProjection> => {
    if (!taskId) throw new ApiError({ kind: 'malformed', status: 0, message: '缺少任务标识。' });
    if (requestRef.current) return requestRef.current;

    const controller = new AbortController();
    requestAbortRef.current?.abort();
    requestAbortRef.current = controller;
    const hasProjection = projectionRef.current !== null;
    patch({
      status: hasProjection ? 'ready' : 'loading',
      refreshing: hasProjection,
      error: null,
    });

    const request = getTaskGraph(taskId, controller.signal)
      .then((projection) => {
        projectionRef.current = projection;
        if (mounted.current) {
          patch({ status: 'ready', projection, error: null, refreshing: false });
        }
        return projection;
      })
      .catch((cause: unknown) => {
        const error = apiErrorFromThrown(cause);
        if (mounted.current && error.kind !== 'aborted') {
          patch({
            status: hasProjection ? 'ready' : 'error',
            error,
            refreshing: false,
          });
        }
        throw error;
      })
      .finally(() => {
        if (requestAbortRef.current === controller) {
          requestRef.current = null;
          requestAbortRef.current = null;
        }
      });
    requestRef.current = request;
    return request;
  }, [patch, taskId]);

  useEffect(() => {
    mounted.current = true;
    taskIdRef.current = taskId;
    projectionRef.current = null;
    caseLogs.current.clear();
    const abortMap = caseAbort.current;
    const timerMap = caseTimers.current;
    setState({ status: 'loading', projection: null, error: null, connection: 'connecting', refreshing: false });
    void refresh().catch(() => undefined);

    return () => {
      mounted.current = false;
      requestAbortRef.current?.abort();
      requestAbortRef.current = null;
      requestRef.current = null;
      abortMap.forEach((controller) => controller.abort());
      abortMap.clear();
      timerMap.forEach((timer) => window.clearTimeout(timer));
      timerMap.clear();
    };
  }, [refresh, retryToken, taskId]);

  // Task updates are a useful low-latency hint, but graph refreshes also happen independently when
  // coordination creates a Case without touching Task.updated_at.
  useEffect(() => {
    if (!revisionKey || taskIdRef.current !== taskId || projectionRef.current === null) return;
    void refresh().catch(() => undefined);
  }, [refresh, revisionKey, taskId]);

  useEffect(() => {
    if (!taskId) return;
    const poll = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    const interval = window.setInterval(poll, DISCOVERY_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [refresh, taskId]);

  const caseIds = (() => {
    const projection = state.projection;
    if (!projection) return [] as string[];
    return [...new Set(
      projection.nodes
        .filter((node) => node.resource.resource_type === 'case' && !isTerminalCaseStatus(node.status))
        .map((node) => node.resource.resource_id),
    )].sort();
  })();
  const caseKey = caseIds.join('|');

  useEffect(() => {
    if (!caseKey) {
      patch({ connection: state.projection ? 'live' : 'connecting' });
      return;
    }
    let disposed = false;
    const activeIds = new Set(caseIds);
    const abortMap = caseAbort.current;
    const timerMap = caseTimers.current;
    const connectCase = (caseId: string) => {
      if (disposed || !activeIds.has(caseId)) return;
      caseAbort.current.get(caseId)?.abort();
      const controller = new AbortController();
      caseAbort.current.set(caseId, controller);
      let sawNewEvent = false;
      const log = caseLogs.current.get(caseId) ?? new CoordinationEventLog();
      caseLogs.current.set(caseId, log);

      void streamCoordinationEvents(caseId, {
        lastEventId: log.lastEventId(),
        signal: controller.signal,
        onOpen: () => {
          caseFailures.current.set(caseId, 0);
          patch({ connection: 'live' });
        },
        onEvent: (event) => {
          if (log.add(event)) sawNewEvent = true;
        },
        onClose: () => {
          if (disposed || controller.signal.aborted) return;
          if (sawNewEvent) void refresh().catch(() => undefined);
          const failures = caseFailures.current.get(caseId) ?? 0;
          caseFailures.current.set(caseId, 0);
          const timer = window.setTimeout(() => connectCase(caseId), CASE_RECONNECT_DELAY_MS);
          caseTimers.current.set(caseId, timer);
          patch({ connection: failures > 0 ? 'reconnecting' : 'live' });
        },
        onError: (error) => {
          if (disposed || controller.signal.aborted || error.kind === 'aborted') return;
          const failures = (caseFailures.current.get(caseId) ?? 0) + 1;
          caseFailures.current.set(caseId, failures);
          if (failures > MAX_CASE_FAILURES) {
            patch({ connection: 'unreachable' });
            return;
          }
          patch({ connection: 'reconnecting' });
          const timer = window.setTimeout(() => connectCase(caseId), backoffMs(failures));
          caseTimers.current.set(caseId, timer);
        },
      });
    };

    // The projection can add Case nodes on a later poll. Existing cursors survive this effect's
    // cleanup, so a new stream still sends Last-Event-ID and cannot duplicate the view.
    caseIds.forEach(connectCase);
    return () => {
      disposed = true;
      caseIds.forEach((caseId) => {
        abortMap.get(caseId)?.abort();
        abortMap.delete(caseId);
        const timer = timerMap.get(caseId);
        if (timer !== undefined) window.clearTimeout(timer);
        timerMap.delete(caseId);
      });
    };
    // The case list is derived only from the persisted projection; it is intentionally not an
    // event payload or array-order inference.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseKey, patch, refresh]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);
  return { ...state, refresh, retry };
}
