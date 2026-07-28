/**
 * Dev-only fixture preview.
 *
 * Renders the captured backend fixtures through the SAME view components the live task page uses,
 * so the contracted scenarios — planned linear, planned parallel, waiting, failed, completed — can
 * be visually verified in a browser without a live Runtime. The M3 acceptance explicitly requires
 * that the linear and parallel fixtures render different dependency graphs from persisted IDs.
 *
 * This route is registered only in the Vite dev build. The banner labels everything on screen as
 * captured fixture data (baseline 356ae35), never as live backend state. Do not add product
 * behavior here.
 */
import { useState } from 'react';
import { FlaskConical } from 'lucide-react';
import type { FeasibilityCheck, OrganizationVersion, Task } from '../api/types';
import FeasibilityPanel from '../components/FeasibilityPanel';
import OrganizationGraph from '../components/OrganizationGraph';
import PageHeader from '../components/PageHeader';
import PlanGraph from '../components/PlanGraph';
import {
  AssignmentStatusBadge,
  DeliverySummary,
  PlanStatusBadge,
  TaskStatusBadge,
} from '../components/taskBadges';
import linearPlanned from '../../fixtures/api/task-linear-planned.json';
import linearCompleted from '../../fixtures/api/task-linear-completed.json';
import parallelPlanned from '../../fixtures/api/task-parallel-planned.json';
import parallelCompleted from '../../fixtures/api/task-parallel-completed.json';
import waitingActivityTask from '../../fixtures/feasibility/task-waiting-activity.json';
import organizationMediaCheck from '../../fixtures/feasibility/organization-media-excel-csv-check.json';
import organizationMediaProposal from '../../fixtures/feasibility/organization-media-excel-csv-proposal.json';
import failedTask from '../../fixtures/api/task-failed-failed.json';

/**
 * Older task fixtures predate the current TaskResponse shape, so they are cast through unknown.
 * The activity fixture is the current backend capture for the queue/result semantic acceptance.
 */
const SCENARIOS: Array<{ key: string; label: string; task: Task }> = [
  { key: 'linear-planned', label: '线性 · 已规划', task: linearPlanned as unknown as Task },
  { key: 'parallel-planned', label: '并行 · 已规划', task: parallelPlanned as unknown as Task },
  { key: 'linear-completed', label: '线性 · 已完成', task: linearCompleted as unknown as Task },
  { key: 'parallel-completed', label: '并行 · 已完成', task: parallelCompleted as unknown as Task },
  {
    key: 'waiting-activity',
    label: '活动语义 · 工作中/排队中',
    task: waitingActivityTask as unknown as Task,
  },
  { key: 'failed', label: '已失败', task: failedTask as unknown as Task },
];

export default function FixturePreview() {
  const [selectedKey, setSelectedKey] = useState(SCENARIOS[0].key);
  const scenario = SCENARIOS.find((candidate) => candidate.key === selectedKey) ?? SCENARIOS[0];
  const task = scenario.task;
  const plan = task.execution_plan;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="Fixture 预览（开发专用）" description="捕获自后端契约快照的固定响应" />

      <div className="border-b border-amber-200/60 bg-amber-50/80 px-6 py-2 sm:px-8">
        <p className="mx-auto flex max-w-5xl items-center gap-2 text-xs leading-relaxed text-amber-800">
          <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
          以下内容为捕获的后端 Fixture 数据，仅用于视觉与拓扑渲染验证，不代表当前后端状态。
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap gap-2">
            {SCENARIOS.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                onClick={() => setSelectedKey(candidate.key)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 ${
                  candidate.key === selectedKey
                    ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-700'
                }`}
              >
                {candidate.label}
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} activityPhase={task.activity_phase} />
              {plan ? <PlanStatusBadge status={plan.status} /> : null}
              <span className="font-mono text-xs text-slate-400">{task.task_id}</span>
            </div>
            <p className="text-sm leading-relaxed text-slate-700">{task.request}</p>
            {task.result_summary ? (
              <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-700">
                {task.result_summary}
              </p>
            ) : null}
          </section>

          {plan ? (
            <>
              <section className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
                <p className="text-sm leading-relaxed text-slate-700">{plan.summary}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  依赖计数 [{plan.steps.map((step) => step.dependency_step_ids.length).join(', ')}] ·
                  初始输入契约 {plan.initial_input_contracts.length} 项
                </p>
              </section>
              <PlanGraph steps={plan.steps} />
            </>
          ) : null}

          {task.assignments.length > 0 ? (
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
                  <AssignmentStatusBadge
                    status={assignment.status}
                    activityPhase={assignment.activity_phase}
                  />
                  {assignment.result_summary ? (
                    <DeliverySummary summary={assignment.result_summary} />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          <section className="space-y-3 border-t border-slate-200 pt-6">
            <div>
              <h2 className="text-base font-bold text-slate-800">组织媒体要求 · Excel / CSV</h2>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                后端从自然语言需求归一化后的岗位格式要求；未声明格式的普通组织不会显示这一块。
              </p>
              <p className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                {(organizationMediaProposal as unknown as OrganizationVersion).source_request}
              </p>
            </div>
            <OrganizationGraph
              spec={(organizationMediaProposal as unknown as OrganizationVersion).spec}
            />
            <FeasibilityPanel checks={[organizationMediaCheck as unknown as FeasibilityCheck]} />
          </section>
        </div>
      </div>
    </div>
  );
}
