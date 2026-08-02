/**
 * Task usage and backend-owned cost telemetry.
 *
 * Provider observations, conservative charged Tokens, effective fuses, and USD estimates are
 * intentionally kept distinct. Decimal cost strings are rendered exactly as returned; the
 * browser never applies model rates or reconstructs a price.
 */
import { CircleDollarSign, Gauge, TimerReset } from 'lucide-react';
import type { AssignmentTokenUsage, TaskTokenUsage } from '../api/types';
import {
  costStatusLabel,
  formatRuntimeLimit,
  formatTokenCount,
  formatUsd,
} from '../lib/executionBudget';

function Stat({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={accent ? 'rounded-xl border border-indigo-200/70 bg-indigo-50/50 p-3' : ''}>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${accent ? 'text-base text-indigo-700' : 'text-sm text-slate-800'}`}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{hint}</p> : null}
    </div>
  );
}

function CostStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'estimated'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : status === 'unavailable'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : status === 'pending'
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {costStatusLabel(status)}
    </span>
  );
}

function taskCostValue(usage: TaskTokenUsage): string {
  if (usage.estimated_cost_usd != null) return formatUsd(usage.estimated_cost_usd);
  if (usage.pending_execution_count > 0) return '等待用量';
  if (usage.unavailable_cost_execution_count > 0) return '费用暂不可用';
  return '—';
}

function LimitSnapshot({ usage }: { usage: AssignmentTokenUsage }) {
  return (
    <dl className="grid grid-cols-3 gap-1.5 text-[10px]">
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
        <dt className="text-slate-400">Token 上限</dt>
        <dd className="mt-0.5 font-mono font-semibold text-slate-700">
          {formatTokenCount(usage.max_tokens_per_attempt)}
        </dd>
        {usage.effective_token_limit !== usage.max_tokens_per_attempt ? (
          <p className="mt-0.5 text-[9px] text-slate-400">
            生效 {formatTokenCount(usage.effective_token_limit)}
          </p>
        ) : null}
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
        <dt className="text-slate-400">费用上限</dt>
        <dd className="mt-0.5 font-mono font-semibold text-slate-700">
          {formatUsd(usage.max_cost_usd_per_attempt)}
        </dd>
        <p className="mt-0.5 text-[9px] text-slate-400">单次尝试</p>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-2 py-1.5">
        <dt className="text-slate-400">运行上限</dt>
        <dd className="mt-0.5 font-semibold text-slate-700">
          {formatRuntimeLimit(usage.max_runtime_seconds_per_attempt)}
        </dd>
        <p className="mt-0.5 text-[9px] text-slate-400">
          生效 {formatRuntimeLimit(usage.effective_runtime_seconds)}
        </p>
      </div>
    </dl>
  );
}

function UsageRow({ usage }: { usage: AssignmentTokenUsage }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-3 pr-4">
        <p className="font-mono text-xs font-semibold text-slate-800">{usage.agent_role_key}</p>
        <p className="mt-0.5 text-[11px] text-slate-400">{usage.assignment_kind}</p>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-600">
        <p className="break-all">{usage.actual_model ?? usage.requested_model ?? '—'}</p>
        {usage.actual_model && usage.requested_model && usage.actual_model !== usage.requested_model ? (
          <p className="mt-0.5 text-[11px] text-amber-600">请求 {usage.requested_model}</p>
        ) : null}
        <p className="mt-1 text-[10px] text-slate-400">{usage.provider}</p>
      </td>
      <td className="py-3 pr-4 text-xs text-slate-600">
        <p>{usage.execution_status}</p>
        <p className="text-[11px] text-slate-400">{usage.usage_status}</p>
      </td>
      <td className="w-[25rem] py-3 pr-4">
        <LimitSnapshot usage={usage} />
      </td>
      <td className="py-3 pr-4 text-right text-xs tabular-nums text-slate-600">
        <p>观测 {formatTokenCount(usage.total_tokens)}</p>
        <p className="mt-0.5 font-semibold text-slate-800">
          计费 {formatTokenCount(usage.charged_tokens)}
        </p>
      </td>
      <td className="py-3 pr-4 text-right text-xs tabular-nums text-slate-600">
        <p className="font-semibold text-slate-800">{formatUsd(usage.cost_usd)}</p>
        <p className="mt-1"><CostStatusBadge status={usage.cost_status} /></p>
      </td>
      <td className="py-3 text-[10px] text-slate-400">
        <span className="break-all font-mono">{usage.pricing_catalog_version ?? '—'}</span>
      </td>
    </tr>
  );
}

function UsageCard({ usage }: { usage: AssignmentTokenUsage }) {
  const model = usage.actual_model ?? usage.requested_model ?? '—';
  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-all font-mono text-xs font-semibold text-slate-800">
            {usage.agent_role_key}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{usage.assignment_kind}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-sm font-semibold tabular-nums text-slate-800">
            {formatUsd(usage.cost_usd)}
          </p>
          <p className="mt-1"><CostStatusBadge status={usage.cost_status} /></p>
        </div>
      </div>

      <div className="mt-3">
        <LimitSnapshot usage={usage} />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-slate-200/70 pt-3 text-xs">
        <div className="col-span-2">
          <dt className="text-[10px] text-slate-400">模型</dt>
          <dd className="break-all text-slate-600">{model}</dd>
          {usage.actual_model && usage.requested_model && usage.actual_model !== usage.requested_model ? (
            <dd className="text-[10px] text-amber-600">请求 {usage.requested_model}</dd>
          ) : null}
        </div>
        <div>
          <dt className="text-[10px] text-slate-400">执行 / 用量状态</dt>
          <dd className="text-slate-600">{usage.execution_status} · {usage.usage_status}</dd>
        </div>
        <div>
          <dt className="text-[10px] text-slate-400">观测 / 计费 Token</dt>
          <dd className="tabular-nums text-slate-600">
            {formatTokenCount(usage.total_tokens)} / {formatTokenCount(usage.charged_tokens)}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[10px] text-slate-400">价格目录快照</dt>
          <dd className="break-all font-mono text-[10px] text-slate-600">
            {usage.pricing_catalog_version ?? '—'}
          </dd>
        </div>
      </dl>
    </li>
  );
}

export default function TaskUsagePanel({ usage }: { usage: TaskTokenUsage }) {
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        <div className="task-usage-header border-b border-slate-100 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-indigo-200 bg-white text-indigo-600">
              <Gauge className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">执行预算与用量</h3>
              <p className="text-[11px] text-slate-500">价格、成本与生效限制均来自后端快照</p>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-4 p-4 min-[390px]:grid-cols-2 sm:grid-cols-3 sm:p-5 lg:grid-cols-4">
          <Stat
            label="后端估算费用"
            value={taskCostValue(usage)}
            hint={`已估算 ${usage.reported_cost_execution_count ?? 0} · 暂不可用 ${usage.unavailable_cost_execution_count ?? 0}`}
            accent
          />
          <Stat
            label="计费 Token（产品账本）"
            value={usage.charged_tokens.toLocaleString('zh-CN')}
            hint="用量不可得时按预留量保守计费"
          />
          <Stat label="预留 Token" value={usage.reserved_tokens.toLocaleString('zh-CN')} />
          <Stat
            label="Provider 观测总量"
            value={usage.observed_total_tokens.toLocaleString('zh-CN')}
            hint="模型上报值，与计费值含义不同"
          />
          <Stat
            label="执行次数"
            value={usage.execution_count}
            hint={`已上报 ${usage.reported_execution_count} · 无用量 ${usage.unavailable_execution_count} · 待结算 ${usage.pending_execution_count}`}
          />
          <Stat label="输入" value={usage.input_tokens.toLocaleString('zh-CN')} />
          <Stat label="缓存输入" value={usage.cached_input_tokens.toLocaleString('zh-CN')} />
          <Stat label="输出 / 推理输出" value={`${usage.output_tokens.toLocaleString('zh-CN')} / ${usage.reasoning_output_tokens.toLocaleString('zh-CN')}`} />
        </dl>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-100 px-4 py-3 text-[10px] text-slate-400 sm:px-5">
          <span className="inline-flex items-center gap-1.5">
            <CircleDollarSign className="h-3.5 w-3.5" aria-hidden="true" />
            前端不计算或编辑模型单价
          </span>
          <span className="inline-flex items-center gap-1.5">
            <TimerReset className="h-3.5 w-3.5" aria-hidden="true" />
            技术重试与业务重放均按新尝试独立计限
          </span>
        </div>
      </div>

      {usage.assignments.length > 0 ? (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-3 shadow-sm sm:hidden">
          <ul className="space-y-2">
            {usage.assignments.map((row) => (
              <UsageCard key={row.assignment_id} usage={row} />
            ))}
          </ul>
        </div>
      ) : null}

      {usage.assignments.length > 0 ? (
        <div className="hidden overflow-x-auto rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm sm:block">
          <table className="w-full min-w-[67rem] text-left">
            <thead>
              <tr className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-4">岗位</th>
                <th className="pb-2 pr-4">模型</th>
                <th className="pb-2 pr-4">状态</th>
                <th className="pb-2 pr-4">单次限制快照</th>
                <th className="pb-2 pr-4 text-right">Token</th>
                <th className="pb-2 pr-4 text-right">估算费用</th>
                <th className="pb-2">价格目录</th>
              </tr>
            </thead>
            <tbody>
              {usage.assignments.map((row) => (
                <UsageRow key={row.assignment_id} usage={row} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
