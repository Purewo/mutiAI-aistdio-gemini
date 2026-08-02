import { Ban, Clock3, Loader2, ListOrdered, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { cancelRoleWorkItem } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { RoleWorkItem, Task } from '../api/types';
import { InlineError } from './states';

const ACTIVE_QUEUE_STATUSES = new Set(['queued', 'leased', 'running']);

function statusCopy(status: string): { label: string; tone: string } {
  switch (status) {
    case 'queued':
      return { label: '等待岗位空闲', tone: 'border-amber-200 bg-amber-50 text-amber-800' };
    case 'leased':
      return { label: '已获得岗位租约', tone: 'border-sky-200 bg-sky-50 text-sky-800' };
    case 'running':
      return { label: '正在执行', tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' };
    default:
      return { label: status, tone: 'border-slate-200 bg-slate-50 text-slate-600' };
  }
}

function sourceCopy(sourceType: string): string {
  if (sourceType === 'coordination_work_item') return '协作事项';
  if (sourceType === 'assignment') return '执行计划';
  return sourceType;
}

function sortQueueItems(left: RoleWorkItem, right: RoleWorkItem): number {
  if (left.status === 'queued' && right.status !== 'queued') return -1;
  if (left.status !== 'queued' && right.status === 'queued') return 1;
  if (left.queue_position !== null && right.queue_position !== null) {
    return left.queue_position - right.queue_position;
  }
  return left.enqueued_at.localeCompare(right.enqueued_at);
}

function QueueItem({
  task,
  item,
  onTaskUpdated,
}: {
  task: Task;
  item: RoleWorkItem;
  onTaskUpdated: (task: Task) => void;
}) {
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('用户取消排队');
  const [error, setError] = useState<ApiError | null>(null);
  const presentation = statusCopy(item.status);
  const queued = item.status === 'queued';

  const cancel = async () => {
    const trimmed = reason.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await cancelRoleWorkItem(task.task_id, item.role_work_item_id, {
        reason: trimmed,
      });
      onTaskUpdated(updated);
      setCancelling(false);
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm sm:p-4">
      <div className="flex flex-wrap items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="break-all font-mono text-sm font-semibold text-slate-800">
              {item.role_key}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${presentation.tone}`}>
              {presentation.label}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {queued
              ? `队列第 ${item.queue_position ?? '—'} 位 · 前面 ${Math.max((item.queue_position ?? 1) - 1, 0)} 项`
              : item.status === 'leased'
                ? '岗位已锁定，正在准备 Runtime 输入'
                : '岗位已准入，Runtime 正在处理'}
            <span className="mx-1.5 text-slate-300">·</span>
            容量 {item.role_capacity}
            <span className="mx-1.5 text-slate-300">·</span>
            来源 {sourceCopy(item.source_type)}
          </p>
          {item.active_work ? (
            <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {item.active_work.role_work_item_id === item.role_work_item_id
                ? '当前岗位由本任务占用'
                : '当前岗位有其他工作占用'}
            </p>
          ) : null}
        </div>
        {queued ? (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCancelling((open) => !open);
            }}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {cancelling ? '收起' : '取消排队'}
          </button>
        ) : null}
      </div>

      {cancelling ? (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
          <label className="block text-xs font-medium text-amber-900" htmlFor={`queue-cancel-${item.role_work_item_id}`}>
            取消原因
          </label>
          <textarea
            id={`queue-cancel-${item.role_work_item_id}`}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            maxLength={10000}
            className="mt-1.5 block w-full resize-y rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-500/10"
          />
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={() => setCancelling(false)}
              className="min-h-11 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
            >
              保留排队
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy || reason.trim().length === 0}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              确认取消
            </button>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}
    </li>
  );
}

export default function RoleQueuePanel({
  task,
  onTaskUpdated,
}: {
  task: Task;
  onTaskUpdated: (task: Task) => void;
}) {
  const activeItems = task.role_queue
    .filter((item) => ACTIVE_QUEUE_STATUSES.has(item.status))
    .sort(sortQueueItems);
  if (activeItems.length === 0) return null;

  const queuedByRole = new Map<string, number>();
  const occupiedWorkIds = new Set<string>();
  activeItems.forEach((item) => {
    queuedByRole.set(
      item.role_key,
      Math.max(queuedByRole.get(item.role_key) ?? 0, item.queued_count),
    );
    if (item.status !== 'queued') occupiedWorkIds.add(item.role_work_item_id);
    if (item.active_work) occupiedWorkIds.add(item.active_work.role_work_item_id);
  });
  const queuedCount = [...queuedByRole.values()].reduce((total, count) => total + count, 0);
  const occupiedCount = occupiedWorkIds.size;
  const roleCount = new Set(activeItems.map((item) => item.role_key)).size;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ListOrdered className="h-5 w-5 text-amber-600" aria-hidden="true" />
        <h2 className="text-lg font-semibold text-slate-800">岗位调度</h2>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
          {queuedCount > 0 ? `${queuedCount} 项排队` : '正在准入'}
        </span>
      </div>
      <div className="rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/80 via-white to-sky-50/60 p-3.5 shadow-sm sm:p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2.5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="text-sm leading-relaxed text-slate-600">
              同一岗位按顺序处理；排队期间不会启动 Runtime，也不会占用 Workspace。岗位空闲后，队列会自动继续。
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-right text-xs text-slate-500 sm:flex sm:gap-5">
            <div>
              <dt>排队</dt>
              <dd className="font-semibold tabular-nums text-amber-800">{queuedCount}</dd>
            </div>
            <div>
              <dt>占用</dt>
              <dd className="font-semibold tabular-nums text-sky-800">{occupiedCount}</dd>
            </div>
            <div>
              <dt>岗位</dt>
              <dd className="font-semibold tabular-nums text-slate-700">{roleCount}</dd>
            </div>
          </dl>
        </div>
        <ul className="mt-3 space-y-2">
          {activeItems.map((item) => (
            <QueueItem key={item.role_work_item_id} task={task} item={item} onTaskUpdated={onTaskUpdated} />
          ))}
        </ul>
      </div>
    </section>
  );
}
