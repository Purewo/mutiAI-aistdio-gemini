/**
 * Live Task view: the persisted Task plus its event-driven refresh.
 *
 * The event stream is a change-notification channel, not the source of Task truth. Events are
 * deduplicated by `event_id`, the highest one drives the `Last-Event-ID` reconnect cursor, and the
 * Task, usage, and approval resources are refetched after connecting, after material events, and at
 * end of stream. Replaying the stream therefore cannot duplicate anything on screen.
 *
 * A terminal Task stays fully inspectable after the stream ends.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getTask, getTaskUsage, listTaskApprovals } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import { TaskEventLog, streamTaskEvents, type TaskEvent } from '../api/events';
import type { Approval, Task, TaskTokenUsage } from '../api/types';
import { isTerminalTaskStatus } from '../api/types';
import type { ConnectionStatus } from '../components/states';

const RECONNECT_DELAY_MS = 1500;
const MAX_RECONNECT_DELAY_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 5;

function failureBackoffMs(consecutiveFailures: number): number {
  return Math.min(RECONNECT_DELAY_MS * 2 ** (consecutiveFailures - 1), MAX_RECONNECT_DELAY_MS);
}

/** Events that change something the page renders and therefore require a refetch. */
const MATERIAL_EVENT_PREFIXES = [
  'task.',
  'assignment.',
  'runtime.',
  'plan.',
  'artifact.',
  'lead.',
];

function isMaterial(event: TaskEvent): boolean {
  return MATERIAL_EVENT_PREFIXES.some((prefix) => event.event_type.startsWith(prefix));
}

export interface LiveTaskState {
  status: 'loading' | 'ready' | 'error';
  error: ApiError | null;
  task: Task | null;
  usage: TaskTokenUsage | null;
  approvals: Approval[];
  events: readonly TaskEvent[];
  connection: ConnectionStatus;
}

export interface LiveTaskApi extends LiveTaskState {
  /** Replace the Task with one the backend just returned, e.g. from an action response. */
  setTask: (task: Task) => void;
  /** Refetch the Task and its dependent resources. */
  refresh: () => Promise<void>;
  reconnect: () => void;
  retry: () => void;
}

export function useLiveTask(taskId: string): LiveTaskApi {
  const [state, setState] = useState<LiveTaskState>({
    status: 'loading',
    error: null,
    task: null,
    usage: null,
    approvals: [],
    events: [],
    connection: 'connecting',
  });

  const eventLog = useRef(new TaskEventLog());
  const streamAbort = useRef<AbortController | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const failureCount = useRef(0);
  const mounted = useRef(true);
  const [retryToken, setRetryToken] = useState(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const patch = useCallback((update: Partial<LiveTaskState>) => {
    if (mounted.current) setState((current) => ({ ...current, ...update }));
  }, []);

  /**
   * Reconcile against the backend. Usage and approvals are best-effort: a Task that loads must stay
   * inspectable even when a secondary resource momentarily fails.
   */
  const refresh = useCallback(async () => {
    const task = await getTask(taskId);
    patch({ task, status: 'ready', error: null });

    const [usage, approvals] = await Promise.all([
      getTaskUsage(taskId).catch(() => stateRef.current.usage),
      listTaskApprovals(taskId).catch(() => stateRef.current.approvals),
    ]);
    patch({ usage: usage ?? null, approvals: approvals ?? [] });
  }, [patch, taskId]);

  const connect = useCallback(() => {
    streamAbort.current?.abort();
    if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    const controller = new AbortController();
    streamAbort.current = controller;
    patch({ connection: eventLog.current.size > 0 ? 'reconnecting' : 'connecting' });

    let sawMaterialEvent = false;

    void streamTaskEvents(taskId, {
      lastEventId: eventLog.current.lastEventId(),
      signal: controller.signal,
      onEvent: (event) => {
        failureCount.current = 0;
        // Duplicate delivery is expected by contract; a replayed event changes nothing.
        if (!eventLog.current.add(event)) return;
        if (isMaterial(event)) sawMaterialEvent = true;
        patch({ connection: 'live', events: [...eventLog.current.list()] });
      },
      onClose: () => {
        if (controller.signal.aborted || !mounted.current) return;
        failureCount.current = 0;
        void (async () => {
          if (sawMaterialEvent) {
            try {
              await refresh();
            } catch {
              // Keep the last persisted view; the next batch retries.
            }
          }
          if (!mounted.current) return;

          const task = stateRef.current.task;
          const terminal = task !== null && isTerminalTaskStatus(task.status);
          if (terminal) {
            // The logical stream is over. The Task resource stays queryable.
            patch({ connection: 'closed' });
            return;
          }
          patch({ connection: 'reconnecting' });
          reconnectTimer.current = window.setTimeout(connect, RECONNECT_DELAY_MS);
        })();
      },
      onError: (error) => {
        if (controller.signal.aborted || !mounted.current) return;
        if (error.kind === 'aborted') return;
        failureCount.current += 1;
        if (failureCount.current > MAX_CONSECUTIVE_FAILURES) {
          patch({ connection: 'closed' });
          return;
        }
        patch({ connection: 'reconnecting' });
        reconnectTimer.current = window.setTimeout(
          connect,
          failureBackoffMs(failureCount.current),
        );
      },
    });
  }, [patch, refresh, taskId]);

  useEffect(() => {
    mounted.current = true;
    eventLog.current = new TaskEventLog();
    failureCount.current = 0;

    void (async () => {
      patch({ status: 'loading', error: null });
      try {
        await refresh();
        if (!mounted.current) return;
        connect();
      } catch (cause) {
        const error = apiErrorFromThrown(cause);
        if (error.kind === 'aborted' || !mounted.current) return;
        patch({ status: 'error', error });
      }
    })();

    return () => {
      mounted.current = false;
      streamAbort.current?.abort();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [connect, patch, refresh, retryToken]);

  const setTask = useCallback(
    (task: Task) => {
      patch({ task });
      // An accepted control action changes usage and approvals too; reconnect to follow it.
      void refresh().catch(() => undefined);
      connect();
    },
    [connect, patch, refresh],
  );

  const reconnect = useCallback(() => {
    failureCount.current = 0;
    connect();
  }, [connect]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);

  return { ...state, setTask, refresh, reconnect, retry };
}
