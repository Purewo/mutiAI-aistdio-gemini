import {
  BadgeCheck,
  Box,
  Crosshair,
  Crown,
  Cpu,
  FileOutput,
  Info,
  Link2,
  Maximize2,
  MessageSquareWarning,
  PackageCheck,
  Radio,
  Repeat2,
  User2,
  Workflow,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type {
  OrganizationSpec,
  PlanStep,
  TaskGraphEdge,
  TaskGraphNode,
  TaskGraphProjection,
  TaskGraphRelation,
  TaskGraphRole,
} from '../api/types';
import type { ConnectionStatus } from './states';

const NODE_WIDTH = 236;
const NODE_HEIGHT = 122;
const NODE_GAP_Y = 22;
const COLUMN_GAP = 128;
const LABEL_WIDTH = 190;
const CANVAS_PADDING_X = 56;
const LANE_PADDING_Y = 24;
const LANE_GAP = 12;
const MIN_LANE_HEIGHT = 176;
const MIN_CANVAS_WIDTH = 900;
// Keep transformed node cards above the 44 px mobile hit-target floor. The canvas remains pannable
// when fitting the whole topology would otherwise shrink interactive nodes below that boundary.
const MIN_SCALE = 0.37;
const MAX_SCALE = 1.45;
const INITIAL_READABLE_SCALE = 0.58;
const COORDINATION_ROLE = '__coordination__';
const FEEDBACK_RAIL_X = LABEL_WIDTH + 28;
const ACTIVE_STATUSES = new Set([
  'ready',
  'submitted',
  'running',
  'waiting',
  'queued',
  'working',
  'waiting_result',
  'waiting_approval',
  'waiting_external',
  'validating_output',
]);

type RelationMeta = {
  label: string;
  color: string;
  dash?: string;
  icon: typeof Workflow;
};

const RELATION_META: Record<TaskGraphRelation, RelationMeta> = {
  dependency: { label: '依赖', color: 'var(--graph-relation-dependency)', icon: Workflow },
  artifact_handoff: { label: '产物交付', color: 'var(--graph-relation-artifact)', icon: FileOutput },
  feedback: { label: '反馈', color: 'var(--graph-relation-feedback)', dash: '8 5', icon: MessageSquareWarning },
  verification: { label: '验证', color: 'var(--graph-relation-verification)', dash: '2 6', icon: BadgeCheck },
  retry: { label: '重试', color: 'var(--graph-relation-retry)', dash: '10 5', icon: Repeat2 },
  replay_reuse: { label: '重放复用', color: 'var(--graph-relation-replay)', dash: '3 5', icon: PackageCheck },
  incremental_handoff: { label: '增量交付', color: 'var(--graph-relation-incremental)', icon: FileOutput },
  finalization: { label: '最终确认', color: 'var(--graph-relation-finalization)', dash: '2 5', icon: BadgeCheck },
  stream_subscription: { label: '流订阅', color: 'var(--graph-relation-subscription)', dash: '8 4', icon: Workflow },
  delivery_binding: { label: '精确绑定', color: 'var(--graph-relation-binding)', dash: '4 4', icon: Link2 },
  keyed_execution: { label: '分区执行', color: 'var(--graph-relation-keyed)', icon: Cpu },
  watermark_convergence: { label: '水位线汇合', color: 'var(--graph-relation-watermark)', dash: '2 4', icon: BadgeCheck },
  incremental_output: { label: '增量产出', color: 'var(--graph-relation-output)', icon: FileOutput },
};

type Lane = {
  roleKey: string;
  displayName: string;
  responsibility: string;
  reportsTo: string | null;
  reportsToName: string | null;
  isLead: boolean;
  top: number;
  height: number;
  centerY: number;
};

type LayoutNode = {
  node: TaskGraphNode;
  resourceKey: string;
  roleKey: string;
  label: string;
  lane: Lane;
  x: number;
  y: number;
  depth: number;
  step: PlanStep | undefined;
};

type LayoutEdge = TaskGraphEdge & {
  sourceNodeId: string;
  targetNodeId: string;
  path: string;
  labelX: number;
  labelY: number;
};

type Layout = {
  width: number;
  height: number;
  lanes: Lane[];
  nodes: LayoutNode[];
  edges: LayoutEdge[];
};

type ViewTransform = { x: number; y: number; scale: number };

function resourceKey(type: string, id: string): string {
  return `${type}:${id}`;
}

function nodeResourceKey(node: TaskGraphNode): string {
  return resourceKey(node.resource.resource_type, node.resource.resource_id);
}

function resourceLabel(node: TaskGraphNode): string {
  return (
    node.resource.label ??
    node.step_key ??
    node.work_item_kind ??
    ({ task: '任务', plan_step: '计划步骤', assignment: '岗位分配', artifact: '产物', case: '反馈 Case', work_item: '待处理事项', artifact_stream: '增量流', artifact_delivery: '流交付', stream_finalization: '最终确认', stream_finalization_attempt: '最终确认尝试', plan_step_execution: '分区执行', delivery_input_binding: 'Delivery 输入绑定' }[
      node.resource.resource_type
    ] ?? '产品资源')
  );
}

function statusLabel(status: string): string {
  return (
    {
      ready: '就绪',
      pending: '待处理',
      pending_dependency: '等待依赖',
      queued: '排队中',
      submitted: '已提交',
      working: '工作中',
      in_progress: '处理中',
      delivered: '已送达',
      acknowledged: '已接收',
      waiting: '等待中',
      waiting_verification: '等待验证',
      assigned: '已分派',
      waiting_result: '等待结果',
      waiting_approval: '等待审批',
      waiting_external: '等待外部',
      validating_output: '校验产出',
      succeeded: '已完成',
      completed: '已完成',
      released: '已发布',
      declared: '已声明',
      open: '已打开',
      finalizing: '最终确认中',
      finalized: '已最终确认',
      accepted: '已接受',
      active: '已启用',
      disabled: '已停用',
      rejected: '已拒绝',
      requested: '已请求',
      running: '运行中',
      exhausted: '已耗尽',
      resolved: '已解决',
      failed: '失败',
      cancelled: '已取消',
      human_required: '需要人工',
      abandoned: '已放弃',
    }[status] ?? status
  );
}

function roleFromProjection(
  projection: TaskGraphProjection,
  organizationSpec: OrganizationSpec | undefined,
): Map<string, TaskGraphRole> {
  const roles = new Map(projection.roles.map((role) => [role.role_key, role] as const));
  // The projection is authoritative. OrganizationSpec is only a compatibility fallback for an
  // older projection that omitted role context; it is never used to invent graph edges.
  if (roles.size === 0) {
    for (const role of organizationSpec?.roles ?? []) {
      roles.set(role.role_key, {
        role_key: role.role_key,
        name: role.name,
        responsibility: role.responsibility,
        is_lead: role.is_lead,
        reports_to: role.reports_to,
      });
    }
  }
  return roles;
}

function buildLayout(
  projection: TaskGraphProjection,
  steps: readonly PlanStep[],
  organizationSpec: OrganizationSpec | undefined,
): Layout {
  const sortedNodes = [...projection.nodes].sort((left, right) => left.node_id.localeCompare(right.node_id));
  const nodeByResource = new Map(sortedNodes.map((node) => [nodeResourceKey(node), node] as const));
  const stepById = new Map(steps.map((step) => [step.plan_step_id, step] as const));
  const relevantEdges = projection.edges.filter(
    (edge) => edge.relation !== 'retry' && edge.relation !== 'feedback',
  );
  const incoming = new Map<string, TaskGraphEdge[]>();
  for (const edge of relevantEdges) {
    const target = nodeByResource.get(resourceKey(edge.target.resource_type, edge.target.resource_id));
    const source = nodeByResource.get(resourceKey(edge.source.resource_type, edge.source.resource_id));
    if (!source || !target || source.node_id === target.node_id) continue;
    const edges = incoming.get(target.node_id) ?? [];
    edges.push(edge);
    incoming.set(target.node_id, edges);
  }
  const depthCache = new Map<string, number>();
  const depthFor = (nodeId: string, seen: Set<string>): number => {
    const cached = depthCache.get(nodeId);
    if (cached !== undefined) return cached;
    if (seen.has(nodeId)) return 0;
    const nextSeen = new Set(seen);
    nextSeen.add(nodeId);
    const depth = Math.min(
      sortedNodes.length,
      Math.max(
        0,
        ...(incoming.get(nodeId) ?? []).map((edge) => {
          const source = nodeByResource.get(resourceKey(edge.source.resource_type, edge.source.resource_id));
          return source ? depthFor(source.node_id, nextSeen) + 1 : 0;
        }),
      ),
    );
    depthCache.set(nodeId, depth);
    return depth;
  };
  for (const node of sortedNodes) depthFor(node.node_id, new Set());

  const roles = roleFromProjection(projection, organizationSpec);
  const hasCoordination = sortedNodes.some((node) => !node.role_key || !roles.has(node.role_key));
  const roleKeys = [...roles.keys()];
  if (hasCoordination) roleKeys.push(COORDINATION_ROLE);
  roleKeys.sort((left, right) => {
    if (left === COORDINATION_ROLE) return 1;
    if (right === COORDINATION_ROLE) return -1;
    const leftRole = roles.get(left);
    const rightRole = roles.get(right);
    if (leftRole?.is_lead !== rightRole?.is_lead) return leftRole?.is_lead ? -1 : 1;
    return left.localeCompare(right);
  });

  const roleToLane = new Map<string, Lane>();
  const lanes: Lane[] = [];
  let nextTop = 18;
  for (const roleKey of roleKeys) {
    const role = roles.get(roleKey);
    const displayName = roleKey === COORDINATION_ROLE ? '反馈与证据' : role?.name ?? roleKey;
    const buckets = new Map<number, number>();
    for (const node of sortedNodes) {
      const nodeRole = node.role_key && roles.has(node.role_key) ? node.role_key : COORDINATION_ROLE;
      if (nodeRole !== roleKey) continue;
      const depth = depthCache.get(node.node_id) ?? 0;
      buckets.set(depth, (buckets.get(depth) ?? 0) + 1);
    }
    const maxBucketSize = Math.max(1, ...buckets.values());
    const height = Math.max(
      MIN_LANE_HEIGHT,
      maxBucketSize * NODE_HEIGHT + (maxBucketSize - 1) * NODE_GAP_Y + LANE_PADDING_Y * 2,
    );
    const reportsTo = role?.reports_to ?? null;
    const reportsToName = reportsTo ? roles.get(reportsTo)?.name ?? reportsTo : null;
    const lane: Lane = {
      roleKey,
      displayName,
      responsibility: role?.responsibility ?? '跨岗位协作记录、反馈与验证关系',
      reportsTo,
      reportsToName,
      isLead: role?.is_lead ?? false,
      top: nextTop,
      height,
      centerY: nextTop + height / 2,
    };
    lanes.push(lane);
    roleToLane.set(roleKey, lane);
    nextTop += height + LANE_GAP;
  }

  const buckets = new Map<string, LayoutNode[]>();
  const layoutNodes: LayoutNode[] = [];
  for (const node of sortedNodes) {
    const roleKey = node.role_key && roles.has(node.role_key) ? node.role_key : COORDINATION_ROLE;
    const lane = roleToLane.get(roleKey);
    if (!lane) continue;
    const depth = depthCache.get(node.node_id) ?? 0;
    const bucketKey = `${roleKey}:${depth}`;
    const bucket = buckets.get(bucketKey) ?? [];
    const item: LayoutNode = {
      node,
      resourceKey: nodeResourceKey(node),
      roleKey,
      label: resourceLabel(node),
      lane,
      x: LABEL_WIDTH + CANVAS_PADDING_X + depth * (NODE_WIDTH + COLUMN_GAP),
      y: 0,
      depth,
      step: node.plan_step_id ? stepById.get(node.plan_step_id) : undefined,
    };
    bucket.push(item);
    buckets.set(bucketKey, bucket);
    layoutNodes.push(item);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((left, right) => left.node.node_id.localeCompare(right.node.node_id));
    const groupHeight = bucket.length * NODE_HEIGHT + (bucket.length - 1) * NODE_GAP_Y;
    for (const [index, node] of bucket.entries()) {
      node.y = node.lane.top + (node.lane.height - groupHeight) / 2 + index * (NODE_HEIGHT + NODE_GAP_Y);
    }
  }

  const nodeById = new Map(layoutNodes.map((node) => [node.node.node_id, node] as const));
  const edges: LayoutEdge[] = [];
  for (const [edgeIndex, edge] of projection.edges.entries()) {
    const source = nodeByResource.get(resourceKey(edge.source.resource_type, edge.source.resource_id));
    const target = nodeByResource.get(resourceKey(edge.target.resource_type, edge.target.resource_id));
    if (!source || !target) continue;
    const sourceNode = nodeById.get(source.node_id);
    const targetNode = nodeById.get(target.node_id);
    if (!sourceNode || !targetNode) continue;
    const sourceX = sourceNode.x + NODE_WIDTH;
    const sourceY = sourceNode.y + NODE_HEIGHT / 2;
    const targetX = targetNode.x;
    const targetY = targetNode.y + NODE_HEIGHT / 2;
    let path: string;
    let labelX: number;
    let labelY: number;
    if (sourceNode.node.node_id === targetNode.node.node_id) {
      path = `M ${sourceX - 24} ${sourceY - 16} C ${sourceX + 120} ${sourceY - 92}, ${sourceX + 120} ${sourceY + 92}, ${sourceX - 24} ${sourceY + 16}`;
      labelX = sourceX + 88;
      labelY = sourceY - 2;
    } else if (edge.relation === 'feedback') {
      // Feedback is a control return, not another execution dependency. Route it through a
      // dedicated left-side rail so the loop remains legible and does not cut through step cards.
      const railX = FEEDBACK_RAIL_X - (edgeIndex % 3) * 12;
      const sourceLeft = sourceNode.x;
      const targetLeft = targetNode.x;
      path = `M ${sourceLeft} ${sourceY} C ${railX} ${sourceY}, ${railX} ${targetY}, ${targetLeft} ${targetY}`;
      labelX = railX + 4;
      labelY = (sourceY + targetY) / 2 - 8;
    } else {
      const direction = targetX >= sourceX ? 1 : -1;
      const distance = Math.max(56, Math.abs(targetX - sourceX) * 0.44);
      path = `M ${sourceX} ${sourceY} C ${sourceX + direction * distance} ${sourceY}, ${targetX - direction * distance} ${targetY}, ${targetX} ${targetY}`;
      labelX = (sourceX + targetX) / 2;
      labelY = (sourceY + targetY) / 2 - 8;
    }
    edges.push({
      ...edge,
      sourceNodeId: sourceNode.node.node_id,
      targetNodeId: targetNode.node.node_id,
      path,
      labelX,
      labelY,
    });
  }
  const maxDepth = Math.max(0, ...layoutNodes.map((node) => node.depth));
  return {
    width: Math.max(MIN_CANVAS_WIDTH, LABEL_WIDTH + CANVAS_PADDING_X * 2 + NODE_WIDTH + maxDepth * (NODE_WIDTH + COLUMN_GAP)),
    height: Math.max(350, nextTop + 6),
    lanes,
    nodes: layoutNodes,
    edges,
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
      className="blueprint-control inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 bg-slate-900/90 text-slate-300 shadow-sm backdrop-blur transition hover:border-cyan-400/40 hover:bg-slate-800 hover:text-cyan-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function NodeIcon({ type }: { type: TaskGraphNode['resource']['resource_type'] }) {
  if (type === 'artifact') return <FileOutput className="h-4 w-4" aria-hidden="true" />;
  if (type === 'artifact_stream') return <Radio className="h-4 w-4" aria-hidden="true" />;
  if (type === 'artifact_delivery') return <FileOutput className="h-4 w-4" aria-hidden="true" />;
  if (type === 'stream_finalization') return <BadgeCheck className="h-4 w-4" aria-hidden="true" />;
  if (type === 'stream_finalization_attempt') return <Info className="h-4 w-4" aria-hidden="true" />;
  if (type === 'plan_step_execution') return <Cpu className="h-4 w-4" aria-hidden="true" />;
  if (type === 'delivery_input_binding') return <Link2 className="h-4 w-4" aria-hidden="true" />;
  if (type === 'case' || type === 'work_item') return <MessageSquareWarning className="h-4 w-4" aria-hidden="true" />;
  if (type === 'assignment') return <PackageCheck className="h-4 w-4" aria-hidden="true" />;
  if (type === 'task') return <Box className="h-4 w-4" aria-hidden="true" />;
  return <User2 className="h-4 w-4" aria-hidden="true" />;
}

function typeLabel(type: TaskGraphNode['resource']['resource_type']): string {
  return ({
    task: '任务',
    plan_step: '计划步骤',
    assignment: '岗位分配',
    artifact: '产物',
    case: '反馈 Case',
    work_item: 'WorkItem',
    artifact_stream: 'ArtifactStream',
    artifact_delivery: 'ArtifactDelivery',
    stream_finalization: 'StreamFinalization',
    stream_finalization_attempt: '最终确认尝试',
    plan_step_execution: 'PlanStepExecution',
    delivery_input_binding: 'DeliveryInputBinding',
  }[type]);
}

function ProjectionNodeCard({
  item,
  selected,
  compact,
  replayExecutedStepKeys,
  replayReusedStepKeys,
  onSelect,
}: {
  item: LayoutNode;
  selected: boolean;
  compact: boolean;
  replayExecutedStepKeys: ReadonlySet<string>;
  replayReusedStepKeys: ReadonlySet<string>;
  onSelect: () => void;
}) {
  const { node, lane, step } = item;
  const isLead = lane.isLead || step?.step_kind === 'lead_review';
  const isActive = ACTIVE_STATUSES.has(node.status);
  const isReused = Boolean(step && replayReusedStepKeys.has(step.step_key));
  const isExecuted = Boolean(step && replayExecutedStepKeys.has(step.step_key));
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${typeLabel(node.resource.resource_type)}：${item.label}`}
      className={`blueprint-node absolute flex flex-col rounded-2xl border p-3.5 text-left shadow-2xl transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 ${
        selected
          ? 'border-cyan-300 bg-slate-800 ring-2 ring-cyan-300/30'
          : isLead
            ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-950 to-slate-900 hover:border-indigo-300'
            : node.resource.resource_type === 'artifact' || node.resource.resource_type === 'artifact_delivery'
              ? 'border-emerald-400/60 bg-gradient-to-br from-emerald-950/80 to-slate-900 hover:border-emerald-300'
              : node.resource.resource_type === 'artifact_stream'
                ? 'border-cyan-400/60 bg-gradient-to-br from-cyan-950/80 to-slate-900 hover:border-cyan-300'
              : node.resource.resource_type === 'stream_finalization_attempt'
                ? node.status === 'rejected'
                  ? 'border-red-400/70 bg-gradient-to-br from-red-950/85 to-slate-900 hover:border-red-300'
                  : 'border-teal-400/60 bg-gradient-to-br from-teal-950/80 to-slate-900 hover:border-teal-300'
              : node.resource.resource_type === 'stream_finalization'
                  ? 'border-teal-400/60 bg-gradient-to-br from-teal-950/80 to-slate-900 hover:border-teal-300'
                : node.resource.resource_type === 'plan_step_execution'
                  ? 'border-blue-400/60 bg-gradient-to-br from-blue-950/80 to-slate-900 hover:border-blue-300'
                : node.resource.resource_type === 'delivery_input_binding'
                  ? 'border-violet-400/60 bg-gradient-to-br from-violet-950/80 to-slate-900 hover:border-violet-300'
              : node.resource.resource_type === 'case' || node.resource.resource_type === 'work_item'
                ? 'border-amber-400/60 bg-gradient-to-br from-amber-950/80 to-slate-900 hover:border-amber-300'
                : 'border-slate-600/80 bg-gradient-to-br from-slate-800 to-slate-900 hover:border-cyan-400/60'
      } ${isLead ? 'blueprint-node--lead' : ''} ${selected ? 'blueprint-node--selected' : ''} ${isReused ? 'border-dashed opacity-75' : ''} ${isActive ? 'shadow-cyan-950/80 ring-1 ring-cyan-400/25' : 'shadow-black/30'}`}
      style={{ left: item.x, top: item.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <span className={`absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-950 ${isLead ? 'bg-indigo-400' : 'bg-cyan-400'}`} />
      <span className={`absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-slate-950 ${isLead ? 'bg-indigo-400' : 'bg-cyan-400'}`} />
      <span className="flex min-w-0 items-start gap-2.5">
        <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${isLead ? 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200' : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'}`}>
          {isLead ? <Crown className="h-4 w-4" aria-hidden="true" /> : <NodeIcon type={node.resource.resource_type} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {typeLabel(node.resource.resource_type)} · {lane.displayName}
          </span>
          <span className="mt-0.5 block truncate text-xs font-semibold text-white" title={item.label}>
            {item.label}
          </span>
        </span>
        <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[10px] text-slate-300">{statusLabel(node.status)}</span>
      </span>
      {!compact ? (
        <span className="mt-2 line-clamp-2 text-xs leading-relaxed text-slate-300">
          {step?.objective ??
            node.failure_summary ??
            node.work_item_kind ??
            (node.partition_key
              ? `分区 ${node.partition_key}${node.sequence !== null && node.sequence !== undefined ? ` · 序列 ${node.sequence}` : ''}`
              : node.trigger_policy
                ? `触发策略 ${node.trigger_policy}`
                : node.resource.label ?? '查看持久化关系、状态与迭代信息')}
        </span>
      ) : (
        <span className="mt-3 text-[11px] font-medium text-slate-400">缩放后显示摘要</span>
      )}
      <span className="mt-auto flex items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-400">
        <span>迭代 {node.iteration_number}</span>
        {isReused ? <span className="ml-auto font-semibold text-violet-300">固定复用</span> : null}
        {isExecuted ? <span className="ml-auto font-semibold text-cyan-300">本次执行</span> : null}
      </span>
    </button>
  );
}

function MiniMap({ layout, view, viewport }: { layout: Layout; view: ViewTransform; viewport: { width: number; height: number } }) {
  const width = 164;
  const height = 92;
  const inset = 6;
  const scale = Math.min((width - inset * 2) / layout.width, (height - inset * 2) / layout.height);
  const offsetX = (width - layout.width * scale) / 2;
  const offsetY = (height - layout.height * scale) / 2;
  const visibleX = -view.x / view.scale;
  const visibleY = -view.y / view.scale;
  return (
    <div className="blueprint-minimap pointer-events-none absolute bottom-3 left-3 z-20 hidden overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-xl backdrop-blur sm:block">
      <svg width={width} height={height} aria-hidden="true">
        {layout.lanes.map((lane, index) => <rect key={lane.roleKey} x={offsetX} y={offsetY + lane.top * scale} width={layout.width * scale} height={lane.height * scale} fill={index % 2 === 0 ? 'var(--blueprint-lane-a)' : 'var(--blueprint-lane-b)'} />)}
        {layout.edges.map((edge) => <path key={edge.edge_id} d={edge.path} transform={`translate(${offsetX} ${offsetY}) scale(${scale})`} fill="none" stroke={RELATION_META[edge.relation].color} strokeWidth={Math.max(0.8, 2 / scale)} strokeDasharray={RELATION_META[edge.relation].dash} opacity="0.75" />)}
        {layout.nodes.map((item) => <rect key={item.node.node_id} x={offsetX + item.x * scale} y={offsetY + item.y * scale} width={NODE_WIDTH * scale} height={NODE_HEIGHT * scale} rx="2" fill={item.lane.isLead ? 'var(--blueprint-lead)' : 'var(--blueprint-node-accent)'} opacity="0.9" />)}
        <rect x={offsetX + Math.max(0, visibleX) * scale} y={offsetY + Math.max(0, visibleY) * scale} width={Math.min(layout.width, viewport.width / view.scale) * scale} height={Math.min(layout.height, viewport.height / view.scale) * scale} rx="3" fill="none" stroke="var(--blueprint-minimap-frame)" strokeWidth="1.5" opacity="0.85" />
      </svg>
    </div>
  );
}

function ProjectionInspector({ item, edges, onClose }: { item: LayoutNode; edges: LayoutEdge[]; onClose: () => void }) {
  const { node, lane, step } = item;
  const related = edges.filter((edge) => edge.sourceNodeId === node.node_id || edge.targetNodeId === node.node_id);
  return (
    <aside className="blueprint-inspector absolute inset-x-2 bottom-2 z-30 max-h-[76%] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-slate-950/95 p-4 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-80">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">{typeLabel(node.resource.resource_type)} · {lane.displayName}</p>
          <h4 className="mt-1 break-words text-sm font-semibold text-white">{item.label}</h4>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20" aria-label="关闭节点详情"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px]
        "><span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">状态：{statusLabel(node.status)}</span><span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">迭代：{node.iteration_number}</span></div>
      <dl className="mt-4 space-y-4 text-xs leading-relaxed">
        <div><dt className="font-semibold text-slate-400">组织上下文</dt><dd className="mt-1 text-slate-200">{lane.responsibility}{lane.reportsToName ? ` · 向 ${lane.reportsToName} 汇报` : ''}</dd></div>
        {step ? <><div><dt className="font-semibold text-slate-400">任务目标</dt><dd className="mt-1 text-slate-200">{step.objective}</dd></div><div><dt className="font-semibold text-slate-400">验收标准</dt><dd className="mt-1 text-slate-200">{step.acceptance_criteria}</dd></div></> : null}
        {node.failure_code || node.failure_summary ? <div><dt className="font-semibold text-slate-400">验证结果</dt><dd className="mt-1 rounded-lg border border-red-400/20 bg-red-400/10 p-2 text-red-100">{node.failure_code ? <p className="break-all font-mono text-[11px] font-semibold text-red-200">{node.failure_code}</p> : null}{node.failure_summary ? <p className="mt-1">{node.failure_summary}</p> : null}</dd></div> : null}
         {node.partition_key || (node.sequence !== null && node.sequence !== undefined) || node.delivery_kind || node.trigger_policy || node.replay_run_id ? <div><dt className="font-semibold text-slate-400">增量流事实</dt><dd className="mt-1 flex flex-wrap gap-1.5">{node.partition_key ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">分区 {node.partition_key}</span> : null}{node.sequence !== null && node.sequence !== undefined ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">序列 {node.sequence}</span> : null}{node.delivery_kind ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">{node.delivery_kind}</span> : null}{node.trigger_policy ? <span className="rounded-md border border-white/10 bg-white/5 px-2 py-1">订阅 {node.trigger_policy}</span> : null}{node.replay_run_id ? <span className="break-all rounded-md border border-violet-300/30 bg-violet-400/10 px-2 py-1 text-violet-200">Replay 复制 · {node.replay_run_id}</span> : null}</dd></div> : null}
         <div><dt className="font-semibold text-slate-400">持久化关系</dt><dd className="mt-1 space-y-2">{related.length > 0 ? related.map((edge) => <div key={edge.edge_id} className="rounded-lg border border-white/10 bg-white/5 p-2"><span style={{ color: RELATION_META[edge.relation].color }} className="font-semibold">{RELATION_META[edge.relation].label}</span><span className="ml-2 text-slate-400">{statusLabel(edge.status)} · 迭代 {edge.iteration_number}</span>{edge.partition_key ? <p className="mt-1 font-mono text-slate-400">分区 {edge.partition_key}{edge.sequence !== null && edge.sequence !== undefined ? ` · 序列 ${edge.sequence}` : ''}</p> : null}{edge.reason_summary ? <p className="mt-1 text-slate-300">{edge.reason_summary}</p> : null}{edge.retry_attempt_id ? <p className="mt-1 break-all font-mono text-[10px] text-amber-200">RetryAttempt {edge.retry_attempt_id}</p> : null}{edge.replay_run_id ? <p className="mt-1 break-all font-mono text-[10px] text-violet-200">ReplayRun {edge.replay_run_id}</p> : null}{edge.delivery_id ? <p className="mt-1 break-all font-mono text-[10px] text-emerald-200">Delivery {edge.delivery_id}</p> : null}{edge.plan_step_execution_id ? <p className="mt-1 break-all font-mono text-[10px] text-cyan-200">Execution {edge.plan_step_execution_id}</p> : null}</div>) : <span className="text-slate-500">暂无关系记录</span>}</dd></div>
      </dl>
    </aside>
  );
}

export default function TaskGraphProjectionCanvas({
  projection,
  steps,
  organizationSpec,
  syncStatus = 'live',
  replayExecutedStepKeys = [],
  replayReusedStepKeys = [],
}: {
  projection: TaskGraphProjection;
  steps: readonly PlanStep[];
  organizationSpec?: OrganizationSpec;
  syncStatus?: ConnectionStatus;
  replayExecutedStepKeys?: readonly string[];
  replayReusedStepKeys?: readonly string[];
}) {
  const layout = useMemo(() => buildLayout(projection, steps, organizationSpec), [projection, steps, organizationSpec]);
  const nodeById = useMemo(() => new Map(layout.nodes.map((item) => [item.node.node_id, item] as const)), [layout.nodes]);
  const replayed = useMemo(() => new Set(replayExecutedStepKeys), [replayExecutedStepKeys]);
  const reused = useMemo(() => new Set(replayReusedStepKeys), [replayReusedStepKeys]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 20, y: 20, scale: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [dragging, setDragging] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? nodeById.get(selectedId) ?? null : null;
  const active = layout.nodes.find((item) => ACTIVE_STATUSES.has(item.node.status));

  const fitView = useCallback((fitAll = false) => {
    const element = viewportRef.current;
    if (!element || element.clientWidth <= 0 || element.clientHeight <= 0) return;
    const padding = element.clientWidth < 640 ? 18 : 42;
    const widthScale = (element.clientWidth - padding * 2) / layout.width;
    const heightScale = (element.clientHeight - padding * 2) / layout.height;
    const scale = clampScale(
      fitAll ? Math.min(widthScale, heightScale, 1.04) : Math.min(widthScale, Math.max(INITIAL_READABLE_SCALE, heightScale)),
    );
    setView({
      scale,
      x: (element.clientWidth - layout.width * scale) / 2,
      y: fitAll ? (element.clientHeight - layout.height * scale) / 2 : 18,
    });
  }, [layout.height, layout.width]);

  useLayoutEffect(() => { fitView(false); }, [fitView]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => { if (selectedId && !nodeById.has(selectedId)) setSelectedId(null); }, [nodeById, selectedId]);

  const zoomBy = (factor: number) => {
    const element = viewportRef.current;
    if (!element) return;
    const centerX = element.clientWidth / 2;
    const centerY = element.clientHeight / 2;
    setView((current) => { const scale = clampScale(current.scale * factor); const worldX = (centerX - current.x) / current.scale; const worldY = (centerY - current.y) / current.scale; return { scale, x: centerX - worldX * scale, y: centerY - worldY * scale }; });
  };
  const centerNode = (item: LayoutNode | undefined) => {
    const element = viewportRef.current;
    if (!element || !item) return;
    setView((current) => ({ ...current, x: element.clientWidth / 2 - (item.x + NODE_WIDTH / 2) * current.scale, y: element.clientHeight / 2 - (item.y + NODE_HEIGHT / 2) * current.scale }));
    setSelectedId(item.node.node_id);
  };
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea')) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: view.x, originY: view.y };
    setDragging(true);
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setView((current) => ({ ...current, x: drag.originX + event.clientX - drag.startX, y: drag.originY + event.clientY - drag.startY }));
  };
  const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const topology = `${projection.nodes.length} 个节点 · ${projection.edges.length} 条权威关系`;
  const syncLabel = ({
    connecting: '建立更新通道',
    live: '持续同步',
    reconnecting: '更新通道重连中',
    closed: '更新通道已结束',
    unreachable: '更新通道不可达',
  } as const)[syncStatus];
  const relationCounts = useMemo(() => {
    const counts = new Map<TaskGraphRelation, number>();
    for (const edge of projection.edges) counts.set(edge.relation, (counts.get(edge.relation) ?? 0) + 1);
    return counts;
  }, [projection.edges]);
  return (
    <section className="blueprint-shell overflow-hidden rounded-[22px] border border-slate-800 bg-[#07111e] text-slate-100 shadow-xl shadow-slate-300/30">
      <header className="blueprint-header border-b border-white/10 bg-slate-950/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-start gap-3"><span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300"><Workflow className="h-5 w-5" aria-hidden="true" /></span><div className="min-w-0"><h3 className="text-sm font-semibold tracking-wide text-white">运行蓝图 · 反馈回路</h3><p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-slate-400"><span>{topology} · 投影 {projection.projection_version}</span><span role="status" className={`inline-flex items-center gap-1.5 ${syncStatus === 'unreachable' ? 'text-amber-300' : syncStatus === 'reconnecting' ? 'text-cyan-300' : 'text-emerald-300'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{syncLabel}</span></p></div></div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400 xl:ml-auto">
            {(Object.keys(RELATION_META) as TaskGraphRelation[]).map((relation) => { const meta = RELATION_META[relation]; const count = relationCounts.get(relation) ?? 0; return <span key={relation} className={`inline-flex items-center gap-2 ${count === 0 ? 'opacity-45' : ''}`}><span className="w-7 border-t-2" style={{ borderColor: meta.color, borderStyle: meta.dash ? 'dashed' : 'solid' }} />{meta.label}<span className="rounded-full bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-slate-500">{count}</span></span>; })}
            <span className="inline-flex items-center gap-1.5 text-slate-500"><Info className="h-3.5 w-3.5" aria-hidden="true" />关系来自产品持久化记录</span>
          </div>
        </div>
      </header>
      <div ref={viewportRef} className={`blueprint-viewport relative h-[500px] select-none overflow-hidden touch-none sm:h-[560px] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`} role="region" aria-label="任务图谱只读二维画布" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {layout.nodes.length === 0 ? <div className="absolute inset-0 flex items-center justify-center p-6 text-sm text-slate-400">当前任务还没有可展示的持久化图节点。</div> : <div className="blueprint-grid absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.28)_1px,transparent_0)] [background-size:22px_22px]" style={{ width: layout.width, height: layout.height, transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})` }}>
          <svg className="absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>{(Object.keys(RELATION_META) as TaskGraphRelation[]).map((relation) => <marker key={relation} id={`task-graph-arrow-${relation}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth"><path d="M 0 0 L 8 4 L 0 8 z" fill={RELATION_META[relation].color} /></marker>)}</defs>
            {layout.lanes.map((lane, index) => <g key={lane.roleKey}><rect x="8" y={lane.top} width={layout.width - 16} height={lane.height} rx="18" fill={index % 2 === 0 ? 'var(--blueprint-lane-a)' : 'var(--blueprint-lane-b)'} stroke="var(--blueprint-lane-border)" /><line x1={LABEL_WIDTH} y1={lane.top + 18} x2={LABEL_WIDTH} y2={lane.top + lane.height - 18} stroke="var(--blueprint-divider)" /></g>)}
            {layout.lanes.map((lane) => { if (!lane.reportsTo) return null; const parent = layout.lanes.find((candidate) => candidate.roleKey === lane.reportsTo); if (!parent) return null; return <path key={`${lane.roleKey}:${parent.roleKey}`} d={`M 28 ${lane.centerY} H 18 V ${parent.centerY} H 28`} fill="none" stroke="var(--nexwork-text-subtle)" strokeWidth="1.5" strokeDasharray="5 5" opacity="0.75" />; })}
            {layout.edges.map((edge) => { const meta = RELATION_META[edge.relation]; const emphasized = edge.relation === 'feedback' || edge.relation === 'retry'; return <g key={edge.edge_id}><title>{`${meta.label}：${edge.reason_summary || statusLabel(edge.status)}`}</title><path d={edge.path} fill="none" stroke={meta.color} strokeWidth={emphasized ? '10' : '7'} opacity={emphasized ? '0.2' : '0.14'} /><path d={edge.path} fill="none" stroke={meta.color} strokeWidth={emphasized ? '2.8' : '2.25'} strokeDasharray={meta.dash} markerEnd={`url(#task-graph-arrow-${edge.relation})`} /><g transform={`translate(${edge.labelX} ${edge.labelY})`}><rect x="-28" y="-10" width="56" height="16" rx="8" fill="var(--blueprint-panel-bg)" fillOpacity="0.94" stroke={meta.color} strokeOpacity={emphasized ? '0.45' : '0.16'} /><text x="0" y="1" textAnchor="middle" fill={meta.color} fontSize="9" fontWeight="600">{meta.label}</text></g></g>; })}
          </svg>
          {layout.lanes.map((lane) => <div key={lane.roleKey} className="absolute left-8 flex w-[138px] -translate-y-1/2 flex-col" style={{ top: lane.centerY }}><span className="flex items-center gap-2 text-xs font-semibold text-slate-100">{lane.isLead ? <Crown className="h-4 w-4 flex-shrink-0 text-indigo-300" aria-hidden="true" /> : <User2 className="h-4 w-4 flex-shrink-0 text-cyan-300" aria-hidden="true" />}<span className="truncate" title={lane.displayName}>{lane.displayName}</span></span><span className="mt-1 truncate pl-6 text-[10px] text-slate-500" title={lane.reportsToName ? `向 ${lane.reportsToName} 汇报` : lane.responsibility}>{lane.reportsToName ? `向 ${lane.reportsToName} 汇报` : lane.roleKey === COORDINATION_ROLE ? '反馈、验证与重试' : lane.isLead ? '组织负责人' : '执行岗位'}</span></div>)}
          {layout.nodes.map((item) => <ProjectionNodeCard key={item.node.node_id} item={item} selected={selectedId === item.node.node_id} compact={view.scale < 0.64} replayExecutedStepKeys={replayed} replayReusedStepKeys={reused} onSelect={() => setSelectedId(item.node.node_id)} />)}
        </div>}
        <div className="absolute right-3 top-3 z-20 flex flex-col gap-2"><CanvasButton label="放大画布" onClick={() => zoomBy(1.18)}><ZoomIn className="h-4 w-4" aria-hidden="true" /></CanvasButton><CanvasButton label="缩小画布" onClick={() => zoomBy(1 / 1.18)}><ZoomOut className="h-4 w-4" aria-hidden="true" /></CanvasButton><CanvasButton label="适应全部节点" onClick={() => fitView(true)}><Maximize2 className="h-4 w-4" aria-hidden="true" /></CanvasButton><CanvasButton label="聚焦当前工作节点" disabled={!active} onClick={() => centerNode(active)}><Crosshair className="h-4 w-4" aria-hidden="true" /></CanvasButton><span className="blueprint-scale rounded-lg bg-slate-950/75 px-2 py-1 text-center text-[10px] tabular-nums text-slate-500">{Math.round(view.scale * 100)}%</span></div>
        <MiniMap layout={layout} view={view} viewport={viewportSize} />
        {selected ? <ProjectionInspector item={selected} edges={layout.edges} onClose={() => setSelectedId(null)} /> : null}
      </div>
      <footer className="blueprint-footer flex flex-col gap-1 border-t border-white/10 bg-slate-950/40 px-4 py-3 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5"><span>拖动画布查看完整关系；点击节点查看产品状态、迭代和反馈证据。</span><span>只读预览 · 不支持拖拽节点、连线或编辑计划</span></footer>
    </section>
  );
}
