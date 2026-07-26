/**
 * One product action the assistant proposed through conversation.
 *
 * Confirmation is asynchronous by contract: `confirmed` and `executing` are pending states, never
 * success. The card only claims an outcome once the backend reports `completed` or `failed`, and it
 * links to the persisted product resource rather than restating the assistant's own words as truth.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, AlertCircle, Loader2, X } from 'lucide-react';
import type { AssistantAction, AssistantActionStatus } from '../api/types';
import { describeApiError } from '../api/errors';
import { formatDateTime } from '../lib/format';

const STATUS_PRESENTATION: Record<AssistantActionStatus, { label: string; tone: string }> = {
  proposed: { label: '待确认', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  confirmed: { label: '已确认 · 执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  executing: { label: '执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  completed: { label: '已完成', tone: 'border-emerald-200/60 bg-emerald-50 text-emerald-700' },
  failed: { label: '执行失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  declined: { label: '已拒绝', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
  expired: { label: '已过期', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
  superseded: { label: '已被取代', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

/** Human labels for the action types the current backend proposes. */
const ACTION_TYPE_LABELS: Record<string, string> = {
  'organization.confirm': '确认组织方案',
  'organization.publish': '发布组织',
  'task.submit': '提交任务',
  'task.retry': '重试任务',
  'task.cancel': '取消任务',
  'approval.decide': '处理 Runtime 审批',
};

/** Link to the persisted resource an action targets, when the frontend has a route for it. */
function targetLink(action: AssistantAction): { to: string; label: string } | null {
  if (!action.target_id) return null;
  if (action.target_type === 'organization') {
    return { to: `/orgs/${action.target_id}`, label: '查看组织' };
  }
  if (action.target_type === 'task') {
    return { to: `/tasks/${action.target_id}`, label: '查看任务' };
  }
  return null;
}

export default function AssistantActionCard({
  action,
  onDecide,
}: {
  action: AssistantAction;
  onDecide: (actionId: string, decision: 'confirm' | 'decline') => Promise<void>;
}) {
  const [busy, setBusy] = useState<'confirm' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const presentation = STATUS_PRESENTATION[action.status] ?? {
    label: action.status,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const pending = action.status === 'confirmed' || action.status === 'executing';
  const link = targetLink(action);

  const decide = async (decision: 'confirm' | 'decline') => {
    setBusy(decision);
    setError(null);
    try {
      await onDecide(action.action_id, decision);
    } catch (cause) {
      setError(describeApiError(cause));
    } finally {
      setBusy(null);
    }
  };

  const button =
    'inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-900">
          {ACTION_TYPE_LABELS[action.action_type] ?? action.action_type}
        </span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${presentation.tone}`}
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          {presentation.label}
        </span>
        <span className="font-mono text-[11px] text-slate-400">{action.action_type}</span>
      </div>

      {action.target_type && action.target_id ? (
        <p className="mb-2 truncate font-mono text-[11px] text-slate-400">
          目标 {action.target_type} · {action.target_id}
        </p>
      ) : null}

      {/* The failure message is the backend's localized text, shown verbatim. */}
      {action.status === 'failed' && action.error_message ? (
        <p className="mb-2 flex items-start gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm leading-relaxed text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          {/* `min-w-0` lets this shrink below its content; error codes are long unbreakable tokens. */}
          <span className="min-w-0 flex-1 break-words">
            {action.error_message}
            {action.error_code ? (
              <span className="ml-1.5 break-all font-mono text-xs text-red-500">
                {action.error_code}
              </span>
            ) : null}
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="mb-2 text-sm leading-relaxed text-red-600">
          {error}
        </p>
      ) : null}

      <dl className="mb-3 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-slate-400">
        <div className="flex gap-1">
          <dt>提出于</dt>
          <dd>{formatDateTime(action.proposed_at)}</dd>
        </div>
        {action.confirmed_at ? (
          <div className="flex gap-1">
            <dt>确认于</dt>
            <dd>{formatDateTime(action.confirmed_at)}</dd>
          </div>
        ) : null}
        {action.executed_at ? (
          <div className="flex gap-1">
            <dt>执行于</dt>
            <dd>{formatDateTime(action.executed_at)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        {action.status === 'proposed' ? (
          <>
            <span className="mr-auto text-xs text-slate-400">
              该操作会改变产品状态，需要您确认。
            </span>
            <button
              type="button"
              onClick={() => decide('decline')}
              disabled={busy !== null}
              className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-400/20`}
            >
              {busy === 'decline' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <X className="h-4 w-4" aria-hidden="true" />
              )}
              拒绝
            </button>
            <button
              type="button"
              onClick={() => decide('confirm')}
              disabled={busy !== null}
              className={`${button} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
            >
              {busy === 'confirm' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-4 w-4" aria-hidden="true" />
              )}
              确认
            </button>
          </>
        ) : null}

        {pending ? (
          <span className="mr-auto text-xs text-slate-500">
            后端正在执行该操作，完成后这里会更新。
          </span>
        ) : null}

        {link && (action.status === 'completed' || pending) ? (
          <Link
            to={link.to}
            className={`${button} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
          >
            {link.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
