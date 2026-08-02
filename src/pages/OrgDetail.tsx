import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, History, Loader2, Users } from 'lucide-react';
import {
  confirmOrganizationVersion,
  createTask,
  getOrganization,
  listOrganizationVersions,
  listVersionFeasibilityChecks,
  publishOrganizationVersion,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { FeasibilityCheck, OrganizationVersion, TaskReplayPolicy } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import FeasibilityPanel from '../components/FeasibilityPanel';
import OrganizationGraph from '../components/OrganizationGraph';
import PageHeader from '../components/PageHeader';
import VersionStatusBadge from '../components/VersionStatusBadge';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';
import { listRecentTasks, rememberTask } from '../lib/recentTasks';

export default function OrgDetail() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const organization = useApiResource(
    (signal) => getOrganization(organizationId ?? '', signal),
    [organizationId],
  );
  const versions = useApiResource(
    (signal) => listOrganizationVersions(organizationId ?? '', signal),
    [organizationId],
  );

  const backLink = (
    <Link
      to="/orgs"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      组织列表
    </Link>
  );

  if (organization.state.status === 'loading') {
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-4 py-5 sm:p-8">
          <LoadingState label="加载组织详情中..." />
        </div>
      </div>
    );
  }

  if (organization.state.status === 'error') {
    const { error } = organization.state;
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-4 py-5 sm:p-8">
          <div className="mx-auto max-w-2xl">
            <ErrorState
              error={error}
              title={error.isNotFound ? '找不到该组织' : '加载组织详情失败'}
              onRetry={error.isNotFound ? undefined : organization.reload}
            />
          </div>
        </div>
      </div>
    );
  }

  const detail = organization.state.data;
  const spec = detail.current_published_spec;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader
        title={detail.name}
        description={detail.description}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                detail.current_published_version_id
                  ? 'border-emerald-200/50 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {detail.current_published_version_id ? '已发布' : '未发布'}
            </span>
            {backLink}
          </div>
        }
      />

      <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-4 py-5 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-8 sm:space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">组织架构</h2>
              {spec ? <span className="text-sm text-slate-400">{spec.roles.length} 个岗位</span> : null}
            </div>

            {spec ? (
              <OrganizationGraph spec={spec} />
            ) : (
              <EmptyState
                title="该组织还没有已发布的版本"
                description="组织架构图由已发布的 OrganizationSpec 渲染。请在下方版本列表中确认并发布一个方案。"
              />
            )}
          </section>

          <TasksSection
            organizationId={detail.organization_id}
            published={detail.current_published_version_id !== null}
          />

          <section>
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">版本</h2>
            </div>

            {versions.state.status === 'loading' ? <LoadingState label="加载版本中..." /> : null}
            {versions.state.status === 'error' ? (
              <ErrorState error={versions.state.error} title="加载版本失败" onRetry={versions.reload} />
            ) : null}
            {versions.state.status === 'ready' && versions.state.data.length === 0 ? (
              <EmptyState title="暂无版本记录" />
            ) : null}
            {versions.state.status === 'ready' && versions.state.data.length > 0 ? (
              <ul className="space-y-3">
                {versions.state.data.map((version) => (
                  <VersionRow
                    key={version.spec_version_id}
                    version={version}
                    onChanged={() => {
                      // A confirm or publish changes both the version list and, on publish, the
                      // organization's current published spec. Reload the persisted resources
                      // instead of patching local state.
                      versions.reload();
                      organization.reload();
                    }}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function TasksSection({
  organizationId,
  published,
}: {
  organizationId: string;
  published: boolean;
}) {
  const navigate = useNavigate();
  const [request, setRequest] = useState('');
  const [replayPolicy, setReplayPolicy] = useState<TaskReplayPolicy>('manual');
  const [maxReplayCount, setMaxReplayCount] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  /**
   * One idempotency key per logical submission: it survives retries of a failed request so the
   * backend can return the original Task, and is regenerated only after a success.
   */
  const idempotencyKey = useRef<string>(crypto.randomUUID());
  const recent = listRecentTasks(organizationId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = request.trim();
    if (text.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await createTask(
        organizationId,
        {
          request: text,
          orchestration_mode: 'planned',
          replay_policy: replayPolicy,
          max_replay_count: maxReplayCount,
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = crypto.randomUUID();
      rememberTask({
        task_id: task.task_id,
        organization_id: organizationId,
        request_preview: text.slice(0, 200),
        submitted_at: task.created_at,
      });
      navigate(`/tasks/${task.task_id}`);
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">任务</h2>
      </div>

      {published ? (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
          noValidate
        >
          <label htmlFor="task-request" className="mb-1.5 block text-sm font-medium text-slate-700">
            向组织负责人提交任务
          </label>
          <textarea
            id="task-request"
            name="task-request"
            value={request}
            disabled={submitting}
            onChange={(event) => setRequest(event.target.value)}
            rows={3}
            placeholder="描述要完成的工作。提交后由组织负责人生成执行计划，确认计划并补齐输入后才会开始执行。"
            className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold leading-relaxed text-slate-600">
              业务重放策略 · {replayPolicy === 'manual' ? '仅手动确认' : '额度内自动重放'} · 最多 {maxReplayCount} 次
            </summary>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              负责人验收后若要求修订，可创建保留完整血缘的新执行尝试。Runtime 技术重试不占用这个额度。
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                触发方式
                <select
                  id="new-task-replay-policy"
                  name="new-task-replay-policy"
                  value={replayPolicy}
                  onChange={(event) => setReplayPolicy(event.target.value as TaskReplayPolicy)}
                  disabled={submitting}
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                >
                  <option value="manual">仅手动确认</option>
                  <option value="auto_within_limit">负责人建议通过校验后自动重放</option>
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-700">
                最大重放次数（0–10）
                <input
                  id="new-task-replay-limit"
                  name="new-task-replay-limit"
                  type="number"
                  min={0}
                  max={10}
                  value={maxReplayCount}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (Number.isFinite(value)) setMaxReplayCount(Math.min(10, Math.max(0, value)));
                  }}
                  disabled={submitting}
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
                />
              </label>
            </div>
          </details>
          {error ? (
            <div className="mt-3">
              <InlineError error={error} />
            </div>
          ) : null}
          <div className="mt-3 flex sm:justify-end">
            <button
              type="submit"
              disabled={submitting || request.trim().length === 0}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              )}
              提交任务
            </button>
          </div>
        </form>
      ) : (
        <EmptyState title="发布组织后即可提交任务" />
      )}

      {recent.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          {/*
            The contract has no Task-list route yet, so this is a browser-local record of recently
            submitted Tasks, kept only for navigation convenience. The gap is reported backend-side.
          */}
          <p className="mb-2 text-xs font-medium text-slate-400">最近提交（本地记录）</p>
          <ul className="space-y-1.5">
            {recent.map((record) => (
              <li key={record.task_id}>
                <Link
                  to={`/tasks/${record.task_id}`}
                  className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
                >
                  <span className="min-w-0 basis-full break-words sm:flex-1 sm:basis-auto sm:truncate">{record.request_preview}</span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(record.submitted_at)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function VersionRow({
  version,
  onChanged,
}: {
  version: OrganizationVersion;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<'confirm' | 'publish' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  /** Persisted feasibility checks, fetched lazily when the row is first expanded. */
  const [checks, setChecks] = useState<FeasibilityCheck[] | null>(null);
  const [checksError, setChecksError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!expanded || checks !== null) return;
    const controller = new AbortController();
    let active = true;
    listVersionFeasibilityChecks(version.organization_id, version.spec_version_id, controller.signal)
      .then((data) => {
        if (active) setChecks(data);
      })
      .catch((cause: unknown) => {
        const apiError = apiErrorFromThrown(cause);
        if (active && apiError.kind !== 'aborted') setChecksError(apiError);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [expanded, checks, version.organization_id, version.spec_version_id]);

  const runTransition = async (kind: 'confirm' | 'publish') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'confirm') {
        await confirmOrganizationVersion(version.organization_id, version.spec_version_id);
      } else {
        await publishOrganizationVersion(version.organization_id, version.spec_version_id);
      }
      onChanged();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setBusy(null);
    }
  };

  const smallButton =
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
          第 {version.version_number} 版
        </button>
        <VersionStatusBadge status={version.status} />
        <span className="text-xs text-slate-400">创建于 {formatDateTime(version.created_at)}</span>
        {version.published_at ? (
          <span className="text-xs text-slate-400">发布于 {formatDateTime(version.published_at)}</span>
        ) : null}

        <div className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto">
          {version.status === 'proposal' ? (
            <button
              type="button"
              onClick={() => runTransition('confirm')}
              disabled={busy !== null}
              className={`${smallButton} bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
            >
              {busy === 'confirm' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              确认
            </button>
          ) : null}
          {version.status === 'confirmed' ? (
            <button
              type="button"
              onClick={() => runTransition('publish')}
              disabled={busy !== null}
              className={`${smallButton} bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 focus-visible:ring-emerald-500/20`}
            >
              {busy === 'publish' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              发布
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-3">
          {version.source_request ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              需求描述：{version.source_request}
            </p>
          ) : null}
          <OrganizationGraph spec={version.spec} />
          {checks === null && checksError === null ? (
            <p className="text-xs text-slate-400">加载可行性结论中...</p>
          ) : null}
          {checksError ? <InlineError error={checksError} /> : null}
          {checks !== null ? <FeasibilityPanel checks={checks} /> : null}
        </div>
      ) : null}
    </li>
  );
}
