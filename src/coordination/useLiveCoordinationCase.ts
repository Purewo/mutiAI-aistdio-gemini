/**
 * Live coordination Case view for the F0 record plane and F1 delivery-quality recovery.
 *
 * The SSE endpoint is an ordered, finite replay batch. The hook keeps the highest event cursor,
 * deduplicates by event_id, and refetches the persisted Case after every batch. Event payloads are
 * never promoted into the page's source of truth.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getCoordinationCase,
  getOrganization,
  getTask,
  listOrganizationVersions,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import {
  CoordinationEventLog,
  streamCoordinationEvents,
} from '../api/events';
import type {
  CoordinationCase,
  OrganizationDetail,
  OrganizationVersion,
  Task,
} from '../api/types';
import type { ConnectionStatus } from '../components/states';

const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;

const TERMINAL_CASE_STATUSES = new Set<CoordinationCase['status']>([
  'resolved',
  'abandoned',
]);

function failureBackoffMs(consecutiveFailures: number): number {
  return Math.min(RECONNECT_DELAY_MS * 2 ** (consecutiveFailures - 1), MAX_RECONNECT_DELAY_MS);
}

interface LiveCoordinationCaseState {
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  caseRecord: CoordinationCase | null;
  organization: OrganizationDetail | null;
  organizationVersion: OrganizationVersion | null;
  relatedTask: Task | null;
  connection: ConnectionStatus;
  streamEventCount: number;
  duplicateEventCount: number;
}

export interface LiveCoordinationCaseApi extends LiveCoordinationCaseState {
  refresh: () => Promise<CoordinationCase>;
  reconnect: () => void;
  retry: () => void;
  setCase: (caseRecord: CoordinationCase) => void;
}

export function useLiveCoordinationCase(caseId: string): LiveCoordinationCaseApi {
  const [state, setState] = useState<LiveCoordinationCaseState>({
    status: 'loading',
    error: null,
    caseRecord: null,
    organization: null,
    organizationVersion: null,
    relatedTask: null,
    connection: 'connecting',
    streamEventCount: 0,
    duplicateEventCount: 0,
  });
  const eventLog = useRef(new CoordinationEventLog());
  const streamEventCount = useRef(0);
  const duplicateEventCount = useRef(0);
  const streamAbort = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const failureCount = useRef(0);
  const mounted = useRef(true);
  const stateRef = useRef(state);
  const [retryToken, setRetryToken] = useState(0);
  stateRef.current = state;

  const patch = useCallback((update: Partial<LiveCoordinationCaseState>) => {
    if (mounted.current) setState((current) => ({ ...current, ...update }));
  }, []);

  const refresh = useCallback(async () => {
    const caseRecord = await getCoordinationCase(caseId);
    const relatedTaskId = caseRecord.signals.find((signal) => signal.task_id)?.task_id ?? null;
    const [organization, versions, relatedTask] = await Promise.all([
      stateRef.current.organization?.organization_id === caseRecord.organization_id
        ? Promise.resolve(stateRef.current.organization)
        : getOrganization(caseRecord.organization_id),
      listOrganizationVersions(caseRecord.organization_id),
      relatedTaskId ? getTask(relatedTaskId) : Promise.resolve(null),
    ]);
    const organizationVersion =
      versions.find(
        (version) => version.spec_version_id === caseRecord.organization_spec_version_id,
      ) ?? null;
    patch({
      caseRecord,
      organization,
      organizationVersion,
      relatedTask,
      status: 'ready',
      error: null,
    });
    return caseRecord;
  }, [caseId, patch]);

  const connect = useCallback(() => {
    streamAbort.current?.abort();
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    const controller = new AbortController();
    streamAbort.current = controller;
    if (eventLog.current.size === 0) patch({ connection: 'connecting' });
    let sawNewEvent = false;

    void streamCoordinationEvents(caseId, {
      lastEventId: eventLog.current.lastEventId(),
      signal: controller.signal,
      onOpen: () => {
        failureCount.current = 0;
        patch({ connection: 'live' });
      },
      onEvent: (event) => {
        streamEventCount.current += 1;
        if (!eventLog.current.add(event)) {
          duplicateEventCount.current += 1;
        } else {
          sawNewEvent = true;
        }
        patch({
          connection: 'live',
          streamEventCount: streamEventCount.current,
          duplicateEventCount: duplicateEventCount.current,
        });
      },
      onClose: () => {
        if (controller.signal.aborted || !mounted.current) return;
        failureCount.current = 0;
        void (async () => {
          let latest = stateRef.current.caseRecord;
          if (sawNewEvent) {
            try {
              latest = await refresh();
            } catch {
              // Keep the last persisted view. The next material batch retries the refresh.
            }
          }
          if (!mounted.current) return;
          if (latest && TERMINAL_CASE_STATUSES.has(latest.status)) {
            patch({ connection: 'closed' });
            return;
          }
          // A finite replay batch closing normally is not a degraded connection. Keep the view
          // live while waiting for the next cursor-based batch; only transport failures surface
          // the reconnecting state.
          patch({ connection: 'live' });
          reconnectTimer.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
        })();
      },
      onError: (error) => {
        if (controller.signal.aborted || !mounted.current || error.kind === 'aborted') return;
        failureCount.current += 1;
        if (failureCount.current > MAX_CONSECUTIVE_FAILURES) {
          patch({ connection: 'unreachable' });
          return;
        }
        patch({ connection: 'reconnecting' });
        reconnectTimer.current = window.setTimeout(
          connect,
          failureBackoffMs(failureCount.current),
        );
      },
    });
  }, [caseId, patch, refresh]);

  useEffect(() => {
    mounted.current = true;
    eventLog.current = new CoordinationEventLog();
    streamEventCount.current = 0;
    duplicateEventCount.current = 0;
    failureCount.current = 0;
    patch({
      status: 'loading',
      error: null,
      caseRecord: null,
      organization: null,
      organizationVersion: null,
      relatedTask: null,
      connection: 'connecting',
      streamEventCount: 0,
      duplicateEventCount: 0,
    });

    void refresh()
      .then(() => {
        if (mounted.current) connect();
      })
      .catch((cause: unknown) => {
        const error = apiErrorFromThrown(cause);
        if (mounted.current && error.kind !== 'aborted') {
          patch({ status: 'error', error });
        }
      });

    return () => {
      mounted.current = false;
      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [connect, patch, refresh, retryToken]);

  const reconnect = useCallback(() => {
    failureCount.current = 0;
    patch({ connection: 'reconnecting' });
    connect();
  }, [connect, patch]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);
  const setCase = useCallback(
    (caseRecord: CoordinationCase) => {
      patch({ caseRecord, status: 'ready', error: null });
      connect();
    },
    [connect, patch],
  );

  return { ...state, refresh, reconnect, retry, setCase };
}
