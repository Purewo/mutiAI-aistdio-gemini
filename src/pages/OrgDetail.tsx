import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, CheckCircle2, ChevronDown, ChevronRight, History, Loader2, Users } from 'lucide-react';
import {
  confirmOrganizationVersion,
  getOrganization,
  listOrganizationVersions,
  publishOrganizationVersion,
} from '../api/endpoints';
import { apiErrorFromThrown, type ApiError } from '../api/errors';
import type { OrganizationVersion } from '../api/types';
import { useApiResource } from '../api/useApiResource';
import OrganizationGraph from '../components/OrganizationGraph';
import PageHeader from '../components/PageHeader';
import VersionStatusBadge from '../components/VersionStatusBadge';
import { EmptyState, ErrorState, InlineError, LoadingState } from '../components/states';
import { formatDateTime } from '../lib/format';

export default function OrgDetail() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const organization = useApiResource(
    (signal) => getOrganization(organizationId ?? '', signal),
    [organizationId],
  );
  const versions = useApiResource(
    (signal) => listOrganizationVersions(organizationId ?? '', signal),
    [organizationId],
  );

  const backLink = (
    <Link
      to="/orgs"
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      组织列表
    </Link>
  );

  if (organization.state.status === 'loading') {
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <LoadingState label="加载组织详情中..." />
        </div>
      </div>
    );
  }

  if (organization.state.status === 'error') {
    const { error } = organization.state;
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mx-auto max-w-2xl">
            <ErrorState
              error={error}
              title={error.isNotFound ? '找不到该组织' : '加载组织详情失败'}
              onRetry={error.isNotFound ? undefined : organization.reload}
            />
          </div>
        </div>
      </div>
    );
  }

  const detail = organization.state.data;
  const spec = detail.current_published_spec;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader
        title={detail.name}
        description={detail.description}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                detail.current_published_version_id
                  ? 'border-emerald-200/50 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {detail.current_published_version_id ? '已发布' : '未发布'}
            </span>
            {backLink}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-10">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">组织架构</h2>
              {spec ? <span className="text-sm text-slate-400">{spec.roles.length} 个岗位</span> : null}
            </div>

            {spec ? (
              <OrganizationGraph spec={spec} />
            ) : (
              <EmptyState
                title="该组织还没有已发布的版本"
                description="组织架构图由已发布的 OrganizationSpec 渲染。请在下方版本列表中确认并发布一个方案。"
              />
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center gap-2">
              <History className="h-5 w-5 text-blue-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">版本</h2>
            </div>

            {versions.state.status === 'loading' ? <LoadingState label="加载版本中..." /> : null}
            {versions.state.status === 'error' ? (
              <ErrorState error={versions.state.error} title="加载版本失败" onRetry={versions.reload} />
            ) : null}
            {versions.state.status === 'ready' && versions.state.data.length === 0 ? (
              <EmptyState title="暂无版本记录" />
            ) : null}
            {versions.state.status === 'ready' && versions.state.data.length > 0 ? (
              <ul className="space-y-3">
                {versions.state.data.map((version) => (
                  <VersionRow
                    key={version.spec_version_id}
                    version={version}
                    onChanged={() => {
                      // A confirm or publish changes both the version list and, on publish, the
                      // organization's current published spec. Reload the persisted resources
                      // instead of patching local state.
                      versions.reload();
                      organization.reload();
                    }}
                  />
                ))}
              </ul>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}

function VersionRow({
  version,
  onChanged,
}: {
  version: OrganizationVersion;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<'confirm' | 'publish' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const runTransition = async (kind: 'confirm' | 'publish') => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === 'confirm') {
        await confirmOrganizationVersion(version.organization_id, version.spec_version_id);
      } else {
        await publishOrganizationVersion(version.organization_id, version.spec_version_id);
      }
      onChanged();
    } catch (cause) {
      setError(apiErrorFromThrown(cause));
    } finally {
      setBusy(null);
    }
  };

  const smallButton =
    'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60';

  return (
    <li className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/15"
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
          )}
          第 {version.version_number} 版
        </button>
        <VersionStatusBadge status={version.status} />
        <span className="text-xs text-slate-400">创建于 {formatDateTime(version.created_at)}</span>
        {version.published_at ? (
          <span className="text-xs text-slate-400">发布于 {formatDateTime(version.published_at)}</span>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {version.status === 'proposal' ? (
            <button
              type="button"
              onClick={() => runTransition('confirm')}
              disabled={busy !== null}
              className={`${smallButton} bg-gradient-to-r from-indigo-600 to-blue-600 shadow-indigo-200 hover:from-indigo-700 hover:to-blue-700 focus-visible:ring-indigo-500/20`}
            >
              {busy === 'confirm' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              确认
            </button>
          ) : null}
          {version.status === 'confirmed' ? (
            <button
              type="button"
              onClick={() => runTransition('publish')}
              disabled={busy !== null}
              className={`${smallButton} bg-gradient-to-r from-emerald-600 to-teal-600 shadow-emerald-200 hover:from-emerald-700 hover:to-teal-700 focus-visible:ring-emerald-500/20`}
            >
              {busy === 'publish' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              发布
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <InlineError error={error} />
        </div>
      ) : null}

      {expanded ? (
        <div className="mt-4 space-y-3">
          {version.source_request ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              需求描述：{version.source_request}
            </p>
          ) : null}
          <OrganizationGraph spec={version.spec} />
        </div>
      ) : null}
    </li>
  );
}
