/**
 * Renders persisted feasibility checks.
 *
 * The outcome, findings, messages, and alternatives all come from the backend validator's
 * localized response. The frontend translates only the outcome enum into a badge label; it never
 * composes its own explanation for a finding and never offers a way to override a blocked or
 * capability-unknown result — those are preview-only by product law.
 */
import { AlertTriangle, CheckCircle2, HelpCircle, ShieldAlert } from 'lucide-react';
import type { FeasibilityCheck, FeasibilityFinding, FeasibilityOutcome } from '../api/types';
import { formatMediaType } from '../lib/media';

const OUTCOME_PRESENTATION: Record<
  FeasibilityOutcome,
  { label: string; tone: string; Icon: typeof CheckCircle2 }
> = {
  feasible: {
    label: '可行',
    tone: 'border-emerald-200/60 bg-emerald-50 text-emerald-700',
    Icon: CheckCircle2,
  },
  conditional: {
    label: '有条件可行',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    Icon: AlertTriangle,
  },
  blocked: {
    label: '已阻断',
    tone: 'border-red-200 bg-red-50 text-red-700',
    Icon: ShieldAlert,
  },
  capability_unknown: {
    label: '能力未知',
    tone: 'border-slate-300 bg-slate-100 text-slate-600',
    Icon: HelpCircle,
  },
};

const OUTCOME_PRIORITY: Record<FeasibilityOutcome, number> = {
  feasible: 0,
  conditional: 1,
  capability_unknown: 2,
  blocked: 3,
};

function summarizeOutcome(checks: FeasibilityCheck[]): FeasibilityOutcome {
  return checks.reduce<FeasibilityOutcome>(
    (summary, check) =>
      OUTCOME_PRIORITY[check.outcome] > OUTCOME_PRIORITY[summary] ? check.outcome : summary,
    'feasible',
  );
}

function summarizeFindings(checks: FeasibilityCheck[]): FeasibilityFinding[] {
  const findings = new Map<string, FeasibilityFinding>();
  checks.forEach((check) => {
    check.findings.forEach((finding) => {
      const key = [
        finding.reason_code,
        finding.role_key,
        finding.binding_key,
        finding.capability,
        finding.message,
      ].join(':');
      if (!findings.has(key)) findings.set(key, finding);
    });
  });
  return [...findings.values()];
}

function formatCheckTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function FeasibilityOutcomeBadge({ outcome }: { outcome: FeasibilityOutcome }) {
  const presentation = OUTCOME_PRESENTATION[outcome] ?? {
    // An outcome value this build does not know yet must not crash the view.
    label: outcome,
    tone: 'border-slate-200 bg-slate-50 text-slate-600',
    Icon: HelpCircle,
  };
  const { label, tone, Icon } = presentation;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}

function capabilityLabel(capability: string): string {
  return (
    {
      input_media_types: '输入格式',
      output_media_types: '输出格式',
      supported_input_media_types: '支持的输入格式',
      supported_output_media_types: '支持的输出格式',
    }[capability] ?? capability
  );
}

function formatCapabilityValue(capability: string, value: unknown): string {
  if (value === null || value === undefined) return '未声明';
  if (Array.isArray(value)) {
    return value.length > 0
      ? value
          .map((item) =>
            capability.includes('media_types') && typeof item === 'string'
              ? formatMediaType(item)
              : item,
          )
          .join('、')
      : '（空）';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function FindingRow({ finding }: { finding: FeasibilityFinding }) {
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-sm leading-relaxed text-slate-700">{finding.message}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-500">
          {finding.reason_code}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          岗位 {finding.role_key}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-slate-500">
          {finding.binding_key}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-600">
          {capabilityLabel(finding.capability)}：需{' '}
          {formatCapabilityValue(finding.capability, finding.required)} / 实际{' '}
          {formatCapabilityValue(finding.capability, finding.actual)}
        </span>
      </div>

      {finding.alternatives.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {finding.alternatives.map((alternative, index) => (
            <li key={index} className="text-xs leading-relaxed text-slate-500">
              · {alternative}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export default function FeasibilityPanel({ checks }: { checks: FeasibilityCheck[] }) {
  if (checks.length === 0) return null;

  const summaryOutcome = summarizeOutcome(checks);
  const findings = summarizeFindings(checks);
  const phases = [...new Set(checks.map((check) => check.phase))];
  const validators = [...new Set(checks.map((check) => check.validator_version))];
  const outcomeCounts = checks.reduce<Partial<Record<FeasibilityOutcome, number>>>((counts, check) => {
    counts[check.outcome] = (counts[check.outcome] ?? 0) + 1;
    return counts;
  }, {});
  const outcomeSummary = (Object.entries(outcomeCounts) as [FeasibilityOutcome, number][])
    .sort(([left], [right]) => OUTCOME_PRIORITY[right] - OUTCOME_PRIORITY[left])
    .map(([outcome, count]) => `${OUTCOME_PRESENTATION[outcome].label} ${count}`)
    .join(' · ');

  return (
    <section className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-700">Runtime 可行性</h4>
        <FeasibilityOutcomeBadge outcome={summaryOutcome} />
        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
          {checks.length} 次检查
        </span>
        <span className="text-[11px] text-slate-400">{outcomeSummary}</span>
      </div>

      {findings.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {findings.map((finding) => (
            <FindingRow
              key={[finding.reason_code, finding.role_key, finding.binding_key, finding.capability].join('-')}
              finding={finding}
            />
          ))}
        </ul>
      ) : null}

      <details className="group mt-2 border-t border-slate-200/70 pt-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-2 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 [&::-webkit-details-marker]:hidden">
          <span>技术校验记录</span>
          <span className="text-[11px] text-slate-400 group-open:hidden">查看 {checks.length} 条</span>
          <span className="hidden text-[11px] text-slate-400 group-open:inline">收起</span>
        </summary>
        <div className="mt-1 space-y-1.5 px-2 pb-1">
          <p className="text-[11px] leading-relaxed text-slate-400">
            阶段 {phases.join('、')} · 校验器 {validators.join('、')}
          </p>
          {[...checks]
            .sort((left, right) => right.created_at.localeCompare(left.created_at))
            .map((check) => (
              <div
                key={check.feasibility_check_id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-slate-200/70 bg-white/80 px-2.5 py-2 text-[11px] text-slate-500"
              >
                <FeasibilityOutcomeBadge outcome={check.outcome} />
                <span>{check.phase}</span>
                <time dateTime={check.created_at}>{formatCheckTime(check.created_at)}</time>
                {check.findings.length > 0 ? <span>{check.findings.length} 项发现</span> : null}
              </div>
            ))}
        </div>
      </details>
    </section>
  );
}
