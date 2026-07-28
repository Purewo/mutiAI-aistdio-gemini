/**
 * Read-only organization diagram.
 *
 * The graph is rendered by code from the published `OrganizationSpec`, never by image generation.
 * Structure comes from `is_lead` and `reports_to`, so it adapts to any number of roles and any depth
 * instead of assuming a fixed set of specialists. This is a preview: there is no drag-and-drop
 * editing in V1.
 */
import { useEffect, useRef } from 'react';
import { Crown, FileInput, FileOutput, Info, User2 } from 'lucide-react';
import type { AgentRoleSpec, OrganizationSpec } from '../api/types';
import { formatMediaTypes } from '../lib/media';

interface RoleNode {
  role: AgentRoleSpec;
  children: RoleNode[];
}

/**
 * Arrange roles into a tree.
 *
 * Roles whose `reports_to` names a key that is absent from the spec are returned separately rather
 * than dropped, so a malformed spec is visible instead of silently rendering an incomplete
 * organization.
 */
function buildTree(roles: readonly AgentRoleSpec[]): { roots: RoleNode[]; orphans: AgentRoleSpec[] } {
  const known = new Set(roles.map((role) => role.role_key));
  const nodes = new Map<string, RoleNode>(
    roles.map((role) => [role.role_key, { role, children: [] }]),
  );

  const roots: RoleNode[] = [];
  const orphans: AgentRoleSpec[] = [];

  for (const role of roles) {
    const node = nodes.get(role.role_key);
    if (!node) continue;

    const parentKey = role.reports_to;
    if (!parentKey) {
      roots.push(node);
      continue;
    }
    if (!known.has(parentKey) || parentKey === role.role_key) {
      orphans.push(role);
      continue;
    }
    nodes.get(parentKey)?.children.push(node);
  }

  // A lead that also declares `reports_to` would otherwise disappear from the top level.
  const leadAtRoot = roots.some((node) => node.role.is_lead);
  if (!leadAtRoot) {
    for (const role of roles) {
      if (!role.is_lead) continue;
      const node = nodes.get(role.role_key);
      if (node && !roots.includes(node)) roots.push(node);
    }
  }

  return { roots, orphans };
}

function RoleCard({ role }: { role: AgentRoleSpec }) {
  const lead = role.is_lead;
  return (
    <div
      className={`w-64 rounded-2xl border p-4 text-left shadow-sm transition-shadow hover:shadow-md ${
        lead ? 'border-indigo-200 bg-indigo-50/60' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border ${
            lead
              ? 'border-indigo-200 bg-white text-indigo-600'
              : 'border-slate-200 bg-slate-50 text-slate-500'
          }`}
        >
          {lead ? (
            <Crown className="h-4 w-4" aria-hidden="true" />
          ) : (
            <User2 className="h-4 w-4" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{role.name}</p>
          <p className="truncate font-mono text-[11px] text-slate-400">{role.role_key}</p>
        </div>
      </div>

      <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-slate-600">
        {role.responsibility}
      </p>

      {role.capability_requirements &&
      (role.capability_requirements.input_media_types.length > 0 ||
        role.capability_requirements.output_media_types.length > 0) ? (
        <div className="mb-3 space-y-1.5 border-t border-slate-100 pt-2.5 text-[10px] text-slate-500">
          {role.capability_requirements.input_media_types.length > 0 ? (
            <p
              className="flex items-start gap-1.5"
              title={role.capability_requirements.input_media_types.join(', ')}
            >
              <FileInput className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" aria-hidden="true" />
              <span>
                输入格式：
                <strong className="font-semibold text-slate-700">
                  {formatMediaTypes(role.capability_requirements.input_media_types)}
                </strong>
              </span>
            </p>
          ) : null}
          {role.capability_requirements.output_media_types.length > 0 ? (
            <p
              className="flex items-start gap-1.5"
              title={role.capability_requirements.output_media_types.join(', ')}
            >
              <FileOutput className="mt-0.5 h-3 w-3 flex-shrink-0 text-slate-400" aria-hidden="true" />
              <span>
                输出格式：
                <strong className="font-semibold text-slate-700">
                  {formatMediaTypes(role.capability_requirements.output_media_types)}
                </strong>
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5">
        {lead ? (
          <span className="rounded-full border border-indigo-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
            组织负责人
          </span>
        ) : null}
        {/*
          The binding key is the stable value each role carries into Runtime configuration. Keeping
          it visible preserves the role-to-binding association the acceptance gate requires.
        */}
        <span
          title="Runtime 绑定标识"
          className="truncate rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[10px] text-slate-500"
        >
          {role.runtime_binding_key}
        </span>
      </div>
    </div>
  );
}

function RoleBranch({ node }: { node: RoleNode }) {
  return (
    <div className="flex flex-col items-center">
      <RoleCard role={node.role} />

      {node.children.length > 0 ? (
        <>
          {/* Connector from this role down to the row of its direct reports. */}
          <span aria-hidden="true" className="h-6 w-px bg-slate-300" />
          <ul className="flex flex-wrap items-start justify-center gap-6">
            {node.children.map((child) => (
              <li key={child.role.role_key} className="flex flex-col items-center">
                <span aria-hidden="true" className="h-6 w-px bg-slate-300" />
                <RoleBranch node={child} />
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default function OrganizationGraph({ spec }: { spec: OrganizationSpec }) {
  const { roots, orphans } = buildTree(spec.roles);
  // Siblings sit side by side because they report to the same lead. That reads like concurrency,
  // which it is not: this diagram carries no execution order at all.
  const hasSiblings = roots.some((node) => node.children.length > 1);

  /*
    The tree is centered on its root. On a viewport narrower than the tree, opening at scroll
    position zero shows empty canvas beside the leftmost branch and cuts the lead off, so the graph
    starts centered instead. On a wide screen there is nothing to scroll and this is a no-op.
  */
  const viewport = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    element.scrollLeft = Math.max(0, (element.scrollWidth - element.clientWidth) / 2);
  }, [spec]);

  return (
    <div className="relative rounded-2xl border border-slate-200/60 bg-white/80 p-8 shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] opacity-30 [background-size:16px_16px]"
      />

      {/* Outside the scroller: this explains the diagram and must stay readable while it is panned. */}
      <p className="relative z-10 mb-6 flex items-start gap-1.5 text-xs leading-relaxed text-slate-400">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          此图表示<strong className="font-semibold text-slate-500">汇报关系</strong>
          （岗位向谁汇报），不代表执行顺序。
          {hasSiblings ? '并排显示的岗位只是同级汇报，不意味着它们并行执行。' : null}
          实际执行顺序由每个任务的执行计划决定，见任务详情页。
        </span>
      </p>

      {/* Bleeds into the card padding so a wide tree can pan across the full card width. */}
      <div ref={viewport} className="relative z-10 -mx-8 overflow-x-auto px-8">
        <ul className="flex min-w-max flex-wrap items-start justify-center gap-10">
          {roots.map((node) => (
            <li key={node.role.role_key}>
              <RoleBranch node={node} />
            </li>
          ))}
        </ul>
      </div>

      {orphans.length > 0 ? (
        <div className="relative z-10 mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="mb-2 text-xs font-semibold text-amber-800">
            以下岗位的上级引用无法在本版本中解析，已单独列出：
          </p>
          <ul className="flex flex-wrap gap-4">
            {orphans.map((role) => (
              <li key={role.role_key}>
                <RoleCard role={role} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
