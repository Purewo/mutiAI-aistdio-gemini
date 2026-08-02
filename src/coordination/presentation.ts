import type {
  CoordinationCaseStatus,
  CoordinationEvent,
  CoordinationRetryStatus,
  CoordinationRetryTrigger,
  CoordinationRoutingConfidence,
  CoordinationRoutingDecisionSource,
  CoordinationRoutingExecutionTier,
  CoordinationRoutingRunStatus,
  CoordinationSeverity,
  CoordinationSignalClass,
  CoordinationWorkItemStatus,
  OrganizationDetail,
  OrganizationVersion,
} from '../api/types';

export interface StatusPresentation {
  label: string;
  className: string;
}

export const CASE_STATUS: Record<CoordinationCaseStatus, StatusPresentation> = {
  open: { label: '待分诊', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  triaging: { label: '分诊中', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  assigned: { label: '已分派', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  in_progress: { label: '处理中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  waiting_verification: {
    label: '等待验证',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  resolved: { label: '已解决', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  escalated: { label: '已升级', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  human_required: {
    label: '需要人工',
    className: 'border-rose-200 bg-rose-50 text-rose-700',
  },
  abandoned: { label: '已终止', className: 'border-slate-300 bg-slate-100 text-slate-600' },
};

export const WORK_ITEM_STATUS: Record<CoordinationWorkItemStatus, StatusPresentation> = {
  created: { label: '已创建', className: 'border-slate-200 bg-slate-100 text-slate-700' },
  delivered: { label: '已送达', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  acknowledged: { label: '已接收', className: 'border-cyan-200 bg-cyan-50 text-cyan-700' },
  in_progress: { label: '处理中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  waiting: { label: '等待中', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  submitted: { label: '已提交', className: 'border-violet-200 bg-violet-50 text-violet-700' },
  waiting_verification: {
    label: '等待验证',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
  completed: { label: '已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', className: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', className: 'border-slate-300 bg-slate-100 text-slate-600' },
};

export const RETRY_STATUS: Record<CoordinationRetryStatus, StatusPresentation> = {
  requested: { label: '已请求', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  running: { label: '重试中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  succeeded: { label: '恢复成功', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '本次失败', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  exhausted: { label: '次数已耗尽', className: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', className: 'border-slate-300 bg-slate-100 text-slate-600' },
};

export const RETRY_TRIGGER_LABEL: Record<CoordinationRetryTrigger, string> = {
  automatic: '系统自动',
  user: '用户发起',
};

export const ROUTING_STATUS: Record<CoordinationRoutingRunStatus, StatusPresentation> = {
  queued: { label: '等待路由', className: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  running: { label: '安全路由中', className: 'border-blue-200 bg-blue-50 text-blue-700' },
  waiting: { label: '等待条件', className: 'border-amber-200 bg-amber-50 text-amber-800' },
  completed: { label: '路由已完成', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '路由已回退', className: 'border-orange-200 bg-orange-50 text-orange-700' },
  cancelled: { label: '路由已取消', className: 'border-slate-300 bg-slate-100 text-slate-600' },
};

export const ROUTING_TIER_LABEL: Record<CoordinationRoutingExecutionTier, string> = {
  standard: '标准受限路由',
  higher_model: '高模型层复核',
  lead: '组织负责人',
  human: '人工处理',
};

export const ROUTING_SOURCE_LABEL: Record<CoordinationRoutingDecisionSource, string> = {
  runtime: '受限语义路由',
  fallback: '产品安全回退',
};

export const ROUTING_CONFIDENCE_LABEL: Record<CoordinationRoutingConfidence, string> = {
  low: '低置信度',
  medium: '中置信度',
  high: '高置信度',
};

export const ROUTING_ACTION_LABEL: Record<string, string> = {
  assign: '分派岗位',
  wait: '等待条件',
  escalate: '升级复核',
  human_required: '转人工处理',
  resolve: '确认解决',
  abort: '终止事项',
};

export const SIGNAL_CLASS_LABEL: Record<CoordinationSignalClass, string> = {
  technical_recovery: '技术恢复',
  delivery_quality: '交付质量',
  semantic_coordination: '语义协作',
  business_revision: '业务修订',
  approval_or_external_wait: '审批或外部等待',
};

export const SEVERITY_LABEL: Record<CoordinationSeverity, string> = {
  info: '提示',
  warning: '注意',
  error: '严重',
  critical: '紧急',
};

export const WORK_ITEM_TRANSITIONS: Record<
  CoordinationWorkItemStatus,
  readonly CoordinationWorkItemStatus[]
> = {
  created: ['delivered', 'cancelled'],
  delivered: ['acknowledged', 'in_progress', 'waiting', 'submitted', 'failed', 'cancelled'],
  acknowledged: ['in_progress', 'waiting', 'submitted', 'failed', 'cancelled'],
  in_progress: ['waiting', 'submitted', 'waiting_verification', 'completed', 'failed', 'cancelled'],
  waiting: ['in_progress', 'submitted', 'waiting_verification', 'completed', 'failed', 'cancelled'],
  submitted: ['waiting_verification', 'completed', 'failed', 'cancelled'],
  waiting_verification: ['in_progress', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

const EVENT_LABELS: Record<string, string> = {
  'coordination.case.created': '协调事项已建立',
  'coordination.signal.recorded': '反馈信号已记录',
  'coordination.work_item.created': '处理事项已创建',
  'coordination.inbox.delivered': '处理事项已送达收件箱',
  'coordination.case.assigned': '负责人已分派',
  'coordination.inbox.read': '收件箱消息已读',
  'coordination.case.status_changed': '协调事项状态已更新',
  'coordination.case.resolved': '协调事项已解决',
  'coordination.case.escalated': '协调事项已升级',
  'coordination.case.human_required': '协调事项需要人工处理',
  'coordination.work_item.status_changed': '处理事项状态已更新',
  'coordination.retry.requested': '已请求技术重试',
  'coordination.retry.running': '技术重试执行中',
  'coordination.retry.succeeded': '技术重试成功',
  'coordination.retry.failed': '本次技术重试失败',
  'coordination.retry.exhausted': '技术重试次数已耗尽',
  'coordination.routing.queued': '语义路由已进入队列',
  'coordination.routing.started': '受限语义路由开始',
  'coordination.routing.completed': '语义路由执行完成',
  'coordination.routing.failed': '语义路由失败并安全回退',
  'coordination.routing.decision_recorded': '路由决定已通过产品校验',
};

export function eventLabel(event: CoordinationEvent): string {
  return EVENT_LABELS[event.event_type] ?? '协调记录已更新';
}

export function eventDescription(event: CoordinationEvent): string | null {
  const payload = event.payload;
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
  const exposesInternalReference =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(reason) ||
    /(?:[a-z]:\\|\/home\/|\/workspace\/)/i.test(reason);
  if (reason && !exposesInternalReference) return reason;
  if (event.event_type === 'coordination.case.escalated') {
    return '自动技术重试已耗尽，事项已交给冻结组织版本中的负责人继续处理。';
  }
  if (event.event_type === 'coordination.case.human_required') {
    return '升级次数达到后端策略上限，等待人工处理。';
  }
  const status = typeof payload.status === 'string' ? payload.status : null;
  if (status && status in CASE_STATUS) {
    return `状态变更为${CASE_STATUS[status as CoordinationCaseStatus].label}`;
  }
  if (status && status in WORK_ITEM_STATUS) {
    return `状态变更为${WORK_ITEM_STATUS[status as CoordinationWorkItemStatus].label}`;
  }
  if (status && status in RETRY_STATUS) {
    const retryNumber = typeof payload.retry_number === 'number' ? payload.retry_number : null;
    return `${retryNumber === null ? '' : `第 ${retryNumber} 次`}${RETRY_STATUS[status as CoordinationRetryStatus].label}`;
  }
  return null;
}

export function failureCodeLabel(code: string | null | undefined): string {
  if (!code) return '交付结果未通过产品校验';
  if (code === 'invalid_assignment_delivery') return '岗位交付结构无效';
  if (code === 'artifact_media_validation_failed') return 'Artifact 内容校验失败';
  if (code.startsWith('artifact_')) return 'Artifact 交付校验失败';
  return '交付结果未通过产品校验';
}

export function roleName(
  organization: OrganizationDetail | OrganizationVersion | null,
  roleKey: string,
): string {
  const roles = organization
    ? 'spec' in organization
      ? organization.spec.roles
      : organization.current_published_spec?.roles
    : null;
  return roles?.find((role) => role.role_key === roleKey)?.name ?? '已分派岗位';
}

export function formatCoordinationTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function isTerminalCase(status: CoordinationCaseStatus): boolean {
  return status === 'resolved' || status === 'abandoned';
}

export function isWaitingCase(status: CoordinationCaseStatus): boolean {
  return status === 'waiting_verification' || status === 'human_required';
}
