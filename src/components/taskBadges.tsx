/**
 * Status badges for Task, plan, plan-step, and Assignment states.
 *
 * Product activity wording comes from backend-derived `activity_phase`. Raw state-machine statuses
 * remain available for diagnostics but are not used to guess whether work is queued, active, or
 * waiting for a result. Unknown enum values render as-is instead of crashing the view.
 */
import type {
  ActivityPhase,
  AssignmentStatus,
  PlanStepStatus,
  TaskExecutionPlanStatus,
  TaskStatus,
} from '../api/types';

interface Presentation {
  label: string;
  tone: string;
}

const FALLBACK: Presentation = { label: '', tone: 'border-slate-200 bg-slate-50 text-slate-600' };

function Badge({
  presentation,
  raw,
  title,
}: {
  presentation: Presentation | undefined;
  raw: string;
  title?: string;
}) {
  const { label, tone } = presentation ?? { ...FALLBACK, label: raw };
  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}
      title={title}
    >
      {label}
    </span>
  );
}

/**
 * Backend-derived product activity wording. This is deliberately separate from the state-machine
 * status: clients must display this field rather than infer activity from Runtime IDs or wait
 * diagnostics.
 */
const ACTIVITY: Record<ActivityPhase, Presentation> = {
  pending: { label: '尚未开始', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  submitted: { label: '已提交', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  queued: { label: '排队中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  working: { label: '工作中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  waiting_result: {
    label: '工作中 · 等待结果',
    tone: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  },
  waiting_approval: { label: '等待审批', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  waiting_external: { label: '等待中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  validating_output: {
    label: '正在整理结果',
    tone: 'border-violet-200 bg-violet-50 text-violet-700',
  },
  completed: { label: '已完成', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  needs_revision: { label: '需修订', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  blocked: { label: '已阻断', tone: 'border-red-200 bg-red-50 text-red-700' },
  failed: { label: '失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

function activityPhaseLabel(activityPhase: ActivityPhase | null | undefined): string | null {
  return activityPhase ? ACTIVITY[activityPhase]?.label ?? activityPhase : null;
}

export function ActivityPhaseBadge({
  activityPhase,
  title,
}: {
  activityPhase: ActivityPhase | null | undefined;
  title?: string;
}) {
  if (!activityPhase) return null;
  return <Badge presentation={ACTIVITY[activityPhase]} raw={activityPhase} title={title} />;
}

const TASK: Record<TaskStatus, Presentation> = {
  created: { label: '已创建', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  planning: { label: '规划中', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  running: { label: '执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  waiting: { label: '等待中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  needs_revision: { label: '需修订', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  completed: { label: '已完成', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  failed: { label: '已失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

export function TaskStatusBadge({
  status,
  activityPhase,
}: {
  status: TaskStatus;
  activityPhase?: ActivityPhase | null;
}) {
  return activityPhase ? (
    <ActivityPhaseBadge
      activityPhase={activityPhase}
      title={`活动阶段：${activityPhaseLabel(activityPhase)} · 任务状态：${status}`}
    />
  ) : (
    <Badge presentation={TASK[status]} raw={status} />
  );
}

const PLAN: Record<TaskExecutionPlanStatus, Presentation> = {
  draft: { label: '草稿', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  validated: { label: '已校验', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  active: { label: '执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  completed: { label: '已完成', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  needs_revision: { label: '需修订', tone: 'border-orange-200 bg-orange-50 text-orange-700' },
  failed: { label: '已失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

export function PlanStatusBadge({ status }: { status: TaskExecutionPlanStatus }) {
  return <Badge presentation={PLAN[status]} raw={status} />;
}

const PLAN_STEP: Record<PlanStepStatus, Presentation> = {
  pending_dependency: { label: '等待依赖', tone: 'border-slate-200 bg-slate-50 text-slate-500' },
  ready: { label: '就绪', tone: 'border-blue-200 bg-blue-50 text-blue-700' },
  submitted: { label: '已提交', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  running: { label: '执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  waiting: { label: '等待中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  validating_output: { label: '校验产出', tone: 'border-violet-200 bg-violet-50 text-violet-700' },
  completed: { label: '已完成', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  blocked: { label: '被阻断', tone: 'border-red-200 bg-red-50 text-red-700' },
  failed: { label: '已失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

export function PlanStepStatusBadge({
  status,
  activityPhase,
}: {
  status: PlanStepStatus;
  activityPhase?: ActivityPhase | null;
}) {
  return activityPhase ? (
    <ActivityPhaseBadge
      activityPhase={activityPhase}
      title={`活动阶段：${activityPhaseLabel(activityPhase)} · 步骤状态：${status}`}
    />
  ) : (
    <Badge presentation={PLAN_STEP[status]} raw={status} />
  );
}

const ASSIGNMENT: Record<AssignmentStatus, Presentation> = {
  pending: { label: '待处理', tone: 'border-slate-200 bg-slate-50 text-slate-600' },
  submitted: { label: '已提交', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  running: { label: '执行中', tone: 'border-indigo-200 bg-indigo-50 text-indigo-700' },
  waiting: { label: '等待中', tone: 'border-amber-200 bg-amber-50 text-amber-700' },
  completed: { label: '已完成', tone: 'border-emerald-200/50 bg-emerald-50 text-emerald-700' },
  failed: { label: '已失败', tone: 'border-red-200 bg-red-50 text-red-700' },
  cancelled: { label: '已取消', tone: 'border-slate-300 bg-slate-100 text-slate-500' },
};

export function AssignmentStatusBadge({
  status,
  activityPhase,
}: {
  status: AssignmentStatus;
  activityPhase?: ActivityPhase | null;
}) {
  return activityPhase ? (
    <ActivityPhaseBadge
      activityPhase={activityPhase}
      title={`活动阶段：${activityPhaseLabel(activityPhase)} · 岗位状态：${status}`}
    />
  ) : (
    <Badge presentation={ASSIGNMENT[status]} raw={status} />
  );
}

/**
 * Render a backend-provided delivery summary.
 *
 * Some summaries (notably the lead's planning delivery) are a serialized structured envelope rather
 * than prose. Dumping that inline overwhelms the page, so long or JSON-shaped content collapses
 * behind a disclosure and scrolls inside its own container. The text is never truncated or
 * rewritten — it is backend product data.
 */
export function DeliverySummary({ summary }: { summary: string }) {
  const trimmed = summary.trim();
  const structured =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (!structured && trimmed.length <= 400) {
    return <p className="w-full text-sm leading-relaxed text-slate-600">{trimmed}</p>;
  }

  let pretty = trimmed;
  if (structured) {
    try {
      pretty = JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      // Not valid JSON after all; show the original text.
    }
  }

  return (
    <details className="w-full">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-slate-500 hover:text-slate-700">
        {structured ? '结构化交付内容' : '完整交付摘要'}（展开）
      </summary>
      <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
        {pretty}
      </pre>
    </details>
  );
}
