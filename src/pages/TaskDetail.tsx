import React, { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  FileUp,
  Gauge,
  ListChecks,
  Loader2,
  Package,
  Play,
  RefreshCw,
  ShieldQuestion,
  Wand2,
  Workflow,
  XCircle,
} from 'lucide-react';
import {
  cancelTask,
  decideTaskApproval,
  listTaskFeasibilityChecks,
  planTask,
  retryTask,
  startTask,
  uploadTaskInput,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { Approval, Task } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import { useLiveTask } from '../task/useLiveTask';
import ArtifactList from '../components/ArtifactList';
import FeasibilityPanel from '../components/FeasibilityPanel';
import PageHeader from '../components/PageHeader';
import PlanGraph from '../components/PlanGraph';
import TaskEventLogView from '../components/TaskEventLogView';
import TaskUsagePanel from '../components/TaskUsagePanel';
import {
  AssignmentStatusBadge,
  DeliverySummary,
  PlanStatusBadge,
  TaskStatusBadge,
} from '../components/taskBadges';
import { ErrorState, InlineError, LoadingState, ReconnectBanner } from '../components/states';
import { formatDateTime } from '../lib/format';

/**
 * Planned-Task preparation, execution, and results.
 *
 * The Task resource is authoritative; the event stream only tells the page when to refetch. Plan
 * topology renders from persisted step IDs and dependencies, Artifact access uses only
 * backend-issued URLs, and approval controls appear only for approval records the backend returned.
 */

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const live = useLiveTask(taskId ?? '');
  const checks = useApiResource(
    (signal) => listTaskFeasibilityChecks(taskId ?? '', signal),
    [taskId],
  );

  if (live.status === 'loading') {
    return (
      <Shell>
        <LoadingState label="加载任务中..." />
      </Shell>
    );
  }

  if (live.status === 'error' || !live.task) {
    const error = live.error;
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <ErrorState
            error={error}
            title={error?.isNotFound ? '找不到该任务' : '加载任务失败'}
            onRetry={error?.isNotFound ? undefined : live.retry}
          />
        </div>
      </Shell>
    );
  }

  const task = live.task;

  return (
    <Shell status={<TaskStatusBadge status={task.status} />} organizationId={task.organization_id}>
      <div className="mx-auto max-w-6xl space-y-8">
        {live.connection !== 'live' ? (
          <ReconnectBanner
            status={live.connection}
            onReconnect={live.reconnect}
            closedText="事件流已结束。任务详情仍可查询。"
          />
        ) : null}

        <TaskMetaCard task={task} />

        {checks.state.status === 'ready' && checks.state.data.length > 0 ? (
          <FeasibilityPanel checks={checks.state.data} />
        ) : null}

        <ControlsSection task={task} onTaskUpdated={live.setTask} onReload={live.refresh} />

        {live.approvals.length > 0 ? (
          <ApprovalsSection
            taskId={task.task_id}
            approvals={live.approvals}
            onDecided={live.refresh}
          />
        ) : null}

        <PlanSection task={task} onTaskUpdated={live.setTask} onReload={live.refresh} />

        {task.execution_plan && task.execution_plan.initial_input_contracts.length > 0 ? (
          <InputsSection task={task} onUploaded={live.refresh} />
        ) : null}

        {task.artifacts.length > 0 ? (
          <Section icon={<Package className="h-5 w-5 text-emerald-600" />} title="交付结果">
            <ArtifactList artifacts={task.artifacts} />
          </Section>
        ) : null}

        {task.assignments.length > 0 ? <AssignmentsSection task={task} /> : null}

        {live.usage ? (
          <Section icon={<Gauge className="h-5 w-5 text-indigo-600" />} title="Token 用量">
            <TaskUsagePanel usage={live.usage} />
          </Section>
        ) : null}

        {live.events.length > 0 ? (
          <Section icon={<Activity className="h-5 w-5 text-blue-600" />} title="事件">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
              <TaskEventLogView events={live.events} />
            </div>
          </Section>
        ) : null}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  status,
  organizationId,
}: {
  children: React.ReactNode;
  status?: React.ReactNode;
  organizationId?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader
        title="任务详情"
        actions={
          <div className="flex items-center gap-3">
            {status}
            {organizationId ? (
              <Link
                to={`/orgs/${organizationId}`}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                所属组织
              </Link>
            ) : null}
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6 sm:p-8">{children}</div>
    </div>
  );
}

function Section({
  icon,
  title,
  extra,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <span aria-hidden="true">{icon}</span>
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

function TaskMetaCard({ task }: { task: Task }) {
  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{task.request}</p>
      <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="flex gap-1.5">
          <dt>编排模式</dt>
          <dd className="font-mono">{task.orchestration_mode}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>任务 ID</dt>
          <dd className="font-mono">{task.task_id}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>创建于</dt>
          <dd>{formatDateTime(task.created_at)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>更新于</dt>
          <dd>{formatDateTime(task.updated_at)}</dd>
        </div>
        {task.completed_at ? (
          <div className="flex gap-1.5">
            <dt>完成于</dt>
            <dd>{formatDateTime(task.completed_at)}</dd>
          </div>
        ) : null}
      </dl>
      {task.result_summary ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <DeliverySummary summary={task.result_summary} />
        </div>
      ) : null}
    </section>
  );
}

/** Retry and cancel, offered only for states where the backend accepts them. */
function ControlsSection({
  task,
  onTaskUpdated,
  onReload,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<'retry' | 'cancel' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const retryable = task.status === 'failed' || task.status === 'needs_revision';
  const cancellable =
    task.status === 'running' || task.status === 'waiting' || task.status === 'planning';
  if (!retryable && !cancellable) return null;

  const run = async (kind: 'retry' | 'cancel') => {
    setBusy(kind);
    setError(null);
    try {
      onTaskUpdated(kind === 'retry' ? await retryTask(task.task_id) : await cancelTask(task.task_id));
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      // TASK_CANCELLATION_INCOMPLETE still cancels the Task; read the persisted state.
      await onReload().catch(() => undefined);
    } finally {
      setBusy(null);
    }
  };

  const button =
    'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-slate-600">
          {retryable
            ? '可以重试失败的岗位任务，已完成的兄弟任务不会重跑。'
            : '任务正在执行，可以请求取消。'}
        </span>
        {retryable ? (
          <button
            type="button"
            onClick={() => run('retry')}
            disabled={busy !== null}
            className={`${button} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
          >
            {busy === 'retry' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            )}
            重试
          </button>
        ) : null}
        {cancellable ? (
          <button
            type="button"
            onClick={() => run('cancel')}
            disabled={busy !== null}
            className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-400/20`}
          >
            {busy === 'cancel' ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <XCircle className="h-4 w-4" aria-hidden="true" />
            )}
            取消任务
          </button>
        ) : null}
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </section>
  );
}

/** Runtime approval requests. Controls appear only for records the backend returned. */
function ApprovalsSection({
  taskId,
  approvals,
  onDecided,
}: {
  taskId: string;
  approvals: Approval[];
  onDecided: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const decide = async (approvalId: string, decision: 'accept' | 'decline' | 'cancel') => {
    setBusy(approvalId);
    setError(null);
    try {
      await decideTaskApproval(taskId, approvalId, { decision });
      await onDecided();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setBusy(null);
    }
  };

  const button =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <Section icon={<ShieldQuestion className="h-5 w-5 text-amber-600" />} title="Runtime 审批">
      <ul className="space-y-2">
        {approvals.map((approval) => (
          <li
            key={approval.approval_id}
            className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-800">{approval.kind}</span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                {approval.status}
              </span>
              {approval.status === 'pending' ? (
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => decide(approval.approval_id, 'decline')}
                    disabled={busy !== null}
                    className={`${button} border border-slate-200 text-slate-600 hover:bg-slate-50 focus-visible:ring-slate-400/20`}
                  >
                    拒绝
                  </button>
                  <button
                    type="button"
                    onClick={() => decide(approval.approval_id, 'accept')}
                    disabled={busy !== null}
                    className={`${button} bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
                  >
                    {busy === approval.approval_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    同意
                  </button>
                </div>
              ) : null}
            </div>
            {approval.reason ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{approval.reason}</p>
            ) : null}
            {/*
              The command is what the user is being asked to approve, so it must be visible to make
              an informed decision. `cwd` is deliberately omitted: host filesystem paths are not
              product history.
            */}
            {approval.command ? (
              <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                {approval.command}
              </pre>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </Section>
  );
}

function PlanSection({
  task,
  onTaskUpdated,
  onReload,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const plan = task.execution_plan;

  const generatePlan = async () => {
    setGenerating(true);
    setError(null);
    try {
      onTaskUpdated(await planTask(task.task_id));
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      await onReload().catch(() => undefined);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Section
      icon={<Workflow className="h-5 w-5 text-indigo-600" />}
      title="执行计划"
      extra={plan ? <PlanStatusBadge status={plan.status} /> : undefined}
    >
      {!plan ? (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6">
          <p className="text-sm text-slate-600">
            还没有执行计划。生成计划会由组织负责人拆解任务并声明所需的初始输入。
          </p>
          {error ? <InlineError error={error} /> : null}
          <button
            type="button"
            onClick={generatePlan}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden="true" />
            )}
            {generating ? '负责人规划中...' : '生成执行计划'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
            <p className="text-sm leading-relaxed text-slate-700">{plan.summary}</p>
            {plan.validation_summary ? (
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                校验：{plan.validation_summary}
              </p>
            ) : null}
            <p className="mt-2 text-[11px] text-slate-400">
              第 {plan.plan_version} 版 · 来源 {plan.source} · 创建于{' '}
              {formatDateTime(plan.created_at)}
            </p>
          </div>
          <PlanGraph steps={plan.steps} />
          <StartRow task={task} onTaskUpdated={onTaskUpdated} onReload={onReload} />
        </div>
      )}
    </Section>
  );
}

function StartRow({
  task,
  onTaskUpdated,
  onReload,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const plan = task.execution_plan;
  if (!plan || task.status !== 'created') return null;

  const missingInputs = plan.initial_input_contracts.filter(
    (contractKey) =>
      !task.artifacts.some(
        (artifact) => artifact.origin === 'task_input' && artifact.contract_key === contractKey,
      ),
  );
  const planValidated = plan.status === 'validated';
  const startable = planValidated && missingInputs.length === 0;

  const start = async () => {
    setStarting(true);
    setError(null);
    try {
      onTaskUpdated(await startTask(task.task_id));
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      // A Runtime failure reported by /start is persisted; render that, not the transient error.
      await onReload().catch(() => undefined);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto text-sm text-slate-600">
          {startable
            ? '计划已校验，所需输入齐备，可以开始执行。'
            : !planValidated
              ? `计划当前状态为「${plan.status}」，尚不能开始执行。`
              : `还有 ${missingInputs.length} 项声明的初始输入未上传：${missingInputs.join('、')}`}
        </div>
        <button
          type="button"
          onClick={start}
          disabled={!startable || starting}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-emerald-200 transition-all hover:from-emerald-700 hover:to-teal-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {starting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Play className="h-4 w-4" aria-hidden="true" />
          )}
          开始执行
        </button>
      </div>
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </div>
  );
}

interface PendingUpload {
  file: File;
  deliveryId: string;
  uploading: boolean;
  error: ApiError | null;
}

function InputsSection({ task, onUploaded }: { task: Task; onUploaded: () => Promise<void> }) {
  const plan = task.execution_plan;
  const [pending, setPending] = useState<Map<string, PendingUpload>>(new Map());
  const fileInputs = useRef(new Map<string, HTMLInputElement | null>());

  if (!plan) return null;

  const setPendingFor = (key: string, value: PendingUpload | null) => {
    setPending((current) => {
      const next = new Map(current);
      if (value === null) next.delete(key);
      else next.set(key, value);
      return next;
    });
  };

  const selectFile = (contractKey: string, file: File | null) => {
    if (!file) {
      setPendingFor(contractKey, null);
      return;
    }
    setPendingFor(contractKey, {
      file,
      deliveryId: `ui-input-${crypto.randomUUID()}`,
      uploading: false,
      error: null,
    });
  };

  const upload = async (contractKey: string) => {
    const entry = pending.get(contractKey);
    if (!entry || entry.uploading) return;
    setPendingFor(contractKey, { ...entry, uploading: true, error: null });
    try {
      await uploadTaskInput(task.task_id, {
        contract_key: contractKey,
        schema_version: '1.0',
        media_type: entry.file.type || 'application/octet-stream',
        file_name: entry.file.name,
        content_base64: await fileToBase64(entry.file),
        source_delivery_id: entry.deliveryId,
      });
      setPendingFor(contractKey, null);
      await onUploaded();
    } catch (cause) {
      setPendingFor(contractKey, { ...entry, uploading: false, error: apiErrorFromThrown(cause) });
    }
  };

  return (
    <Section
      icon={<FileUp className="h-5 w-5 text-blue-600" />}
      title="初始输入"
      extra={
        <span className="text-sm text-slate-400">
          计划声明了 {plan.initial_input_contracts.length} 项输入契约
        </span>
      }
    >
      <ul className="space-y-3">
        {plan.initial_input_contracts.map((contractKey) => {
          const artifact = task.artifacts.find(
            (item) => item.origin === 'task_input' && item.contract_key === contractKey,
          );
          const entry = pending.get(contractKey);
          return (
            <li
              key={contractKey}
              className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-semibold text-slate-800">{contractKey}</span>
                {artifact ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    已上传 {artifact.file_name}（{artifact.byte_size} 字节 · {artifact.status}）
                  </span>
                ) : (
                  <>
                    <input
                      ref={(element) => {
                        fileInputs.current.set(contractKey, element);
                      }}
                      id={`input-file-${contractKey}`}
                      name={`input-file-${contractKey}`}
                      type="file"
                      onChange={(event) => selectFile(contractKey, event.target.files?.[0] ?? null)}
                      className="text-sm text-slate-600 file:mr-3 file:rounded-lg file:border file:border-slate-200 file:bg-slate-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-100"
                      aria-label={`选择 ${contractKey} 的输入文件`}
                    />
                    <button
                      type="button"
                      onClick={() => upload(contractKey)}
                      disabled={!entry || entry.uploading}
                      className="ml-auto inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {entry?.uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <FileUp className="h-4 w-4" aria-hidden="true" />
                      )}
                      上传
                    </button>
                  </>
                )}
              </div>
              {entry?.error ? (
                <div className="mt-3">
                  <InlineError error={entry.error} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function AssignmentsSection({ task }: { task: Task }) {
  return (
    <Section icon={<ListChecks className="h-5 w-5 text-blue-600" />} title="岗位任务">
      <ul className="space-y-2">
        {task.assignments.map((assignment) => {
          const execution = assignment.runtime_execution;
          return (
            <li
              key={assignment.assignment_id}
              className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-sm font-semibold text-slate-800">
                  {assignment.agent_role_key}
                </span>
                <span className="text-xs text-slate-400">{assignment.assignment_kind}</span>
                <AssignmentStatusBadge status={assignment.status} />
              </div>

              {/*
                Product Runtime facts only: identities, policy snapshot, and compaction count. No
                Codex transcript, tool events, or host paths.
              */}
              {execution ? (
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-0.5 text-[11px] text-slate-400">
                  <div className="flex gap-1">
                    <dt>Runtime 状态</dt>
                    <dd>{execution.status}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>模型</dt>
                    <dd>
                      {execution.actual_model ?? '—'}
                      {execution.requested_model && execution.requested_model !== execution.actual_model
                        ? `（请求 ${execution.requested_model}）`
                        : null}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>安全模式</dt>
                    <dd>{execution.security_mode ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>沙箱</dt>
                    <dd>{execution.sandbox_mode ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>网络</dt>
                    <dd>
                      {execution.network_access === null
                        ? '—'
                        : execution.network_access
                          ? '允许'
                          : '禁止'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>上下文压缩</dt>
                    <dd>{execution.context_compactions}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>执行 ID</dt>
                    <dd className="font-mono">{execution.execution_id}</dd>
                  </div>
                  {execution.wait_reason ? (
                    <div className="flex gap-1">
                      <dt>等待原因</dt>
                      <dd>{execution.wait_reason}</dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              {assignment.result_summary ? (
                <div className="mt-2">
                  <DeliverySummary summary={assignment.result_summary} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

