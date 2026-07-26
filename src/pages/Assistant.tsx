import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import PageHeader from '../components/PageHeader';

/**
 * Platform assistant entry point.
 *
 * The contracted organization proposal lifecycle (`POST /api/v1/organizations/proposals`, then the
 * confirm and publish transitions) lands in the next stage. Until then this page shows no assistant
 * conversation, because rendering a scripted exchange would imply an assistant that is not wired up.
 */
export default function Assistant() {
  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="平台小助理" description="设计并发布您的 AI 组织" />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-3xl border border-slate-200/60 bg-white p-10 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-lg shadow-indigo-200">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </div>

          <h2 className="text-xl font-bold text-slate-900">组织方案流程即将开放</h2>
          <p className="max-w-md text-sm leading-relaxed text-slate-600">
            组织方案的提交、结构化预览、确认与发布正在按阶段接入。当前版本已经可以查看并浏览已发布组织的结构。
          </p>

          <Link
            to="/orgs"
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
          >
            查看组织管理
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
