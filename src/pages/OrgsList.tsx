import React from 'react';
import { Link } from 'react-router-dom';
import { Network, ArrowRight } from 'lucide-react';

export default function OrgsList() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">组织管理</h1>
      </header>
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Organization Card */}
          <Link to="/orgs/1" className="group bg-white rounded-2xl shadow-sm border border-slate-200/60 p-6 hover:shadow-xl hover:shadow-indigo-100/50 hover:border-indigo-200 transition-all duration-300 flex flex-col h-56 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-bl-full -z-0 opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100/50">
                <Network className="w-5 h-5" />
              </div>
              <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">活跃</span>
            </div>
            
            <h2 className="text-lg font-bold text-slate-900 mb-2 relative z-10">演示研发组织</h2>
            <p className="text-slate-600 text-sm mb-4 line-clamp-2 relative z-10 leading-relaxed">这是一个致力于使用专业 AI 代理进行软件研发的组织。</p>
            
            <div className="mt-auto flex items-center justify-between pt-4 border-t border-slate-100 relative z-10">
              <div className="flex items-center space-x-2 text-sm text-slate-500 font-medium">
                <span>负责人：Alice</span>
              </div>
              <span className="flex items-center text-indigo-600 text-sm font-semibold group-hover:text-indigo-700 transition-colors">
                查看详情 <ArrowRight className="w-4 h-4 ml-1 transform group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
