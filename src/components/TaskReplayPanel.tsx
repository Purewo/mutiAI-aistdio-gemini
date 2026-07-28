/**
 * Product-level Task replay controls and immutable replay history.
 *
 * A replay is a reviewed business revision, not a Runtime resume or technical retry. The backend
 * remains authoritative for eligibility, topology expansion, pinned Artifacts, lineage, and the
 * replay budget; this component only submits contracted choices and renders persisted results.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  History,
  Loader2,
  RotateCcw,
  Save,
  Settings2,
} from 'lucide-react';
import { createTaskReplay, updateTaskReplayPolicy } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type {
  PlanStep,
  Task,
  TaskReplayPolicy,
  TaskReplayScope,
  TaskReplayStatus,
} from '../api/types';
import { formatDateTime, formatDuration } from '../lib/format';
import { DeliverySummary } from './taskBadges';
import { InlineError } from './states';

const ACTIVE_REPLAY_STATUSES = new Set<TaskReplayStatus>(['created', 'running', 'waiting']);

const REPLAY_STATUS: Record<TaskReplayStatus, { label: string; tone: string }> = {
  created: { label: '已创建', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  running: { label: '重放中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  waiting: { label: '等待中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  completed: { label: '已完成', tone: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  needs_revision: { label: '仍需修订', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  failed: { label: '重放失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

const SCOPE_LABEL: Record<TaskReplayScope, string> = {
  full: '完整重放',
  from_step: '从此步骤继续',
  step_only: '仅重放此步骤',
};

function ReplayStatusBadge({ status }: { status: TaskReplayStatus }) {
  const presentation = REPLAY_STATUS[status];
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${presentation.tone}`}>
      {presentation.label}
    </span>
  );
}

function isStrictLinear(steps: readonly PlanStep[]): boolean {
  const ordered = [...steps].sort((left, right) => left.sequence - right.sequence);
  if (ordered.length === 0) return false;
  return ordered.every((step, index) => {
    if (index === 0) return step.dependency_step_ids.length === 0;
    return (
      step.dependency_step_ids.length === 1 &&
      step.dependency_step_ids[0] === ordered[index - 1].plan_step_id
    );
  });
}

function specialistSteps(task: Task): PlanStep[] {
  return (task.base_execution_plan?.steps ?? task.execution_plan?.steps ?? []).filter(
    (step) => step.step_kind === 'specialist',
  );
}

function triggerLabel(trigger: string): string {
  if (trigger === 'lead') return '负责人自动发起';
  if (trigger === 'user') return '用户发起';
  return trigger;
}

function readBinding(value: Record<string, unknown>): { contractKey: string; artifactId: string } | null {
  const contractKey = value.contract_key;
  const artifactId = value.artifact_id;
  if (typeof contractKey !== 'string' || typeof artifactId !== 'string') return null;
  return { contractKey, artifactId };
}

function BindingSummary({
  label,
  values,
}: {
  label: string;
  values: readonly Record<string, unknown>[];
}) {
  const bindings = values.map(readBinding).filter((value): value is NonNullable<typeof value> => value !== null);
  if (bindings.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold text-slate-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {bindings.map((binding) => (
          <span
            key={`${binding.contractKey}:${binding.artifactId}`}
            className="rounded-full border border-blue-200/70 bg-blue-50 px-2 py-0.5 font-mono text-[10px] text-blue-700"
            title={`已固定 Artifact ${binding.artifactId}`}
          >
            {binding.contractKey}
          </span>
        ))}
      </div>
    </div>
  );
}

function ReplayHistory({ task }: { task: Task }) {
  const baseSteps = task.base_execution_plan?.steps ?? [];
  const stepNameById = new Map(baseSteps.map((step) => [step.plan_step_id, step.step_key]));
  const replayNumberById = new Map(
    task.replay_runs.map((replay) => [replay.replay_run_id, replay.replay_number]),
  );
  const newestFirst = [...task.replay_runs].sort(
    (left, right) => right.replay_number - left.replay_number,
  );

  if (newestFirst.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-5 text-center text-sm text-slate-500">
        还没有业务重放记录。技术重试不会出现在这里，也不会消耗重放次数。
      </div>
    );
  }

  return (
    <ol className="space-y-3">
      {newestFirst.map((replay) => {
        const targetName = replay.target_plan_step_id
          ? stepNameById.get(replay.target_plan_step_id) ?? '基准计划中的目标步骤'
          : null;
        const parentNumber = replay.parent_replay_run_id
          ? replayNumberById.get(replay.parent_replay_run_id)
          : null;
        return (
          <li
            key={replay.replay_run_id}
            className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-slate-900">第 {replay.replay_number} 次重放</span>
              <ReplayStatusBadge status={replay.status} />
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                {SCOPE_LABEL[replay.scope]}
              </span>
              <span className="text-[11px] text-slate-400">{triggerLabel(replay.trigger)}</span>
              {replay.wall_duration_seconds !== null ? (
                <span className="ml-auto text-xs tabular-nums text-slate-500">
                  {formatDuration(replay.wall_duration_seconds)}
                </span>
              ) : null}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-slate-800">重放原因：</span>
              {replay.reason}
            </p>
            {replay.feedback ? (
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
                <span className="font-semibold text-slate-700">修改反馈：</span>
                {replay.feedback}
              </p>
            ) : null}

            <dl className="mt-3 grid gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">范围</dt>
                <dd className="mt-0.5 font-medium text-slate-700">
                  {targetName ? `${SCOPE_LABEL[replay.scope]} · ${targetName}` : SCOPE_LABEL[replay.scope]}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">上下文</dt>
                <dd className="mt-0.5 font-medium text-slate-700">
                  {replay.context_policy === 'continue_context' ? '沿用岗位上下文' : replay.context_policy}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">血缘</dt>
                <dd className="mt-0.5 font-medium text-slate-700">
                  {parentNumber ? `继承第 ${parentNumber} 次重放` : '继承初始执行'}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 px-3 py-2">
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">创建时间</dt>
                <dd className="mt-0.5 font-medium text-slate-700">{formatDateTime(replay.created_at)}</dd>
              </div>
            </dl>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-indigo-700">本次执行</p>
                <div className="flex flex-wrap gap-1.5">
                  {replay.executed_step_keys.map((key) => (
                    <span key={key} className="rounded-full bg-white px-2 py-0.5 font-mono text-[10px] text-indigo-700 shadow-sm">
                      {key}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-500">固定复用</p>
                {replay.reused_step_keys.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {replay.reused_step_keys.map((key) => (
                      <span key={key} className="rounded-full border border-dashed border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500">
                        {key}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">无，所有步骤都重新执行</span>
                )}
              </div>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <BindingSummary label="固定输入 Artifact" values={replay.input_artifact_bindings} />
              <BindingSummary label="本次完成后的有效 Artifact" values={replay.effective_artifact_bindings} />
            </div>

            {replay.issues.length > 0 ? (
              <div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-orange-800">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  负责人指出的问题
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-orange-800">
                  {replay.issues.map((issue, index) => <li key={`${index}:${issue}`}>{issue}</li>)}
                </ul>
              </div>
            ) : null}

            {replay.lead_decision ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                负责人结论：{replay.lead_decision}
              </p>
            ) : null}
            {replay.result_summary ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <DeliverySummary summary={replay.result_summary} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function ReplayComposer({
  task,
  onReload,
  onReconnect,
}: {
  task: Task;
  onReload: () => Promise<void>;
  onReconnect: () => void;
}) {
  const baseSteps = useMemo(() => specialistSteps(task), [task]);
  const linear = isStrictLinear(task.base_execution_plan?.steps ?? []);
  const stepOnlyTargets = baseSteps.filter((step) => step.output_contracts.length > 0);
  const [scope, setScope] = useState<TaskReplayScope>('full');
  const [targetStepId, setTargetStepId] = useState('');
  const [reason, setReason] = useState('');
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const activeReplay = task.replay_runs.some((replay) => ACTIVE_REPLAY_STATUSES.has(replay.status));
  const exhausted = task.replay_count >= task.max_replay_count;
  const needsTarget = scope !== 'full';
  const targets = scope === 'step_only' ? stepOnlyTargets : baseSteps;
  const canSubmit =
    !submitting &&
    !activeReplay &&
    !exhausted &&
    reason.trim().length > 0 &&
    (!needsTarget || targetStepId.length > 0);

  useEffect(() => {
    if (scope === 'full') {
      setTargetStepId('');
      return;
    }
    if (!targets.some((step) => step.plan_step_id === targetStepId)) {
      setTargetStepId(targets[0]?.plan_step_id ?? '');
    }
  }, [scope, targetStepId, targets]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await createTaskReplay(
        task.task_id,
        {
          scope,
          target_plan_step_id: scope === 'full' ? null : targetStepId,
          reason: reason.trim(),
          feedback: feedback.trim(),
          context_policy: 'continue_context',
        },
        idempotencyKey.current,
      );
      idempotencyKey.current = crypto.randomUUID();
      setReason('');
      setFeedback('');
      await onReload();
      // needs_revision is quiescent, so its previous SSE loop is closed. A replay can make the
      // Task active again; explicitly reconnect after fetching the new authoritative snapshot.
      onReconnect();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
      // Replay execution may have persisted a failed run even when the request reports failure.
      await onReload().catch(() => undefined);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-orange-200 bg-orange-50/40 p-4" noValidate>
      <div className="mb-3 flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-900">根据负责人意见重放任务</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            重放会创建新的计划、岗位任务和产物版本，原执行记录不会被覆盖。
          </p>
        </div>
      </div>

      {activeReplay ? (
        <p className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
          当前已有一次重放正在进行，完成或取消后才能再次发起。
        </p>
      ) : exhausted ? (
        <p className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-800">
          已用完 {task.max_replay_count} 次业务重放额度。可先提高下方的重放上限，再决定是否继续。
        </p>
      ) : (
        <>
          <fieldset>
            <legend className="mb-2 text-xs font-semibold text-slate-700">重放范围</legend>
            <div className="grid gap-2 md:grid-cols-3">
              <ScopeOption
                value="full"
                current={scope}
                title="完整重放"
                description="重新执行所有岗位步骤和负责人验收。"
                onChange={setScope}
              />
              <ScopeOption
                value="from_step"
                current={scope}
                title="从某一步继续"
                description="复用上游产物，重做所选步骤及其后续步骤。"
                disabled={!linear}
                disabledHint="并行计划不支持线性后缀重放"
                onChange={setScope}
              />
              <ScopeOption
                value="step_only"
                current={scope}
                title="仅重放某一步"
                description="只产出候选结果，不会直接完成整个 Task。"
                disabled={stepOnlyTargets.length === 0}
                disabledHint="没有可单独重放且声明产出的岗位步骤"
                onChange={setScope}
              />
            </div>
          </fieldset>

          {needsTarget ? (
            <label className="mt-3 block text-xs font-semibold text-slate-700">
              目标步骤
              <select
                id="replay-target-step"
                name="replay-target-step"
                value={targetStepId}
                onChange={(event) => setTargetStepId(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                {targets.map((step) => (
                  <option key={step.plan_step_id} value={step.plan_step_id}>
                    {step.step_key} · {step.role_key} — {step.objective}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700">
              重放原因 <span className="text-red-500">*</span>
              <textarea
                id="replay-reason"
                name="replay-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={10_000}
                placeholder="例如：负责人验收发现统计口径与需求不一致。"
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
            <label className="text-xs font-semibold text-slate-700">
              修改反馈（可选）
              <textarea
                id="replay-feedback"
                name="replay-feedback"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                rows={3}
                maxLength={20_000}
                placeholder="写清需要保留什么、修正什么，以及新的验收标准。"
                className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-auto text-xs text-slate-500">
              上下文：沿用现有岗位 Workspace 与 Thread；重放会消耗 1 次业务额度。
            </span>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-600 to-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-orange-200 transition-all hover:from-orange-700 hover:to-rose-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
              {submitting ? '正在创建重放...' : '确认发起重放'}
            </button>
          </div>
        </>
      )}

      {error ? <div className="mt-3"><InlineError error={error} /></div> : null}
    </form>
  );
}

function ScopeOption({
  value,
  current,
  title,
  description,
  disabled = false,
  disabledHint,
  onChange,
}: {
  value: TaskReplayScope;
  current: TaskReplayScope;
  title: string;
  description: string;
  disabled?: boolean;
  disabledHint?: string;
  onChange: (value: TaskReplayScope) => void;
}) {
  const selected = current === value;
  return (
    <label
      className={`relative rounded-xl border px-3 py-2.5 transition-colors ${
        disabled
          ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-60'
          : selected
            ? 'cursor-pointer border-orange-300 bg-white ring-2 ring-orange-500/10'
            : 'cursor-pointer border-slate-200 bg-white hover:border-orange-200'
      }`}
      title={disabled ? disabledHint : undefined}
    >
      <input
        id={`replay-scope-${value}`}
        type="radio"
        name="replay-scope"
        value={value}
        checked={selected}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="sr-only"
      />
      <span className="block text-sm font-semibold text-slate-800">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
        {disabled && disabledHint ? disabledHint : description}
      </span>
    </label>
  );
}

export default function TaskReplayPanel({
  task,
  onTaskUpdated,
  onReload,
  onReconnect,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
  onReload: () => Promise<void>;
  onReconnect: () => void;
}) {
  const [policy, setPolicy] = useState<TaskReplayPolicy>(task.replay_policy);
  const [limit, setLimit] = useState(task.max_replay_count);
  const [saving, setSaving] = useState(false);
  const [policyError, setPolicyError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (saving) return;
    setPolicy(task.replay_policy);
    setLimit(task.max_replay_count);
  }, [saving, task.max_replay_count, task.replay_policy]);

  const dirty = policy !== task.replay_policy || limit !== task.max_replay_count;
  const savePolicy = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    setPolicyError(null);
    try {
      onTaskUpdated(
        await updateTaskReplayPolicy(task.task_id, {
          replay_policy: policy,
          max_replay_count: limit,
        }),
      );
    } catch (cause) {
      setPolicyError(apiErrorFromThrown(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <History className="h-5 w-5 text-violet-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">任务重放</h2>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
          {task.replay_count} / {task.max_replay_count} 次
        </span>
      </div>

      <div className="space-y-4">
        {task.status === 'needs_revision' ? (
          <ReplayComposer task={task} onReload={onReload} onReconnect={onReconnect} />
        ) : task.replay_runs.some((replay) => ACTIVE_REPLAY_STATUSES.has(replay.status)) ? (
          <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            业务重放正在执行。事件到达后会重新获取 Task 的权威状态。
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-start gap-2">
            <Settings2 className="mt-0.5 h-4 w-4 text-slate-500" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">重放策略</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                自动策略只接受负责人给出的、通过后端校验且未超过额度的重放建议。
              </p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px_auto] sm:items-end">
            <label className="text-xs font-semibold text-slate-700">
              触发方式
              <select
                id="task-replay-policy"
                name="task-replay-policy"
                value={policy}
                onChange={(event) => setPolicy(event.target.value as TaskReplayPolicy)}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              >
                <option value="manual">仅手动确认</option>
                <option value="auto_within_limit">额度内自动重放</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-700">
              最大重放次数
              <input
                id="task-replay-limit"
                name="task-replay-limit"
                type="number"
                min={task.replay_count}
                max={10}
                value={limit}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value)) setLimit(Math.min(10, Math.max(task.replay_count, value)));
                }}
                disabled={saving}
                className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
              />
            </label>
            <button
              type="button"
              onClick={savePolicy}
              disabled={!dirty || saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="h-4 w-4" aria-hidden="true" />}
              保存策略
            </button>
          </div>
          {policyError ? <div className="mt-3"><InlineError error={policyError} /></div> : null}
        </div>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <h3 className="text-sm font-bold text-slate-800">不可变重放记录</h3>
          </div>
          <ReplayHistory task={task} />
        </div>
      </div>
    </section>
  );
}
