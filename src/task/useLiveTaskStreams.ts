/**
 * Persisted Artifact Stream projections for one Task.
 *
 * Task SSE is only a refresh signal. Every update reads both the collection and each detail
 * endpoint again, while retaining the last successful projection during a quiet reconciliation.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getTaskArtifactStream,
  getTaskStreamExecution,
  listTaskArtifactStreams,
  listTaskStreamExecutions,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { ArtifactStream, PlanStepExecution } from '../api/types';

interface TaskStreamProjection {
  streams: ArtifactStream[];
  executions: PlanStepExecution[];
}

interface TaskStreamsState {
  status: 'loading' | 'ready' | 'error';
  streams: ArtifactStream[];
  executions: PlanStepExecution[];
  error: ApiError | null;
  refreshing: boolean;
}

export interface LiveTaskStreamsApi extends TaskStreamsState {
  refresh: () => Promise<TaskStreamProjection>;
  retry: () => void;
}

export function useLiveTaskStreams(taskId: string, revisionKey?: string | null): LiveTaskStreamsApi {
  const [state, setState] = useState<TaskStreamsState>({
    status: 'loading',
    streams: [],
    executions: [],
    error: null,
    refreshing: false,
  });
  const mounted = useRef(true);
  const streamsRef = useRef<ArtifactStream[]>([]);
  const executionsRef = useRef<PlanStepExecution[]>([]);
  const requestRef = useRef<Promise<TaskStreamProjection> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const refresh = useCallback(async (): Promise<TaskStreamProjection> => {
    if (requestRef.current) return requestRef.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const hasProjection = streamsRef.current.length > 0 || executionsRef.current.length > 0;
    if (mounted.current) {
      setState((current) => ({
        ...current,
        status: hasProjection ? 'ready' : 'loading',
        error: null,
        refreshing: hasProjection,
      }));
    }

    const request = Promise.all([
      listTaskArtifactStreams(taskId, controller.signal),
      listTaskStreamExecutions(taskId, controller.signal),
    ])
      .then(async ([listedStreams, listedExecutions]) => {
        // The detail route is authoritative for the expanded partition/delivery inspector. Reading
        // each listed stream also proves that the list never smuggles an unowned detail resource.
        const [detailedStreams, detailedExecutions] = await Promise.all([
          Promise.all(
            listedStreams.map((stream) =>
              getTaskArtifactStream(taskId, stream.artifact_stream_id, controller.signal),
            ),
          ),
          Promise.all(
            listedExecutions.map((execution) =>
              getTaskStreamExecution(taskId, execution.plan_step_execution_id, controller.signal),
            ),
          ),
        ]);
        detailedStreams.sort((left, right) => left.created_at.localeCompare(right.created_at));
        detailedExecutions.sort((left, right) => left.created_at.localeCompare(right.created_at));
        streamsRef.current = detailedStreams;
        executionsRef.current = detailedExecutions;
        if (mounted.current) {
          setState({
            status: 'ready',
            streams: detailedStreams,
            executions: detailedExecutions,
            error: null,
            refreshing: false,
          });
        }
        return { streams: detailedStreams, executions: detailedExecutions };
      })
      .catch((cause: unknown) => {
        const error = apiErrorFromThrown(cause);
        if (mounted.current && error.kind !== 'aborted') {
          setState((current) => ({
            status:
              current.streams.length > 0 || current.executions.length > 0 ? 'ready' : 'error',
            streams: current.streams,
            executions: current.executions,
            error,
            refreshing: false,
          }));
        }
        throw error;
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
          requestRef.current = null;
        }
      });
    requestRef.current = request;
    return request;
  }, [taskId]);

  useEffect(() => {
    mounted.current = true;
    streamsRef.current = [];
    executionsRef.current = [];
    setState({ status: 'loading', streams: [], executions: [], error: null, refreshing: false });
    void refresh().catch(() => undefined);
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
      abortRef.current = null;
      requestRef.current = null;
    };
  }, [refresh, retryToken, taskId]);

  useEffect(() => {
    if (!revisionKey || (streamsRef.current.length === 0 && executionsRef.current.length === 0)) return;
    void refresh().catch(() => undefined);
  }, [refresh, revisionKey]);

  const retry = useCallback(() => setRetryToken((token) => token + 1), []);
  return { ...state, refresh, retry };
}
