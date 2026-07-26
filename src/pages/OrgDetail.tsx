import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Users } from 'lucide-react';
import { getOrganization } from '../api/endpoints';
import { useApiResource } from '../api/useApiResource';
import OrganizationGraph from '../components/OrganizationGraph';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/states';

export default function OrgDetail() {
  const { organizationId } = useParams<{ organizationId: string }>();
  const { state, reload } = useApiResource(
    (signal) => getOrganization(organizationId ?? '', signal),
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

  if (state.status === 'loading') {
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <LoadingState label="加载组织详情中..." />
        </div>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex h-full flex-col bg-slate-50/50">
        <PageHeader title="组织详情" actions={backLink} />
        <div className="flex-1 overflow-y-auto p-6 sm:p-8">
          <div className="mx-auto max-w-2xl">
            <ErrorState
              error={state.error}
              title={state.error.isNotFound ? '找不到该组织' : '加载组织详情失败'}
              onRetry={state.error.isNotFound ? undefined : reload}
            />
          </div>
        </div>
      </div>
    );
  }

  const organization = state.data;
  const spec = organization.current_published_spec;

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader
        title={organization.name}
        description={organization.description}
        actions={
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                organization.current_published_version_id
                  ? 'border-emerald-200/50 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-slate-50 text-slate-600'
              }`}
            >
              {organization.current_published_version_id ? '已发布' : '未发布'}
            </span>
            {backLink}
          </div>
        }
      />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-6xl space-y-8">
          <section>
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-800">组织架构</h2>
              <span className="text-sm text-slate-400">
                {spec ? `${spec.roles.length} 个岗位` : null}
              </span>
            </div>

            {spec ? (
              <OrganizationGraph spec={spec} />
            ) : (
              <EmptyState
                title="该组织还没有已发布的版本"
                description="组织架构图由已发布的 OrganizationSpec 渲染。请先确认并发布一个组织方案。"
              />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
