/**
 * Per-role wall-clock breakdown for one Task.
 *
 * Rows are attributed by `agent_role_key` and sorted slowest first, so the dominant cost is the
 * first thing read. Bars are proportional to the Task total when it is known, which makes a single
 * dominating role obvious without the reader comparing numbers by hand.
 *
 * Every value is a backend-reported wall-clock observation. It can include queueing and waiting,
 * so it is presented as elapsed time, never as model compute time.
 */
import { Clock } from 'lucide-react';
import type { Task } from '../api/types';
import { formatDuration } from '../lib/format';

interface RoleTiming {
  roleKey: string;
  kinds: string[];
  wallSeconds: number;
  runSeconds: number | null;
  queueSeconds: number | null;
  /** Assignment time not accounted for by its Runtime execution: validation, publication, settling. */
  productSeconds: number | null;
  incomplete: boolean;
}

function collect(task: Task): RoleTiming[] {
  const byRole = new Map<string, RoleTiming>();

  for (const assignment of task.assignments) {
    const execution = assignment.runtime_execution;
    const entry = byRole.get(assignment.agent_role_key) ?? {
      roleKey: assignment.agent_role_key,
      kinds: [],
      wallSeconds: 0,
      runSeconds: null,
      queueSeconds: null,
      productSeconds: null,
      incomplete: false,
    };

    if (!entry.kinds.includes(assignment.assignment_kind)) entry.kinds.push(assignment.assignment_kind);

    if (assignment.wall_duration_seconds === null) {
      entry.incomplete = true;
    } else {
      entry.wallSeconds += assignment.wall_duration_seconds;
    }

    const add = (current: number | null, value: number | null) =>
      value === null ? current : (current ?? 0) + value;

    entry.runSeconds = add(entry.runSeconds, execution?.run_duration_seconds ?? null);
    entry.queueSeconds = add(entry.queueSeconds, execution?.queue_duration_seconds ?? null);

    if (assignment.wall_duration_seconds !== null && execution?.wall_duration_seconds != null) {
      entry.productSeconds = add(
        entry.productSeconds,
        Math.max(0, assignment.wall_duration_seconds - execution.wall_duration_seconds),
      );
    }

    byRole.set(assignment.agent_role_key, entry);
  }

  return [...byRole.values()].sort((a, b) => b.wallSeconds - a.wallSeconds);
}

export default function TaskTimingPanel({ task }: { task: Task }) {
  const rows = collect(task);
  if (rows.length === 0) return null;

  const total = task.wall_duration_seconds;
  const widest = Math.max(...rows.map((r) => r.wallSeconds), 1);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <div>
            <p className="text-xs font-medium text-slate-500">任务总耗时</p>
            <p className="mt-0.5 text-lg font-semibold text-slate-800">{formatDuration(total)}</p>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            以下均为产品观测到的墙钟时间，可能包含排队与等待，不等同于模型计算时间。
          </p>
        </div>

        <ul className="space-y-3">
          {rows.map((row) => {
            const share = total && total > 0 ? row.wallSeconds / total : row.wallSeconds / widest;
            return (
              <li key={row.roleKey}>
                <div className="mb-1 flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-semibold text-slate-800">
                    {row.roleKey}
                  </span>
                  <span className="text-[11px] text-slate-400">{row.kinds.join(' + ')}</span>
                  <span className="ml-auto inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-slate-700">
                    <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {formatDuration(row.incomplete && row.wallSeconds === 0 ? null : row.wallSeconds)}
                  </span>
                </div>

                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                  role="presentation"
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-blue-500"
                    style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
                  />
                </div>

                <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-400">
                  <div className="flex gap-1" title="Runtime 调度等待">
                    <dt>排队</dt>
                    <dd className="tabular-nums">{formatDuration(row.queueSeconds)}</dd>
                  </div>
                  <div className="flex gap-1" title="Codex 实际执行阶段">
                    <dt>Codex 运行</dt>
                    <dd className="tabular-nums">{formatDuration(row.runSeconds)}</dd>
                  </div>
                  <div
                    className="flex gap-1"
                    title="Assignment 总耗时减去 Runtime 耗时：产出校验、Artifact 发布与状态收敛"
                  >
                    <dt>产品处理</dt>
                    <dd className="tabular-nums">{formatDuration(row.productSeconds)}</dd>
                  </div>
                  {row.incomplete ? <div className="text-amber-600">含未完成阶段</div> : null}
                </dl>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
