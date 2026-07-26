/**
 * Status badges for Task, plan, plan-step, and Assignment states.
 *
 * Labels translate the contracted enums for display; the underlying value always comes from the
 * backend. `waiting` is presented as a resumable boundary (Runtime Turn, capacity queue, or
 * approval), never as an error, and `needs_revision` is a lead decision awaiting user-directed
 * follow-up. Unknown enum values render as-is instead of crashing the view.
 */
import type {
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

function Badge({ presentation, raw }: { presentation: Presentation | undefined; raw: string }) {
  const { label, tone } = presentation ?? { ...FALLBACK, label: raw };
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label}</span>
  );
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

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <Badge presentation={TASK[status]} raw={status} />;
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

export function PlanStepStatusBadge({ status }: { status: PlanStepStatus }) {
  return <Badge presentation={PLAN_STEP[status]} raw={status} />;
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

export function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  return <Badge presentation={ASSIGNMENT[status]} raw={status} />;
}
