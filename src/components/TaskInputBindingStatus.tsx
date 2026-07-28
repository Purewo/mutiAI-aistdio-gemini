import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  FileInput,
  Fingerprint,
  Loader2,
  AlertTriangle,
  XCircle,
} from 'lucide-react';
import type {
  Artifact,
  TaskInputBindingReport,
  TaskInputContractSpec,
} from '../api/types';
import type { AssistantAttachmentInput } from '../assistant/taskInputBindings';
import { formatBytes } from '../lib/format';

interface InputTrace {
  contractKey: string;
  schemaVersion: string;
  fileName: string;
  mediaType: string;
  attachmentId: string | null;
  messageId: string | null;
  actionId: string | null;
  sha256: string | null;
  byteSize: number | null;
}

const STATUS = {
  waiting_for_plan: {
    label: '等待规划',
    tone: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: Loader2,
    spinning: true,
    summary: '规划验证后会自动尝试绑定；这一步不会自动启动 Task。',
  },
  bound: {
    label: '全部绑定',
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
    spinning: false,
    summary: '已确认的附件输入均已物化为不可变 Task Artifact。',
  },
  partial: {
    label: '部分绑定',
    tone: 'border-orange-200 bg-orange-50 text-orange-700',
    icon: AlertTriangle,
    spinning: false,
    summary: '部分输入已物化，仍有 contract 需要补充或处理。',
  },
  failed: {
    label: '绑定失败',
    tone: 'border-red-200 bg-red-50 text-red-700',
    icon: XCircle,
    spinning: false,
    summary: '附件转换已关闭失败，没有为失败项创建部分 Artifact。',
  },
} as const;

function tracesFromAction(inputs: readonly AssistantAttachmentInput[]): InputTrace[] {
  return inputs.map((input) => ({
    contractKey: input.contract_key,
    schemaVersion: input.schema_version,
    fileName: input.file_name ?? '附件',
    mediaType: input.media_type ?? '未知媒体类型',
    attachmentId: input.attachment_id,
    messageId: input.source_message_id,
    actionId: null,
    sha256: input.sha256,
    byteSize: input.byte_size,
  }));
}

function tracesFromContracts(contracts: readonly TaskInputContractSpec[]): InputTrace[] {
  return contracts.map((contract) => ({
    contractKey: contract.contract_key,
    schemaVersion: contract.schema_version,
    fileName: contract.file_name,
    mediaType: contract.media_type,
    attachmentId: contract.source_attachment_id ?? null,
    messageId: contract.source_message_id ?? null,
    actionId: contract.source_action_id ?? null,
    sha256: contract.source_sha256 ?? null,
    byteSize: contract.source_byte_size ?? null,
  }));
}

function shortIdentity(value: string): string {
  return value.length <= 14 ? value : `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default function TaskInputBindingStatus({
  actionInputs = [],
  contracts = [],
  report,
  artifacts = [],
  title = 'Task 输入绑定',
}: {
  actionInputs?: readonly AssistantAttachmentInput[];
  contracts?: readonly TaskInputContractSpec[];
  report?: TaskInputBindingReport | null;
  artifacts?: readonly Artifact[];
  title?: string;
}) {
  const traces = actionInputs.length > 0 ? tracesFromAction(actionInputs) : tracesFromContracts(contracts);
  if (traces.length === 0 && !report) return null;

  const presentation = report ? STATUS[report.status] : null;
  const StatusIcon = presentation?.icon ?? CircleDashed;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white/80 px-3.5 py-3">
        <FileInput className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <span className="text-xs font-bold tracking-wide text-slate-800">{title}</span>
        <span className="font-mono text-[10px] text-slate-400">ATTACHMENT → CONTRACT → ARTIFACT</span>
        {presentation ? (
          <span
            className={`ml-auto inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${presentation.tone}`}
          >
            <StatusIcon
              className={`h-3 w-3 ${presentation.spinning ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {presentation.label}
          </span>
        ) : null}
      </div>

      {traces.length > 0 ? (
        <ul className="divide-y divide-slate-200/80">
          {traces.map((trace) => {
            const artifact = artifacts.find(
              (item) => item.origin === 'task_input' && item.contract_key === trace.contractKey,
            );
            const failure = report?.failures.find((item) => item.contract_key === trace.contractKey);
            const remaining = report?.remaining_contract_keys.includes(trace.contractKey) ?? false;

            return (
              <li key={`${trace.contractKey}:${trace.attachmentId ?? trace.fileName}`} className="p-3.5">
                <div className="grid min-w-0 items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
                  <div className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileInput className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-800" title={trace.fileName}>
                        {trace.fileName}
                      </span>
                      {trace.byteSize !== null ? (
                        <span className="flex-shrink-0 text-[10px] tabular-nums text-slate-400">
                          {formatBytes(trace.byteSize)}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                      <span className="truncate" title={trace.mediaType}>{trace.mediaType}</span>
                      {trace.attachmentId ? (
                        <span className="font-mono" title={trace.attachmentId}>
                          attachment:{shortIdentity(trace.attachmentId)}
                        </span>
                      ) : (
                        <span>手工输入</span>
                      )}
                    </div>
                  </div>

                  <ArrowRight className="hidden h-4 w-4 text-indigo-300 sm:block" aria-hidden="true" />
                  <ArrowDown className="mx-auto h-4 w-4 text-indigo-300 sm:hidden" aria-hidden="true" />

                  <div className="min-w-0 rounded-xl border border-indigo-100 bg-indigo-50/70 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-1 break-all font-mono text-xs font-bold text-indigo-800">
                        {trace.contractKey}
                      </span>
                      <span className="flex-shrink-0 rounded-md bg-white px-1.5 py-0.5 font-mono text-[10px] text-indigo-500">
                        v{trace.schemaVersion}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                      {artifact ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700" title={artifact.artifact_id}>
                          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                          Artifact {shortIdentity(artifact.artifact_id)}
                        </span>
                      ) : failure ? (
                        <span className="font-semibold text-red-700">转换失败</span>
                      ) : remaining ? (
                        <span className="font-semibold text-orange-700">仍待绑定或上传</span>
                      ) : (
                        <span className="text-indigo-500">已声明输入 contract</span>
                      )}
                      {trace.sha256 ? (
                        <span className="inline-flex items-center gap-1 font-mono text-slate-400" title={trace.sha256}>
                          <Fingerprint className="h-3 w-3" aria-hidden="true" />
                          {trace.sha256.slice(0, 12)}…
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {trace.messageId || trace.actionId ? (
                  <div className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 pl-0.5 font-mono text-[10px] text-slate-400">
                    {trace.messageId ? <span title={trace.messageId}>message:{shortIdentity(trace.messageId)}</span> : null}
                    {trace.actionId ? <span title={trace.actionId}>action:{shortIdentity(trace.actionId)}</span> : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {presentation && report ? (
        <div className="border-t border-slate-200 bg-white/70 px-3.5 py-3">
          <p className="text-xs leading-relaxed text-slate-600">{presentation.summary}</p>
          {report.remaining_contract_keys.length > 0 ? (
            <p className="mt-1.5 text-[11px] text-slate-500">
              剩余 contract：{' '}
              <span className="break-all font-mono font-semibold text-slate-700">
                {report.remaining_contract_keys.join('、')}
              </span>
            </p>
          ) : null}
          {report.failures.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {report.failures.map((failure) => (
                <li
                  key={`${failure.contract_key}:${failure.code}`}
                  className="rounded-lg border border-red-100 bg-red-50 px-2.5 py-2 text-[11px] leading-relaxed text-red-700"
                >
                  <span className="break-all font-mono font-bold">{failure.contract_key}</span>
                  <span className="mx-1.5 text-red-300">/</span>
                  <span className="break-all font-mono text-red-500">{failure.code}</span>
                  <span className="mt-0.5 block">{failure.message}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
