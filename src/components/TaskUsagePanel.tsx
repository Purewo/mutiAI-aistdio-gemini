/**
 * Task Token usage.
 *
 * The contract separates two different things and the UI must not blur them: Provider-observed
 * counters (what the model reported) and the conservative `charged_tokens` budget value (what the
 * product debited, which falls back to the reservation when usage is unavailable). Totals come from
 * the backend as-is; nothing here recomputes a total in a way that changes its meaning.
 */
import type { AssignmentTokenUsage, TaskTokenUsage } from '../api/types';

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-800">{value}</dd>
      {hint ? <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">{hint}</p> : null}
    </div>
  );
}

function num(value: number | null): string {
  return value === null ? '—' : value.toLocaleString('zh-CN');
}

function UsageRow({ usage }: { usage: AssignmentTokenUsage }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="py-2 pr-3">
        <p className="font-mono text-xs font-semibold text-slate-800">{usage.agent_role_key}</p>
        <p className="text-[11px] text-slate-400">{usage.assignment_kind}</p>
      </td>
      <td className="py-2 pr-3 text-xs text-slate-600">
        <p>{usage.actual_model ?? usage.requested_model ?? '—'}</p>
        {usage.actual_model && usage.requested_model && usage.actual_model !== usage.requested_model ? (
          <p className="text-[11px] text-amber-600">请求 {usage.requested_model}</p>
        ) : null}
      </td>
      <td className="py-2 pr-3 text-xs text-slate-600">
        <p>{usage.execution_status}</p>
        <p className="text-[11px] text-slate-400">{usage.usage_status}</p>
      </td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-slate-600">
        {num(usage.input_tokens)}
      </td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-slate-600">
        {num(usage.output_tokens)}
      </td>
      <td className="py-2 pr-3 text-right text-xs tabular-nums text-slate-600">
        {num(usage.total_tokens)}
      </td>
      <td className="py-2 text-right text-xs font-semibold tabular-nums text-slate-800">
        {num(usage.charged_tokens)}
      </td>
    </tr>
  );
}

export default function TaskUsagePanel({ usage }: { usage: TaskTokenUsage }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="执行次数"
            value={usage.execution_count}
            hint={`已上报 ${usage.reported_execution_count} · 无用量 ${usage.unavailable_execution_count} · 待结算 ${usage.pending_execution_count}`}
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
          <Stat label="输入" value={usage.input_tokens.toLocaleString('zh-CN')} />
          <Stat label="缓存输入" value={usage.cached_input_tokens.toLocaleString('zh-CN')} />
          <Stat label="输出" value={usage.output_tokens.toLocaleString('zh-CN')} />
          <Stat label="推理输出" value={usage.reasoning_output_tokens.toLocaleString('zh-CN')} />
        </dl>
      </div>

      {usage.assignments.length > 0 ? (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3">岗位</th>
                <th className="pb-2 pr-3">模型</th>
                <th className="pb-2 pr-3">状态</th>
                <th className="pb-2 pr-3 text-right">输入</th>
                <th className="pb-2 pr-3 text-right">输出</th>
                <th className="pb-2 pr-3 text-right">观测合计</th>
                <th className="pb-2 text-right">计费</th>
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
