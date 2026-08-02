/**
 * One product action the assistant proposed through conversation.
 *
 * Confirmation is asynchronous by contract: `confirmed` and `executing` are pending states, never
 * success. The card only claims an outcome once the backend reports `completed` or `failed`, and it
 * links to the persisted product resource rather than restating the assistant's own words as truth.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { getOrganization, listOrganizationVersions, listOrganizations } from '../api/endpoints';
import type {
  AssistantAction,
  AssistantActionStatus,
  OrganizationDetail,
  OrganizationVersion,
  Task,
} from '../api/types';
import { describeApiError } from '../api/errors';
import { formatDateTime } from '../lib/format';
import TaskInputBindingStatus from './TaskInputBindingStatus';
import {
  attachmentInputsFromAction,
  inputBindingFromAction,
  taskIdFromAction,
} from '../assistant/taskInputBindings';

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
  'organization.publish': '确认并发布组织',
  'task.submit': '提交任务',
  'task.replay': '重放任务',
  'task.retry': '重试任务',
  'task.cancel': '取消任务',
  'approval.decide': '处理 Runtime 审批',
};

type OrganizationRefreshState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; organization: OrganizationDetail; version: OrganizationVersion | null }
  | { status: 'error'; message: string };

function payloadString(action: AssistantAction, key: string): string | null {
  const value = action.payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function organizationIdFromAction(action: AssistantAction): string | null {
  return payloadString(action, 'organization_id') ??
    (action.target_type === 'organization' ? action.target_id : null);
}

function organizationVersionIdFromAction(action: AssistantAction): string | null {
  return payloadString(action, 'spec_version_id') ??
    (action.target_type === 'organization_version' ? action.target_id : null);
}

function isOrganizationAction(action: AssistantAction): boolean {
  return action.action_type === 'organization.publish' || action.action_type === 'organization.confirm';
}

/** Link to the persisted resource an action targets, when the frontend has a route for it. */
function targetLink(action: AssistantAction, task: Task | null): { to: string; label: string } | null {
  if (action.action_type === 'task.submit') {
    const taskId = task?.task_id ?? taskIdFromAction(action);
    if (taskId) return { to: `/tasks/${encodeURIComponent(taskId)}`, label: '查看任务' };
  }
  if (isOrganizationAction(action)) {
    const organizationId = organizationIdFromAction(action);
    if (organizationId) {
      return {
        to: `/orgs/${encodeURIComponent(organizationId)}`,
        label: '查看组织与版本',
      };
    }
  }
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
  task = null,
  onDecide,
}: {
  action: AssistantAction;
  task?: Task | null;
  onDecide: (actionId: string, decision: 'confirm' | 'decline') => Promise<void>;
}) {
  const [busy, setBusy] = useState<'confirm' | 'decline' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [organizationRefresh, setOrganizationRefresh] = useState<OrganizationRefreshState>({
    status: 'idle',
  });
  const [organizationRefreshToken, setOrganizationRefreshToken] = useState(0);

  const presentation = STATUS_PRESENTATION[action.status] ?? {
    label: action.status,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  const pending = action.status === 'confirmed' || action.status === 'executing';
  const organizationAction = isOrganizationAction(action);
  const organizationId = organizationIdFromAction(action);
  const organizationVersionId = organizationVersionIdFromAction(action);
  const organizationTerminal = action.status === 'completed' || action.status === 'failed';
  const link = targetLink(action, task);
  const attachmentInputs = attachmentInputsFromAction(action);
  const actionContracts = (() => {
    const contracts = task?.requested_input_contracts ?? [];
    const exact = contracts.filter((contract) => contract.source_action_id === action.action_id);
    return exact.length > 0
      ? exact
      : contracts.filter((contract) => contract.source_attachment_id !== null);
  })();
  const inputBinding = task?.input_binding ?? inputBindingFromAction(action);
  const showsAttachmentBinding =
    action.action_type === 'task.submit' &&
    (attachmentInputs.length > 0 || actionContracts.length > 0 || inputBinding !== null);
  const replayPayload =
    action.action_type === 'task.replay' && action.payload && typeof action.payload === 'object'
      ? action.payload
      : null;
  const replayScope = replayPayload && typeof replayPayload.scope === 'string' ? replayPayload.scope : null;
  const replayReason = replayPayload && typeof replayPayload.reason === 'string' ? replayPayload.reason : null;
  const replayFeedback = replayPayload && typeof replayPayload.feedback === 'string' ? replayPayload.feedback : null;

  useEffect(() => {
    if (!organizationAction || !organizationTerminal || !organizationVersionId) {
      setOrganizationRefresh({ status: 'idle' });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setOrganizationRefresh({ status: 'loading' });
    void (async () => {
      let resolvedOrganizationId = organizationId;
      if (!resolvedOrganizationId) {
        const organizations = await listOrganizations(controller.signal);
        const matches = await Promise.all(
          organizations.map(async (organization) => {
            try {
              const versions = await listOrganizationVersions(
                organization.organization_id,
                controller.signal,
              );
              return versions.some((item) => item.spec_version_id === organizationVersionId)
                ? organization.organization_id
                : null;
            } catch {
              return null;
            }
          }),
        );
        resolvedOrganizationId = matches.find((item): item is string => item !== null) ?? null;
      }
      if (!resolvedOrganizationId) {
        throw new Error('The organization for this version could not be resolved.');
      }
      return Promise.all([
        getOrganization(resolvedOrganizationId, controller.signal),
        listOrganizationVersions(resolvedOrganizationId, controller.signal),
      ]);
    })()
      .then(([organization, versions]) => {
        if (!active) return;
        setOrganizationRefresh({
          status: 'ready',
          organization,
          version:
            versions.find((item) => item.spec_version_id === organizationVersionId) ?? null,
        });
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setOrganizationRefresh({ status: 'error', message: describeApiError(cause) });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [
    action.action_id,
    action.status,
    organizationAction,
    organizationId,
    organizationRefreshToken,
    organizationTerminal,
    organizationVersionId,
  ]);

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
    'inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto';

  const organizationVersion = organizationRefresh.status === 'ready' ? organizationRefresh.version : null;
  const refreshedOrganizationId =
    organizationRefresh.status === 'ready' ? organizationRefresh.organization.organization_id : null;
  const resourceLink =
    link ??
    (organizationAction && refreshedOrganizationId
      ? { to: `/orgs/${encodeURIComponent(refreshedOrganizationId)}`, label: '查看组织与版本' }
      : null);
  const publishStateMatches =
    action.action_type === 'organization.publish' &&
    organizationRefresh.status === 'ready' &&
    organizationVersion?.status === 'published' &&
    organizationRefresh.organization.current_published_version_id === organizationVersionId;
  const showLink = Boolean(
    resourceLink &&
      (organizationAction
        ? organizationTerminal && organizationRefresh.status === 'ready'
        : action.status === 'completed' || pending),
  );

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
        <p className="mb-2 break-all font-mono text-[11px] text-slate-400">
          目标 {action.target_type} · {action.target_id}
        </p>
      ) : null}

      {replayPayload ? (
        <div className="mb-3 rounded-xl border border-orange-100 bg-orange-50/60 px-3 py-2.5 text-xs leading-relaxed text-orange-900">
          <p>
            <span className="font-semibold">范围：</span>
            {replayScope === 'full'
              ? '完整重放'
              : replayScope === 'from_step'
                ? '从指定步骤继续'
                : replayScope === 'step_only'
                  ? '仅重放指定步骤'
                  : replayScope ?? '后端已声明'}
          </p>
          {replayReason ? (
            <p className="mt-1">
              <span className="font-semibold">原因：</span>{replayReason}
            </p>
          ) : null}
          {replayFeedback ? (
            <p className="mt-1 whitespace-pre-wrap">
              <span className="font-semibold">反馈：</span>{replayFeedback}
            </p>
          ) : null}
          <p className="mt-1 text-orange-800/75">
            这是一次新的业务执行尝试，原计划和产物不会被覆盖。
          </p>
        </div>
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

      {organizationAction && organizationTerminal ? (
        <div className="mb-3">
          {organizationRefresh.status === 'loading' ? (
            <p className="flex min-h-11 items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 text-xs leading-relaxed text-indigo-700">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
              Action 已进入终态，正在刷新组织与版本状态…
            </p>
          ) : null}
          {organizationRefresh.status === 'ready' ? (
            <p
              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                action.action_type === 'organization.publish' && action.status === 'completed'
                  ? publishStateMatches
                    ? 'border-emerald-100 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800'
                  : action.action_type === 'organization.publish' &&
                      action.status === 'failed' &&
                      organizationVersion?.status === 'proposal'
                    ? 'border-slate-200 bg-slate-50 text-slate-700'
                    : 'border-indigo-100 bg-indigo-50/70 text-indigo-800'
              }`}
            >
              {action.action_type === 'organization.publish' && action.status === 'completed'
                ? publishStateMatches
                  ? `“${organizationRefresh.organization.name}”已确认并发布，组织与版本状态已刷新。`
                  : `Action 已完成，但刷新后的版本状态为 ${organizationVersion?.status ?? '未找到'}，请重新核对。`
                : action.action_type === 'organization.publish' && action.status === 'failed'
                  ? organizationVersion?.status === 'proposal'
                    ? '发布未完成；刷新结果确认方案仍为 proposal，没有形成半确认状态。'
                    : `发布未完成；组织与版本状态已刷新，当前版本状态为 ${organizationVersion?.status ?? '未找到'}。`
                  : `历史确认 Action 已完成；目标版本当前状态为 ${organizationVersion?.status ?? '未找到'}。`}
            </p>
          ) : null}
          {organizationRefresh.status === 'error' ? (
            <div className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-700">
              <p>Action 已进入终态，但组织与版本状态刷新失败：{organizationRefresh.message}</p>
              <button
                type="button"
                onClick={() => setOrganizationRefreshToken((token) => token + 1)}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-semibold text-red-700 hover:bg-red-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/15"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                重新刷新
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {showsAttachmentBinding ? (
        <div className="mb-3 space-y-2">
          <p
            className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
              action.status === 'proposed'
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : action.status === 'declined' || action.status === 'cancelled' || action.status === 'expired'
                  ? 'border-slate-200 bg-slate-50 text-slate-600'
                  : 'border-indigo-100 bg-indigo-50/70 text-indigo-800'
            }`}
          >
            {action.status === 'proposed'
              ? '普通聊天附件不会进入 Task。只有确认这个 planned Action 后，下面的附件才会按声明的 contract key 绑定。'
              : action.status === 'declined' || action.status === 'cancelled' || action.status === 'expired'
                ? '这次附件映射没有执行，附件仍只属于小助理对话。'
                : '附件映射已经明确授权；当前状态来自 Task 数据库，完成绑定也不会自动启动任务。'}
          </p>
          <TaskInputBindingStatus
            actionInputs={attachmentInputs}
            contracts={actionContracts}
            report={inputBinding}
            artifacts={task?.artifacts}
            title={action.status === 'proposed' ? '待确认的附件输入映射' : '附件输入映射'}
          />
        </div>
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

      <div className="flex flex-col items-stretch gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        {action.status === 'proposed' ? (
          <>
            <span className="text-xs leading-relaxed text-slate-400 sm:mr-auto">
              {action.action_type === 'organization.publish'
                ? '一次确认将原子完成方案确认与组织发布，不会再要求第二次点击。'
                : action.action_type === 'organization.confirm'
                  ? '这是历史兼容确认步骤；新的组织创建流程不会再产生该 Action。'
                  : '该操作会改变产品状态，需要您确认。'}
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
              {action.action_type === 'organization.publish'
                ? '确认并发布组织'
                : action.action_type === 'organization.confirm'
                  ? '确认组织方案'
                  : '确认'}
            </button>
          </>
        ) : null}

        {pending ? (
          <span className="text-xs leading-relaxed text-slate-500 sm:mr-auto">
            {action.action_type === 'organization.publish'
              ? '后端正在确认并发布；Action 完成前不会提前显示发布成功。'
              : '后端正在执行该操作，完成后这里会更新。'}
          </span>
        ) : null}

        {resourceLink && showLink ? (
          <Link
            to={resourceLink.to}
            className={`${button} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
          >
            {resourceLink.label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
