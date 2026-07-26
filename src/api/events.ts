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

export interface EventStreamHandlers {
  onEvent: (event: TaskEvent) => void;
  /** Called once the server closed the stream normally. */
  onClose?: () => void;
  /** Called when the stream failed. The caller decides whether to reconnect. */
  onError?: (error: ApiError) => void;
}

export interface EventStreamOptions extends EventStreamHandlers {
  /**
   * Highest event ID already applied. The server replays events after this cursor before following
   * new ones, so passing it avoids re-delivering what the view already holds.
   */
  lastEventId?: string | null;
  signal?: AbortSignal;
}

/** One `data:` payload decoded from the SSE wire format. */
function parseEvent(raw: string): TaskEvent | null {
  const dataLines: string[] = [];
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join('\n')) as TaskEvent;
  } catch {
    // An unparsable frame must not tear down a live stream.
    return null;
  }
}

/**
 * Open the task event stream and dispatch decoded envelopes until the server closes it or the
 * caller aborts. Resolves when the stream ends; it does not reconnect on its own.
 */
export async function streamTaskEvents(taskId: string, options: EventStreamOptions): Promise<void> {
  const headers: Record<string, string> = { Accept: 'text/event-stream' };
  if (options.lastEventId) headers['Last-Event-ID'] = options.lastEventId;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/tasks/${encodeURIComponent(taskId)}/events`, {
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
        const event = parseEvent(frame);
        if (event) options.onEvent(event);
      }
    }
    const trailing = parseEvent(buffer);
    if (trailing) options.onEvent(trailing);
    options.onClose?.();
  } catch (cause) {
    options.onError?.(apiErrorFromThrown(cause));
  } finally {
    reader.releaseLock();
  }
}

/**
 * Ordered event log that tolerates the contract's duplicate delivery.
 *
 * Deduplication is by `event_id`; `sequence` provides display order and the reconnect cursor.
 */
export class TaskEventLog {
  private readonly seen = new Set<string>();
  private events: TaskEvent[] = [];

  /** Append an event. Returns false when it was already applied. */
  add(event: TaskEvent): boolean {
    if (this.seen.has(event.event_id)) return false;
    this.seen.add(event.event_id);
    this.events.push(event);
    this.events.sort((a, b) => a.sequence - b.sequence);
    return true;
  }

  addAll(events: readonly TaskEvent[]): number {
    let applied = 0;
    for (const event of events) {
      if (this.add(event)) applied += 1;
    }
    return applied;
  }

  list(): readonly TaskEvent[] {
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
