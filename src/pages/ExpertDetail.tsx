import { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  CalendarClock,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { createExpertConversation, getExpert } from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { ExpertVersion } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import ExpertCapabilityPanel from '../components/ExpertCapabilityPanel';
import PageHeader from '../components/PageHeader';
import { ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';

export default function ExpertDetail() {
  const { expertId = '' } = useParams();
  const navigate = useNavigate();
  const resource = useApiResource((signal) => getExpert(expertId, signal), [expertId]);
  const [startingVersionId, setStartingVersionId] = useState<string | null>(null);
  const [startError, setStartError] = useState<ApiError | null>(null);

  const versions = useMemo(() => {
    if (resource.state.status !== 'ready') return [];
    return [...resource.state.data.versions].sort((a, b) => b.version_number - a.version_number);
  }, [resource.state]);

  const startTrial = async (version: ExpertVersion) => {
    if (!version.eligible || startingVersionId) return;
    setStartingVersionId(version.expert_version_id);
    setStartError(null);
    try {
      const conversation = await createExpertConversation({
        expert_version_id: version.expert_version_id,
      });
      navigate(`/experts/conversations/${encodeURIComponent(conversation.conversation_id)}`);
    } catch (cause: unknown) {
      setStartError(apiErrorFromThrown(cause));
    } finally {
      setStartingVersionId(null);
    }
  };

  if (resource.state.status === 'loading') {
    return (
      <div className="flex h-full flex-col bg-[var(--nexwork-page)]">
        <PageHeader title="专家详情" />
        <LoadingState label="正在读取专家版本…" />
      </div>
    );
  }
  if (resource.state.status === 'error') {
    return (
      <div className="flex h-full flex-col bg-[var(--nexwork-page)]">
        <PageHeader title="专家详情" />
        <div className="mobile-scroll-gutter flex-1 overflow-y-auto p-4 sm:p-8">
          <ErrorState error={resource.state.error} title="专家详情加载失败" onRetry={resource.reload} />
        </div>
      </div>
    );
  }

  const expert = resource.state.data;
  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--nexwork-page)]">
      <PageHeader
        title={expert.display_name}
        description={expert.short_description}
        actions={
          <Link
            to="/experts"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-500/15"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            返回市场
          </Link>
        }
      />
      <div className="mobile-scroll-gutter flex-1 overflow-y-auto px-3 py-4 sm:px-8 sm:py-6">
        <div className="mx-auto max-w-6xl space-y-5">
          <section className="overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-900/10">
            <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl border border-white/10 bg-white/[0.07] text-cyan-300">
                <Bot className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
                  {expert.category ?? '通用能力'} · {expert.expert_key}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">{expert.display_name}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">{expert.short_description}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {expert.tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-300">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-center">
                <p className="text-2xl font-black text-white">{versions.length}</p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-slate-400">固定版本</p>
              </div>
            </div>
          </section>

          {startError ? <InlineError error={startError} /> : null}

          <section className="space-y-5">
            {versions.map((version) => (
              <article key={version.expert_version_id} className="space-y-3">
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-slate-900">版本 {version.version_number}</h3>
                      <StatusBadge version={version} />
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        {providerLabel(version.provider)}
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                        {version.verified_at ? `验证于 ${formatDateTime(version.verified_at)}` : '尚无验证时间'}
                      </span>
                      <span className="break-all font-mono text-slate-400">{version.expert_version_id}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void startTrial(version)}
                    disabled={!version.eligible || startingVersionId !== null}
                    className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-900/10 transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
                  >
                    <Sparkles className={`h-4 w-4 ${startingVersionId === version.expert_version_id ? 'animate-pulse' : ''}`} aria-hidden="true" />
                    {startingVersionId === version.expert_version_id
                      ? '正在创建…'
                      : version.eligible
                        ? '试用这个版本'
                        : '暂不可试用'}
                  </button>
                </div>

                {!version.eligible ? (
                  <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>
                      此版本不能创建新会话
                      {version.eligibility_reason_codes.length > 0
                        ? `：${version.eligibility_reason_codes.join('、')}`
                        : '。'}
                    </span>
                  </div>
                ) : null}

                <ExpertCapabilityPanel
                  capability={version.capability}
                  interactionMode={version.interaction_mode}
                />
              </article>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ version }: { version: ExpertVersion }) {
  const ready = version.eligible && version.verification_status === 'verified';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${
        ready
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
      }`}
    >
      {ready ? <BadgeCheck className="h-3 w-3" aria-hidden="true" /> : null}
      {ready ? '已验证可用' : version.verification_status}
    </span>
  );
}

function providerLabel(provider: string): string {
  return provider === 'codex' ? 'Codex' : provider === 'dify' ? 'Dify' : provider;
}
