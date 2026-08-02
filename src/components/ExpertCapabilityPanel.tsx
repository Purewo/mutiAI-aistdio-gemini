import {
  Braces,
  CircleSlash2,
  FileInput,
  MessagesSquare,
  Repeat2,
  ShieldCheck,
  Type,
} from 'lucide-react';
import type { ExpertCapability, ExpertInteractionMode } from '../api/types';
import { formatBytes } from '../lib/format';

const INTERACTION_COPY: Record<
  ExpertInteractionMode,
  { label: string; description: string; icon: typeof MessagesSquare }
> = {
  conversational: {
    label: '连续会话',
    description: '该专家可以在同一私有试用会话中承接前文。',
    icon: MessagesSquare,
  },
  request_response: {
    label: '单次请求',
    description: '每次发送都是独立调用，不代表 Provider 具有多轮记忆。',
    icon: Repeat2,
  },
};

const TEXT_INPUT_COPY = {
  required: {
    label: '需要文字',
    description: '每次提交必须包含文字说明。',
    icon: Type,
  },
  optional: {
    label: '文字可选',
    description: '可以提交文字、附件，或两者同时提交。',
    icon: FileInput,
  },
  unsupported: {
    label: '不接收文字',
    description: '该版本不会读取自由文本，只会处理声明支持的附件。',
    icon: CircleSlash2,
  },
} as const;

export function ExpertSemantics({
  interactionMode,
  capability,
  compact = false,
}: {
  interactionMode: ExpertInteractionMode;
  capability: ExpertCapability;
  compact?: boolean;
}) {
  const interaction = INTERACTION_COPY[interactionMode];
  const textInput = TEXT_INPUT_COPY[capability.text_input_mode];
  const InteractionIcon = interaction.icon;
  const TextIcon = textInput.icon;

  return (
    <div className={`grid gap-2 ${compact ? '' : 'sm:grid-cols-2'}`}>
      <div className="expert-semantics-card--cyan rounded-xl border border-cyan-200/70 bg-cyan-50/70 px-3 py-2.5 text-cyan-950">
        <p className="flex items-center gap-2 text-xs font-bold">
          <InteractionIcon className="h-4 w-4 text-cyan-700" aria-hidden="true" />
          {interaction.label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-cyan-900/75">{interaction.description}</p>
      </div>
      <div className="expert-semantics-card--amber rounded-xl border border-amber-200/70 bg-amber-50/75 px-3 py-2.5 text-amber-950">
        <p className="flex items-center gap-2 text-xs font-bold">
          <TextIcon className="h-4 w-4 text-amber-700" aria-hidden="true" />
          {textInput.label}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/75">{textInput.description}</p>
      </div>
    </div>
  );
}

export default function ExpertCapabilityPanel({
  capability,
  interactionMode,
  compact = false,
}: {
  capability: ExpertCapability;
  interactionMode: ExpertInteractionMode;
  compact?: boolean;
}) {
  const limits = capability.limits;
  return (
    <section className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">能力边界</p>
        <p className="mt-2 text-sm leading-7 text-slate-700">{capability.purpose}</p>
      </div>

      <ExpertSemantics interactionMode={interactionMode} capability={capability} compact={compact} />

      <div className={`grid gap-4 ${compact ? '' : 'lg:grid-cols-2'}`}>
        <ContractColumn title="支持的输入" contracts={capability.input_contracts} />
        <ContractColumn title="标准化输出" contracts={capability.output_contracts} />
      </div>

      <div
        className={`grid gap-4 border-t border-slate-100 pt-4 ${
          compact ? '' : 'lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'
        }`}
      >
        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            数据处理说明
          </p>
          <p className="mt-1.5 text-xs leading-6 text-slate-600">{capability.data_handling.statement}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px]">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
              {capability.data_handling.storage_scope === 'product_only'
                ? '产品托管'
                : capability.data_handling.storage_scope === 'provider_managed'
                  ? 'Provider 托管'
                  : '混合托管'}
            </span>
            <span
              className={`rounded-full px-2.5 py-1 ${
                capability.data_handling.sends_to_external_provider
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700'
              }`}
            >
              {capability.data_handling.sends_to_external_provider
                ? '输入会发送给外部 Provider'
                : '输入不离开产品托管边界'}
            </span>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold text-slate-700">试用限制</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
            <Limit label="单次文件" value={`${limits?.max_input_files ?? 1} 个`} />
            <Limit
              label="文件大小"
              value={limits?.max_input_bytes ? formatBytes(limits.max_input_bytes) : '按服务配置'}
            />
            <Limit
              label="最长耗时"
              value={limits?.max_duration_seconds ? `${limits.max_duration_seconds} 秒` : '按服务配置'}
            />
            <Limit
              label="并发 Turn"
              value={limits?.max_concurrent_turns ? `${limits.max_concurrent_turns}` : '按服务配置'}
            />
          </dl>
        </div>
      </div>

      {capability.non_goals.length > 0 ? (
        <details className="group rounded-xl border border-slate-200 bg-slate-50/80">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-semibold text-slate-600 [&::-webkit-details-marker]:hidden">
            <Braces className="h-4 w-4 text-slate-400" aria-hidden="true" />
            查看明确不处理的范围
          </summary>
          <ul className="space-y-1.5 border-t border-slate-200 px-4 py-3 text-xs leading-5 text-slate-600">
            {capability.non_goals.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function ContractColumn({
  title,
  contracts,
}: {
  title: string;
  contracts: ExpertCapability['input_contracts'];
}) {
  return (
    <div>
      <p className="text-xs font-bold text-slate-700">{title}</p>
      {contracts.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">未声明结构化 Contract</p>
      ) : (
        <div className="mt-2 space-y-2">
          {contracts.map((contract) => (
            <div key={contract.contract_key} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
                <span className="break-all font-mono text-[11px] text-indigo-700">{contract.contract_key}</span>
                {contract.required ? (
                  <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-600">必需</span>
                ) : null}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{contract.description}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {contract.media_types.map((mediaType) => (
                  <span key={mediaType} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-500">
                    {mediaType}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-700">{value}</dd>
    </div>
  );
}
