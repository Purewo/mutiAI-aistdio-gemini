/**
 * Display helpers for backend-owned execution limits and cost snapshots.
 *
 * Dollar values stay as contracted decimal strings. These helpers never parse prices, apply a
 * rate, or derive a cost in the browser; they only add product labels and units to persisted
 * backend values.
 */

export function formatTokenCount(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('zh-CN');
}

export function formatUsd(value: string | null | undefined): string {
  return value == null ? '—' : `$${value}`;
}

export function formatRuntimeLimit(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) {
    return `${seconds.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 秒`;
  }
  if (seconds % 60 === 0) {
    return `${(seconds / 60).toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 分钟`;
  }
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes} 分 ${rest.toLocaleString('zh-CN', { maximumFractionDigits: 3 })} 秒`;
}

export function costStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case 'estimated':
      return '后端估算';
    case 'pending':
      return '等待用量';
    case 'unavailable':
      return '费用暂不可用';
    default:
      return status ?? '未知状态';
  }
}

export function hasDeclaredExecutionLimit(limits: {
  max_tokens_per_attempt?: number | null;
  max_cost_usd_per_attempt?: string | null;
  max_runtime_seconds_per_attempt?: number | null;
} | null | undefined): boolean {
  return Boolean(
    limits &&
      (limits.max_tokens_per_attempt !== null && limits.max_tokens_per_attempt !== undefined ||
        limits.max_cost_usd_per_attempt !== null &&
          limits.max_cost_usd_per_attempt !== undefined ||
        limits.max_runtime_seconds_per_attempt !== null &&
          limits.max_runtime_seconds_per_attempt !== undefined),
  );
}
