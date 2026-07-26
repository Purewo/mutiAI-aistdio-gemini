import { Link } from 'react-router-dom';
import { ArrowRight, Network } from 'lucide-react';
import { listOrganizations } from '../api/endpoints';
import { useApiResource } from '../api/useApiResource';
import PageHeader from '../components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../components/states';

export default function OrgsList() {
  const { state, reload } = useApiResource((signal) => listOrganizations(signal), []);

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="组织管理" description="您拥有的 AI 组织" />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-6xl">
          {state.status === 'loading' ? <LoadingState label="加载组织中..." /> : null}

          {state.status === 'error' ? (
            <ErrorState error={state.error} title="加载组织列表失败" onRetry={reload} />
          ) : null}

          {state.status === 'ready' && state.data.length === 0 ? (
            <EmptyState
              title="还没有组织"
              description="请在平台小助理中描述您的需求，生成组织方案并发布后，组织会显示在这里。"
              action={
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                >
                  去创建组织
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              }
            />
          ) : null}

          {state.status === 'ready' && state.data.length > 0 ? (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {state.data.map((organization) => {
                const published = organization.current_published_version_id !== null;
                return (
                  <li key={organization.organization_id}>
                    <Link
                      to={`/orgs/${organization.organization_id}`}
                      className="group relative flex min-h-[14rem] flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm transition-all duration-300 hover:border-indigo-200 hover:shadow-xl hover:shadow-indigo-100/50 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
                    >
                      <div
                        aria-hidden="true"
                        className="absolute right-0 top-0 -z-0 h-32 w-32 rounded-bl-full bg-gradient-to-br from-indigo-50 to-blue-50 opacity-50 transition-transform duration-500 group-hover:scale-110"
                      />

                      <div className="relative z-10 mb-4 flex items-start justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100/50 bg-indigo-50 text-indigo-600">
                          <Network className="h-5 w-5" aria-hidden="true" />
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            published
                              ? 'border-emerald-200/50 bg-emerald-50 text-emerald-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600'
                          }`}
                        >
                          {published ? '已发布' : '未发布'}
                        </span>
                      </div>

                      <h2 className="relative z-10 mb-2 truncate text-lg font-bold text-slate-900">
                        {organization.name}
                      </h2>
                      {/*
                        `line-clamp` needs `display: -webkit-box`, which a browser blockifies away on
                        a direct flex child. The wrapper keeps the paragraph out of the flex
                        formatting context so the clamp and its ellipsis actually apply.
                      */}
                      <div className="relative z-10 mb-4">
                        <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">
                          {organization.description}
                        </p>
                      </div>

                      <div className="relative z-10 mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                        <span className="text-sm font-medium text-slate-500">
                          {published ? '查看组织结构' : '尚未发布版本'}
                        </span>
                        <span className="flex items-center text-sm font-semibold text-indigo-600 transition-colors group-hover:text-indigo-700">
                          进入
                          <ArrowRight
                            className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-1"
                            aria-hidden="true"
                          />
                        </span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
