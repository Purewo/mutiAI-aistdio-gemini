import React, { useState } from 'react';
import { Activity, Cpu, Gauge, Pencil, ShieldCheck, X } from 'lucide-react';
import { getRuntimeControls, listRuntimeBindings, upsertRuntimeBinding } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type {
  RuntimeBinding,
  RuntimeCapabilityProfile,
  RuntimeControl,
  RuntimeSecurityMode,
} from '../api/types';
import { useApiResource } from '../api/useApiResource';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';

/**
 * Owner-scoped Runtime configuration.
 *
 * Bindings select each role's provider, model, reasoning effort, and named security mode; the
 * first execution of an Assignment freezes these values into its RuntimeExecution snapshot. The
 * page displays the versioned capability profile the feasibility validator evaluates against, and
 * shows the product's admission, capacity, and token-budget state from the controls resource.
 *
 * Rejected changes surface the backend conflict envelope (for example RUNTIME_PROVIDER_MISMATCH or
 * RUNTIME_SECURITY_MODE_INVALID) without inventing fallback values, and nothing here bypasses
 * backend policy validation.
 */

/**
 * The contracted security modes, checked against the generated contract type so a contract change
 * fails the build instead of leaving a stale hard-coded list.
 */
const SECURITY_MODES = ['demo_full_access', 'workspace_restricted'] as const satisfies readonly RuntimeSecurityMode[];

const SECURITY_MODE_PRESENTATION: Record<RuntimeSecurityMode, { label: string; tone: string }> = {
  demo_full_access: {
    label: '完全访问（仅限 localhost 演示）',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  workspace_restricted: {
    label: '工作区受限（支持审批）',
    tone: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
  },
};

export default function RuntimeConfig() {
  const controls = useApiResource((signal) => getRuntimeControls(signal), []);
  const bindings = useApiResource((signal) => listRuntimeBindings(signal), []);

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="Runtime 配置" description="岗位 Runtime 绑定与产品准入状态" />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-5xl space-y-8">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Gauge className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">准入与预算</h2>
            </div>
            {controls.state.status === 'loading' ? <LoadingState label="加载 Runtime 状态中..." /> : null}
            {controls.state.status === 'error' ? (
              <ErrorState error={controls.state.error} title="加载 Runtime 状态失败" onRetry={controls.reload} />
            ) : null}
            {controls.state.status === 'ready' ? <ControlsCard controls={controls.state.data} /> : null}
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2">
              <Cpu className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">Runtime 绑定</h2>
            </div>
            {bindings.state.status === 'loading' ? <LoadingState label="加载绑定中..." /> : null}
            {bindings.state.status === 'error' ? (
              <ErrorState error={bindings.state.error} title="加载绑定失败" onRetry={bindings.reload} />
            ) : null}
            {bindings.state.status === 'ready' && bindings.state.data.length === 0 ? (
              <EmptyState
                title="还没有 Runtime 绑定"
                description="绑定会在组织岗位首次引用时由后端按需创建。"
              />
            ) : null}
            {bindings.state.status === 'ready' && bindings.state.data.length > 0 ? (
              <ul className="space-y-4">
                {bindings.state.data.map((binding) => (
                  <BindingCard
                    key={binding.runtime_binding_id}
                    binding={binding}
                    onSaved={bindings.reload}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value}</dd>
    </div>
  );
}

function ControlsCard({ controls }: { controls: RuntimeControl }) {
  const budgetConfigured =
    controls.token_budget_limit !== null && controls.token_reservation_per_execution !== null;

  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatItem label="Runtime 提供方" value={<span className="font-mono">{controls.provider}</span>} />
        <StatItem
          label="并发执行"
          value={`${controls.active_executions} / ${controls.max_concurrent_executions}`}
        />
        <StatItem
          label="Provider 容量信号"
          value={
            <span className="inline-flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              {controls.provider_capacity_status}
              {controls.provider_capacity_reason ? `（${controls.provider_capacity_reason}）` : null}
            </span>
          }
        />
        <StatItem
          label="容量观测于"
          value={formatDateTime(controls.provider_capacity_observed_at)}
        />
        {budgetConfigured ? (
          <>
            <StatItem label="Token 预算上限" value={controls.token_budget_limit} />
            <StatItem label="单次预留" value={controls.token_reservation_per_execution} />
            <StatItem label="已预留 / 已消耗" value={`${controls.tokens_reserved} / ${controls.tokens_consumed}`} />
            <StatItem label="剩余" value={controls.tokens_remaining ?? '—'} />
          </>
        ) : (
          <StatItem label="Token 预算" value="未配置" />
        )}
      </dl>
    </div>
  );
}

function CapabilityProfileSummary({ profile }: { profile: RuntimeCapabilityProfile }) {
  const spec = profile.profile;
  const unknownable = (value: unknown, render: (v: NonNullable<unknown>) => string): string =>
    value === null || value === undefined ? '未知' : render(value);

  const entries: Array<[string, string]> = [
    ['操作系统', `${spec.os_family}${spec.os_version ? ` ${spec.os_version}` : ''}`],
    ['架构', spec.architecture ?? '未知'],
    ['界面', unknownable(spec.headless, (v) => (v ? '无 GUI（headless）' : '有 GUI'))],
    ['CPU 等级', spec.cpu_capacity_class],
    ['内存', spec.memory_mb !== null && spec.memory_mb !== undefined ? `${spec.memory_mb} MB` : '未知'],
    ['GPU', unknownable(spec.gpu_available, (v) => (v ? `可用${spec.gpu_kind ? `（${spec.gpu_kind}）` : ''}` : '不可用'))],
    ['网络', unknownable(spec.network_access, (v) => (v ? '允许' : '禁止'))],
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600">
        <ShieldCheck className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        能力画像
        <span className="font-normal text-slate-400">
          第 {profile.revision} 版 · 来源 {profile.source} · {profile.trusted ? '可信' : '未信任'}
        </span>
      </p>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3 lg:grid-cols-4">
        {entries.map(([label, value]) => (
          <div key={label} className="text-xs">
            <dt className="inline text-slate-400">{label}：</dt>
            <dd className="inline text-slate-600">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function BindingCard({ binding, onSaved }: { binding: RuntimeBinding; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [model, setModel] = useState(binding.model ?? '');
  const [effort, setEffort] = useState(binding.reasoning_effort ?? '');
  const [securityMode, setSecurityMode] = useState<RuntimeSecurityMode>(binding.security_mode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const modeBadge = SECURITY_MODE_PRESENTATION[binding.security_mode] ?? {
    label: binding.security_mode,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
  };

  const startEditing = () => {
    setModel(binding.model ?? '');
    setEffort(binding.reasoning_effort ?? '');
    setSecurityMode(binding.security_mode);
    setError(null);
    setEditing(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // The PUT is idempotent for identical values. The provider is not user-editable here: V1 has
      // one active provider, and a mismatch is a backend conflict, not a frontend choice.
      await upsertRuntimeBinding(binding.binding_key, {
        provider: binding.provider,
        model: model.trim().length > 0 ? model.trim() : null,
        reasoning_effort: effort.trim().length > 0 ? effort.trim() : null,
        security_mode: securityMode,
      });
      setEditing(false);
      onSaved();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm transition-all duration-200 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-mono text-sm font-bold text-slate-900">{binding.binding_key}</h3>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${modeBadge.tone}`}>
          {modeBadge.label}
        </span>
        {!binding.is_active ? (
          <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
            未启用
          </span>
        ) : null}
        {!editing ? (
          <button
            type="button"
            onClick={startEditing}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            编辑
          </button>
        ) : null}
      </div>

      {!editing ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          <StatItem label="提供方" value={<span className="font-mono">{binding.provider}</span>} />
          <StatItem label="模型" value={binding.model ?? '未指定（Provider 默认）'} />
          <StatItem label="推理力度" value={binding.reasoning_effort ?? '未指定'} />
          <StatItem label="更新于" value={formatDateTime(binding.updated_at)} />
        </dl>
      ) : (
        <form onSubmit={handleSubmit} className="mt-4 space-y-4" noValidate>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label
                htmlFor={`binding-${binding.binding_key}-model`}
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                模型（留空使用 Provider 默认）
              </label>
              <input
                id={`binding-${binding.binding_key}-model`}
                name={`binding-${binding.binding_key}-model`}
                type="text"
                value={model}
                disabled={saving}
                onChange={(event) => setModel(event.target.value)}
                placeholder="gpt-5.5"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label
                htmlFor={`binding-${binding.binding_key}-effort`}
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                推理力度（留空使用默认）
              </label>
              <input
                id={`binding-${binding.binding_key}-effort`}
                name={`binding-${binding.binding_key}-effort`}
                type="text"
                value={effort}
                disabled={saving}
                onChange={(event) => setEffort(event.target.value)}
                placeholder="medium"
                className={`${fieldClass} font-mono`}
              />
            </div>
            <div>
              <label
                htmlFor={`binding-${binding.binding_key}-mode`}
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                安全模式
              </label>
              <select
                id={`binding-${binding.binding_key}-mode`}
                name={`binding-${binding.binding_key}-mode`}
                value={securityMode}
                disabled={saving}
                onChange={(event) => setSecurityMode(event.target.value as RuntimeSecurityMode)}
                className={fieldClass}
              >
                {SECURITY_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {SECURITY_MODE_PRESENTATION[mode].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? <InlineError error={error} /> : null}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      )}

      <div className="mt-3">
        <CapabilityProfileSummary profile={binding.capability_profile} />
      </div>
    </li>
  );
}
