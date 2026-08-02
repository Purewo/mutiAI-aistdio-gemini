import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  FileCheck2,
  Inbox,
  Layers3,
  PackageCheck,
  Radio,
  Route,
  RotateCcw,
  Send,
  ShieldAlert,
  UserRoundCheck,
} from 'lucide-react';
import {
  reportCoordinationWorkItem,
  transitionCoordinationCase,
  transitionCoordinationWorkItem,
} from '../api/endpoints';
import { ApiError } from '../api/errors';
import type {
  CoordinationWorkItemReportRequest,
  CoordinationWorkItemStatus,
} from '../api/types';
import ArtifactList from '../components/ArtifactList';
import PageHeader from '../components/PageHeader';
import {
  ErrorState,
  InlineError,
  LoadingState,
  ReconnectBanner,
} from '../components/states';
import {
  CASE_STATUS,
  RETRY_STATUS,
  RETRY_TRIGGER_LABEL,
  ROUTING_ACTION_LABEL,
  ROUTING_CONFIDENCE_LABEL,
  ROUTING_SOURCE_LABEL,
  ROUTING_STATUS,
  ROUTING_TIER_LABEL,
  SIGNAL_CLASS_LABEL,
  WORK_ITEM_STATUS,
  WORK_ITEM_TRANSITIONS,
  eventDescription,
  eventLabel,
  failureCodeLabel,
  formatCoordinationTime,
  isTerminalCase,
  roleName,
} from '../coordination/presentation';
import { contentEvidenceRef } from '../coordination/evidence';
import { useLiveCoordinationCase } from '../coordination/useLiveCoordinationCase';

const ACTION_LABELS: Record<string, string> = {
  retry: '技术重试',
  replay: '业务重放',
  assign: '分派',
  reroute: '重新路由',
  wait: '等待',
  escalate: '升级',
  human_required: '转人工',
  resolve: '解决',
  abort: '终止',
};

export default function CoordinationCaseDetail() {
  const { caseId = '' } = useParams();
  const live = useLiveCoordinationCase(caseId);
  const [workItemTarget, setWorkItemTarget] = useState<CoordinationWorkItemStatus | ''>('');
  const [reason, setReason] = useState('');
  const [reportOutcome, setReportOutcome] =
    useState<CoordinationWorkItemReportRequest['outcome']>('completed');
  const [reportSummary, setReportSummary] = useState('');
  const [reportEvidence, setReportEvidence] = useState('');
  const [submitting, setSubmitting] =
    useState<'work-item' | 'report' | 'resolved' | 'abandoned' | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const reportIdempotency = useRef<{ signature: string; key: string } | null>(null);

  const caseRecord = live.caseRecord;
  const currentWorkItem = caseRecord?.work_items[caseRecord.work_items.length - 1] ?? null;
  const reportableWorkItem = caseRecord
    ? [...caseRecord.work_items]
        .reverse()
        .find((item) => !['completed', 'failed', 'cancelled'].includes(item.status)) ?? null
    : null;
  const responsibleWorkItem = reportableWorkItem ?? currentWorkItem;
  const caseIsTerminal = caseRecord ? isTerminalCase(caseRecord.status) : false;
  const latestRetry = caseRecord?.retry_attempts[caseRecord.retry_attempts.length - 1] ?? null;
  const latestRoutingRun = caseRecord?.routing_runs[caseRecord.routing_runs.length - 1] ?? null;
  const semanticCase = (caseRecord?.routing_runs.length ?? 0) > 0;
  const relatedTask = live.relatedTask;
  const affectedArtifacts = useMemo(() => {
    if (!caseRecord || !relatedTask) return [];
    const evidenceArtifactIds = new Set(
      caseRecord.signals
        .map((signal) => signal.artifact_id)
        .filter((artifactId): artifactId is string => artifactId !== null),
    );
    const failedPlanStepIds = new Set(
      caseRecord.signals
        .map((signal) => signal.plan_step_id)
        .filter((planStepId): planStepId is string => planStepId !== null),
    );
    const affectedContracts = new Set(
      relatedTask.execution_plan?.steps
        .filter((step) => failedPlanStepIds.has(step.plan_step_id))
        .flatMap((step) => step.output_contracts.map((contract) => contract.contract_key)) ?? [],
    );
    for (const artifact of relatedTask.artifacts) {
      if (evidenceArtifactIds.has(artifact.artifact_id)) affectedContracts.add(artifact.contract_key);
    }
    return relatedTask.artifacts.filter(
      (artifact) => evidenceArtifactIds.has(artifact.artifact_id) || affectedContracts.has(artifact.contract_key),
    );
  }, [caseRecord, relatedTask]);
  const affectedContractKeys = useMemo(
    () => new Set(affectedArtifacts.map((artifact) => artifact.contract_key)),
    [affectedArtifacts],
  );
  const preservedSiblingCount = relatedTask
    ? relatedTask.artifacts.filter(
        (artifact) => artifact.status === 'released' && !affectedContractKeys.has(artifact.contract_key),
      ).length
    : 0;
  const transitionOptions = useMemo(
    () => (currentWorkItem && !caseIsTerminal ? WORK_ITEM_TRANSITIONS[currentWorkItem.status] : []),
    [caseIsTerminal, currentWorkItem],
  );

  useEffect(() => {
    setWorkItemTarget(transitionOptions[0] ?? '');
  }, [currentWorkItem?.status, transitionOptions]);

  const handleWorkItemTransition = async () => {
    if (!currentWorkItem || !workItemTarget) return;
    setSubmitting('work-item');
    setActionError(null);
    try {
      await transitionCoordinationWorkItem(
        currentWorkItem.work_item_id,
        { status: workItemTarget, reason: reason.trim() },
        `coordination-work-item:${currentWorkItem.work_item_id}:${currentWorkItem.status}:${workItemTarget}`,
      );
      await live.refresh();
      live.reconnect();
      setReason('');
    } catch (error) {
      setActionError(error);
    } finally {
      setSubmitting(null);
    }
  };

  const handleWorkItemReport = async () => {
    if (!reportableWorkItem || !reportSummary.trim()) return;
    if (reportOutcome !== 'waiting' && !reportEvidence.trim()) return;
    setSubmitting('report');
    setActionError(null);
    try {
      const evidenceRefs = reportEvidence.trim()
        ? [
            await contentEvidenceRef(
              'work_item_report',
              `${roleName(live.organizationVersion, reportableWorkItem.target_role_key)}提交的岗位报告`,
              reportEvidence.trim(),
            ),
          ]
        : [];
      const body: CoordinationWorkItemReportRequest = {
        reporting_role_key: reportableWorkItem.target_role_key,
        outcome: reportOutcome,
        summary: reportSummary.trim(),
        evidence_refs: evidenceRefs,
      };
      const signature = JSON.stringify(body);
      if (reportIdempotency.current?.signature !== signature) {
        reportIdempotency.current = {
          signature,
          key: `coordination-report-${window.crypto.randomUUID()}`,
        };
      }
      const result = await reportCoordinationWorkItem(
        reportableWorkItem.work_item_id,
        body,
        reportIdempotency.current.key,
      );
      reportIdempotency.current = null;
      live.setCase(result.case);
      live.reconnect();
      setReportSummary('');
      setReportEvidence('');
    } catch (error) {
      setActionError(error);
    } finally {
      setSubmitting(null);
    }
  };

  const handleCaseTerminal = async (status: 'resolved' | 'abandoned') => {
    if (!caseRecord) return;
    setSubmitting(status);
    setActionError(null);
    try {
      const updated = await transitionCoordinationCase(
        caseRecord.case_id,
        { status, reason: reason.trim() },
        `coordination-case:${caseRecord.case_id}:${caseRecord.status}:${status}`,
      );
      live.setCase(updated);
      setReason('');
    } catch (error) {
      setActionError(error);
    } finally {
      setSubmitting(null);
    }
  };

  if (live.status === 'loading') {
    return <LoadingState label="正在读取协调事项、处理记录与事件时间线..." />;
  }

  if (live.status === 'error') {
    if (live.error instanceof ApiError && (live.error.isForbidden || live.error.isNotFound)) {
      return <PermissionState />;
    }
    return (
      <div className="h-full overflow-y-auto p-4 sm:p-8">
        <ErrorState error={live.error} onRetry={live.retry} />
      </div>
    );
  }

  if (!caseRecord || !live.organization) return null;
  const status = CASE_STATUS[caseRecord.status];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--nexwork-page)]">
      <PageHeader
        title="协调事项"
        description={`${live.organization.name} · 持久化反馈与岗位处理记录`}
        actions={
          <Link
            to="/coordination"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回协作中心
          </Link>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <section className="relative overflow-hidden rounded-[28px] bg-slate-950 px-5 py-6 text-white shadow-2xl shadow-slate-900/10 sm:px-8 sm:py-8">
            <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full border-[42px] border-indigo-400/10" />
            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-4xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${status.className}`}>
                    {status.label}
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                    {formatCoordinationTime(caseRecord.created_at)} 建立
                  </span>
                </div>
                <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
                  {caseRecord.title}
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
                  {caseRecord.summary}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                <HeroMetric label="处理次数" value={`${caseRecord.attempt_count}/${caseRecord.max_attempts}`} />
                <HeroMetric label="升级次数" value={`${caseRecord.escalation_count}/${caseRecord.max_escalations}`} />
                {caseRecord.retry_attempts.length > 0 ? (
                  <HeroMetric
                    label="技术重试"
                    value={`${caseRecord.retry_attempts.length}/${technicalRetryLimit(caseRecord.policy_snapshot)}`}
                  />
                ) : null}
                {caseRecord.routing_runs.length > 0 ? (
                  <HeroMetric label="语义路由" value={String(caseRecord.routing_runs.length)} />
                ) : null}
                <HeroMetric label="事件记录" value={String(caseRecord.events.length)} />
              </div>
            </div>
          </section>

          <ReconnectBanner
            status={live.connection}
            onReconnect={live.reconnect}
            closedText="协调事项已进入终态，事件回放已结束；持久化记录仍可查看。"
          />

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
            <Radio className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            <span>SSE 已接收 {live.streamEventCount} 帧</span>
            <span aria-hidden="true">·</span>
            <span>已去重 {live.duplicateEventCount} 帧</span>
            <span aria-hidden="true">·</span>
            <span>每批结束后重新读取持久化 Case</span>
          </div>

          {actionError ? <InlineError error={actionError} /> : null}

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
            <div className="space-y-5">
              {caseRecord.routing_runs.length > 0 ? (
                <section className="rounded-[24px] border border-indigo-200 bg-white p-5 shadow-sm sm:p-6">
                  <SectionTitle
                    icon={BrainCircuit}
                    title="受限语义路由"
                    subtitle="每次路由都是独立审计记录；页面只展示后端批准的安全投影，不展示 Runtime Thread、Turn、Workspace 或原始输出。"
                  />

                  <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <EvidenceMetric label="路由执行" value={String(caseRecord.routing_runs.length)} />
                    <EvidenceMetric
                      label="高模型复核"
                      value={String(caseRecord.routing_runs.filter((run) => run.execution_tier === 'higher_model').length)}
                    />
                    <EvidenceMetric
                      label="安全回退"
                      value={String(caseRecord.routing_runs.filter((run) => run.decision?.decision_source === 'fallback').length)}
                    />
                    <EvidenceMetric
                      label="累计 Tokens"
                      value={String(caseRecord.routing_runs.reduce((total, run) => total + run.total_tokens, 0))}
                    />
                  </div>

                  <div className="mt-4 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4 text-sm leading-6 text-indigo-950">
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
                    <p>
                      路由 Runtime 只有两个 Case 范围内的只读工具；网络、Shell、多 Agent、插件和任意数据库操作均由后端禁用。
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    {[...caseRecord.routing_runs]
                      .sort((left, right) => left.routing_number - right.routing_number)
                      .map((run) => (
                        <article key={run.routing_run_id} className="overflow-hidden rounded-2xl border border-slate-200">
                          <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                                  第 {run.routing_number} 次路由
                                </span>
                                <StatusBadge presentation={ROUTING_STATUS[run.status]} />
                              </div>
                              <p className="mt-2 text-sm font-bold text-slate-900">
                                {ROUTING_TIER_LABEL[run.execution_tier]}
                              </p>
                            </div>
                            <div className="text-left text-xs leading-5 text-slate-500 sm:text-right">
                              <p>{run.actual_model ?? run.requested_model ?? run.runtime_provider}</p>
                              <p>{run.reasoning_effort ? `${run.reasoning_effort} reasoning` : '产品受限执行'}</p>
                            </div>
                          </div>

                          <div className="p-4 sm:p-5">
                            {run.decision ? (
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">
                                    {ROUTING_ACTION_LABEL[run.decision.action] ?? run.decision.action}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    {ROUTING_SOURCE_LABEL[run.decision.decision_source]}
                                  </span>
                                  <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    {ROUTING_CONFIDENCE_LABEL[run.decision.confidence]}
                                  </span>
                                </div>
                                <p className="mt-3 text-sm leading-6 text-slate-700">{run.decision.reason}</p>
                                <div className="mt-4 grid gap-3 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400">下一责任方</p>
                                    <p className="mt-1 font-bold text-slate-800">
                                      {run.decision.target_role_key
                                        ? roleName(live.organizationVersion, run.decision.target_role_key)
                                        : routingDestinationLabel(run.decision.action)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400">处理阶段</p>
                                    <p className="mt-1 font-bold text-slate-800">
                                      {workItemKindLabel(run.decision.work_item_kind)}
                                    </p>
                                  </div>
                                </div>
                                {run.decision.validation_errors.length > 0 ? (
                                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <p className="text-xs font-bold text-amber-900">产品校验已触发安全回退</p>
                                    <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">
                                      {run.decision.validation_errors.map((error) => (
                                        <li key={error}>· {routingValidationLabel(error)}</li>
                                      ))}
                                    </ul>
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <div className="flex items-center gap-3 text-sm text-slate-500">
                                <Route className="h-5 w-5 text-indigo-500" aria-hidden="true" />
                                正在等待产品校验后的结构化路由决定。
                              </div>
                            )}
                            {run.failure_code ? (
                              <p className="mt-3 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800">
                                {routingFailureLabel(run.failure_code)}；系统已按冻结组织和有限策略选择安全回退。
                              </p>
                            ) : null}
                            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
                              <span>输入 {run.input_tokens} tokens</span>
                              <span>输出 {run.output_tokens} tokens</span>
                              <span>上下文压缩 {run.context_compactions} 次</span>
                              <span>{formatCoordinationTime(run.completed_at ?? run.started_at ?? run.created_at)}</span>
                            </div>
                          </div>
                        </article>
                      ))}
                  </div>
                </section>
              ) : null}

              {caseRecord.retry_attempts.length > 0 ? (
                <section className="rounded-[24px] border border-blue-200 bg-white p-5 shadow-sm sm:p-6">
                  <SectionTitle
                    icon={RotateCcw}
                    title="技术恢复"
                    subtitle="technical Retry 只恢复失败岗位；业务 Replay 保持独立计数与入口。"
                  />

                  <div className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/60 p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-slate-900">后端有限策略正在处理交付质量失败</p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          Case、技术重试和 Task 业务重放是三条独立记录；页面只展示持久化产品状态，不从 Runtime 文本推断结果。
                        </p>
                      </div>
                      {relatedTask ? (
                        <Link
                          to={`/tasks/${relatedTask.task_id}`}
                          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50"
                        >
                          查看关联 Task
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      ) : null}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <EvidenceMetric label="技术重试次数" value={String(caseRecord.retry_attempts.length)} />
                      <EvidenceMetric
                        label="策略上限"
                        value={technicalRetryLimit(caseRecord.policy_snapshot)}
                      />
                      <EvidenceMetric
                        label="业务 Replay"
                        value={relatedTask ? String(relatedTask.replay_count) : '—'}
                      />
                      <EvidenceMetric label="保留的旁路产物" value={String(preservedSiblingCount)} />
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    {[...caseRecord.retry_attempts]
                      .sort((left, right) => left.retry_number - right.retry_number)
                      .map((attempt) => (
                        <article key={attempt.retry_attempt_id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">
                              第 {attempt.retry_number} 次技术重试
                            </span>
                            <StatusBadge presentation={RETRY_STATUS[attempt.status]} />
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                              {RETRY_TRIGGER_LABEL[attempt.trigger]}
                            </span>
                          </div>
                          <div className="mt-3 flex items-start gap-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
                              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900">{failureCodeLabel(attempt.failure_code)}</p>
                              {attempt.failure_summary ? (
                                <p className="mt-1 text-sm leading-6 text-slate-600">{attempt.failure_summary}</p>
                              ) : null}
                            </div>
                          </div>
                          <dl className="mt-4 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500 sm:grid-cols-3">
                            <div>
                              <dt className="font-semibold text-slate-400">请求时间</dt>
                              <dd className="mt-1">{formatCoordinationTime(attempt.created_at)}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-400">完成时间</dt>
                              <dd className="mt-1">{formatCoordinationTime(attempt.completed_at)}</dd>
                            </div>
                            <div>
                              <dt className="font-semibold text-slate-400">当时业务 Replay 次数</dt>
                              <dd className="mt-1">{attempt.task_replay_count_snapshot}</dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                  </div>

                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                        <PackageCheck className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div>
                        <h3 className="font-black text-slate-900">失败证据与后续版本</h3>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                          rejected 候选只保留审计证据；恢复成功后会出现新的 released Artifact，原记录不会被覆盖。
                        </p>
                      </div>
                    </div>
                    {affectedArtifacts.length > 0 ? (
                      <div className="mt-4">
                        <ArtifactList
                          artifacts={affectedArtifacts}
                          replayNumberById={new Map(
                            relatedTask?.replay_runs.map((replay) => [replay.replay_run_id, replay.replay_number]) ?? [],
                          )}
                        />
                      </div>
                    ) : (
                      <p className="mt-4 rounded-xl bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-500">
                        本次失败发生在结构化交付解析阶段，没有可保留的候选文件；技术重试记录和 Signal 仍保持完整。
                      </p>
                    )}
                  </div>
                </section>
              ) : null}

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle
                  icon={Layers3}
                  title="岗位处理"
                  subtitle={semanticCase
                    ? '每次语义路由只创建一个有限 WorkItem；岗位报告完成后再由后端决定下一步。'
                    : '自动恢复耗尽后，每次岗位处理都是不可覆盖的 WorkItem 记录。'}
                />
                <div className="mt-5 space-y-3">
                  {caseRecord.work_items.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                      尚未分派岗位，当前事项等待分诊。
                    </p>
                  ) : (
                    caseRecord.work_items.map((workItem) => (
                      <article key={workItem.work_item_id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                                第 {workItem.attempt_number} 次处理
                              </span>
                              <StatusBadge presentation={WORK_ITEM_STATUS[workItem.status]} />
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                {workItemKindLabel(workItem.work_item_kind)}
                              </span>
                            </div>
                            <h2 className="mt-2 text-base font-bold text-slate-900">{workItem.title}</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{workItem.brief}</p>
                          </div>
                          <div className="shrink-0 rounded-xl bg-indigo-50 px-3 py-2 text-sm font-bold text-indigo-700">
                            {roleName(live.organizationVersion, workItem.target_role_key)}
                          </div>
                        </div>
                        <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold text-slate-400">完成条件</p>
                            <p className="mt-1 leading-6 text-slate-700">{workItem.completion_condition}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-400">允许动作</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {workItem.allowed_actions.length > 0 ? workItem.allowed_actions.map((action) => (
                                <span key={action} className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                                  {ACTION_LABELS[action] ?? action}
                                </span>
                              )) : <span className="text-slate-400">未声明</span>}
                            </div>
                          </div>
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={CircleDot} title="状态时间线" subtitle="按后端持久化 sequence 展示，不读取隐藏 Runtime 历史。" />
                <ol className="relative mt-6 space-y-0 before:absolute before:bottom-3 before:left-[7px] before:top-3 before:w-px before:bg-slate-200">
                  {caseRecord.events.map((event) => (
                    <li key={event.event_id} className="relative grid grid-cols-[16px_minmax(0,1fr)] gap-4 pb-6 last:pb-0">
                      <span className="relative z-[1] mt-1 h-4 w-4 rounded-full border-4 border-white bg-indigo-500 shadow-[0_0_0_1px_rgb(199,210,254)]" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-bold text-slate-800">{eventLabel(event)}</p>
                          <time className="text-xs text-slate-400">{formatCoordinationTime(event.occurred_at)}</time>
                        </div>
                        {eventDescription(event) ? (
                          <p className="mt-1 text-sm leading-6 text-slate-500">{eventDescription(event)}</p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[24px] border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 sm:p-6">
                <SectionTitle icon={UserRoundCheck} title="当前责任" />
                {latestRoutingRun && ['queued', 'running'].includes(latestRoutingRun.status) ? (
                  <div className="mt-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                      <BrainCircuit className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-950">系统安全路由</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        正在读取 Case 范围内的持久化证据并校验下一责任岗位。
                      </p>
                      <div className="mt-3">
                        <StatusBadge presentation={ROUTING_STATUS[latestRoutingRun.status]} />
                      </div>
                    </div>
                  </div>
                ) : responsibleWorkItem ? (
                  <div className="mt-5">
                    <p className="text-2xl font-black text-slate-950">
                      {roleName(live.organizationVersion, responsibleWorkItem.target_role_key)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {responsibleWorkItem.title}
                    </p>
                    <div className="mt-4 flex items-center justify-between rounded-xl border border-indigo-100 bg-white/80 px-3 py-3">
                      <span className="text-sm font-semibold text-slate-600">当前状态</span>
                      <StatusBadge presentation={WORK_ITEM_STATUS[responsibleWorkItem.status]} />
                    </div>
                  </div>
                ) : latestRetry ? (
                  <div className="mt-5 flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Bot className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <p className="text-lg font-black text-slate-950">系统自动恢复</p>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        失败岗位正在由后端按有限 Retry 策略处理，不需要用户手动重放 Task。
                      </p>
                      <div className="mt-3">
                        <StatusBadge presentation={RETRY_STATUS[latestRetry.status]} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 text-sm leading-6 text-slate-500">尚无处理事项，等待分诊与分派。</p>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle
                  icon={semanticCase ? Send : ArrowUpRight}
                  title={semanticCase ? '提交岗位报告' : '推进岗位处理'}
                  subtitle={semanticCase
                    ? '报告只绑定当前 WorkItem；完成或失败后由后端重新路由，前端不直接改写 Case。'
                    : '这里只推进 WorkItem 生命周期；技术 Retry 与业务 Replay 使用各自的产品策略。'}
                />
                {semanticCase ? (
                  caseIsTerminal ? (
                    <div className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                      <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                      <p>该语义协作闭环已经由后端验证结束，所有岗位报告与路由决定保持只读。</p>
                    </div>
                  ) : reportableWorkItem ? (
                    <div className="mt-5">
                      <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-indigo-500">当前报告岗位</p>
                        <p className="mt-2 text-lg font-black text-slate-950">
                          {roleName(live.organizationVersion, reportableWorkItem.target_role_key)}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {workItemKindLabel(reportableWorkItem.work_item_kind)} · {reportableWorkItem.completion_condition}
                        </p>
                      </div>

                      <label className="mt-4 block text-sm font-bold text-slate-800">
                        本次结果
                        <select
                          id="coordination-report-outcome"
                          name="report_outcome"
                          value={reportOutcome}
                          onChange={(event) =>
                            setReportOutcome(event.target.value as CoordinationWorkItemReportRequest['outcome'])
                          }
                          className="form-control mt-2"
                        >
                          <option value="completed">已完成并提交验证</option>
                          <option value="failed">未通过，需要再次处理</option>
                          <option value="waiting">等待外部条件</option>
                        </select>
                      </label>
                      <label className="mt-4 block text-sm font-bold text-slate-800">
                        岗位结论
                        <textarea
                          id="coordination-report-summary"
                          name="report_summary"
                          value={reportSummary}
                          onChange={(event) => setReportSummary(event.target.value)}
                          rows={4}
                          maxLength={20_000}
                          required
                          placeholder="说明本岗位完成了什么、验证了什么，以及下一岗位可以依赖的结论。"
                          className="form-control mt-2 resize-y"
                        />
                      </label>
                      <label className="mt-4 block text-sm font-bold text-slate-800">
                        可验证证据{reportOutcome === 'waiting' ? '（可选）' : ''}
                        <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">
                          不需要填写 Artifact 或内部记录 ID；页面会为这段可见内容生成 SHA-256 证据身份。
                        </span>
                        <textarea
                          id="coordination-report-evidence"
                          name="report_evidence"
                          value={reportEvidence}
                          onChange={(event) => setReportEvidence(event.target.value)}
                          rows={4}
                          maxLength={20_000}
                          required={reportOutcome !== 'waiting'}
                          placeholder="例如：已发布契约版本、实际响应和复验结果一致。"
                          className="form-control mt-2 resize-y"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void handleWorkItemReport()}
                        disabled={
                          submitting !== null ||
                          !reportSummary.trim() ||
                          (reportOutcome !== 'waiting' && !reportEvidence.trim())
                        }
                        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/15 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send className="h-4 w-4" aria-hidden="true" />
                        {submitting === 'report' ? '正在提交并重新路由...' : '提交岗位报告'}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                      <Route className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500" aria-hidden="true" />
                      <p>当前没有可报告的岗位事项；系统可能正在生成下一条安全路由决定，页面会通过 SSE 后重新读取 Case。</p>
                    </div>
                  )
                ) : (
                  <>
                <label className="mt-5 block text-sm font-bold text-slate-800">
                  处理事项下一状态
                  <select
                    id="coordination-work-item-target"
                    name="work_item_status"
                    value={workItemTarget}
                    onChange={(event) => setWorkItemTarget(event.target.value as CoordinationWorkItemStatus)}
                    disabled={transitionOptions.length === 0}
                    className="form-control mt-2"
                  >
                    {transitionOptions.length === 0 ? <option value="">没有可用转换</option> : null}
                    {transitionOptions.map((option) => (
                      <option key={option} value={option}>{WORK_ITEM_STATUS[option].label}</option>
                    ))}
                  </select>
                </label>
                <label className="mt-4 block text-sm font-bold text-slate-800">
                  说明（可选）
                  <textarea
                    id="coordination-transition-reason"
                    name="transition_reason"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={10_000}
                    disabled={caseIsTerminal}
                    placeholder="写下这次状态变化的产品原因。"
                    className="form-control mt-2 resize-y"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => void handleWorkItemTransition()}
                  disabled={!currentWorkItem || !workItemTarget || submitting !== null}
                  className="mt-4 min-h-12 w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/15 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting === 'work-item' ? '正在更新...' : '确认推进'}
                </button>

                {!caseIsTerminal ? (
                  <div className="mt-5 border-t border-slate-100 pt-5">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">结束协调事项</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCaseTerminal('resolved')}
                        disabled={submitting !== null}
                        className="min-h-11 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        {submitting === 'resolved' ? '处理中...' : '标记解决'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCaseTerminal('abandoned')}
                        disabled={submitting !== null}
                        className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {submitting === 'abandoned' ? '处理中...' : '终止事项'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex items-start gap-3 rounded-xl bg-emerald-50 p-4 text-sm leading-6 text-emerald-800">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                    <p>该事项已进入终态，历史处理记录保持只读。</p>
                  </div>
                )}
                  </>
                )}
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <SectionTitle icon={Inbox} title="信号与收件箱" />
                <div className="mt-5 space-y-4 text-sm">
                  {caseRecord.signals.map((signal) => (
                    <div key={signal.signal_id} className="rounded-xl bg-slate-50 p-4">
                      <p className="font-bold text-slate-800">{SIGNAL_CLASS_LABEL[signal.signal_class]}</p>
                      <p className="mt-1 leading-6 text-slate-500">{signal.summary}</p>
                      {signal.evidence_refs.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {signal.evidence_refs.map((evidence, index) => (
                            <span key={`${evidence.resource_type}-${index}`} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                              <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {evidence.label ?? '已附产品证据'}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3">
                    <span className="text-slate-500">岗位投递</span>
                    <strong className="text-slate-800">{caseRecord.inbox_deliveries.length} 条</strong>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function PermissionState() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-50 p-5">
      <div className="max-w-lg rounded-[28px] border border-amber-200 bg-white p-8 text-center shadow-xl shadow-slate-900/5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-black text-slate-900">无法访问这条协调事项</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          记录不存在，或它属于其他所有者。为保护权限边界，页面不会透露更多资源信息。
        </p>
        <Link to="/coordination" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          返回协作中心
        </Link>
      </div>
    </div>
  );
}

function HeroMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[108px] rounded-2xl border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-white">{value}</p>
    </div>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function workItemKindLabel(kind: string | null | undefined): string {
  const labels: Record<string, string> = {
    semantic_triage: '安全分诊',
    semantic_escalation: '升级分诊',
    issue_investigation: '问题调查',
    backend_fix: '后端修复',
    publication_check: '发布校验',
    frontend_reintegration: '前端重新集成',
    delivery_quality_exhausted: '交付质量升级',
    feedback_review: '反馈审查',
  };
  return kind ? labels[kind] ?? '受限岗位处理' : '无新增岗位事项';
}

function routingDestinationLabel(action: string): string {
  const labels: Record<string, string> = {
    wait: '等待外部条件',
    escalate: '进入高层复核',
    human_required: '等待人工处理',
    resolve: '事项已验证解决',
    abort: '事项已终止',
  };
  return labels[action] ?? '等待产品决定';
}

function routingValidationLabel(code: string): string {
  const labels: Record<string, string> = {
    case_terminal: '事项已经进入终态',
    confidence_low: '路由置信度不足',
    target_role_invalid: '目标岗位不属于当前冻结组织版本',
    work_item_kind_required: '缺少明确的处理阶段',
    completion_condition_required: '缺少可验证的完成条件',
    work_item_kind_invalid_for_stage: '处理阶段不符合当前闭环顺序',
    attempt_limit_reached: '岗位处理次数已达到策略上限',
    publication_checker_must_be_issue_handler: '发布校验必须交回问题处理岗位',
    reintegration_target_must_be_source_role: '重新集成必须交回最初发现问题的岗位',
    resolution_not_verified: '解决条件尚未完成产品验证',
    escalation_limit_reached: '升级次数已达到策略上限',
  };
  return labels[code] ?? '路由决定未通过产品约束';
}

function routingFailureLabel(code: string): string {
  const labels: Record<string, string> = {
    COORDINATION_ROUTER_RUNTIME_FAILED: '受限路由 Runtime 执行失败',
    COORDINATION_ROUTER_OUTPUT_INVALID: '路由输出未通过结构校验',
    COORDINATION_ROUTING_SOURCE_MISSING: '路由所需的持久化来源已缺失',
    COORDINATION_ROUTER_RECOVERY_FAILED: '启动恢复未能完成',
    COORDINATION_ROUTER_RECOVERY_UNAVAILABLE: '当前路由无法安全恢复',
  };
  return labels[code] ?? '语义路由未能正常完成';
}

function technicalRetryLimit(policy: Record<string, unknown>): string {
  const limit = policy.technical_retry_limit;
  return typeof limit === 'number' && Number.isFinite(limit) ? String(limit) : '—';
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof Clock3; title: string; subtitle?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <div>
        <h2 className="font-black text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs leading-5 text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function StatusBadge({ presentation }: { presentation: { label: string; className: string } }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${presentation.className}`}>
      {presentation.label}
    </span>
  );
}
