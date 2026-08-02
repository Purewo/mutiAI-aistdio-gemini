/**
 * Read-only operational blueprint for a persisted Task execution plan.
 *
 * Execution edges come exclusively from `plan_step_id` and `dependency_step_ids`. Organization
 * context comes exclusively from the frozen OrganizationSpec when the caller has it. The two
 * relation layers remain visually separate and the component does not infer feedback, Retry, or
 * Replay edges that are not present in the backend contract.
 */
import {
  Crown,
  Crosshair,
  Info,
  Maximize2,
  User2,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { OrganizationSpec, PlanStep, TaskGraphProjection } from '../api/types';
import type { ConnectionStatus } from './states';
import { formatDuration } from '../lib/format';
import { PlanStepStatusBadge } from './taskBadges';
import TaskGraphProjectionCanvas from './TaskGraphProjectionCanvas';

interface LayeredStep {
  step: PlanStep;
  depth: number;
}

interface BlueprintLane {
  roleKey: string;
  displayName: string;
  reportsTo: string | null;
  reportsToName: string | null;
  isLead: boolean;
  top: number;
  height: number;
  centerY: number;
}

interface BlueprintNode {
  step: PlanStep;
  depth: number;
  x: number;
  y: number;
  lane: BlueprintLane;
  replayDisposition?: 'executed' | 'reused';
}

interface BlueprintEdge {
  sourceId: string;
  targetId: string;
  path: string;
}

interface BlueprintLayout {
  width: number;
  height: number;
  lanes: BlueprintLane[];
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
  layers: LayeredStep[][];
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

const NODE_WIDTH = 256;
const NODE_HEIGHT = 140;
const NODE_GAP_Y = 24;
const COLUMN_GAP = 138;
const LABEL_WIDTH = 190;
const CANVAS_PADDING_X = 58;
const LANE_PADDING_Y = 28;
const LANE_GAP = 12;
const MIN_LANE_HEIGHT = 196;
const MIN_CANVAS_WIDTH = 940;
const MIN_SCALE = 0.34;
const MAX_SCALE = 1.45;
const EMPTY_STEP_KEYS: readonly string[] = [];

/** Missing dependencies stay visible at depth zero; malformed cycles cannot hang the page. */
function layerSteps(steps: readonly PlanStep[]): LayeredStep[][] {
  const byId = new Map(steps.map((step) => [step.plan_step_id, step]));
  const depths = new Map<string, number>();

  const resolveDepth = (step: PlanStep, seen: Set<string>): number => {
    const known = depths.get(step.plan_step_id);
    if (known !== undefined) return known;
    if (seen.has(step.plan_step_id)) return 0;

    const nextSeen = new Set(seen);
    nextSeen.add(step.plan_step_id);
    let depth = 0;
    for (const dependencyId of step.dependency_step_ids) {
      const dependency = byId.get(dependencyId);
      if (dependency) depth = Math.max(depth, resolveDepth(dependency, nextSeen) + 1);
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

function outputContractKey(contract: Record<string, unknown>, index: number): string {
  return typeof contract.contract_key === 'string' ? contract.contract_key : `输出 ${index + 1}`;
}

function describeTopology(layers: LayeredStep[][]): string {
  const widths = layers.map((layer) => layer.length);
  if (widths.length === 0) return '';
  if (widths.every((width) => width === 1)) {
    return `严格线性 · ${widths.length} 个步骤依次交付`;
  }
  const widest = Math.max(...widths);
  if (widths.length === 2 && widths[0] > 1 && widths[1] === 1) {
    return `并行汇合 · ${widths[0]} 个岗位同时推进后进入负责人审核`;
  }
  return `混合 DAG · ${widths.length} 个依赖波次，最大并行度 ${widest}`;
}

function buildLayout(
  steps: readonly PlanStep[],
  organizationSpec: OrganizationSpec | undefined,
  replayed: ReadonlySet<string>,
  reused: ReadonlySet<string>,
): BlueprintLayout {
  const layers = layerSteps(steps);
  const depthById = new Map(
    layers.flatMap((layer) => layer.map(({ step, depth }) => [step.plan_step_id, depth] as const)),
  );
  const roleSpecByKey = new Map(
    (organizationSpec?.roles ?? []).map((role) => [role.role_key, role] as const),
  );
  const roleOrder = new Map(
    (organizationSpec?.roles ?? []).map((role, index) => [role.role_key, index] as const),
  );
  const roleKeys = [...new Set([...steps].sort((a, b) => a.sequence - b.sequence).map((step) => step.role_key))];

  roleKeys.sort((left, right) => {
    const leftLead = roleSpecByKey.get(left)?.is_lead || steps.some((step) => step.role_key === left && step.step_kind === 'lead_review');
    const rightLead = roleSpecByKey.get(right)?.is_lead || steps.some((step) => step.role_key === right && step.step_kind === 'lead_review');
    if (leftLead !== rightLead) return leftLead ? -1 : 1;
    const leftOrder = roleOrder.get(left);
    const rightOrder = roleOrder.get(right);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return left.localeCompare(right);
  });

  const bucketCount = new Map<string, number>();
  for (const step of steps) {
    const key = `${step.role_key}:${depthById.get(step.plan_step_id) ?? 0}`;
    bucketCount.set(key, (bucketCount.get(key) ?? 0) + 1);
  }

  const laneByRole = new Map<string, BlueprintLane>();
  const lanes: BlueprintLane[] = [];
  let nextLaneTop = 18;
  for (const roleKey of roleKeys) {
    const maxBucketSize = Math.max(
      1,
      ...[...bucketCount.entries()]
        .filter(([key]) => key.startsWith(`${roleKey}:`))
        .map(([, count]) => count),
    );
    const contentHeight = maxBucketSize * NODE_HEIGHT + (maxBucketSize - 1) * NODE_GAP_Y;
    const height = Math.max(MIN_LANE_HEIGHT, contentHeight + LANE_PADDING_Y * 2);
    const role = roleSpecByKey.get(roleKey);
    const reportsToRole = role?.reports_to ? roleSpecByKey.get(role.reports_to) : undefined;
    const lane: BlueprintLane = {
      roleKey,
      displayName: role?.name ?? roleKey,
      reportsTo: role?.reports_to ?? null,
      reportsToName: reportsToRole?.name ?? role?.reports_to ?? null,
      isLead:
        role?.is_lead ??
        steps.some((step) => step.role_key === roleKey && step.step_kind === 'lead_review'),
      top: nextLaneTop,
      height,
      centerY: nextLaneTop + height / 2,
    };
    lanes.push(lane);
    laneByRole.set(roleKey, lane);
    nextLaneTop += height + LANE_GAP;
  }

  const slots = new Map<string, PlanStep[]>();
  for (const step of steps) {
    const key = `${step.role_key}:${depthById.get(step.plan_step_id) ?? 0}`;
    const bucket = slots.get(key) ?? [];
    bucket.push(step);
    bucket.sort((left, right) => left.sequence - right.sequence);
    slots.set(key, bucket);
  }

  const nodes: BlueprintNode[] = [];
  for (const step of steps) {
    const depth = depthById.get(step.plan_step_id) ?? 0;
    const lane = laneByRole.get(step.role_key);
    if (!lane) continue;
    const bucket = slots.get(`${step.role_key}:${depth}`) ?? [step];
    const slot = Math.max(0, bucket.findIndex((candidate) => candidate.plan_step_id === step.plan_step_id));
    const groupHeight = bucket.length * NODE_HEIGHT + (bucket.length - 1) * NODE_GAP_Y;
    const y = lane.top + (lane.height - groupHeight) / 2 + slot * (NODE_HEIGHT + NODE_GAP_Y);
    nodes.push({
      step,
      depth,
      lane,
      x: LABEL_WIDTH + CANVAS_PADDING_X + depth * (NODE_WIDTH + COLUMN_GAP),
      y,
      replayDisposition: reused.has(step.step_key)
        ? 'reused'
        : replayed.has(step.step_key)
          ? 'executed'
          : undefined,
    });
  }

  const nodeById = new Map(nodes.map((node) => [node.step.plan_step_id, node] as const));
  const edges: BlueprintEdge[] = [];
  for (const target of nodes) {
    for (const sourceId of target.step.dependency_step_ids) {
      const source = nodeById.get(sourceId);
      if (!source) continue;
      const sourceX = source.x + NODE_WIDTH;
      const sourceY = source.y + NODE_HEIGHT / 2;
      const targetX = target.x;
      const targetY = target.y + NODE_HEIGHT / 2;
      const distance = Math.max(52, (targetX - sourceX) * 0.46);
      const path = `M ${sourceX} ${sourceY} C ${sourceX + distance} ${sourceY}, ${targetX - distance} ${targetY}, ${targetX} ${targetY}`;
      edges.push({ sourceId, targetId: target.step.plan_step_id, path });
    }
  }

  const maxDepth = Math.max(0, layers.length - 1);
  return {
    width: Math.max(
      MIN_CANVAS_WIDTH,
      LABEL_WIDTH + CANVAS_PADDING_X * 2 + NODE_WIDTH + maxDepth * (NODE_WIDTH + COLUMN_GAP),
    ),
    height: Math.max(350, nextLaneTop + 6),
    lanes,
    nodes,
    edges,
    layers,
  };
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function CanvasButton({
  label,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900/90 text-slate-300 shadow-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-cyan-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function MiniMap({
  layout,
  view,
  viewport,
}: {
  layout: BlueprintLayout;
  view: ViewTransform;
  viewport: { width: number; height: number };
}) {
  const width = 164;
  const height = 92;
  const inset = 6;
  const scale = Math.min((width - inset * 2) / layout.width, (height - inset * 2) / layout.height);
  const offsetX = (width - layout.width * scale) / 2;
  const offsetY = (height - layout.height * scale) / 2;
  const visibleX = -view.x / view.scale;
  const visibleY = -view.y / view.scale;

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 hidden overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-xl backdrop-blur sm:block">
      <svg width={width} height={height} aria-hidden="true">
        {layout.lanes.map((lane, index) => (
          <rect
            key={lane.roleKey}
            x={offsetX}
            y={offsetY + lane.top * scale}
            width={layout.width * scale}
            height={lane.height * scale}
            fill={index % 2 === 0 ? '#111c2d' : '#0c1625'}
          />
        ))}
        {layout.edges.map((edge) => (
          <path
            key={`${edge.sourceId}:${edge.targetId}`}
            d={edge.path}
            transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}
            fill="none"
            stroke="#38bdf8"
            strokeWidth={Math.max(0.8, 2 / scale)}
            opacity="0.55"
          />
        ))}
        {layout.nodes.map((node) => (
          <rect
            key={node.step.plan_step_id}
            x={offsetX + node.x * scale}
            y={offsetY + node.y * scale}
            width={NODE_WIDTH * scale}
            height={NODE_HEIGHT * scale}
            rx="2"
            fill={node.step.step_kind === 'lead_review' ? '#818cf8' : '#38bdf8'}
            opacity="0.9"
          />
        ))}
        <rect
          x={offsetX + Math.max(0, visibleX) * scale}
          y={offsetY + Math.max(0, visibleY) * scale}
          width={Math.min(layout.width, viewport.width / view.scale) * scale}
          height={Math.min(layout.height, viewport.height / view.scale) * scale}
          rx="3"
          fill="none"
          stroke="#f8fafc"
          strokeWidth="1.5"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}

function StepNode({
  node,
  selected,
  compact,
  onSelect,
}: {
  node: BlueprintNode;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const { step, lane, replayDisposition } = node;
  const isLeadReview = step.step_kind === 'lead_review';
  const isActive = ['submitted', 'queued', 'working', 'waiting_result', 'waiting_approval', 'waiting_external', 'validating_output'].includes(
    step.activity_phase,
  );

  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${lane.displayName}：${step.objective}`}
      className={`absolute flex flex-col rounded-2xl border p-3.5 text-left shadow-2xl transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 ${
        selected
          ? 'border-cyan-300 bg-slate-800 ring-2 ring-cyan-300/30'
          : isLeadReview
            ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-950 to-slate-900 hover:border-indigo-300'
            : 'border-slate-600/80 bg-gradient-to-br from-slate-800 to-slate-900 hover:border-cyan-400/60'
      } ${replayDisposition === 'reused' ? 'border-dashed opacity-75' : ''} ${
        isActive ? 'shadow-cyan-950/80 ring-1 ring-cyan-400/25' : 'shadow-black/30'
      }`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <span
        aria-hidden="true"
        className={`absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-950 ${
          isLeadReview ? 'bg-indigo-400' : 'bg-cyan-400'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-950 ${
          isLeadReview ? 'bg-indigo-400' : 'bg-cyan-400'
        }`}
      />

      <span className="flex min-w-0 items-start gap-2.5">
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
            isLeadReview
              ? 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200'
              : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
          }`}
        >
          {isLeadReview ? (
            <Crown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <User2 className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {isLeadReview ? '负责人审核' : lane.displayName}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white" title={step.step_key}>
            {step.step_key}
          </span>
        </span>
        <PlanStepStatusBadge status={step.status} activityPhase={step.activity_phase} />
      </span>

      {!compact ? (
        <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">
          {step.objective}
        </span>
      ) : (
        <span className="mt-3 text-[11px] font-medium text-slate-400">缩放后显示摘要</span>
      )}

      <span className="mt-auto flex items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-400">
        <span>{step.dependency_step_ids.length} 个上游</span>
        <span aria-hidden="true">·</span>
        <span>{step.output_contracts.length} 项交付</span>
        {replayDisposition ? (
          <span className="ml-auto font-semibold text-violet-300">
            {replayDisposition === 'reused' ? '固定复用' : '本次执行'}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function StepInspector({
  node,
  dependencyNames,
  onClose,
}: {
  node: BlueprintNode;
  dependencyNames: string[];
  onClose: () => void;
}) {
  const { step, lane } = node;
  return (
    <aside className="absolute inset-x-2 bottom-2 z-30 max-h-[76%] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-slate-950/95 p-4 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-80">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">
            {step.step_kind === 'lead_review' ? '负责人审核' : lane.displayName}
          </p>
          <h4 className="mt-1 break-words text-sm font-semibold text-white">{step.step_key}</h4>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20"
          aria-label="关闭步骤详情"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="mt-3">
        <PlanStepStatusBadge status={step.status} activityPhase={step.activity_phase} />
      </div>

      <dl className="mt-4 space-y-4 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold text-slate-400">任务目标</dt>
          <dd className="mt-1 text-slate-200">{step.objective}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">验收标准</dt>
          <dd className="mt-1 text-slate-200">{step.acceptance_criteria}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">组织上下文</dt>
          <dd className="mt-1 text-slate-200">
            {lane.reportsToName ? `向 ${lane.reportsToName} 汇报` : lane.isLead ? '组织负责人' : '当前版本未声明上级'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">上游步骤</dt>
          <dd className="mt-1 text-slate-200">
            {dependencyNames.length > 0 ? dependencyNames.join('、') : '无上游依赖，可在首个就绪波启动'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">输入契约</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {step.input_contracts.length > 0 ? (
              step.input_contracts.map((contract) => (
                <span key={contract} className="break-all rounded-md border border-blue-400/20 bg-blue-400/10 px-2 py-1 font-mono text-[10px] text-blue-200">
                  {contract}
                </span>
              ))
            ) : (
              <span className="text-slate-500">无</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">输出契约</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {step.output_contracts.length > 0 ? (
              step.output_contracts.map((contract, index) => {
                const key = outputContractKey(contract, index);
                return (
                  <span key={key} className="break-all rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 font-mono text-[10px] text-emerald-200">
                    {key}
                  </span>
                );
              })
            ) : (
              <span className="text-slate-500">无</span>
            )}
          </dd>
        </div>
      </dl>

      {step.dependency_wait_seconds !== null || step.active_duration_seconds !== null ? (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-white/10 pt-4 text-xs">
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-slate-500">等待依赖</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-200">
              {formatDuration(step.dependency_wait_seconds)}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 p-3">
            <p className="text-slate-500">执行耗时</p>
            <p className="mt-1 font-semibold tabular-nums text-slate-200">
              {formatDuration(step.active_duration_seconds)}
            </p>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function PlanGraphSteps({
  steps,
  organizationSpec,
  replayExecutedStepKeys = EMPTY_STEP_KEYS,
  replayReusedStepKeys = EMPTY_STEP_KEYS,
}: {
  steps: readonly PlanStep[];
  organizationSpec?: OrganizationSpec;
  replayExecutedStepKeys?: readonly string[];
  replayReusedStepKeys?: readonly string[];
}) {
  const replayed = useMemo(() => new Set(replayExecutedStepKeys), [replayExecutedStepKeys]);
  const reused = useMemo(() => new Set(replayReusedStepKeys), [replayReusedStepKeys]);
  const layout = useMemo(
    () => buildLayout(steps, organizationSpec, replayed, reused),
    [organizationSpec, replayed, reused, steps],
  );
  const nodeById = useMemo(
    () => new Map(layout.nodes.map((node) => [node.step.plan_step_id, node] as const)),
    [layout.nodes],
  );
  const nameById = useMemo(
    () => new Map(steps.map((step) => [step.plan_step_id, step.step_key] as const)),
    [steps],
  );
  const topology = describeTopology(layout.layers);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 20, y: 20, scale: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedNode = selectedId ? nodeById.get(selectedId) ?? null : null;
  const activeNode = layout.nodes.find((node) =>
    ['submitted', 'queued', 'working', 'waiting_result', 'waiting_approval', 'waiting_external', 'validating_output'].includes(
      node.step.activity_phase,
    ),
  );

  const fitView = useCallback(() => {
    const element = viewportRef.current;
    if (!element) return;
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width <= 0 || height <= 0) return;
    const padding = width < 640 ? 18 : 42;
    const scale = clampScale(
      Math.min((width - padding * 2) / layout.width, (height - padding * 2) / layout.height, 1.04),
    );
    setView({
      scale,
      x: (width - layout.width * scale) / 2,
      y: (height - layout.height * scale) / 2,
    });
  }, [layout.height, layout.width]);

  useLayoutEffect(() => {
    fitView();
  }, [fitView]);

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedId && !nodeById.has(selectedId)) setSelectedId(null);
  }, [nodeById, selectedId]);

  const zoomBy = (factor: number) => {
    const element = viewportRef.current;
    if (!element) return;
    const centerX = element.clientWidth / 2;
    const centerY = element.clientHeight / 2;
    setView((current) => {
      const scale = clampScale(current.scale * factor);
      const worldX = (centerX - current.x) / current.scale;
      const worldY = (centerY - current.y) / current.scale;
      return {
        scale,
        x: centerX - worldX * scale,
        y: centerY - worldY * scale,
      };
    });
  };

  const centerNode = (node: BlueprintNode | undefined) => {
    const element = viewportRef.current;
    if (!element || !node) return;
    setView((current) => ({
      ...current,
      x: element.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * current.scale,
      y: element.clientHeight / 2 - (node.y + NODE_HEIGHT / 2) * current.scale,
    }));
    setSelectedId(node.step.plan_step_id);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    setDragging(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  if (steps.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
        执行计划中还没有可展示的步骤。
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-800 bg-[#07111e] text-slate-100 shadow-xl shadow-slate-300/30">
      <header className="border-b border-white/10 bg-slate-950/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
              <Workflow className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-wide text-white">运行蓝图</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {topology} · {layout.lanes.length} 个岗位泳道 · {layout.edges.length} 条真实依赖
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400 xl:ml-auto">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-7 rounded bg-cyan-400" />
              执行交付
            </span>
            {organizationSpec ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-7 border-t border-dashed border-slate-500" />
                组织汇报
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              当前仅显示后端已确认的关系
            </span>
          </div>
        </div>
      </header>

      <div
        ref={viewportRef}
        className={`relative h-[500px] select-none overflow-hidden touch-none sm:h-[560px] ${
          dragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        role="region"
        aria-label="执行计划只读二维画布"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div
          className="absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.28)_1px,transparent_0)] [background-size:22px_22px]"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          }}
        >
          <svg className="absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id="plan-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="#38bdf8" />
              </marker>
              <filter id="plan-edge-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {layout.lanes.map((lane, index) => (
              <g key={lane.roleKey}>
                <rect
                  x="8"
                  y={lane.top}
                  width={layout.width - 16}
                  height={lane.height}
                  rx="18"
                  fill={index % 2 === 0 ? 'rgba(15, 30, 48, 0.72)' : 'rgba(11, 23, 38, 0.72)'}
                  stroke="rgba(148, 163, 184, 0.10)"
                />
                <line
                  x1={LABEL_WIDTH}
                  y1={lane.top + 18}
                  x2={LABEL_WIDTH}
                  y2={lane.top + lane.height - 18}
                  stroke="rgba(148, 163, 184, 0.16)"
                />
              </g>
            ))}

            {organizationSpec
              ? layout.lanes.map((lane) => {
                  if (!lane.reportsTo) return null;
                  const parent = layout.lanes.find((candidate) => candidate.roleKey === lane.reportsTo);
                  if (!parent) return null;
                  return (
                    <path
                      key={`${lane.roleKey}:${parent.roleKey}`}
                      d={`M 28 ${lane.centerY} H 18 V ${parent.centerY} H 28`}
                      fill="none"
                      stroke="#64748b"
                      strokeWidth="1.5"
                      strokeDasharray="5 5"
                      opacity="0.75"
                    />
                  );
                })
              : null}

            {layout.edges.map((edge) => (
              <g key={`${edge.sourceId}:${edge.targetId}`}>
                <path
                  d={edge.path}
                  fill="none"
                  stroke="#0e7490"
                  strokeWidth="7"
                  opacity="0.18"
                />
                <path
                  d={edge.path}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2.25"
                  markerEnd="url(#plan-edge-arrow)"
                  filter="url(#plan-edge-glow)"
                />
              </g>
            ))}
          </svg>

          {layout.lanes.map((lane) => (
            <div
              key={lane.roleKey}
              className="absolute left-8 flex w-[138px] -translate-y-1/2 flex-col"
              style={{ top: lane.centerY }}
            >
              <span className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                {lane.isLead ? (
                  <Crown className="h-4 w-4 flex-shrink-0 text-indigo-300" aria-hidden="true" />
                ) : (
                  <User2 className="h-4 w-4 flex-shrink-0 text-cyan-300" aria-hidden="true" />
                )}
                <span className="truncate" title={lane.displayName}>{lane.displayName}</span>
              </span>
              {lane.reportsToName ? (
                <span className="mt-1 truncate pl-6 text-[10px] text-slate-500" title={`向 ${lane.reportsToName} 汇报`}>
                  向 {lane.reportsToName} 汇报
                </span>
              ) : (
                <span className="mt-1 pl-6 text-[10px] text-slate-500">
                  {lane.isLead ? '组织负责人' : '执行岗位'}
                </span>
              )}
            </div>
          ))}

          {layout.nodes.map((node) => (
            <StepNode
              key={node.step.plan_step_id}
              node={node}
              selected={selectedId === node.step.plan_step_id}
              compact={view.scale < 0.64}
              onSelect={() => setSelectedId(node.step.plan_step_id)}
            />
          ))}
        </div>

        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2">
          <CanvasButton label="放大画布" onClick={() => zoomBy(1.18)}>
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <CanvasButton label="缩小画布" onClick={() => zoomBy(1 / 1.18)}>
            <ZoomOut className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <CanvasButton label="适应全部节点" onClick={fitView}>
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <CanvasButton
            label="聚焦当前工作节点"
            disabled={!activeNode}
            onClick={() => centerNode(activeNode)}
          >
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <span className="rounded-lg bg-slate-950/75 px-2 py-1 text-center text-[10px] tabular-nums text-slate-500">
            {Math.round(view.scale * 100)}%
          </span>
        </div>

        <MiniMap layout={layout} view={view} viewport={viewportSize} />

        {selectedNode ? (
          <StepInspector
            node={selectedNode}
            dependencyNames={selectedNode.step.dependency_step_ids.map(
              (id) => nameById.get(id) ?? '未解析的上游步骤',
            )}
            onClose={() => setSelectedId(null)}
          />
        ) : null}
      </div>

      <footer className="flex flex-col gap-1 border-t border-white/10 bg-slate-950/40 px-4 py-3 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>拖动画布查看完整关系；点击节点查看验收、契约和耗时。</span>
        <span>只读预览 · 不支持拖拽节点、连线或编辑计划</span>
      </footer>
    </section>
  );
}

export default function PlanGraph({
  steps,
  organizationSpec,
  projection,
  syncStatus,
  replayExecutedStepKeys = EMPTY_STEP_KEYS,
  replayReusedStepKeys = EMPTY_STEP_KEYS,
}: {
  steps: readonly PlanStep[];
  organizationSpec?: OrganizationSpec;
  projection?: TaskGraphProjection;
  syncStatus?: ConnectionStatus;
  replayExecutedStepKeys?: readonly string[];
  replayReusedStepKeys?: readonly string[];
}) {
  if (projection) {
    return (
      <TaskGraphProjectionCanvas
        projection={projection}
        steps={steps}
        organizationSpec={organizationSpec}
        syncStatus={syncStatus}
        replayExecutedStepKeys={replayExecutedStepKeys}
        replayReusedStepKeys={replayReusedStepKeys}
      />
    );
  }
  return (
    <PlanGraphSteps
      steps={steps}
      organizationSpec={organizationSpec}
      replayExecutedStepKeys={replayExecutedStepKeys}
      replayReusedStepKeys={replayReusedStepKeys}
    />
  );
}
