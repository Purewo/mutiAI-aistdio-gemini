import React, { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FileUp,
  ListChecks,
  Loader2,
  Play,
  Wand2,
  Workflow,
} from 'lucide-react';
import {
  getTask,
  listTaskFeasibilityChecks,
  planTask,
  startTask,
  uploadTaskInput,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { Task } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import FeasibilityPanel from '../components/FeasibilityPanel';
import PageHeader from '../components/PageHeader';
import PlanGraph from '../components/PlanGraph';
import { AssignmentStatusBadge, PlanStatusBadge, TaskStatusBadge } from '../components/taskBadges';
import { ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';

/**
 * Planned-Task preparation and inspection.
 *
 * The pre-execution flow follows the contracted lifecycle: the submitted Task carries
 * `orchestration_mode: planned`; `POST /plan` runs the organization lead's recoverable planning
 * boundary and persists an immutable plan; every contract key in
 * `execution_plan.initial_input_contracts` must be fulfilled by an uploaded initial Artifact; and
 * start stays disabled until the backend has returned a validated plan and no declared input is
 * missing. Plan topology renders exclusively from persisted step IDs and dependencies.
 */

/** Read a File into the contracted base64 transport. */
async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export default function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const task = useApiResource((signal) => getTask(taskId ?? '', signal), [taskId]);
  const checks = useApiResource(
    (signal) => listTaskFeasibilityChecks(taskId ?? '', signal),
    [taskId],
  );

  if (task.state.status === 'loading') {
    return (
      <Shell>
        <LoadingState label="加载任务中..." />
      </Shell>
    );
  }

  if (task.state.status === 'error') {
    const { error } = task.state;
    return (
      <Shell>
        <div className="mx-auto max-w-2xl">
          <ErrorState
            error={error}
            title={error.isNotFound ? '找不到该任务' : '加载任务失败'}
            onRetry={error.isNotFound ? undefined : task.reload}
          />
        </div>
      </Shell>
    );
  }

  const data = task.state.data;

  return (
    <Shell
      title={<TaskStatusBadge status={data.status} />}
      organizationId={data.organization_id}
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <TaskMetaCard task={data} />

        {checks.state.status === 'ready' && checks.state.data.length > 0 ? (
          <FeasibilityPanel checks={checks.state.data} />
        ) : null}

        <PlanSection task={data} onTaskUpdated={task.set} onReload={task.reload} />

        {data.execution_plan && data.execution_plan.initial_input_contracts.length > 0 ? (
          <InputsSection task={data} onUploaded={task.reload} />
        ) : null}

        <StartSection task={data} onTaskUpdated={task.set} onReload={task.reload} />

        {data.assignments.length > 0 ? <AssignmentsSection task={data} /> : null}
      </div>
    </Shell>
  );
}

function Shell({
  children,
  title,
  organizationId,
}: {
  children: React.ReactNode;
  title?: React.ReactNode;
  organizationId?: string;
}) {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader
        title="任务详情"
        actions={
          <div className="flex items-center gap-3">
            {title}
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
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
          {task.result_summary}
        </p>
      ) : null}
    </section>
  );
}

function PlanSection({
  task,
  onTaskUpdated,
  onReload,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => void;
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
      // Planning runs a recoverable lead boundary; the persisted Task may have moved anyway.
      onReload();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Workflow className="h-5 w-5 text-indigo-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">执行计划</h2>
        {plan ? <PlanStatusBadge status={plan.status} /> : null}
      </div>

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
              第 {plan.plan_version} 版 · 来源 {plan.source} · 创建于 {formatDateTime(plan.created_at)}
            </p>
          </div>
          <PlanGraph steps={plan.steps} />
        </div>
      )}
    </section>
  );
}

interface PendingUpload {
  file: File;
  /** Stable per-selection delivery identity, reused if the same upload is retried. */
  deliveryId: string;
  uploading: boolean;
  error: ApiError | null;
}

function InputsSection({ task, onUploaded }: { task: Task; onUploaded: () => void }) {
  const plan = task.execution_plan;
  const [pending, setPending] = useState<Map<string, PendingUpload>>(new Map());
  const fileInputs = useRef(new Map<string, HTMLInputElement | null>());

  if (!plan) return null;

  const fulfilledBy = (contractKey: string) =>
    task.artifacts.find(
      (artifact) => artifact.origin === 'task_input' && artifact.contract_key === contractKey,
    );

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
      onUploaded();
    } catch (cause) {
      setPendingFor(contractKey, {
        ...entry,
        uploading: false,
        error: apiErrorFromThrown(cause),
      });
    }
  };

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <FileUp className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">初始输入</h2>
        <span className="text-sm text-slate-400">
          计划声明了 {plan.initial_input_contracts.length} 项输入契约
        </span>
      </div>

      <ul className="space-y-3">
        {plan.initial_input_contracts.map((contractKey) => {
          const artifact = fulfilledBy(contractKey);
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
    </section>
  );
}

function StartSection({
  task,
  onTaskUpdated,
  onReload,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => void;
}) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const plan = task.execution_plan;
  // Start is only offered before execution begins; afterwards progress speaks for itself.
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
      // If /start reported a Runtime failure, the persisted Task holds the authoritative state.
      onReload();
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
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
    </section>
  );
}

function AssignmentsSection({ task }: { task: Task }) {
  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">岗位任务</h2>
      </div>
      <ul className="space-y-2">
        {task.assignments.map((assignment) => (
          <li
            key={assignment.assignment_id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm"
          >
            <span className="font-mono text-sm font-semibold text-slate-800">
              {assignment.agent_role_key}
            </span>
            <span className="text-xs text-slate-400">{assignment.assignment_kind}</span>
            <AssignmentStatusBadge status={assignment.status} />
            {assignment.result_summary ? (
              <p className="w-full text-sm leading-relaxed text-slate-600">
                {assignment.result_summary}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
