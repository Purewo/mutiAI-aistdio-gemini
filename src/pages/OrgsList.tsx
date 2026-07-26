import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Network, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { listOrganizations } from '../lib/api';

export default function OrgsList() {
  const [orgs, setOrgs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const data = await listOrganizations();
        setOrgs(data);
      } catch (err: any) {
        setError(err.message || '加载组织列表失败');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">组织管理</h1>
      </header>
      
      <div className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-slate-500 font-medium">加载组织中...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 bg-red-50/50 rounded-2xl border border-red-100">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        ) : orgs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4 bg-slate-100/50 rounded-2xl border border-slate-200 border-dashed">
            <Network className="w-10 h-10 text-slate-400" />
            <p className="text-slate-500 font-medium">暂无组织，请联系平台小助理创建。</p>
          </div>
        ) : (
          <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orgs.map((org) => (
              <Link key={org.organization_id} to={`/orgs/${org.organization_id}`} className="group bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 hover:shadow-xl hover:shadow-indigo-100/50 hover:border-indigo-200 transition-all duration-300 flex flex-col h-56 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-bl-full -z-0 opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                
                <div className="flex justify-between items-start mb-4 relative z-10">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100/50">
                    <Network className="w-5 h-5" />
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                    {org.current_published_version_id ? '已发布' : '草稿'}
                  </span>
                </div>
                
                <h2 className="text-lg font-bold text-slate-900 mb-2 relative z-10">{org.name}</h2>
                <p className="text-slate-600 text-sm mb-4 line-clamp-2 relative z-10 leading-relaxed">{org.description}</p>
                
                <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100 relative z-10">
                  <div className="flex items-center space-x-2 text-sm text-slate-500 font-medium">
                    <span>{org.current_published_version_id ? '查看详情' : '待确认'}</span>
                  </div>
                  <span className="flex items-center text-indigo-600 text-sm font-semibold group-hover:text-indigo-700 transition-colors">
                    进入 <ArrowRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
