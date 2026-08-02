/**
 * Read-only organization blueprint.
 *
 * This intentionally shares the visual language of PlanGraph while retaining a different
 * semantic model: every edge below is a persisted OrganizationSpec `reports_to` relationship.
 * It never implies execution order and does not expose editing controls.
 */
import {
  Crown,
  Crosshair,
  FileInput,
  FileOutput,
  Info,
  Maximize2,
  User2,
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
import type { AgentRoleSpec, OrganizationSpec } from '../api/types';
import {
  formatRuntimeLimit,
  formatTokenCount,
  formatUsd,
  hasDeclaredExecutionLimit,
} from '../lib/executionBudget';
import { formatMediaTypes } from '../lib/media';

interface RoleNode {
  role: AgentRoleSpec;
  children: RoleNode[];
}

interface OrgLayoutNode {
  role: AgentRoleSpec;
  parentRole: AgentRoleSpec | null;
  depth: number;
  x: number;
  y: number;
  orphan: boolean;
}

interface OrgLayoutEdge {
  sourceId: string;
  targetId: string;
  path: string;
}

interface OrgLayout {
  width: number;
  height: number;
  nodes: OrgLayoutNode[];
  edges: OrgLayoutEdge[];
  roots: RoleNode[];
  orphans: AgentRoleSpec[];
}

interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

const NODE_WIDTH = 264;
const NODE_HEIGHT = 158;
const HORIZONTAL_GAP = 72;
const VERTICAL_GAP = 116;
const CANVAS_PADDING = 56;
const MIN_CANVAS_WIDTH = 980;
const MIN_SCALE = 0.34;
const MAX_SCALE = 1.45;
const EMPTY_ROLES: readonly AgentRoleSpec[] = [];

function buildTree(roles: readonly AgentRoleSpec[]): {
  roots: RoleNode[];
  orphans: AgentRoleSpec[];
} {
  const known = new Set(roles.map((role) => role.role_key));
  const nodes = new Map<string, RoleNode>(
    roles.map((role) => [role.role_key, { role, children: [] }] as const),
  );
  const roots: RoleNode[] = [];
  const orphans: AgentRoleSpec[] = [];

  for (const role of roles) {
    const node = nodes.get(role.role_key);
    if (!node) continue;
    if (!role.reports_to) {
      roots.push(node);
    } else if (!known.has(role.reports_to) || role.reports_to === role.role_key) {
      orphans.push(role);
    } else {
      nodes.get(role.reports_to)?.children.push(node);
    }
  }

  // Preserve a lead at the top even if a malformed proposal gives it a parent.
  const lead = roles.find((role) => role.is_lead);
  if (lead) {
    const leadNode = nodes.get(lead.role_key);
    if (leadNode && !roots.includes(leadNode)) roots.unshift(leadNode);
  }

  // A malformed cycle has no root. Keep it visible as an orphan rather than recursing forever.
  const attached = new Set<string>();
  const mark = (node: RoleNode, seen: Set<string>) => {
    if (seen.has(node.role.role_key) || attached.has(node.role.role_key)) return;
    attached.add(node.role.role_key);
    const nextSeen = new Set(seen);
    nextSeen.add(node.role.role_key);
    node.children.forEach((child) => mark(child, nextSeen));
  };
  roots.forEach((root) => mark(root, new Set()));
  for (const role of roles) {
    if (!attached.has(role.role_key) && !orphans.some((orphan) => orphan.role_key === role.role_key)) {
      orphans.push(role);
    }
  }

  return { roots, orphans };
}

function buildLayout(spec: OrganizationSpec): OrgLayout {
  const { roots, orphans } = buildTree(spec.roles);
  const roleByKey = new Map(spec.roles.map((role) => [role.role_key, role] as const));
  const nodes: OrgLayoutNode[] = [];
  const edges: OrgLayoutEdge[] = [];
  const placed = new Set<string>();
  const sizing = new Map<string, number>();

  const subtreeWidth = (node: RoleNode, seen: Set<string>): number => {
    const known = sizing.get(node.role.role_key);
    if (known !== undefined) return known;
    if (seen.has(node.role.role_key)) return NODE_WIDTH;
    const nextSeen = new Set(seen);
    nextSeen.add(node.role.role_key);
    const childWidth = node.children.reduce(
      (total, child) => total + subtreeWidth(child, nextSeen),
      0,
    );
    const gaps = Math.max(0, node.children.length - 1) * HORIZONTAL_GAP;
    const width = Math.max(NODE_WIDTH, childWidth + gaps);
    sizing.set(node.role.role_key, width);
    return width;
  };

  const rootWidths = roots.map((root) => subtreeWidth(root, new Set()));
  const rootGap = Math.max(HORIZONTAL_GAP, HORIZONTAL_GAP * 1.5);
  const rootContentWidth = rootWidths.reduce((total, width) => total + width, 0) + Math.max(0, roots.length - 1) * rootGap;
  const orphanColumns = Math.max(1, Math.min(3, orphans.length));
  const orphanWidth = orphanColumns * NODE_WIDTH + Math.max(0, orphanColumns - 1) * HORIZONTAL_GAP;
  const width = Math.max(MIN_CANVAS_WIDTH, Math.max(rootContentWidth, orphanWidth) + CANVAS_PADDING * 2);

  const place = (node: RoleNode, left: number, depth: number, seen: Set<string>) => {
    if (placed.has(node.role.role_key) || seen.has(node.role.role_key)) return;
    const nextSeen = new Set(seen);
    nextSeen.add(node.role.role_key);
    const branchWidth = subtreeWidth(node, nextSeen);
    const x = left + (branchWidth - NODE_WIDTH) / 2;
    const y = CANVAS_PADDING + depth * (NODE_HEIGHT + VERTICAL_GAP);
    const parentRole = node.role.reports_to ? roleByKey.get(node.role.reports_to) ?? null : null;
    nodes.push({ role: node.role, parentRole, depth, x, y, orphan: false });
    placed.add(node.role.role_key);

    if (parentRole) {
      const parent = nodes.find((candidate) => candidate.role.role_key === parentRole?.role_key);
      if (parent) {
        const sourceX = parent.x + NODE_WIDTH / 2;
        const sourceY = parent.y + NODE_HEIGHT;
        const targetX = x + NODE_WIDTH / 2;
        const targetY = y;
        const middleY = sourceY + (targetY - sourceY) / 2;
        edges.push({
          sourceId: parent.role.role_key,
          targetId: node.role.role_key,
          path: `M ${sourceX} ${sourceY} V ${middleY} H ${targetX} V ${targetY}`,
        });
      }
    }

    let childLeft = left;
    for (const child of node.children) {
      const childWidth = subtreeWidth(child, nextSeen);
      place(child, childLeft, depth + 1, nextSeen);
      childLeft += childWidth + HORIZONTAL_GAP;
    }
  };

  let rootLeft = (width - rootContentWidth) / 2;
  for (let index = 0; index < roots.length; index += 1) {
    place(roots[index], rootLeft, 0, new Set());
    rootLeft += rootWidths[index] + rootGap;
  }

  const maxDepth = nodes.reduce((max, node) => Math.max(max, node.depth), 0);
  const orphanTop = CANVAS_PADDING + (maxDepth + 1) * (NODE_HEIGHT + VERTICAL_GAP);
  const orphanStart = (width - orphanWidth) / 2;
  orphans.forEach((role, index) => {
    const column = index % orphanColumns;
    const row = Math.floor(index / orphanColumns);
    nodes.push({
      role,
      parentRole: role.reports_to ? roleByKey.get(role.reports_to) ?? null : null,
      depth: maxDepth + 1 + row,
      x: orphanStart + column * (NODE_WIDTH + HORIZONTAL_GAP),
      y: orphanTop + row * (NODE_HEIGHT + 24),
      orphan: true,
    });
  });

  const regularBottom = nodes
    .filter((node) => !node.orphan)
    .reduce((max, node) => Math.max(max, node.y + NODE_HEIGHT), CANVAS_PADDING);
  const orphanRows = orphans.length > 0 ? Math.ceil(orphans.length / orphanColumns) : 0;

  return {
    width,
    height: Math.max(
      420,
      orphanRows > 0
        ? orphanTop + orphanRows * (NODE_HEIGHT + 24) + CANVAS_PADDING
        : regularBottom + CANVAS_PADDING,
    ),
    nodes,
    edges,
    roots,
    orphans,
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

function MiniMap({
  layout,
  view,
  viewport,
}: {
  layout: OrgLayout;
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
    <div className="blueprint-minimap pointer-events-none absolute bottom-3 left-3 z-20 hidden overflow-hidden rounded-xl border border-white/10 bg-slate-950/85 shadow-xl backdrop-blur sm:block">
      <svg width={width} height={height} aria-hidden="true">
        {layout.edges.map((edge) => (
          <path
            key={`${edge.sourceId}:${edge.targetId}`}
            d={edge.path}
            transform={`translate(${offsetX} ${offsetY}) scale(${scale})`}
            fill="none"
            stroke="var(--blueprint-edge-soft)"
            strokeWidth={Math.max(0.8, 2 / scale)}
            opacity="0.7"
          />
        ))}
        {layout.nodes.map((node) => (
          <rect
            key={node.role.role_key}
            x={offsetX + node.x * scale}
            y={offsetY + node.y * scale}
            width={NODE_WIDTH * scale}
            height={NODE_HEIGHT * scale}
            rx="2"
            fill={node.role.is_lead ? 'var(--blueprint-lead)' : node.orphan ? '#f59e0b' : 'var(--blueprint-node-accent)'}
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
          stroke="var(--blueprint-minimap-frame)"
          strokeWidth="1.5"
          opacity="0.85"
        />
      </svg>
    </div>
  );
}

function RoleNodeCard({
  node,
  selected,
  compact,
  onSelect,
}: {
  node: OrgLayoutNode;
  selected: boolean;
  compact: boolean;
  onSelect: () => void;
}) {
  const { role } = node;
  const lead = role.is_lead;
  return (
    <button
      type="button"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${role.name}：${role.responsibility}`}
      className={`blueprint-node absolute flex flex-col rounded-2xl border p-3.5 text-left shadow-2xl transition duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/30 ${
        selected
          ? 'border-cyan-300 bg-slate-800 ring-2 ring-cyan-300/30'
          : lead
            ? 'border-indigo-400/70 bg-gradient-to-br from-indigo-950 to-slate-900 hover:border-indigo-300'
            : node.orphan
              ? 'border-amber-400/60 bg-gradient-to-br from-amber-950/50 to-slate-900 hover:border-amber-300'
              : 'border-slate-600/80 bg-gradient-to-br from-slate-800 to-slate-900 hover:border-cyan-400/60'
      } ${lead ? 'blueprint-node--lead' : node.orphan ? 'blueprint-node--orphan' : ''} ${selected ? 'blueprint-node--selected' : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
    >
      <span
        aria-hidden="true"
        className={`absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-slate-950 ${
          lead ? 'bg-indigo-400' : node.orphan ? 'bg-amber-400' : 'bg-cyan-400'
        }`}
      />
      <span
        aria-hidden="true"
        className={`absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-slate-950 ${
          lead ? 'bg-indigo-400' : node.orphan ? 'bg-amber-400' : 'bg-cyan-400'
        }`}
      />
      <span className="flex min-w-0 items-start gap-2.5">
        <span
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
            lead
              ? 'border-indigo-400/40 bg-indigo-400/10 text-indigo-200'
              : node.orphan
                ? 'border-amber-400/40 bg-amber-400/10 text-amber-200'
                : 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200'
          }`}
        >
          {lead ? (
            <Crown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <User2 className="h-4 w-4" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            {lead ? '组织负责人' : node.orphan ? '未解析上级' : '组织岗位'}
          </span>
          <span className="mt-0.5 block truncate text-sm font-semibold text-white" title={role.name}>
            {role.name}
          </span>
        </span>
      </span>

      <span className="mt-2 truncate font-mono text-[10px] text-slate-500" title={role.role_key}>
        {role.role_key}
      </span>
      {!compact ? (
        <span className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-300">
          {role.responsibility}
        </span>
      ) : (
        <span className="mt-2 text-[11px] font-medium text-slate-400">缩放后显示岗位摘要</span>
      )}

      <span className="mt-auto flex items-center gap-2 border-t border-white/5 pt-2 text-[10px] text-slate-400">
        <span className={lead ? 'text-indigo-300' : node.orphan ? 'text-amber-300' : 'text-cyan-300'}>
          {lead ? '负责人' : node.orphan ? '待修正关系' : '汇报关系'}
        </span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{role.runtime_binding_key}</span>
        {hasDeclaredExecutionLimit(role.execution_limits) ? (
          <span className="ml-auto shrink-0 rounded-full border border-amber-300/30 px-1.5 py-0.5 text-[9px] font-semibold text-amber-300">
            执行护栏
          </span>
        ) : null}
      </span>
    </button>
  );
}

function RoleInspector({ node, roleByKey, onClose }: { node: OrgLayoutNode; roleByKey: Map<string, AgentRoleSpec>; onClose: () => void }) {
  const { role } = node;
  const parent = role.reports_to ? roleByKey.get(role.reports_to) : undefined;
  const capability = role.capability_requirements;
  const executionLimits = role.execution_limits;
  const hasExecutionLimit = hasDeclaredExecutionLimit(executionLimits);
  return (
    <aside className="blueprint-inspector absolute inset-x-2 bottom-2 z-30 max-h-[76%] overflow-y-auto rounded-2xl border border-cyan-300/20 bg-slate-950/95 p-4 text-slate-200 shadow-2xl shadow-black/50 backdrop-blur-md md:inset-y-3 md:left-auto md:right-3 md:max-h-none md:w-80">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-300">
            {role.is_lead ? '组织负责人' : node.orphan ? '未解析上级' : '组织岗位'}
          </p>
          <h4 className="mt-1 break-words text-sm font-semibold text-white">{role.name}</h4>
          <p className="mt-1 break-all font-mono text-[10px] text-slate-500">{role.role_key}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mr-1 -mt-1 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-300/20"
          aria-label="关闭岗位详情"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <dl className="mt-4 space-y-4 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold text-slate-400">岗位职责</dt>
          <dd className="mt-1 text-slate-200">{role.responsibility}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">组织关系</dt>
          <dd className="mt-1 text-slate-200">
            {parent ? `向 ${parent.name} 汇报` : role.is_lead ? '组织负责人，无上级' : role.reports_to ? `上级 ${role.reports_to} 未在当前版本中解析` : '未声明上级'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">Runtime 绑定</dt>
          <dd className="mt-1 break-all font-mono text-[11px] text-slate-300">{role.runtime_binding_key}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-400">单次执行限制</dt>
          {hasExecutionLimit ? (
            <dd className="mt-2">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">Token</p>
                  <p className="mt-1 break-words font-mono text-[11px] font-semibold text-slate-200">
                    {formatTokenCount(executionLimits?.max_tokens_per_attempt ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">费用</p>
                  <p className="mt-1 break-words font-mono text-[11px] font-semibold text-slate-200">
                    {formatUsd(executionLimits?.max_cost_usd_per_attempt ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 px-2 py-2">
                  <p className="text-[9px] uppercase tracking-wide text-slate-500">时长</p>
                  <p className="mt-1 break-words text-[11px] font-semibold text-slate-200">
                    {formatRuntimeLimit(executionLimits?.max_runtime_seconds_per_attempt ?? null)}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                每次 Assignment 独立生效；费用由后端价格目录估算。
              </p>
            </dd>
          ) : (
            <dd className="mt-1 text-slate-500">未设置岗位级限制，使用平台与 Provider 约束</dd>
          )}
        </div>
        {capability && (capability.input_media_types.length > 0 || capability.output_media_types.length > 0) ? (
          <div>
            <dt className="font-semibold text-slate-400">媒体能力要求</dt>
            <dd className="mt-2 space-y-2 text-slate-200">
              {capability.input_media_types.length > 0 ? (
                <p className="flex items-start gap-2">
                  <FileInput className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-blue-300" aria-hidden="true" />
                  <span>输入：{formatMediaTypes(capability.input_media_types)}</span>
                </p>
              ) : null}
              {capability.output_media_types.length > 0 ? (
                <p className="flex items-start gap-2">
                  <FileOutput className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-300" aria-hidden="true" />
                  <span>输出：{formatMediaTypes(capability.output_media_types)}</span>
                </p>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
    </aside>
  );
}

export default function OrganizationGraph({ spec }: { spec: OrganizationSpec }) {
  const layout = useMemo(() => buildLayout(spec), [spec]);
  const roleByKey = useMemo(
    () => new Map((spec.roles ?? EMPTY_ROLES).map((role) => [role.role_key, role] as const)),
    [spec.roles],
  );
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);
  const [view, setView] = useState<ViewTransform>({ x: 20, y: 20, scale: 1 });
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [selectedRoleKey, setSelectedRoleKey] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const selectedNode = selectedRoleKey
    ? layout.nodes.find((node) => node.role.role_key === selectedRoleKey) ?? null
    : null;
  const activeRoot = layout.nodes.find((node) => node.role.is_lead) ?? layout.nodes[0];

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
    if (selectedRoleKey && !layout.nodes.some((node) => node.role.role_key === selectedRoleKey)) {
      setSelectedRoleKey(null);
    }
  }, [layout.nodes, selectedRoleKey]);

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

  const centerNode = (node: OrgLayoutNode | undefined) => {
    const element = viewportRef.current;
    if (!element || !node) return;
    setView((current) => ({
      ...current,
      x: element.clientWidth / 2 - (node.x + NODE_WIDTH / 2) * current.scale,
      y: element.clientHeight / 2 - (node.y + NODE_HEIGHT / 2) * current.scale,
    }));
    setSelectedRoleKey(node.role.role_key);
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

  if (spec.roles.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
        当前组织版本还没有岗位。
      </div>
    );
  }

  return (
    <section className="blueprint-shell overflow-hidden rounded-[22px] border border-slate-800 bg-[#07111e] text-slate-100 shadow-xl shadow-slate-300/30">
      <header className="blueprint-header border-b border-white/10 bg-slate-950/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-indigo-400/20 bg-indigo-400/10 text-indigo-300">
              <Crown className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold tracking-wide text-white">组织蓝图</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                {spec.roles.length} 个岗位 · 汇报关系 · 只读预览
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400 xl:ml-auto">
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-7 rounded bg-indigo-400" />
              reports_to 汇报关系
            </span>
            <span className="inline-flex items-center gap-1.5 text-slate-500">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              不代表任务执行顺序
            </span>
          </div>
        </div>
      </header>

      <div
        ref={viewportRef}
        className={`blueprint-viewport relative h-[500px] select-none overflow-hidden touch-none sm:h-[560px] ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        role="region"
        aria-label="组织架构只读二维画布"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div
          className="blueprint-grid absolute left-0 top-0 origin-top-left bg-[radial-gradient(circle_at_1px_1px,rgba(100,116,139,0.28)_1px,transparent_0)] [background-size:22px_22px]"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`,
          }}
        >
          <svg className="absolute inset-0" width={layout.width} height={layout.height} aria-hidden="true">
            <defs>
              <marker id="org-edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="var(--blueprint-edge-soft)" />
              </marker>
              <filter id="org-edge-glow" x="-30%" y="-30%" width="160%" height="160%">
                <feGaussianBlur stdDeviation="2" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <rect x="16" y="16" width={layout.width - 32} height={layout.height - 32} rx="20" fill="var(--blueprint-lane-a)" stroke="var(--blueprint-lane-border)" />
            {layout.edges.map((edge) => (
              <g key={`${edge.sourceId}:${edge.targetId}`}>
                <path d={edge.path} fill="none" stroke="var(--blueprint-edge)" strokeWidth="7" opacity="0.18" />
                <path d={edge.path} fill="none" stroke="var(--blueprint-edge-soft)" strokeWidth="2.25" markerEnd="url(#org-edge-arrow)" filter="url(#org-edge-glow)" />
              </g>
            ))}
            {layout.orphans.length > 0 ? (
              <line x1="28" y1={layout.nodes.filter((node) => !node.orphan).reduce((max, node) => Math.max(max, node.y + NODE_HEIGHT), 0) + 32} x2={layout.width - 28} y2={layout.nodes.filter((node) => !node.orphan).reduce((max, node) => Math.max(max, node.y + NODE_HEIGHT), 0) + 32} stroke="#f59e0b" strokeDasharray="6 8" opacity="0.35" />
            ) : null}
          </svg>
          {layout.nodes.map((node) => (
            <RoleNodeCard
              key={node.role.role_key}
              node={node}
              selected={selectedRoleKey === node.role.role_key}
              compact={view.scale < 0.64}
              onSelect={() => setSelectedRoleKey(node.role.role_key)}
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
          <CanvasButton label="适应全部岗位" onClick={fitView}>
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <CanvasButton label="聚焦组织负责人" disabled={!activeRoot} onClick={() => centerNode(activeRoot)}>
            <Crosshair className="h-4 w-4" aria-hidden="true" />
          </CanvasButton>
          <span className="blueprint-scale rounded-lg bg-slate-950/75 px-2 py-1 text-center text-[10px] tabular-nums text-slate-500">
            {Math.round(view.scale * 100)}%
          </span>
        </div>

        <MiniMap layout={layout} view={view} viewport={viewportSize} />

        {selectedNode ? <RoleInspector node={selectedNode} roleByKey={roleByKey} onClose={() => setSelectedRoleKey(null)} /> : null}
      </div>

      <footer className="blueprint-footer flex flex-col gap-1 border-t border-white/10 bg-slate-950/40 px-4 py-3 text-[11px] leading-relaxed text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <span>拖动画布查看完整层级；点击岗位查看职责、上级和能力要求。</span>
        <span>{layout.orphans.length > 0 ? `有 ${layout.orphans.length} 个岗位的上级引用待修正` : '只读预览 · 不支持编辑组织关系'}</span>
      </footer>
    </section>
  );
}
