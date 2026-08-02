import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock3,
  FileDiff,
  Inbox,
  Plus,
  RefreshCw,
  Route,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  createCoordinationSemanticObservation,
  createCoordinationSignal,
  getOrganization,
  listCoordinationCases,
  listCoordinationInbox,
  listOrganizationVersions,
  listOrganizations,
  markCoordinationInboxRead,
} from '../api/endpoints';
import type {
  CoordinationInboxDelivery,
  CoordinationSemanticObservationRequest,
  CoordinationSeverity,
  CoordinationSignalCreateRequest,
  CoordinationSignalClass,
  OrganizationDetail,
  OrganizationSummary,
  OrganizationVersion,
} from '../api/types';
import { useApiResource } from '../api/useApiResource';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import {
  CASE_STATUS,
  RETRY_STATUS,
  ROUTING_STATUS,
  SEVERITY_LABEL,
  SIGNAL_CLASS_LABEL,
  WORK_ITEM_STATUS,
  formatCoordinationTime,
  isTerminalCase,
  isWaitingCase,
  roleName,
} from '../coordination/presentation';
import { contentEvidenceRef } from '../coordination/evidence';

interface CoordinationOverview {
  cases: Awaited<ReturnType<typeof listCoordinationCases>>;
  inbox: CoordinationInboxDelivery[];
  organizations: OrganizationSummary[];
  organizationDetails: OrganizationDetail[];
  organizationVersions: OrganizationVersion[];
}

type OverviewTab = 'cases' | 'inbox';
type ComposerMode = 'semantic' | 'direct';

export default function Coordination() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<OverviewTab>('cases');
  const [composerOpen, setComposerOpen] = useState(false);
  const [markingRead, setMarkingRead] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const overview = useApiResource<CoordinationOverview>(async (signal) => {
    const [cases, inbox, organizations] = await Promise.all([
      listCoordinationCases({}, signal),
      listCoordinationInbox({}, signal),
      listOrganizations(signal),
    ]);
    const referencedOrganizationIds = new Set([
      ...cases.map((item) => item.organization_id),
      ...inbox.map((item) => item.organization_id),
      ...organizations
        .filter((item) => item.current_published_version_id !== null)
        .map((item) => item.organization_id),
    ]);
    const [organizationDetails, versionGroups] = await Promise.all([
      Promise.all(
        [...referencedOrganizationIds].map((organizationId) =>
          getOrganization(organizationId, signal),
        ),
      ),
      Promise.all(
        [...referencedOrganizationIds].map((organizationId) =>
          listOrganizationVersions(organizationId, signal),
        ),
      ),
    ]);
    return {
      cases,
      inbox,
      organizations,
      organizationDetails,
      organizationVersions: versionGroups.flat(),
    };
  }, []);

  const handleMarkRead = async (delivery: CoordinationInboxDelivery) => {
    if (delivery.status !== 'delivered' || overview.state.status !== 'ready') return;
    setMarkingRead(delivery.delivery_id);
    setActionError(null);
    try {
      const updated = await markCoordinationInboxRead(delivery.delivery_id);
      overview.set({
        ...overview.state.data,
        inbox: overview.state.data.inbox.map((item) =>
          item.delivery_id === updated.delivery_id
            ? { ...updated, work_item: updated.work_item ?? item.work_item }
            : item,
        ),
      });
    } catch (error) {
      setActionError(error);
    } finally {
      setMarkingRead(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--nexwork-page)]">
      <PageHeader
        title="协作中心"
        description="从自然语言观察开始，沿受限路由、岗位交接和验证结论形成可追溯闭环。"
        actions={
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-900/20"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            提交观察
          </button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-7">
        {overview.state.status === 'loading' ? (
          <LoadingState label="正在读取协调事项与岗位收件箱..." />
        ) : overview.state.status === 'error' ? (
          <ErrorState error={overview.state.error} onRetry={overview.reload} />
        ) : (
          <OverviewContent
            data={overview.state.data}
            tab={tab}
            onTabChange={setTab}
            onRefresh={overview.reload}
            onOpenCase={(caseId) => navigate(`/coordination/cases/${caseId}`)}
            onMarkRead={handleMarkRead}
            markingRead={markingRead}
            actionError={actionError}
            onOpenComposer={() => setComposerOpen(true)}
          />
        )}
      </div>

      {composerOpen && overview.state.status === 'ready' ? (
        <SignalComposer
          organizations={overview.state.data.organizations}
          organizationDetails={overview.state.data.organizationDetails}
          onClose={() => setComposerOpen(false)}
          onCreated={(caseId) => {
            setComposerOpen(false);
            navigate(`/coordination/cases/${caseId}`);
          }}
        />
      ) : null}
    </div>
  );
}

function OverviewContent({
  data,
  tab,
  onTabChange,
  onRefresh,
  onOpenCase,
  onMarkRead,
  markingRead,
  actionError,
  onOpenComposer,
}: {
  data: CoordinationOverview;
  tab: OverviewTab;
  onTabChange: (tab: OverviewTab) => void;
  onRefresh: () => void;
  onOpenCase: (caseId: string) => void;
  onMarkRead: (delivery: CoordinationInboxDelivery) => void;
  markingRead: string | null;
  actionError: unknown;
  onOpenComposer: () => void;
}) {
  const organizationById = useMemo(
    () => new Map(data.organizationDetails.map((item) => [item.organization_id, item])),
    [data.organizationDetails],
  );
  const versionById = useMemo(
    () => new Map(data.organizationVersions.map((item) => [item.spec_version_id, item])),
    [data.organizationVersions],
  );
  const activeCount = data.cases.filter((item) => !isTerminalCase(item.status)).length;
  const waitingCount = data.cases.filter((item) => isWaitingCase(item.status)).length;
  const resolvedCount = data.cases.filter((item) => item.status === 'resolved').length;
  const unreadCount = data.inbox.filter((item) => item.status === 'delivered').length;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="协作概览">
        <MetricCard icon={Activity} label="进行中" value={activeCount} tone="ink" />
        <MetricCard icon={Clock3} label="等待验证" value={waitingCount} tone="amber" />
        <MetricCard icon={Bell} label="岗位未读" value={unreadCount} tone="blue" />
        <MetricCard icon={CheckCircle2} label="已解决" value={resolvedCount} tone="green" />
      </section>

      <section className="overflow-hidden rounded-[24px] border border-slate-200/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="inline-flex w-full rounded-xl bg-slate-100 p-1 sm:w-auto">
            <TabButton
              active={tab === 'cases'}
              label={`协调事项 ${data.cases.length}`}
              onClick={() => onTabChange('cases')}
            />
            <TabButton
              active={tab === 'inbox'}
              label={`岗位收件箱 ${unreadCount > 0 ? `· ${unreadCount} 未读` : ''}`}
              onClick={() => onTabChange('inbox')}
            />
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            刷新
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {actionError ? <div className="mb-4"><InlineError error={actionError} /></div> : null}
          {tab === 'cases' ? (
            data.cases.length === 0 ? (
              <EmptyState
                title="还没有协调事项"
                description="记录一条反馈后，系统会创建可追溯的 Case；如同时指定岗位，还会生成首个处理事项。"
                action={
                  <button
                    type="button"
                    onClick={onOpenComposer}
                    className="min-h-11 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    记录第一条反馈
                  </button>
                }
              />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {data.cases.map((caseRecord) => {
                  const organization = organizationById.get(caseRecord.organization_id) ?? null;
                  const organizationVersion =
                    versionById.get(caseRecord.organization_spec_version_id) ?? null;
                  const currentWorkItem = caseRecord.work_items[caseRecord.work_items.length - 1] ?? null;
                  const latestRetry = caseRecord.retry_attempts[caseRecord.retry_attempts.length - 1] ?? null;
                  const latestRoutingRun = caseRecord.routing_runs[caseRecord.routing_runs.length - 1] ?? null;
                  return (
                    <button
                      key={caseRecord.case_id}
                      type="button"
                      onClick={() => onOpenCase(caseRecord.case_id)}
                      className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
                    >
                      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-indigo-500 via-sky-400 to-emerald-400 opacity-75" />
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                            {organization?.name ?? '已发布组织'}
                          </p>
                          <h2 className="mt-2 line-clamp-2 text-base font-bold leading-snug text-slate-900">
                            {caseRecord.title}
                          </h2>
                          {latestRetry ? (
                            <div className="mt-2">
                              <StatusBadge presentation={RETRY_STATUS[latestRetry.status]} />
                            </div>
                          ) : latestRoutingRun ? (
                            <div className="mt-2">
                              <StatusBadge presentation={ROUTING_STATUS[latestRoutingRun.status]} />
                            </div>
                          ) : null}
                        </div>
                        <StatusBadge presentation={CASE_STATUS[caseRecord.status]} />
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-600">
                        {caseRecord.summary}
                      </p>
                      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm">
                        <div>
                          <p className="text-xs text-slate-400">当前负责人</p>
                          <p className="mt-1 truncate font-semibold text-slate-700">
                            {currentWorkItem
                              ? latestRoutingRun && ['queued', 'running'].includes(latestRoutingRun.status)
                                ? '系统安全路由'
                                : roleName(organizationVersion, currentWorkItem.target_role_key)
                              : latestRetry
                                ? '系统自动恢复'
                                : latestRoutingRun
                                  ? '等待路由决定'
                                : '等待分诊'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">处理次数</p>
                          <p className="mt-1 font-semibold text-slate-700">
                            {caseRecord.attempt_count} / {caseRecord.max_attempts}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                        <span>{formatCoordinationTime(caseRecord.updated_at)}</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 opacity-80 transition group-hover:translate-x-0.5 group-hover:opacity-100">
                          查看过程 <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )
          ) : data.inbox.length === 0 ? (
            <EmptyState
              title="岗位收件箱为空"
              description="指定负责人后，处理事项会以幂等投递记录出现在这里。"
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {data.inbox.map((delivery) => {
                const organization = organizationById.get(delivery.organization_id) ?? null;
                const inboxCase = data.cases.find((item) => item.case_id === delivery.case_id);
                const organizationVersion = inboxCase
                  ? versionById.get(inboxCase.organization_spec_version_id) ?? null
                  : null;
                const unread = delivery.status === 'delivered';
                return (
                  <article
                    key={delivery.delivery_id}
                    className={`flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center ${
                      unread ? '' : 'opacity-75'
                    }`}
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                        unread ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Inbox className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenCase(delivery.case_id)}
                      className="min-w-0 flex-1 text-left focus:outline-none focus-visible:rounded-lg focus-visible:ring-4 focus-visible:ring-indigo-500/15"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-900">
                          {delivery.work_item?.title ?? '协调处理事项'}
                        </h3>
                        {delivery.work_item ? (
                          <StatusBadge presentation={WORK_ITEM_STATUS[delivery.work_item.status]} />
                        ) : null}
                        {unread ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                            未读
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {organization?.name ?? '已发布组织'} ·{' '}
                        {roleName(organizationVersion, delivery.target_role_key)} ·{' '}
                        {formatCoordinationTime(delivery.delivered_at)}
                      </p>
                    </button>
                    <div className="flex shrink-0 gap-2">
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => void onMarkRead(delivery)}
                          disabled={markingRead === delivery.delivery_id}
                          className="min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          {markingRead === delivery.delivery_id ? '处理中...' : '标记已读'}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onOpenCase(delivery.case_id)}
                        className="min-h-11 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        打开事项
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  value: number;
  tone: 'ink' | 'amber' | 'blue' | 'green';
}) {
  const tones = {
    ink: 'bg-slate-950 text-white',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  } as const;
  return (
    <div className={`rounded-2xl border border-transparent p-4 sm:p-5 ${tones[tone]}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold opacity-70">{label}</p>
        <Icon className="h-5 w-5 opacity-60" aria-hidden="true" />
      </div>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
    </div>
  );
}

function TabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition sm:flex-none ${
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ presentation }: { presentation: { label: string; className: string } }) {
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${presentation.className}`}>
      {presentation.label}
    </span>
  );
}

function SignalComposer({
  organizations,
  organizationDetails,
  onClose,
  onCreated,
}: {
  organizations: OrganizationSummary[];
  organizationDetails: OrganizationDetail[];
  onClose: () => void;
  onCreated: (caseId: string) => void;
}) {
  const publishedOrganizations = organizations.filter(
    (item) => item.current_published_version_id !== null,
  );
  const detailsById = useMemo(
    () => new Map(organizationDetails.map((item) => [item.organization_id, item])),
    [organizationDetails],
  );
  const [organizationId, setOrganizationId] = useState(
    publishedOrganizations[0]?.organization_id ?? '',
  );
  const [mode, setMode] = useState<ComposerMode>('semantic');
  const [sourceRoleKey, setSourceRoleKey] = useState('');
  const [signalClass, setSignalClass] = useState<CoordinationSignalClass>('semantic_coordination');
  const [severity, setSeverity] = useState<CoordinationSeverity>('warning');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [publishedContract, setPublishedContract] = useState('');
  const [observedBehavior, setObservedBehavior] = useState('');
  const [expectedResult, setExpectedResult] = useState('');
  const [targetRoleKey, setTargetRoleKey] = useState('');
  const [completionCondition, setCompletionCondition] = useState(
    '完成调查并提交一份可由负责人独立验证的结论。',
  );
  const [maxAttempts, setMaxAttempts] = useState(3);
  const [maxEscalations, setMaxEscalations] = useState(2);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idempotency = useRef<{ signature: string; key: string } | null>(null);
  const selectedOrganization = detailsById.get(organizationId) ?? null;
  const roles = useMemo(
    () => selectedOrganization?.current_published_spec?.roles ?? [],
    [selectedOrganization],
  );

  useEffect(() => {
    if (!roles.some((role) => role.role_key === sourceRoleKey)) {
      const frontendRole = roles.find(
        (role) =>
          role.role_key.toLowerCase().includes('frontend') ||
          role.name.toLowerCase().includes('frontend') ||
          role.name.includes('前端'),
      );
      setSourceRoleKey(frontendRole?.role_key ?? roles.find((role) => !role.is_lead)?.role_key ?? roles[0]?.role_key ?? '');
    }
    if (!roles.some((role) => role.role_key === targetRoleKey)) {
      setTargetRoleKey(roles.find((role) => !role.is_lead)?.role_key ?? roles[0]?.role_key ?? '');
    }
  }, [roles, sourceRoleKey, targetRoleKey]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!organizationId) return;
    if (mode === 'semantic' && (!sourceRoleKey || !publishedContract.trim() || !observedBehavior.trim())) return;
    if (mode === 'direct' && !targetRoleKey) return;
    setSubmitting(true);
    setError(null);
    try {
      if (mode === 'semantic') {
        const evidenceRefs = await Promise.all([
          contentEvidenceRef(
            'published_contract_excerpt',
            '用户提供的已发布契约约定',
            publishedContract.trim(),
          ),
          contentEvidenceRef(
            'observed_response_excerpt',
            '用户提供的实际响应或行为',
            observedBehavior.trim(),
          ),
        ]);
        const observation = [
          `已发布契约约定：\n${publishedContract.trim()}`,
          `实际响应或行为：\n${observedBehavior.trim()}`,
          expectedResult.trim() ? `期望验证结果：\n${expectedResult.trim()}` : null,
        ].filter((value): value is string => value !== null).join('\n\n');
        const body: CoordinationSemanticObservationRequest = {
          organization_id: organizationId,
          source_role_key: sourceRoleKey,
          title: title.trim(),
          observation,
          evidence_refs: evidenceRefs,
          severity,
          policy: {
            max_attempts: maxAttempts,
            max_escalations: maxEscalations,
          },
        };
        const signature = JSON.stringify(body);
        if (idempotency.current?.signature !== signature) {
          idempotency.current = {
            signature,
            key: `coordination-observation-${window.crypto.randomUUID()}`,
          };
        }
        const result = await createCoordinationSemanticObservation(body, idempotency.current.key);
        idempotency.current = null;
        onCreated(result.case.case_id);
        return;
      }
      const body: CoordinationSignalCreateRequest = {
        organization_id: organizationId,
        signal_class: signalClass,
        kind: 'user_feedback',
        severity,
        title: title.trim(),
        summary: summary.trim(),
        policy: {
          max_attempts: maxAttempts,
          max_escalations: maxEscalations,
        },
        initial_work_item: {
          target_role_key: targetRoleKey,
          work_item_kind: 'feedback_review',
          title: `处理：${title.trim()}`,
          brief: summary.trim(),
          completion_condition: completionCondition.trim(),
          allowed_actions: ['wait', 'escalate', 'resolve'],
        },
      };
      const signature = JSON.stringify(body);
      if (idempotency.current?.signature !== signature) {
        idempotency.current = {
          signature,
          key: `coordination-signal-${window.crypto.randomUUID()}`,
        };
      }
      const result = await createCoordinationSignal(body, idempotency.current.key);
      idempotency.current = null;
      onCreated(result.case.case_id);
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm" role="presentation">
      <button type="button" aria-label="关闭反馈面板" className="absolute inset-0" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="coordination-composer-title"
        className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-[var(--nexwork-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">F2 · 受限语义协作</p>
            <h2 id="coordination-composer-title" className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              提交一条产品观察
            </h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              默认由受限路由器判断下一位负责人；也可退回只记录、不路由的共享协调模式。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
            <span className="sr-only">关闭</span>
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
          {error ? <div className="mb-5"><InlineError error={error} /></div> : null}
          {publishedOrganizations.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
              <div className="flex items-center gap-2 font-bold">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                暂无已发布组织
              </div>
              <p className="mt-2">反馈必须归属一个已发布组织，请先完成组织确认与发布。</p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist" aria-label="观察处理方式">
                <ComposerModeButton
                  active={mode === 'semantic'}
                  icon={Route}
                  label="语义协作"
                  onClick={() => setMode('semantic')}
                />
                <ComposerModeButton
                  active={mode === 'direct'}
                  icon={FileDiff}
                  label="仅记录并分派"
                  onClick={() => setMode('direct')}
                />
              </div>

              <fieldset className="grid gap-4 sm:grid-cols-2">
                <Field label="归属组织">
                  <select
                    id="coordination-organization"
                    name="organization_id"
                    value={organizationId}
                    onChange={(event) => setOrganizationId(event.target.value)}
                    className="form-control"
                  >
                    {publishedOrganizations.map((organization) => (
                      <option key={organization.organization_id} value={organization.organization_id}>
                        {organization.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={mode === 'semantic' ? '发现问题的岗位' : '直接负责人'}>
                  <select
                    id={mode === 'semantic' ? 'coordination-source-role' : 'coordination-target-role'}
                    name={mode === 'semantic' ? 'source_role_key' : 'target_role_key'}
                    value={mode === 'semantic' ? sourceRoleKey : targetRoleKey}
                    onChange={(event) =>
                      mode === 'semantic'
                        ? setSourceRoleKey(event.target.value)
                        : setTargetRoleKey(event.target.value)
                    }
                    className="form-control"
                    required
                  >
                    {roles.map((role) => (
                      <option key={role.role_key} value={role.role_key}>
                        {role.name}{role.is_lead ? ' · 负责人' : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </fieldset>

              <fieldset className={`grid gap-4 ${mode === 'direct' ? 'sm:grid-cols-2' : ''}`}>
                {mode === 'direct' ? <Field label="反馈类型">
                  <select
                    id="coordination-signal-class"
                    name="signal_class"
                    value={signalClass}
                    onChange={(event) => setSignalClass(event.target.value as CoordinationSignalClass)}
                    className="form-control"
                  >
                    {Object.entries(SIGNAL_CLASS_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field> : null}
                <Field label="严重程度">
                  <select
                    id="coordination-severity"
                    name="severity"
                    value={severity}
                    onChange={(event) => setSeverity(event.target.value as CoordinationSeverity)}
                    className="form-control"
                  >
                    {Object.entries(SEVERITY_LABEL).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </Field>
              </fieldset>

              <Field label="标题">
                <input
                  id="coordination-title"
                  name="title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={200}
                  required
                  placeholder="例如：发布接口与实际响应不一致"
                  className="form-control"
                />
              </Field>
              {mode === 'semantic' ? (
                <>
                  <Field label="已发布契约中的约定" hint="粘贴需要核对的公开约定或产品事实，不需要填写契约 ID。">
                    <textarea
                      id="coordination-published-contract"
                      name="published_contract"
                      value={publishedContract}
                      onChange={(event) => setPublishedContract(event.target.value)}
                      maxLength={10_000}
                      required
                      rows={4}
                      placeholder="例如：公开 OpenAPI 说明该字段允许 null。"
                      className="form-control resize-y"
                    />
                  </Field>
                  <Field label="实际响应或行为" hint="只写可观察事实，不要粘贴 Runtime 对话、隐藏推理或主机路径。">
                    <textarea
                      id="coordination-observed-behavior"
                      name="observed_behavior"
                      value={observedBehavior}
                      onChange={(event) => setObservedBehavior(event.target.value)}
                      maxLength={10_000}
                      required
                      rows={4}
                      placeholder="例如：实际请求在字段为 null 时返回 422。"
                      className="form-control resize-y"
                    />
                  </Field>
                  <Field label="期望验证结果（可选）">
                    <textarea
                      id="coordination-expected-result"
                      name="expected_result"
                      value={expectedResult}
                      onChange={(event) => setExpectedResult(event.target.value)}
                      maxLength={10_000}
                      rows={3}
                      placeholder="例如：发布修复后，由前端岗位重新拉取并验证。"
                      className="form-control resize-y"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field label="情况说明" hint="只写产品事实与期望结果，不要粘贴 Runtime 对话或主机路径。">
                    <textarea
                      id="coordination-summary"
                      name="summary"
                      value={summary}
                      onChange={(event) => setSummary(event.target.value)}
                      maxLength={20_000}
                      required
                      rows={5}
                      placeholder="描述你观察到的现象、影响和需要验证的结果。"
                      className="form-control resize-y"
                    />
                  </Field>
                  <Field label="完成条件">
                    <textarea
                      id="coordination-completion-condition"
                      name="completion_condition"
                      value={completionCondition}
                      onChange={(event) => setCompletionCondition(event.target.value)}
                      maxLength={10_000}
                      required
                      rows={3}
                      className="form-control resize-y"
                    />
                  </Field>
                </>
              )}

              <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-bold text-slate-800">处理边界</legend>
                <div className="mt-2 grid gap-4 sm:grid-cols-2">
                  <Field label="最多处理次数">
                    <input
                      id="coordination-max-attempts"
                      name="max_attempts"
                      type="number"
                      min={1}
                      max={20}
                      value={maxAttempts}
                      onChange={(event) => setMaxAttempts(Number(event.target.value))}
                      className="form-control"
                    />
                  </Field>
                  <Field label="最多升级次数">
                    <input
                      id="coordination-max-escalations"
                      name="max_escalations"
                      type="number"
                      min={0}
                      max={10}
                      value={maxEscalations}
                      onChange={(event) => setMaxEscalations(Number(event.target.value))}
                      className="form-control"
                    />
                  </Field>
                </div>
              </fieldset>

              <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                <p>
                  {mode === 'semantic'
                    ? '前端会为两段证据生成内容哈希；后端只允许 Case 范围内的只读工具，并校验真实岗位、次数和升级边界。'
                    : '系统会从已发布组织恢复真实岗位归属，并为同一次提交保留幂等身份。'}
                </p>
              </div>
            </div>
          )}
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:flex-row sm:justify-end sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            取消
          </button>
          <button
            type="submit"
            onClick={(event) => {
              const form = event.currentTarget.closest('aside')?.querySelector('form');
              form?.requestSubmit();
            }}
            disabled={
              submitting ||
              publishedOrganizations.length === 0 ||
              (mode === 'semantic'
                ? !sourceRoleKey || !title.trim() || !publishedContract.trim() || !observedBehavior.trim()
                : !targetRoleKey || !title.trim() || !summary.trim())
            }
            className="min-h-12 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? '正在建立协调事项...'
              : mode === 'semantic'
                ? '提交并安全路由'
                : '记录并分派'}
          </button>
        </div>
      </aside>
    </div>
  );
}

function ComposerModeButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Route;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
        active ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-bold text-slate-800">
      {label}
      {hint ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{hint}</span> : null}
      <span className="mt-2 block">{children}</span>
    </label>
  );
}
