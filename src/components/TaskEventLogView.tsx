/**
 * Product event history for a Task.
 *
 * These are normalized product events, not raw Codex output: no transcripts, tool calls, LangGraph
 * checkpoints, or host paths appear here. Rows are keyed by `event_id`, so a replayed or duplicated
 * delivery cannot produce a second row.
 */
import type { TaskEvent } from '../api/events';
import { formatDateTime } from '../lib/format';

/** Tone per event family, so failures and completions are distinguishable at a glance. */
function toneFor(eventType: string): string {
  if (/fail|reject|cancel/i.test(eventType)) return 'bg-red-400';
  if (/completed|released|published/i.test(eventType)) return 'bg-emerald-400';
  if (/waiting|deferred|approval/i.test(eventType)) return 'bg-amber-400';
  return 'bg-slate-300';
}

/** Longest scalar value shown in a one-line event summary. */
const MAX_VALUE_LENGTH = 80;

/**
 * Product-safe payload summary: a few scalar fields, never a raw dump of nested internals.
 *
 * Some payload strings carry a whole serialized delivery envelope, so values are clipped. The full
 * record stays available on the Assignment and Artifact resources; this row is an index, not a
 * transcript.
 */
function summarize(payload: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object') continue;
    if (key.endsWith('_id') && parts.length > 1) continue;
    const text = String(value);
    parts.push(
      `${key}=${text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}…` : text}`,
    );
    if (parts.length >= 4) break;
  }
  return parts.join(' · ');
}

export default function TaskEventLogView({ events }: { events: readonly TaskEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-400">暂无事件。</p>;
  }

  return (
    <ol className="space-y-1.5">
      {events.map((event) => (
        <li key={event.event_id} className="flex items-start gap-2.5 text-xs">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${toneFor(event.event_type)}`}
          />
          {/*
            Event types are long unbreakable identifiers. On a narrow column the sequence and
            timestamp would leave them too little room to fit, so below `sm` they move onto their own
            line instead of pushing the row into a horizontal scroll.
          */}
          <div className="min-w-0 flex-1 sm:flex sm:items-start sm:gap-2.5">
            <div className="flex gap-2.5 text-slate-400">
              <span className="w-12 flex-shrink-0 tabular-nums">#{event.sequence}</span>
              <span className="flex-shrink-0 sm:w-32">{formatDateTime(event.occurred_at)}</span>
            </div>
            <div className="min-w-0 flex-1">
              <span className="break-all font-mono font-medium text-slate-700">
                {event.event_type}
              </span>
              {(() => {
                const summary = summarize(event.payload);
                return summary ? (
                  <span className="ml-2 break-all text-slate-400">{summary}</span>
                ) : null;
              })()}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
