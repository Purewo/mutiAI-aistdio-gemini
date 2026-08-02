/**
 * Task event stream transport.
 *
 * The stream is a change-notification channel, not the source of persisted Task truth. Duplicate
 * delivery is expected by contract, so consumers deduplicate by `event_id` and reconcile the Task
 * resource after connecting, reconnecting, receiving material events, and reaching end of stream.
 *
 * This uses `fetch` rather than the native `EventSource` for two reasons the contract requires:
 * `EventSource` cannot send an explicit `Last-Event-ID` for events already held from a previous page
 * load, and it cannot send credentials to a differently-originated configurable API base.
 */
import { ApiError, apiErrorFromResponse, apiErrorFromThrown } from './errors';
import { API_BASE_URL } from './http';
import type { CoordinationEvent } from './types';

/**
 * Product event envelope, matching `contracts/task-event.v1.json`.
 *
 * `payload` is versioned by `schema_version`. Consumers must ignore unknown fields and tolerate
 * unknown `event_type` values without corrupting the current task view.
 */
export interface TaskEvent {
  event_id: string;
  event_type: string;
  schema_version: string;
  aggregate_type: string;
  aggregate_id: string;
  task_id: string;
  assignment_id: string | null;
  runtime_execution_id: string | null;
  sequence: number;
  occurred_at: string;
  source: string;
  correlation_id: string;
  payload: Record<string, unknown>;
}

export interface EventStreamHandlers<T> {
  /** Called after the server accepted the SSE request and before frames are read. */
  onOpen?: () => void;
  onEvent: (event: T) => void;
  /** Called once the server closed the stream normally. */
  onClose?: () => void;
  /** Called when the stream failed. The caller decides whether to reconnect. */
  onError?: (error: ApiError) => void;
}

export interface EventStreamOptions<T> extends EventStreamHandlers<T> {
  /**
   * Highest event ID already applied. The server replays events after this cursor before following
   * new ones, so passing it avoids re-delivering what the view already holds.
   */
  lastEventId?: string | null;
  signal?: AbortSignal;
}

/** One `data:` payload decoded from the SSE wire format. */
function parseEvent<T>(raw: string): T | null {
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as T;
  } catch {
    // An unparsable frame must not tear down a live stream.
    return null;
  }
}

/**
 * Read one SSE endpoint and dispatch decoded envelopes until the server closes it or the caller
 * aborts. Resolves when the stream ends; it does not reconnect on its own — reconnect policy
 * belongs to the caller, which owns the `Last-Event-ID` cursor.
 *
 * Shared by the task and platform-assistant streams: both use the same envelope rules, both may
 * deliver duplicates, and both are finite ordered batches rather than infinite streams.
 */
export async function streamEvents<T>(
  path: string,
  options: EventStreamOptions<T>,
): Promise<void> {
  const headers: Record<string, string> = {
    Accept: 'text/event-stream',
    'Accept-Language': 'zh-CN',
  };
  if (options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers,
      credentials: 'include',
      signal: options.signal,
    });
  } catch (cause) {
    options.onError?.(apiErrorFromThrown(cause));
    return;
  }

  if (!response.ok) {
    options.onError?.(await apiErrorFromResponse(response));
    return;
  }
  if (!response.body) {
    options.onError?.(
      new ApiError({ kind: 'malformed', status: response.status, message: 'Event stream had no body.' }),
    );
    return;
  }

  options.onOpen?.();

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      // SSE frames are separated by a blank line; tolerate CRLF from any intermediate proxy.
      for (;;) {
        const boundary = /\r?\n\r?\n/.exec(buffer);
        if (!boundary) break;
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const event = parseEvent<T>(frame);
        if (event) options.onEvent(event);
      }
    }
    const trailing = parseEvent<T>(buffer);
    if (trailing) options.onEvent(trailing);
    options.onClose?.();
  } catch (cause) {
    options.onError?.(apiErrorFromThrown(cause));
  } finally {
    reader.releaseLock();
  }
}

export function streamTaskEvents(
  taskId: string,
  options: EventStreamOptions<TaskEvent>,
): Promise<void> {
  return streamEvents(`/tasks/${encodeURIComponent(taskId)}/events`, options);
}

/**
 * Platform-assistant conversation event envelope, matching
 * `contracts/events/assistant-event.v1.json`. Conversation ordering is independent from Task
 * event ordering.
 */
export interface AssistantEvent {
  event_id: string;
  event_type: string;
  schema_version: string;
  aggregate_type: string;
  aggregate_id: string;
  conversation_id: string;
  sequence: number;
  occurred_at: string;
  source: string;
  correlation_id: string;
  payload: Record<string, unknown>;
}

export function streamAssistantEvents(
  conversationId: string,
  options: EventStreamOptions<AssistantEvent>,
): Promise<void> {
  return streamEvents(
    `/assistant/conversations/${encodeURIComponent(conversationId)}/events`,
    options,
  );
}

/** Expert private-trial event envelope, matching `contracts/events/expert-event.v1.json`. */
export interface ExpertEvent {
  event_id: string;
  event_type: string;
  schema_version: string;
  aggregate_type: string;
  aggregate_id: string;
  conversation_id: string;
  sequence: number;
  occurred_at: string;
  source: string;
  correlation_id: string;
  payload: Record<string, unknown>;
}

export function streamExpertEvents(
  conversationId: string,
  options: EventStreamOptions<ExpertEvent>,
): Promise<void> {
  return streamEvents(
    `/experts/conversations/${encodeURIComponent(conversationId)}/events`,
    options,
  );
}

/** Durable Case event replay. Persisted Case resources remain the display source of truth. */
export function streamCoordinationEvents(
  caseId: string,
  options: EventStreamOptions<CoordinationEvent>,
): Promise<void> {
  return streamEvents(
    `/coordination/cases/${encodeURIComponent(caseId)}/events`,
    options,
  );
}

/**
 * Ordered event log that tolerates the contract's duplicate delivery.
 *
 * Deduplication is by `event_id`; `sequence` provides display order and the reconnect cursor.
 */
export class EventLog<T extends { event_id: string; sequence: number }> {
  private readonly seen = new Set<string>();
  private events: T[] = [];

  /** Append an event. Returns false when it was already applied. */
  add(event: T): boolean {
    if (this.seen.has(event.event_id)) return false;
    this.seen.add(event.event_id);
    this.events.push(event);
    this.events.sort((a, b) => a.sequence - b.sequence);
    return true;
  }

  addAll(events: readonly T[]): number {
    let applied = 0;
    for (const event of events) {
      if (this.add(event)) applied += 1;
    }
    return applied;
  }

  list(): readonly T[] {
    return this.events;
  }

  /** Cursor to send as `Last-Event-ID` when reconnecting. */
  lastEventId(): string | null {
    return this.events.length > 0 ? this.events[this.events.length - 1].event_id : null;
  }

  get size(): number {
    return this.events.length;
  }
}

export class TaskEventLog extends EventLog<TaskEvent> {}
export class AssistantEventLog extends EventLog<AssistantEvent> {}
export class CoordinationEventLog extends EventLog<CoordinationEvent> {}
export class ExpertEventLog extends EventLog<ExpertEvent> {}
