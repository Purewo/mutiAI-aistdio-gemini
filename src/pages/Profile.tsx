import { Info, Shield, User } from 'lucide-react';
import { useAuth } from '../auth/context';
import PageHeader from '../components/PageHeader';
import { LoadingState } from '../components/states';

export default function Profile() {
  const { state } = useAuth();

  return (
    <div className="flex h-full flex-col bg-slate-50/50">
      <PageHeader title="个人中心" />

      <div className="flex-1 overflow-y-auto p-6 sm:p-8">
        <div className="mx-auto max-w-2xl">
          {state.status !== 'authenticated' ? (
            <LoadingState label="加载账户信息中..." />
          ) : (
            <div className="overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-indigo-100 bg-indigo-50 text-indigo-600">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">账户信息</h2>
                </div>

                <dl className="space-y-4">
                  <div>
                    <dt className="mb-1 text-sm font-medium text-slate-500">昵称</dt>
                    <dd className="text-slate-900">{state.user.display_name}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-sm font-medium text-slate-500">用户名</dt>
                    <dd className="text-slate-900">{state.user.username}</dd>
                  </div>
                  <div>
                    <dt className="mb-1 text-sm font-medium text-slate-500">用户 ID</dt>
                    <dd className="break-all font-mono text-sm text-slate-600">
                      {state.user.user_id}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-slate-50/40 p-8">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-100 bg-blue-50 text-blue-600">
                    <Shield className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">安全设置</h2>
                </div>

                {/*
                  The current OpenAPI snapshot exposes no profile-update or password-change route.
                  A form here would imply a capability the backend does not have, so the gap is
                  reported instead of being filled with a non-functional control.
                */}
                <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
                  <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                  <p className="text-sm leading-relaxed text-slate-600">
                    当前后端契约中还没有修改昵称或密码的接口，因此这里暂不提供编辑表单。等核心仓库发布对应路由后再实现。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
