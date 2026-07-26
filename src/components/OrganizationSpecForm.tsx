/**
 * Structured builder for one organization proposal request.
 *
 * The contracted proposal route accepts an already-structured `OrganizationSpec`; the future
 * platform-assistant conversation must emit this same contract. Until that flow exists, the user
 * assembles the spec here directly. This is a single-request lifecycle: each submission creates one
 * new proposal version, and there is no multi-turn patching because no patch contract exists.
 *
 * Client-side checks only guide input toward the contract's structural rules (exactly one lead,
 * unique role keys). The backend remains the validation authority, and its envelope is what the
 * submission flow displays on rejection.
 */
import React, { useState } from 'react';
import { Plus, Send, Trash2 } from 'lucide-react';
import type { OrganizationSpec } from '../api/types';

export interface ProposalDraft {
  sourceRequest: string;
  spec: OrganizationSpec;
}

interface DraftRole {
  role_key: string;
  name: string;
  responsibility: string;
  is_lead: boolean;
  reports_to: string;
  runtime_binding_key: string;
}

/**
 * Editable default only. `codex-local-default` is the binding key used by the backend's local demo
 * configuration; the field stays free-form because bindings are owner-defined product data.
 */
const DEFAULT_BINDING_KEY = 'codex-local-default';

function emptyRole(overrides: Partial<DraftRole> = {}): DraftRole {
  return {
    role_key: '',
    name: '',
    responsibility: '',
    is_lead: false,
    reports_to: '',
    runtime_binding_key: DEFAULT_BINDING_KEY,
    ...overrides,
  };
}

const INITIAL_ROLES: DraftRole[] = [
  emptyRole({ role_key: 'lead', is_lead: true }),
  emptyRole({ role_key: '', reports_to: 'lead' }),
];

/** Issues that would fail the contract's structural rules before the request is worth sending. */
function draftIssues(name: string, roles: DraftRole[]): string[] {
  const issues: string[] = [];
  if (name.trim().length === 0) issues.push('组织名称不能为空。');
  if (roles.length === 0) issues.push('至少需要一个岗位。');

  const leadCount = roles.filter((role) => role.is_lead).length;
  if (leadCount !== 1) issues.push('必须有且仅有一个组织负责人。');

  const keys = roles.map((role) => role.role_key.trim());
  if (keys.some((key) => key.length === 0)) issues.push('每个岗位都需要岗位标识。');
  if (new Set(keys.filter((key) => key.length > 0)).size !== keys.filter((key) => key.length > 0).length) {
    issues.push('岗位标识不能重复。');
  }
  for (const role of roles) {
    if (role.name.trim().length === 0) issues.push(`岗位「${role.role_key || '未命名'}」缺少名称。`);
    if (role.responsibility.trim().length === 0) {
      issues.push(`岗位「${role.role_key || '未命名'}」缺少职责描述。`);
    }
    if (role.runtime_binding_key.trim().length === 0) {
      issues.push(`岗位「${role.role_key || '未命名'}」缺少 Runtime 绑定标识。`);
    }
  }
  return issues;
}

export default function OrganizationSpecForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (draft: ProposalDraft) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sourceRequest, setSourceRequest] = useState('');
  const [roles, setRoles] = useState<DraftRole[]>(INITIAL_ROLES);
  const [showIssues, setShowIssues] = useState(false);

  const issues = draftIssues(name, roles);

  const updateRole = (index: number, patch: Partial<DraftRole>) => {
    setRoles((current) =>
      current.map((role, i) => (i === index ? { ...role, ...patch } : role)),
    );
  };

  const setLead = (index: number) => {
    setRoles((current) =>
      current.map((role, i) => ({
        ...role,
        is_lead: i === index,
        // A lead reports to no one; clearing here keeps the submitted spec consistent.
        reports_to: i === index ? '' : role.reports_to,
      })),
    );
  };

  const removeRole = (index: number) => {
    setRoles((current) => {
      const removedKey = current[index]?.role_key;
      return current
        .filter((_, i) => i !== index)
        .map((role) => (role.reports_to === removedKey ? { ...role, reports_to: '' } : role));
    });
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (issues.length > 0) {
      setShowIssues(true);
      return;
    }
    setShowIssues(false);
    onSubmit({
      sourceRequest: sourceRequest.trim(),
      spec: {
        schema_version: '1.0',
        name: name.trim(),
        description: description.trim(),
        roles: roles.map((role) => ({
          role_key: role.role_key.trim(),
          name: role.name.trim(),
          responsibility: role.responsibility.trim(),
          is_lead: role.is_lead,
          reports_to: role.is_lead || role.reports_to === '' ? null : role.reports_to,
          runtime_binding_key: role.runtime_binding_key.trim(),
        })),
      },
    });
  };

  const fieldClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label htmlFor="org-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            组织名称
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
            placeholder="例如：内容研发组织"
            className={fieldClass}
          />
        </div>
        <div>
          <label htmlFor="org-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
            组织简介
          </label>
          <input
            id="org-desc"
            type="text"
            value={description}
            disabled={disabled}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="这个组织负责什么"
            className={fieldClass}
          />
        </div>
      </div>

      <div>
        <label htmlFor="org-source" className="mb-1.5 block text-sm font-medium text-slate-700">
          需求描述（可选）
        </label>
        <textarea
          id="org-source"
          value={sourceRequest}
          disabled={disabled}
          onChange={(event) => setSourceRequest(event.target.value)}
          rows={2}
          placeholder="用您自己的话描述这个组织要解决的问题，会随方案一起保存。"
          className={`${fieldClass} resize-y`}
        />
      </div>

      <fieldset className="space-y-4">
        <legend className="flex w-full items-center justify-between">
          <span className="text-sm font-semibold text-slate-800">岗位（{roles.length}）</span>
        </legend>

        {roles.map((role, index) => (
          <div
            key={index}
            className={`rounded-2xl border p-4 ${
              role.is_lead ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200 bg-white'
            }`}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="radio"
                  name="lead-role"
                  checked={role.is_lead}
                  disabled={disabled}
                  onChange={() => setLead(index)}
                  className="h-4 w-4 accent-indigo-600"
                />
                组织负责人
              </label>
              <button
                type="button"
                onClick={() => removeRole(index)}
                disabled={disabled || roles.length <= 1}
                aria-label={`删除岗位 ${role.role_key || index + 1}`}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label htmlFor={`role-${index}-key`} className="mb-1 block text-xs font-medium text-slate-500">
                  岗位标识
                </label>
                <input
                  id={`role-${index}-key`}
                  name={`role-${index}-key`}
                  type="text"
                  value={role.role_key}
                  disabled={disabled}
                  onChange={(event) => updateRole(index, { role_key: event.target.value })}
                  placeholder="writer"
                  className={`${fieldClass} font-mono`}
                />
              </div>
              <div>
                <label htmlFor={`role-${index}-name`} className="mb-1 block text-xs font-medium text-slate-500">
                  岗位名称
                </label>
                <input
                  id={`role-${index}-name`}
                  name={`role-${index}-name`}
                  type="text"
                  value={role.name}
                  disabled={disabled}
                  onChange={(event) => updateRole(index, { name: event.target.value })}
                  placeholder="内容撰写"
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor={`role-${index}-reports-to`} className="mb-1 block text-xs font-medium text-slate-500">
                  汇报对象
                </label>
                <select
                  id={`role-${index}-reports-to`}
                  name={`role-${index}-reports-to`}
                  value={role.is_lead ? '' : role.reports_to}
                  disabled={disabled || role.is_lead}
                  onChange={(event) => updateRole(index, { reports_to: event.target.value })}
                  className={fieldClass}
                >
                  <option value="">（无）</option>
                  {roles
                    .filter((other, i) => i !== index && other.role_key.trim().length > 0)
                    .map((other) => (
                      <option key={other.role_key} value={other.role_key}>
                        {other.name.trim() || other.role_key}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor={`role-${index}-binding`} className="mb-1 block text-xs font-medium text-slate-500">
                  Runtime 绑定标识
                </label>
                <input
                  id={`role-${index}-binding`}
                  name={`role-${index}-binding`}
                  type="text"
                  value={role.runtime_binding_key}
                  disabled={disabled}
                  onChange={(event) => updateRole(index, { runtime_binding_key: event.target.value })}
                  className={`${fieldClass} font-mono`}
                />
              </div>
              <div className="md:col-span-2 xl:col-span-4">
                <label htmlFor={`role-${index}-responsibility`} className="mb-1 block text-xs font-medium text-slate-500">
                  职责
                </label>
                <textarea
                  id={`role-${index}-responsibility`}
                  name={`role-${index}-responsibility`}
                  value={role.responsibility}
                  disabled={disabled}
                  onChange={(event) => updateRole(index, { responsibility: event.target.value })}
                  rows={2}
                  placeholder="这个岗位具体负责什么"
                  className={`${fieldClass} resize-y`}
                />
              </div>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={() => setRoles((current) => [...current, emptyRole()])}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:text-indigo-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加岗位
        </button>
      </fieldset>

      {showIssues && issues.length > 0 ? (
        <ul role="alert" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          {issues.map((issue) => (
            <li key={issue} className="text-sm text-amber-800">
              {issue}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          {disabled ? '提交中...' : '生成组织方案'}
        </button>
      </div>
    </form>
  );
}
