import {
  AlertTriangle,
  Ban,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Cpu,
  FileOutput,
  GitMerge,
  Link2,
  Loader2,
  PauseCircle,
  Radio,
  RefreshCw,
  RotateCcw,
  Rows3,
  Workflow,
  XCircle,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { cancelTaskStreamExecution, retryTaskStreamExecution } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type {
  ArtifactDelivery,
  ArtifactDeliveryAttempt,
  ArtifactDeliveryAttemptStatus,
  ArtifactStream,
  ArtifactStreamStatus,
  PlanStep,
  PlanStepExecution,
  PlanStepExecutionAttempt,
  PlanStepExecutionAttemptStatus,
  PlanStepExecutionStatus,
  StreamFinalizationAttempt,
  StreamSubscription,
  Task,
} from '../api/types';
import { formatBytes, formatDateTime } from '../lib/format';
import { useLiveTaskStreams } from '../task/useLiveTaskStreams';
import { ErrorState, InlineError } from './states';

const STATUS_META: Record<ArtifactStreamStatus, { label: string; className: string }> = {
  declared: { label: '已声明', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  open: { label: '已打开', className: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  finalizing: { label: '正在最终确认', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  finalized: { label: '已最终确认', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  failed: { label: '失败', className: 'border-red-200 bg-red-50 text-red-800' },
  cancelled: { label: '已取消', className: 'border-slate-200 bg-slate-100 text-slate-700' },
};

const EXECUTION_STATUS_META: Record<PlanStepExecutionStatus, { label: string; className: string }> = {
  pending_input: { label: '等待输入', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  ready: { label: '就绪', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  submitted: { label: '已提交', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  running: { label: '工作中', className: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  waiting: { label: '等待结果', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  completed: { label: '分区完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  failed: { label: '失败', className: 'border-red-200 bg-red-50 text-red-800' },
  cancelled: { label: '已取消', className: 'border-slate-200 bg-slate-100 text-slate-700' },
};

const DELIVERY_ATTEMPT_STATUS_META: Record<
  ArtifactDeliveryAttemptStatus,
  { label: string; className: string }
> = {
  accepted: { label: '已接受', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  duplicate: { label: '幂等重复', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  rejected: { label: '已拒绝', className: 'border-red-200 bg-red-50 text-red-800' },
  conflict: { label: '身份冲突', className: 'border-orange-200 bg-orange-50 text-orange-800' },
};

const EXECUTION_ATTEMPT_STATUS_META: Record<
  PlanStepExecutionAttemptStatus,
  { label: string; className: string }
> = {
  requested: { label: '已请求', className: 'border-blue-200 bg-blue-50 text-blue-800' },
  submitted: { label: '已提交', className: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  running: { label: '工作中', className: 'border-cyan-200 bg-cyan-50 text-cyan-800' },
  waiting: { label: '等待结果', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  completed: { label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  failed: { label: '失败', className: 'border-red-200 bg-red-50 text-red-800' },
  cancelled: { label: '已取消', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  exhausted: { label: '重试耗尽', className: 'border-rose-300 bg-rose-50 text-rose-900' },
};

const ACTIVE_EXECUTION_STATUSES = new Set<PlanStepExecutionStatus>([
  'submitted',
  'running',
  'waiting',
]);

type ScenarioState = 'empty' | 'open' | 'partial' | 'finalized' | 'failed';

const SCENARIO_META: Record<ScenarioState, { label: string; description: string; className: string }> = {
  empty: {
    label: '空流',
    description: '有限分区已经声明，尚未打开，也没有持久化交付。',
    className: 'border-slate-200 bg-slate-50 text-slate-700',
  },
  open: {
    label: '等待交付',
    description: '流已经打开，声明的分区目前都还没有最终交付。',
    className: 'border-cyan-200 bg-cyan-50 text-cyan-800',
  },
  partial: {
    label: '部分到达',
    description: '至少一个分区已有最终交付，其余有限分区仍保持未完成。',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  finalized: {
    label: '全部最终确认',
    description: '所有声明分区均有最终交付，并已写入不可变 finalization watermark。',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  },
  failed: {
    label: '流失败',
    description: '失败状态和原因来自持久化流记录；已接受的交付仍保留为证据。',
    className: 'border-red-200 bg-red-50 text-red-800',
  },
};

function scenarioState(stream: ArtifactStream): ScenarioState {
  if (stream.status === 'failed' || stream.status === 'cancelled') return 'failed';
  if (stream.status === 'finalized') return 'finalized';
  if (stream.final_partition_count > 0) return 'partial';
  if (stream.status === 'declared') return 'empty';
  return 'open';
}

function deliveryKindLabel(delivery: ArtifactDelivery): string {
  return delivery.delivery_kind === 'final' ? '最终交付' : '临时交付';
}

function StreamContractSummary({ steps }: { steps: readonly PlanStep[] }) {
  const declarations = useMemo(
    () =>
      steps.flatMap((step) => [
        ...step.stream_output_contracts.map((contract) => ({
          key: `${step.plan_step_id}:out:${contract.contract_key}`,
          role: 'output' as const,
          step,
          contractKey: contract.contract_key,
          detail: `${contract.media_type} · ${contract.partition_key_name} · ${contract.expected_partition_keys.length} 个有限分区`,
        })),
        ...step.stream_input_contracts.map((contract) => ({
          key: `${step.plan_step_id}:in:${contract.contract_key}`,
          role: 'input' as const,
          step,
          contractKey: contract.contract_key,
          detail: `${contract.trigger_policy} · ${contract.delivery_kind} · 最大并发 ${contract.max_concurrent_executions}`,
        })),
      ]),
    [steps],
  );

  if (declarations.length === 0) return null;
  return (
    <div className="grid gap-2 lg:grid-cols-2">
      {declarations.map((item) => (
        <div key={item.key} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                item.role === 'output' ? 'bg-cyan-100 text-cyan-800' : 'bg-indigo-100 text-indigo-800'
              }`}
            >
              {item.role === 'output' ? '流输出' : '流输入'}
            </span>
            <span className="text-xs font-semibold text-slate-800">{item.step.step_key}</span>
          </div>
          <p className="mt-2 break-all font-mono text-xs font-semibold text-slate-700">
            {item.contractKey}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.detail}</p>
        </div>
      ))}
    </div>
  );
}

function PartitionGrid({ stream }: { stream: ArtifactStream }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Rows3 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-slate-800">有限分区</h4>
        <span className="text-xs text-slate-500">
          {stream.final_partition_count} / {stream.expected_partition_count} 个分区已有最终交付
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {stream.partitions.map((partition) => (
          <article
            key={partition.partition_key}
            className={`rounded-xl border p-3 ${
              partition.has_final_delivery
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              {partition.has_final_delivery ? (
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-600" aria-hidden="true" />
              ) : (
                <CircleDashed className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-slate-800">
                {partition.partition_key}
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {partition.has_final_delivery ? '最终交付已到达' : '等待交付'}
              </span>
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-500">
              <dt>已接受交付</dt>
              <dd className="text-right font-semibold text-slate-700">
                {partition.accepted_delivery_count}
              </dd>
              <dt>最新序列</dt>
              <dd className="text-right font-mono text-slate-700">
                {partition.latest_sequence ?? '—'}
              </dd>
              <dt>最新类型</dt>
              <dd className="text-right text-slate-700">
                {partition.latest_delivery_kind === 'final'
                  ? '最终'
                  : partition.latest_delivery_kind === 'provisional'
                    ? '临时'
                    : '—'}
              </dd>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}

function DeliveryList({ deliveries }: { deliveries: readonly ArtifactDelivery[] }) {
  if (deliveries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm text-slate-500">
        当前没有持久化 ArtifactDelivery。
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {deliveries.map((delivery) => (
        <li key={delivery.artifact_delivery_id} className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <FileOutput className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="break-all text-sm font-semibold text-slate-800">{delivery.file_name}</span>
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  {deliveryKindLabel(delivery)}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {delivery.status}
                </span>
                {delivery.replay_run_id ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
                    Replay 复制
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                分区 <span className="font-mono text-slate-700">{delivery.partition_key}</span> · 序列{' '}
                <span className="font-mono text-slate-700">{delivery.sequence}</span> ·{' '}
                {formatBytes(delivery.byte_size)} · {delivery.media_type}
              </p>
              <p className="mt-1 break-all font-mono text-[10px] text-slate-400">
                SHA-256 {delivery.sha256}
              </p>
              {delivery.validation_summary ? (
                <p className="mt-1.5 text-xs text-slate-600">{delivery.validation_summary}</p>
              ) : null}
              {delivery.replay_run_id || delivery.source_delivery_id ? (
                <details className="mt-2 rounded-lg border border-violet-100 bg-violet-50/50 px-2.5">
                  <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-semibold text-violet-800">
                    查看 Delivery Replay 血缘
                  </summary>
                  <dl className="space-y-2 border-t border-violet-100 py-2 text-[10px] text-violet-800">
                    <div>
                      <dt className="font-semibold">ReplayRun</dt>
                      <dd className="break-all font-mono">{delivery.replay_run_id ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold">源 Delivery</dt>
                      <dd className="break-all font-mono">{delivery.source_delivery_id ?? '—'}</dd>
                    </div>
                  </dl>
                </details>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function DeliveryAttemptHistory({ attempts }: { attempts: readonly ArtifactDeliveryAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
        当前没有持久化 Delivery publication Attempt。
      </div>
    );
  }

  const newestFirst = [...attempts].sort((left, right) => {
    const time = Date.parse(right.created_at) - Date.parse(left.created_at);
    return time !== 0
      ? time
      : right.artifact_delivery_attempt_id.localeCompare(left.artifact_delivery_attempt_id);
  });

  return (
    <ol className="space-y-2">
      {newestFirst.map((attempt) => {
        const meta = DELIVERY_ATTEMPT_STATUS_META[attempt.status];
        return (
          <li
            key={attempt.artifact_delivery_attempt_id}
            className={`rounded-xl border p-3 ${
              attempt.status === 'rejected' || attempt.status === 'conflict'
                ? 'border-red-200 bg-red-50/70'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-semibold text-slate-800">
                {attempt.partition_key} · #{attempt.sequence}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                {meta.label}
              </span>
              <span className="ml-auto text-[10px] text-slate-400">{formatDateTime(attempt.created_at)}</span>
            </div>
            {attempt.failure_code ? (
              <p className="mt-2 break-all font-mono text-[11px] font-semibold text-red-800">
                {attempt.failure_code}
              </p>
            ) : null}
            {attempt.failure_summary ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{attempt.failure_summary}</p>
            ) : null}
            <details className="mt-2 rounded-lg border border-slate-200 bg-white/70 px-2.5">
              <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-semibold text-slate-600">
                查看 Attempt 标识与校验数据
              </summary>
              <dl className="grid gap-2 border-t border-slate-200 py-2 text-[10px] text-slate-500 sm:grid-cols-2">
                <div><dt>ArtifactDeliveryAttempt</dt><dd className="break-all font-mono text-slate-700">{attempt.artifact_delivery_attempt_id}</dd></div>
                <div><dt>ArtifactDelivery</dt><dd className="break-all font-mono text-slate-700">{attempt.artifact_delivery_id ?? '未创建'}</dd></div>
                <div><dt>Idempotency-Key</dt><dd className="break-all font-mono text-slate-700">{attempt.idempotency_key}</dd></div>
                <div><dt>类型 / 大小</dt><dd className="text-slate-700">{attempt.delivery_kind} · {formatBytes(attempt.byte_size)}</dd></div>
                <div className="sm:col-span-2"><dt>SHA-256</dt><dd className="break-all font-mono text-slate-700">{attempt.sha256}</dd></div>
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function FinalizationCard({ stream }: { stream: ArtifactStream }) {
  const finalization = stream.finalization;
  if (!finalization) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
        尚无 StreamFinalization；界面不会根据时间或交付顺序自行判断流已完成。
      </div>
    );
  }

  return (
    <article className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BadgeCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-emerald-950">不可变 Finalization Watermark</h4>
        <span className="rounded-full border border-emerald-200 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
          {finalization.status}
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-emerald-900/80">{finalization.summary}</p>
      <dl className="mt-3 grid gap-2">
        {Object.entries(finalization.partition_watermarks).map(([partitionKey, watermark]) => (
          <div key={partitionKey} className="rounded-lg border border-emerald-200/80 bg-white/70 p-2.5">
            <dt className="font-mono text-xs font-semibold text-emerald-950">{partitionKey}</dt>
            <dd className="mt-1 space-y-0.5 text-[11px] text-emerald-900/70">
              {Object.entries(watermark).map(([key, value]) => (
                <div key={key} className="flex min-w-0 gap-2">
                  <span className="flex-shrink-0">{key}</span>
                  <span className="min-w-0 break-all font-mono">{String(value)}</span>
                </div>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-emerald-900/70">
        {finalization.delivery_count} 个交付 · {formatDateTime(finalization.finalized_at)}
      </p>
    </article>
  );
}

function FinalizationAttemptHistory({
  attempts,
}: {
  attempts: readonly StreamFinalizationAttempt[];
}) {
  if (attempts.length === 0) return null;
  const ordered = [...attempts].sort(
    (left, right) => left.attempt_number - right.attempt_number,
  );

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <BadgeCheck className="h-4 w-4 text-violet-600" aria-hidden="true" />
        <h4 className="text-sm font-semibold text-slate-800">最终确认尝试记录</h4>
        <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
          不可变 · {ordered.length} 次
        </span>
      </div>
      <ol className="space-y-2">
        {ordered.map((attempt) => {
          const rejected = attempt.status === 'rejected';
          const verifiedCount = Object.keys(attempt.verified_partition_watermarks).length;
          return (
            <li
              key={attempt.stream_finalization_attempt_id}
              className={`rounded-xl border p-3 ${
                rejected
                  ? 'border-red-200 bg-red-50/80 text-red-950'
                  : 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {rejected ? (
                  <XCircle className="h-4 w-4 flex-shrink-0 text-red-600" aria-hidden="true" />
                ) : (
                  <CheckCircle2
                    className="h-4 w-4 flex-shrink-0 text-emerald-600"
                    aria-hidden="true"
                  />
                )}
                <span className="text-xs font-semibold">
                  第 {attempt.attempt_number} 次 · {rejected ? '已拒绝' : '已接受'}
                </span>
                <span className="ml-auto text-[10px] opacity-70">
                  {formatDateTime(attempt.completed_at)}
                </span>
              </div>

              {attempt.failure_code ? (
                <p className="mt-2 break-all font-mono text-[11px] font-semibold text-red-800">
                  {attempt.failure_code}
                </p>
              ) : null}
              <p className="mt-1 text-xs leading-relaxed opacity-80">
                {attempt.failure_summary ??
                  '所有声明分区已经通过最终确认校验，并写入权威 Finalization。'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                {attempt.failed_partition_key ? (
                  <span className="rounded-md border border-current/15 bg-white/50 px-2 py-1 font-mono">
                    失败分区 {attempt.failed_partition_key}
                  </span>
                ) : null}
                <span className="rounded-md border border-current/15 bg-white/50 px-2 py-1">
                  已观察 {attempt.observed_partition_count} / {attempt.expected_partition_count}
                </span>
                <span className="rounded-md border border-current/15 bg-white/50 px-2 py-1">
                  已验证水位线 {verifiedCount}
                </span>
              </div>

              <details className="mt-2 rounded-lg border border-current/10 bg-white/40 px-2.5">
                <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-semibold opacity-75">
                  查看尝试标识与已验证水位线
                </summary>
                <dl className="space-y-2 border-t border-current/10 py-2 text-[10px] opacity-75">
                  <div>
                    <dt>StreamFinalizationAttempt</dt>
                    <dd className="break-all font-mono">
                      {attempt.stream_finalization_attempt_id}
                    </dd>
                  </div>
                  {attempt.stream_finalization_id ? (
                    <div>
                      <dt>已接受 Finalization</dt>
                      <dd className="break-all font-mono">{attempt.stream_finalization_id}</dd>
                    </div>
                  ) : null}
                  {Object.entries(attempt.verified_partition_watermarks).map(
                    ([partitionKey, watermark]) => (
                      <div key={partitionKey}>
                        <dt className="font-mono font-semibold">{partitionKey}</dt>
                        <dd className="break-all font-mono">
                          {Object.entries(watermark)
                            .map(([key, value]) => `${key}=${String(value)}`)
                            .join(' · ')}
                        </dd>
                      </div>
                    ),
                  )}
                </dl>
              </details>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StreamDetail({ stream }: { stream: ArtifactStream }) {
  const scenario = scenarioState(stream);
  const scenarioMeta = SCENARIO_META[scenario];
  const statusMeta = STATUS_META[stream.status];
  const progress =
    stream.expected_partition_count > 0
      ? Math.min(100, (stream.final_partition_count / stream.expected_partition_count) * 100)
      : 0;

  return (
    <article className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
              {statusMeta.label}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${scenarioMeta.className}`}>
              验收态：{scenarioMeta.label}
            </span>
          </div>
          <h3 className="mt-3 break-all font-mono text-sm font-semibold text-slate-900">
            {stream.contract_key}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{scenarioMeta.description}</p>
          {stream.failure_summary ? (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm leading-relaxed text-red-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{stream.failure_summary}</span>
            </div>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs lg:w-80">
          <div><dt className="text-slate-500">交付</dt><dd className="mt-0.5 text-lg font-semibold text-slate-900">{stream.delivery_count}</dd></div>
          <div><dt className="text-slate-500">最终分区</dt><dd className="mt-0.5 text-lg font-semibold text-slate-900">{stream.final_partition_count}/{stream.expected_partition_count}</dd></div>
          <div><dt className="text-slate-500">媒体类型</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{stream.media_type}</dd></div>
          <div><dt className="text-slate-500">分区字段</dt><dd className="mt-0.5 break-all font-mono text-slate-700">{stream.partition_key_name}</dd></div>
        </dl>
      </div>

      <div aria-label="最终分区进度" className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-[width]" style={{ width: `${progress}%` }} />
      </div>

      <PartitionGrid stream={stream} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div>
          <div className="mb-2 flex items-center gap-2"><FileOutput className="h-4 w-4 text-emerald-600" aria-hidden="true" /><h4 className="text-sm font-semibold text-slate-800">不可变交付</h4></div>
          <DeliveryList deliveries={stream.deliveries} />
          <div className="mb-2 mt-5 flex items-center gap-2">
            <Rows3 className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <h4 className="text-sm font-semibold text-slate-800">Delivery publication Attempt</h4>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
              不可变 · {stream.delivery_attempts.length} 次
            </span>
          </div>
          <DeliveryAttemptHistory attempts={stream.delivery_attempts} />
        </div>
        <div className="space-y-4">
          <FinalizationAttemptHistory attempts={stream.finalization_attempts} />
          <div>
            <div className="mb-2 flex items-center gap-2"><Workflow className="h-4 w-4 text-indigo-600" aria-hidden="true" /><h4 className="text-sm font-semibold text-slate-800">消费订阅</h4></div>
            {stream.subscriptions.length > 0 ? (
              <ul className="space-y-2">
                {stream.subscriptions.map((subscription) => (
                  <li key={subscription.stream_subscription_id} className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold text-indigo-950">{subscription.contract_key}</span><span className="rounded-full bg-white px-2 py-0.5 font-semibold text-indigo-800">{subscription.trigger_policy}</span></div>
                    <p className="mt-1.5 text-indigo-900/70">
                      {subscription.delivery_kind} · 最大并发 {subscription.max_concurrent_executions} · {subscription.status}
                    </p>
                    <p className="mt-1 text-indigo-900/70">
                      最大 Retry {subscription.max_retry_count} 次 · 最长 {subscription.max_execution_seconds} 秒 · Token 上限 {subscription.max_tokens_per_execution ?? '未单独限制'}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">没有持久化订阅。</p>
            )}
          </div>
          <FinalizationCard stream={stream} />
        </div>
      </div>
    </article>
  );
}

function ExecutionAttemptHistory({ attempts }: { attempts: readonly PlanStepExecutionAttempt[] }) {
  if (attempts.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
        该 keyed execution 尚未创建 Runtime Attempt；会在并发槽位与岗位租约可用后自动准入，刷新页面不会自行创建执行记录。
      </p>
    );
  }

  const ordered = [...attempts].sort(
    (left, right) => left.attempt_number - right.attempt_number,
  );
  return (
    <ol className="space-y-2">
      {ordered.map((attempt) => {
        const meta = EXECUTION_ATTEMPT_STATUS_META[attempt.status];
        return (
          <li
            key={attempt.plan_step_execution_attempt_id}
            className={`rounded-xl border p-3 ${
              attempt.status === 'failed' || attempt.status === 'exhausted'
                ? 'border-red-200 bg-red-50/70'
                : 'border-slate-200 bg-slate-50/70'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800">第 {attempt.attempt_number} 次</span>
              <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 font-mono text-[10px] text-violet-800">
                {attempt.trigger}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${meta.className}`}>
                {meta.label}
              </span>
              <span className="ml-auto text-[10px] text-slate-400">{formatDateTime(attempt.created_at)}</span>
            </div>
            {attempt.failure_code ? (
              <p className="mt-2 break-all font-mono text-[11px] font-semibold text-red-800">
                {attempt.failure_code}
              </p>
            ) : null}
            {attempt.failure_summary ? (
              <p className="mt-1 text-xs leading-relaxed text-slate-700">{attempt.failure_summary}</p>
            ) : null}
            <dl className="mt-2 grid grid-cols-2 gap-2 text-[10px] sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><dt className="text-slate-400">用量状态</dt><dd className="mt-0.5 font-semibold text-slate-700">{attempt.usage_status}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><dt className="text-slate-400">计费 Token</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-700">{attempt.charged_tokens}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><dt className="text-slate-400">预留 Token</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-700">{attempt.reserved_tokens}</dd></div>
              <div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5"><dt className="text-slate-400">观测总量</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-700">{attempt.total_tokens ?? '—'}</dd></div>
            </dl>
            <details className="mt-2 rounded-lg border border-slate-200 bg-white/70 px-2.5">
              <summary className="flex min-h-11 cursor-pointer items-center text-[11px] font-semibold text-slate-600">
                查看 Attempt、Assignment 与时间点
              </summary>
              <dl className="grid gap-2 border-t border-slate-200 py-2 text-[10px] text-slate-500 sm:grid-cols-2">
                <div><dt>PlanStepExecutionAttempt</dt><dd className="break-all font-mono text-slate-700">{attempt.plan_step_execution_attempt_id}</dd></div>
                <div><dt>Assignment</dt><dd className="break-all font-mono text-slate-700">{attempt.assignment_id}</dd></div>
                <div><dt>RuntimeExecution</dt><dd className="break-all font-mono text-slate-700">{attempt.runtime_execution_id}</dd></div>
                <div><dt>Runtime event</dt><dd className="break-all font-mono text-slate-700">{attempt.runtime_event_id ?? '—'}</dd></div>
                <div><dt>开始</dt><dd className="text-slate-700">{formatDateTime(attempt.started_at)}</dd></div>
                <div><dt>完成</dt><dd className="text-slate-700">{formatDateTime(attempt.completed_at)}</dd></div>
              </dl>
            </details>
          </li>
        );
      })}
    </ol>
  );
}

function PartitionExecutionActions({
  taskId,
  execution,
  onRefresh,
  onReconnect,
}: {
  taskId: string;
  execution: PlanStepExecution;
  onRefresh: () => Promise<void>;
  onReconnect?: () => void;
}) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'retry' | 'cancel' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const retryKey = useRef(crypto.randomUUID());
  const retryExhausted = execution.retry_count >= execution.max_retry_count;
  const canRetry =
    (execution.status === 'failed' || execution.status === 'cancelled') && !retryExhausted;
  const canCancel = ['ready', 'submitted', 'running', 'waiting'].includes(execution.status);

  if (!canRetry && !canCancel && !retryExhausted) return null;

  const submit = async (action: 'retry' | 'cancel') => {
    const normalized = reason.trim();
    if (!normalized || pending) return;
    setPending(action);
    setError(null);
    try {
      if (action === 'retry') {
        await retryTaskStreamExecution(
          taskId,
          execution.plan_step_execution_id,
          { reason: normalized },
          retryKey.current,
        );
        retryKey.current = crypto.randomUUID();
      } else {
        await cancelTaskStreamExecution(taskId, execution.plan_step_execution_id, {
          reason: normalized,
        });
      }
      onReconnect?.();
      setReason('');
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      await onRefresh().catch(() => undefined);
      setPending(null);
    }
  };

  return (
    <div className={`mt-4 rounded-xl border p-3 ${retryExhausted ? 'border-rose-200 bg-rose-50/70' : 'border-amber-200 bg-amber-50/50'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h5 className="text-sm font-semibold text-slate-800">分区控制</h5>
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
          Retry {execution.retry_count} / {execution.max_retry_count}
        </span>
      </div>
      {retryExhausted ? (
        <p className="mt-2 text-xs leading-relaxed text-rose-800">
          技术 Retry 已达到持久化上限；不会自动转成业务 Replay，也不会增加 Task.replay_count。
        </p>
      ) : null}
      {canRetry || canCancel ? (
        <>
          <label className="mt-3 block text-xs font-semibold text-slate-700">
            操作原因 <span className="text-red-500">*</span>
            <textarea
              id={`stream-execution-reason-${execution.plan_step_execution_id}`}
              name={`stream-execution-reason-${execution.plan_step_execution_id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              maxLength={10_000}
              placeholder="说明为什么只重试或取消这个分区。"
              disabled={pending !== null}
              className="mt-1.5 min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60"
            />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canRetry ? (
              <button
                type="button"
                onClick={() => void submit('retry')}
                disabled={pending !== null || reason.trim().length === 0}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {pending === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
                重试此分区
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                onClick={() => void submit('cancel')}
                disabled={pending !== null || reason.trim().length === 0}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {pending === 'cancel' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Ban className="h-4 w-4" aria-hidden="true" />}
                取消此分区
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {error ? <div className="mt-3"><InlineError error={error} /></div> : null}
    </div>
  );
}

function KeyedExecutionCard({
  execution,
  task,
  streams,
  onRefresh,
  onReconnect,
}: {
  execution: PlanStepExecution;
  task: Task;
  streams: readonly ArtifactStream[];
  onRefresh: () => Promise<void>;
  onReconnect?: () => void;
}) {
  const statusMeta = EXECUTION_STATUS_META[execution.status];
  const isAllExecution = execution.trigger_policy === 'all';
  const displayStatus = isAllExecution && execution.status === 'completed' ? '汇合完成' : statusMeta.label;
  const step = task.execution_plan?.steps.find(
    (candidate) => candidate.plan_step_id === execution.plan_step_id,
  );
  const assignment = task.assignments.find(
    (candidate) => candidate.plan_step_execution_id === execution.plan_step_execution_id,
  );

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            {isAllExecution ? (
              <GitMerge className="h-5 w-5" aria-hidden="true" />
            ) : execution.status === 'waiting' ? (
              <PauseCircle className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Cpu className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-mono text-sm font-semibold text-slate-900">
                {isAllExecution ? '最终水位线汇合' : `分区 ${execution.partition_key ?? '—'}`}
              </h4>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusMeta.className}`}>
                {displayStatus}
              </span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {step?.step_key ?? '冻结计划步骤'} · {isAllExecution ? '所有最终分区一次汇合' : '每个分区独立执行'}
            </p>
          </div>
        </div>
        <div className={`rounded-xl border px-3 py-2 text-xs ${assignment ? 'border-indigo-200 bg-indigo-50 text-indigo-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
          <p className="font-semibold">{assignment ? 'Assignment 已创建' : 'Assignment 尚未创建'}</p>
          <p className="mt-0.5">
            {assignment
              ? `${assignment.assignment_kind} · ${assignment.activity_phase}`
              : execution.status === 'ready'
                ? '保持 ready，等待并发槽位或调度'
                : '以 keyed execution 记录为准'}
          </p>
        </div>
      </div>

      {execution.failure_summary ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {execution.failure_summary}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Rows3 className="h-4 w-4 text-violet-600" aria-hidden="true" />
          <h5 className="text-sm font-semibold text-slate-800">不可变执行尝试</h5>
          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-800">
            {execution.attempts.length} 次 · Retry {execution.retry_count}/{execution.max_retry_count}
          </span>
        </div>
        <ExecutionAttemptHistory attempts={execution.attempts} />
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h5 className="text-sm font-semibold text-slate-800">精确 Delivery 输入绑定</h5>
        </div>
        {execution.input_bindings.length > 0 ? (
          <ul className="space-y-2">
            {execution.input_bindings.map((binding) => {
              const delivery = streams
                .flatMap((stream) => stream.deliveries)
                .find((candidate) => candidate.artifact_delivery_id === binding.artifact_delivery_id);
              const checksumMatches = delivery?.sha256 === binding.delivery_sha256;
              return (
                <li
                  key={binding.delivery_input_binding_id}
                  className="rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-slate-800">
                      {delivery?.file_name ?? (isAllExecution ? '最终水位线成员交付' : `分区 ${execution.partition_key ?? '—'} 的交付`)}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 font-semibold ${
                      binding.status === 'materialized'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : binding.status === 'revoked'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-blue-200 bg-blue-50 text-blue-800'
                    }`}>
                      {binding.status === 'materialized' ? '已物化并校验' : binding.status === 'declared' ? '已声明' : '已撤销'}
                    </span>
                    {delivery ? (
                      <span className={`font-semibold ${checksumMatches ? 'text-emerald-700' : 'text-red-700'}`}>
                        {checksumMatches ? 'SHA-256 一致' : 'SHA-256 不一致'}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 break-all font-mono text-[10px] leading-relaxed text-slate-500">
                    SHA-256 {binding.delivery_sha256}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {binding.materialized_at
                      ? `物化完成于 ${formatDateTime(binding.materialized_at)}`
                      : '尚未物化；页面不会显示宿主工作区或存储路径。'}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
            当前 execution 尚无输入绑定。
          </p>
        )}
      </div>

      <PartitionExecutionActions
        taskId={task.task_id}
        execution={execution}
        onRefresh={onRefresh}
        onReconnect={onReconnect}
      />

      <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50/70 px-3">
        <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-slate-600">
          查看技术验收标识与时间点
        </summary>
        <dl className="grid gap-2 border-t border-slate-200 py-3 text-[11px] text-slate-500 sm:grid-cols-2">
          <div><dt>PlanStepExecution</dt><dd className="break-all font-mono text-slate-700">{execution.plan_step_execution_id}</dd></div>
          <div><dt>触发策略</dt><dd className="font-mono text-slate-700">{execution.trigger_policy}</dd></div>
          {execution.trigger_delivery_id ? <div><dt>触发 Delivery</dt><dd className="break-all font-mono text-slate-700">{execution.trigger_delivery_id}</dd></div> : null}
          {execution.trigger_finalization_id ? <div><dt>触发 Finalization</dt><dd className="break-all font-mono text-slate-700">{execution.trigger_finalization_id}</dd></div> : null}
          <div><dt>Execution key</dt><dd className="break-all font-mono text-slate-700">{execution.execution_key}</dd></div>
          <div><dt>Assignment</dt><dd className="break-all font-mono text-slate-700">{execution.assignment_id ?? '未创建'}</dd></div>
          <div><dt>就绪时间</dt><dd className="text-slate-700">{execution.ready_at ? formatDateTime(execution.ready_at) : '—'}</dd></div>
          <div><dt>开始时间</dt><dd className="text-slate-700">{execution.started_at ? formatDateTime(execution.started_at) : '—'}</dd></div>
          <div><dt>完成时间</dt><dd className="text-slate-700">{execution.completed_at ? formatDateTime(execution.completed_at) : '—'}</dd></div>
        </dl>
      </details>
    </article>
  );
}

function IncrementalExecutionPanel({
  task,
  streams,
  executions,
  onRefresh,
  onReconnect,
}: {
  task: Task;
  streams: readonly ArtifactStream[];
  executions: readonly PlanStepExecution[];
  onRefresh: () => Promise<void>;
  onReconnect?: () => void;
}) {
  const subscriptions = streams.flatMap((stream) => stream.subscriptions);
  const eachExecutions = executions.filter((execution) => execution.trigger_policy === 'each');
  const allExecutions = executions.filter((execution) => execution.trigger_policy === 'all');
  const activeCount = executions.filter((execution) => ACTIVE_EXECUTION_STATUSES.has(execution.status)).length;
  const readyWithoutAssignment = executions.filter(
    (execution) => execution.status === 'ready' && !execution.assignment_id,
  ).length;
  const saturatedSubscriptions = subscriptions.filter((subscription) => {
    const matching = executions.filter(
      (execution) => execution.stream_subscription_id === subscription.stream_subscription_id,
    );
    const active = matching.filter((execution) => ACTIVE_EXECUTION_STATUSES.has(execution.status)).length;
    const heldReady = matching.some(
      (execution) => execution.status === 'ready' && !execution.assignment_id,
    );
    return active >= subscription.max_concurrent_executions && heldReady;
  });

  const leadSteps = task.execution_plan?.steps.filter((step) => step.step_kind === 'lead_review') ?? [];
  const leadAssignmentExists = task.assignments.some((assignment) =>
    leadSteps.some((step) => step.plan_step_id === assignment.plan_step_id),
  );
  const leadReviewCompleted = task.assignments.some(
    (assignment) =>
      leadSteps.some((step) => step.plan_step_id === assignment.plan_step_id) &&
      assignment.status === 'completed',
  );
  const finalizedStream = streams.find((stream) => stream.finalization);
  const allExecution = allExecutions[0];
  const allBindingsMaterialized = Boolean(
    allExecution &&
      allExecution.input_bindings.length > 0 &&
      allExecution.input_bindings.every((binding) => binding.status === 'materialized'),
  );
  const aggregateStep = allExecution
    ? task.execution_plan?.steps.find((step) => step.plan_step_id === allExecution.plan_step_id)
    : undefined;
  const aggregateContractKeys = new Set(
    (aggregateStep?.output_contracts ?? [])
      .map((contract) => contract.contract_key)
      .filter((contractKey): contractKey is string => typeof contractKey === 'string'),
  );
  const aggregateArtifact = task.artifacts.find(
    (artifact) => aggregateContractKeys.has(artifact.contract_key) && artifact.status === 'released',
  );
  const incrementalCompleted = Boolean(
    allExecution?.status === 'completed' && aggregateArtifact && task.status === 'completed' && leadReviewCompleted,
  );
  const finalizationAttempts = streams
    .flatMap((stream) => stream.finalization_attempts)
    .sort((left, right) => {
      const timeDelta = Date.parse(left.completed_at) - Date.parse(right.completed_at);
      return timeDelta !== 0 ? timeDelta : left.attempt_number - right.attempt_number;
    });
  const latestFinalizationAttempt = finalizationAttempts[finalizationAttempts.length - 1];
  const rejectedAttempt =
    latestFinalizationAttempt?.status === 'rejected' ? latestFinalizationAttempt : undefined;
  const deliveryAttemptCount = streams.reduce((sum, stream) => sum + stream.delivery_attempts.length, 0);
  const executionAttemptCount = executions.reduce((sum, execution) => sum + execution.attempts.length, 0);

  return (
    <section className="space-y-3 rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50/80 via-white to-cyan-50/60 p-4 sm:p-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Cpu className="h-5 w-5 text-blue-700" aria-hidden="true" />
          <h3 className="text-base font-semibold text-slate-900">增量执行与水位线收敛</h3>
           <span className="rounded-full border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-800">
               自动调度 · recovery + lineage
          </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Delivery 提交后会自动唤醒已就绪的 each；all 只有在接受 final watermark 后才一次绑定全部分区。每次下游执行都先经过岗位队列准入，事件只负责通知刷新，状态、Assignment、绑定和聚合 Artifact 均读取持久化 API。
          </p>
        </div>
        <dl className="grid grid-cols-4 gap-2 text-center text-xs lg:w-[440px]">
          <div className="rounded-xl border border-blue-200 bg-white px-2 py-3"><dt className="text-slate-500">each 分区</dt><dd className="mt-1 text-lg font-bold text-slate-900">{eachExecutions.length}</dd></div>
          <div className="rounded-xl border border-teal-200 bg-white px-2 py-3"><dt className="text-slate-500">all 汇合</dt><dd className="mt-1 text-lg font-bold text-teal-800">{allExecutions.length}</dd></div>
          <div className="rounded-xl border border-cyan-200 bg-white px-2 py-3"><dt className="text-slate-500">占用并发</dt><dd className="mt-1 text-lg font-bold text-cyan-800">{activeCount}</dd></div>
          <div className="rounded-xl border border-amber-200 bg-white px-2 py-3"><dt className="text-slate-500">就绪未分配</dt><dd className="mt-1 text-lg font-bold text-amber-800">{readyWithoutAssignment}</dd></div>
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">Delivery Attempts {deliveryAttemptCount}</span>
        <span className="rounded-full border border-violet-200 bg-white px-2.5 py-1 text-violet-800">Execution Attempts {executionAttemptCount}</span>
        <span className="rounded-full border border-indigo-200 bg-white px-2.5 py-1 text-indigo-800">重试只影响失败分区</span>
      </div>

      <div className="grid gap-2 lg:grid-cols-2">
        {subscriptions.map((subscription: StreamSubscription) => {
          const matching = executions.filter(
            (execution) => execution.stream_subscription_id === subscription.stream_subscription_id,
          );
          const active = matching.filter((execution) => ACTIVE_EXECUTION_STATUSES.has(execution.status)).length;
          const heldReady = matching.filter(
            (execution) => execution.status === 'ready' && !execution.assignment_id,
          );
          const saturated = active >= subscription.max_concurrent_executions && heldReady.length > 0;
          return (
            <div key={subscription.stream_subscription_id} className={`rounded-xl border p-3 ${saturated ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-slate-800">{subscription.contract_key}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${saturated ? 'bg-amber-200 text-amber-900' : 'bg-blue-100 text-blue-800'}`}>
                  {saturated ? '背压生效' : subscription.trigger_policy === 'all' ? '水位线门控' : '并发可用'}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-600">
                当前占用 {active} / {subscription.max_concurrent_executions}
                {heldReady.length > 0
                  ? ` · ${heldReady.map((execution) => execution.partition_key ?? 'all 汇合').join('、')} 保持 ready 且无 Assignment`
                  : ''}
              </p>
            </div>
          );
        })}
      </div>

      {saturatedSubscriptions.length > 0 ? (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm leading-relaxed text-amber-900">
          <PauseCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          <span>并发上限已占满，额外分区保持 ready 且不创建 Assignment；这正是后端持久化的背压边界。</span>
        </div>
      ) : null}

      {executions.length > 0 ? (
        <div className={`grid gap-3 ${executions.length > 1 ? 'xl:grid-cols-2' : ''}`}>
          {executions.map((execution) => (
            <KeyedExecutionCard
              key={execution.plan_step_execution_id}
              execution={execution}
              task={task}
              streams={streams}
              onRefresh={onRefresh}
              onReconnect={onReconnect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm text-slate-500">
          尚无持久化 PlanStepExecution。未交付的分区不会被前端猜测成执行节点。
        </div>
      )}

      <div className={`flex items-start gap-2 rounded-xl border px-3 py-3 text-xs leading-relaxed ${incrementalCompleted ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : rejectedAttempt ? 'border-red-200 bg-red-50 text-red-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {incrementalCompleted ? <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> : rejectedAttempt ? <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" /> : <Clock3 className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />}
        <span>
          {incrementalCompleted
            ? '增量执行已完成：final watermark 汇合全部分区，aggregate Artifact 已发布，负责人审核随后完成，Task 已进入终态。'
            : rejectedAttempt
              ? `完整性校验：第 ${rejectedAttempt.attempt_number} 次 finalization 已被后端拒绝（${rejectedAttempt.failure_code ?? 'FINALIZATION_REJECTED'}）${rejectedAttempt.failed_partition_key ? `，失败分区 ${rejectedAttempt.failed_partition_key}` : ''}。Stream 保持 open，不会伪造 Finalization 或 all execution。`
              : allExecution
                ? `自动收敛进行中：final watermark 已接受，all execution 为 ${allExecution.status}，${allBindingsMaterialized ? '全部输入绑定已物化' : '输入绑定尚未全部物化'}；${leadAssignmentExists ? '负责人审核已创建。' : finalizedStream ? '等待 aggregate 与负责人审核。' : ''}`
                : '等待最终水位线：partial 交付不会创建 all execution，必须先有持久化 final watermark；Task 不会因普通交付顺序自行完成。'}
        </span>
      </div>
    </section>
  );
}

export default function TaskArtifactStreamsPanel({
   task,
   revisionKey,
   onTaskRefresh,
   onReconnect,
}: {
  task: Task;
  revisionKey?: string | null;
  onTaskRefresh?: () => Promise<void>;
  onReconnect?: () => void;
}) {
  const live = useLiveTaskStreams(task.task_id, revisionKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const plan = task.execution_plan;
  const hasDeclaredContracts = Boolean(
    plan?.steps.some(
      (step) => step.stream_output_contracts.length > 0 || step.stream_input_contracts.length > 0,
    ),
  );

  useEffect(() => {
    if (live.streams.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !live.streams.some((stream) => stream.artifact_stream_id === selectedId)) {
      const streamWithCurrentRejection = live.streams.find((stream) => {
        const orderedAttempts = [...stream.finalization_attempts].sort(
          (left, right) => left.attempt_number - right.attempt_number,
        );
        return orderedAttempts[orderedAttempts.length - 1]?.status === 'rejected';
      });
      setSelectedId((streamWithCurrentRejection ?? live.streams[0]).artifact_stream_id);
    }
  }, [live.streams, selectedId]);

  if (!hasDeclaredContracts && live.status === 'ready' && live.streams.length === 0) return null;
  if (!hasDeclaredContracts && live.status === 'loading') return null;

  const selected =
    live.streams.find((stream) => stream.artifact_stream_id === selectedId) ?? live.streams[0];

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Radio className="h-5 w-5 text-cyan-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">增量 Artifact 流</h2>
        <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-semibold text-cyan-800">
           D1-E · automatic each + all
        </span>
        {live.refreshing ? (
          <span role="status" className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            静默刷新持久化投影
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => void live.refresh().catch(() => undefined)}
          disabled={live.refreshing}
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${live.refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
          刷新流状态
        </button>
      </div>

      <div className="space-y-3">
        {plan ? <StreamContractSummary steps={plan.steps} /> : null}

        {live.status === 'loading' ? (
          <div role="status" className="flex min-h-44 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-600" aria-hidden="true" />
            正在读取流列表与详情投影…
          </div>
        ) : null}

        {live.status === 'error' ? (
          <ErrorState error={live.error} title="加载增量 Artifact 流失败" onRetry={live.retry} />
        ) : null}

        {live.status === 'ready' && live.error ? (
          <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span>后台刷新失败，当前仍显示上一次成功读取的持久化投影：{live.error.message}</span>
          </div>
        ) : null}

        {live.status === 'ready' && live.streams.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center">
            <Boxes className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
            <p className="mt-3 font-semibold text-slate-700">当前 Task 没有持久化 ArtifactStream</p>
            <p className="mt-1 text-sm text-slate-500">页面不会从普通 Artifact 或步骤顺序推断增量流。</p>
          </div>
        ) : null}

        {live.streams.length > 1 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {live.streams.map((stream) => (
              <button
                key={stream.artifact_stream_id}
                type="button"
                onClick={() => setSelectedId(stream.artifact_stream_id)}
                className={`min-h-11 flex-shrink-0 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/15 ${
                  selected?.artifact_stream_id === stream.artifact_stream_id
                    ? 'border-cyan-300 bg-cyan-50 text-cyan-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {stream.contract_key} · {STATUS_META[stream.status].label}
              </button>
            ))}
          </div>
        ) : null}

        {selected ? <StreamDetail stream={selected} /> : null}

        <IncrementalExecutionPanel
          task={task}
          streams={live.streams}
          executions={live.executions}
          onRefresh={async () => {
            await Promise.all([live.refresh(), onTaskRefresh?.()]);
          }}
          onReconnect={onReconnect}
        />

        <div className="flex items-start gap-2 rounded-xl border border-indigo-200 bg-indigo-50/70 px-4 py-3 text-xs leading-relaxed text-indigo-900">
          {selected?.status === 'failed' ? (
            <XCircle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          ) : (
            <Workflow className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
          )}
          <span>
            有限增量执行已经启用：Producer 只能使用当前 Assignment 绑定的 Delivery 与 finalization 工具；提交后由持久化状态自动唤醒 each/all，并经过岗位队列准入。Retry、取消与 from_step Replay 继续保留不可变血缘；any、quorum 与 window 仍不支持。
          </span>
        </div>
      </div>
    </section>
  );
}
