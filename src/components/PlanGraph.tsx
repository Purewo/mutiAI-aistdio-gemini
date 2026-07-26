/**
 * Renders a persisted TaskExecutionPlan as a layered dependency graph.
 *
 * Edges come exclusively from each step's `plan_step_id` and `dependency_step_ids`; array order is
 * never used to infer topology. Steps are layered by dependency depth, so the two contracted M2.3
 * shapes render naturally: a strict-linear chain becomes one column of single-step layers, and a
 * parallel fan-out becomes one wide layer of specialists joined by the lead-review layer. The
 * component draws whatever the persisted edges describe and offers no editing.
 */
import { ChevronRight, Crown, User2, Workflow } from 'lucide-react';
import type { PlanStep } from '../api/types';
import { PlanStepStatusBadge } from './taskBadges';

interface LayeredStep {
  step: PlanStep;
  depth: number;
}

/** Layer steps by dependency depth. Steps whose dependencies are missing from the plan land at 0. */
function layerSteps(steps: readonly PlanStep[]): LayeredStep[][] {
  const byId = new Map(steps.map((step) => [step.plan_step_id, step]));
  const depths = new Map<string, number>();

  const resolveDepth = (step: PlanStep, seen: Set<string>): number => {
    const known = depths.get(step.plan_step_id);
    if (known !== undefined) return known;
    // A dependency cycle cannot occur in a validated plan; guard so a malformed one cannot hang us.
    if (seen.has(step.plan_step_id)) return 0;
    seen.add(step.plan_step_id);

    let depth = 0;
    for (const dependencyId of step.dependency_step_ids) {
      const dependency = byId.get(dependencyId);
      if (dependency) depth = Math.max(depth, resolveDepth(dependency, seen) + 1);
    }
    depths.set(step.plan_step_id, depth);
    return depth;
  };

  for (const step of steps) resolveDepth(step, new Set());

  const layers: LayeredStep[][] = [];
  for (const step of steps) {
    const depth = depths.get(step.plan_step_id) ?? 0;
    while (layers.length <= depth) layers.push([]);
    layers[depth].push({ step, depth });
  }
  return layers;
}

function StepCard({ step, dependencyNames }: { step: PlanStep; dependencyNames: string[] }) {
  const isLeadReview = step.step_kind === 'lead_review';
  return (
    <div
      className={`flex h-full w-60 flex-col rounded-2xl border p-3.5 text-left shadow-sm ${
        isLeadReview ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
            isLeadReview
              ? 'border-indigo-200 bg-white text-indigo-600'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          {isLeadReview ? (
            <Crown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <User2 className="h-4 w-4" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{step.step_key}</p>
          <p className="truncate font-mono text-[11px] text-slate-400">岗位 {step.role_key}</p>
        </div>
        <PlanStepStatusBadge status={step.status} />
      </div>

      {/* Wrappers keep line-clamp working: it needs display:-webkit-box, which a flex child loses. */}
      <div className="mb-1">
        <p className="line-clamp-2 text-xs leading-relaxed text-slate-600" title={step.objective}>
          {step.objective}
        </p>
      </div>
      <div className="mb-2">
        <p
          className="line-clamp-2 text-[11px] leading-relaxed text-slate-400"
          title={step.acceptance_criteria}
        >
          验收：{step.acceptance_criteria}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-1">
        {isLeadReview ? (
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            负责人评审
          </span>
        ) : null}
        {dependencyNames.length > 0 ? (
          <span
            className="truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500"
            title={`依赖持久化步骤：${dependencyNames.join('、')}`}
          >
            依赖 {dependencyNames.join('、')}
          </span>
        ) : (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">
            无依赖
          </span>
        )}
        {step.input_contracts.map((contract) => (
          <span
            key={contract}
            className="truncate rounded-full border border-blue-200/60 bg-blue-50 px-2 py-0.5 font-mono text-[10px] text-blue-700"
            title={`输入契约 ${contract}`}
          >
            入 {contract}
          </span>
        ))}
        {step.output_contracts.map((contract, index) => {
          const key = typeof contract.contract_key === 'string' ? contract.contract_key : `#${index}`;
          return (
            <span
              key={key}
              className="truncate rounded-full border border-emerald-200/60 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] text-emerald-700"
              title={`输出契约 ${key}`}
            >
              出 {key}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Describe the shape the persisted dependencies actually form, so a reader does not have to infer
 * concurrency from the layout. Only the two contracted M2.3 shapes are named; anything else is
 * reported neutrally rather than guessed at.
 */
function describeTopology(layers: LayeredStep[][]): string {
  const widths = layers.map((layer) => layer.length);
  if (widths.length === 0) return '';
  if (widths.every((w) => w === 1)) {
    return `严格线性：${widths.length} 个步骤依次执行，每一步都要等上一步完成。`;
  }
  const widest = Math.max(...widths);
  return `并行分支：最宽一层有 ${widest} 个步骤可同时执行，其余按依赖先后进行。`;
}

export default function PlanGraph({ steps }: { steps: readonly PlanStep[] }) {
  const layers = layerSteps(steps);
  const nameById = new Map(steps.map((step) => [step.plan_step_id, step.step_key]));
  const topology = describeTopology(layers);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white/80 p-6 shadow-sm">
      {topology ? (
        <p className="mb-5 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500">
          <Workflow className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            <strong className="font-semibold">执行顺序</strong>（由持久化的步骤依赖决定）：
            {topology}
          </span>
        </p>
      ) : null}

      {/*
        Layers flow left to right, which matches how a pipeline reads and uses the width a desktop
        actually has instead of turning a four-step chain into a long vertical scroll. Steps that
        share a layer stack vertically inside their column, so a parallel fan-out still reads as one
        stage. The container scrolls horizontally when a plan outgrows the viewport.
      */}
      <div className="flex min-w-max items-stretch">
        {layers.map((layer, index) => (
          <div key={index} className="flex items-stretch">
            {/* A directed connector: these stages run in sequence, they are not alternatives. */}
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="flex w-10 flex-shrink-0 items-center justify-center self-center text-slate-300"
              >
                <span className="h-px w-5 bg-current" />
                <ChevronRight className="-ml-1.5 h-4 w-4" />
              </span>
            ) : null}
            <ul className="flex flex-col justify-center gap-4">
              {layer.map(({ step }) => (
                <li key={step.plan_step_id}>
                  <StepCard
                    step={step}
                    dependencyNames={step.dependency_step_ids.map(
                      (id) => nameById.get(id) ?? id.slice(0, 8),
                    )}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
