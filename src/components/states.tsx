/**
 * Shared loading, empty, error, and reconnect presentations.
 *
 * Every screen that reads backend data uses these so the four states look the same everywhere and
 * none of them is silently skipped. Error text comes from the backend's contracted envelope; these
 * components add framing, never invented fallback content.
 */
import React from 'react';
import { AlertCircle, Inbox, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { ApiError, describeApiError } from '../api/errors';

export function LoadingState({ label = '加载中...' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center gap-4 py-16 px-6 text-center"
    >
      <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden="true" />
      <p className="font-medium text-slate-500">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-100/50 py-16 px-6 text-center">
      <Inbox className="h-10 w-10 text-slate-400" aria-hidden="true" />
      <p className="font-medium text-slate-600">{title}</p>
      {description ? <p className="max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Render a failed request.
 *
 * The backend's `code` and `request_id` are shown when present so a defect can be correlated with
 * the server log instead of being reduced to a generic message.
 */
export function ErrorState({
  error,
  title = '加载失败',
  onRetry,
}: {
  error: unknown;
  title?: string;
  onRetry?: () => void;
}) {
  const apiError = error instanceof ApiError ? error : null;
  const offline = apiError?.kind === 'network';

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-red-100 bg-red-50/50 py-12 px-6 text-center"
    >
      {offline ? (
        <WifiOff className="h-8 w-8 text-red-500" aria-hidden="true" />
      ) : (
        <AlertCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
      )}
      <p className="font-semibold text-red-800">{title}</p>
      <p className="max-w-lg text-sm leading-relaxed text-red-700">{describeApiError(error)}</p>
      {apiError?.code || apiError?.requestId ? (
        <p className="font-mono text-xs text-red-500/80">
          {apiError.code ? <span>{apiError.code}</span> : null}
          {apiError.code && apiError.requestId ? <span> · </span> : null}
          {apiError.requestId ? <span>request {apiError.requestId}</span> : null}
        </p>
      ) : null}
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          重试
        </button>
      ) : null}
    </div>
  );
}

/**
 * Compact alert for a failed action inside an otherwise healthy view, such as a rejected confirm or
 * publish. Shows the backend envelope values without replacing the surrounding content.
 */
export function InlineError({ error }: { error: unknown }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-700"
    >
      <p>{describeApiError(error)}</p>
      {apiError?.code || apiError?.requestId ? (
        <p className="mt-1 font-mono text-xs text-red-500/80">
          {apiError.code ? <span>{apiError.code}</span> : null}
          {apiError.code && apiError.requestId ? <span> · </span> : null}
          {apiError.requestId ? <span>request {apiError.requestId}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * `closed` is a normal end of stream. `unreachable` means repeated reconnects failed and automatic
 * retrying stopped; the two must read differently so a lost backend is not mistaken for completion.
 */
export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'closed' | 'unreachable';

/**
 * Event-stream connection banner.
 *
 * The stream is a change-notification channel, so a dropped connection is a degraded-freshness
 * condition rather than a failure of the Task. `closed` is a normal end of stream after a terminal
 * event; the Task resource stays inspectable.
 */
export function ReconnectBanner({
  status,
  onReconnect,
  closedText = '事件流已结束，当前内容已是最新。',
}: {
  status: ConnectionStatus;
  onReconnect?: () => void;
  /** Overrides the end-of-stream copy, which differs between the task and conversation views. */
  closedText?: string;
}) {
  if (status === 'live') return null;

  const copy: Record<Exclude<ConnectionStatus, 'live'>, { text: string; tone: string }> = {
    connecting: { text: '正在连接事件流...', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
    reconnecting: {
      text: '事件流已断开，正在重连。进度可能暂时滞后。',
      tone: 'border-amber-200 bg-amber-50 text-amber-800',
    },
    closed: {
      text: closedText,
      tone: 'border-slate-200 bg-slate-50 text-slate-600',
    },
    unreachable: {
      text: '无法连接到服务端，已停止自动重连。当前内容可能不是最新。',
      tone: 'border-red-200 bg-red-50 text-red-800',
    },
  };
  const { text, tone } = copy[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-sm ${tone}`}
    >
      <span className="flex items-center gap-2">
        {status === 'reconnecting' ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : null}
        {text}
      </span>
      {onReconnect && status !== 'connecting' ? (
        <button
          type="button"
          onClick={onReconnect}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          重新连接
        </button>
      ) : null}
    </div>
  );
}
