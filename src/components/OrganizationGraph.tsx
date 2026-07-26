/**
 * Read-only organization diagram.
 *
 * The graph is rendered by code from the published `OrganizationSpec`, never by image generation.
 * Structure comes from `is_lead` and `reports_to`, so it adapts to any number of roles and any depth
 * instead of assuming a fixed set of specialists. This is a preview: there is no drag-and-drop
 * editing in V1.
 */
import { Crown, User2 } from 'lucide-react';
import type { AgentRoleSpec, OrganizationSpec } from '../api/types';

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

  return (
    <div className="relative overflow-x-auto rounded-2xl border border-slate-200/60 bg-white/80 p-8 shadow-sm">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] opacity-30 [background-size:16px_16px]"
      />

      <ul className="relative z-10 flex min-w-max flex-wrap items-start justify-center gap-10">
        {roots.map((node) => (
          <li key={node.role.role_key}>
            <RoleBranch node={node} />
          </li>
        ))}
      </ul>

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
