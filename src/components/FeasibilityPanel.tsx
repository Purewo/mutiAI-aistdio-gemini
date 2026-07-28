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

  return (
    <div className="space-y-3">
      {checks.map((check) => (
        <section
          key={check.feasibility_check_id}
          className="rounded-2xl border border-slate-200/60 bg-slate-50/60 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xs font-semibold text-slate-700">Runtime 可行性</h4>
            <FeasibilityOutcomeBadge outcome={check.outcome} />
            <span className="text-[11px] text-slate-400">
              阶段 {check.phase} · 校验器 {check.validator_version}
            </span>
          </div>

          {check.findings.length > 0 ? (
            <ul className="mt-2 space-y-2">
              {check.findings.map((finding, index) => (
                <FindingRow key={`${check.feasibility_check_id}-${index}`} finding={finding} />
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
