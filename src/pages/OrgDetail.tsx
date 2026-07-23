import React from 'react';
import { Send, Users, Activity, Bot } from 'lucide-react';

export default function OrgDetail() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-slate-800">演示研发组织</h1>
          <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/50">活跃</span>
        </div>
      </header>
      
      <div className="flex-1 overflow-hidden flex">
        {/* Main Workspace */}
        <div className="flex-1 bg-slate-50/50 p-8 overflow-y-auto border-r border-slate-200/60 flex flex-col space-y-8">
          
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Users className="w-5 h-5 text-indigo-600" />
              <h2 className="text-lg font-semibold text-slate-800">组织架构</h2>
            </div>
            <div className="bg-white/80 backdrop-blur border border-slate-200/60 rounded-2xl h-[400px] flex items-center justify-center shadow-sm relative overflow-hidden">
              <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] [background-size:16px_16px] opacity-30"></div>
              <p className="text-slate-400 font-medium relative z-10">组织架构图画布 (占位)</p>
            </div>
          </section>
          
          <section>
            <div className="flex items-center space-x-2 mb-4">
              <Activity className="w-5 h-5 text-blue-600" />
              <h2 className="text-lg font-semibold text-slate-800">任务进度</h2>
            </div>
            <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm min-h-[160px] flex items-center justify-center">
              <p className="text-slate-400 text-sm">暂无进行中的任务。</p>
            </div>
          </section>
          
        </div>
        
        {/* Leader Chat Area */}
        <div className="w-[400px] bg-white flex flex-col relative z-20 shadow-[-4px_0_24px_-12px_rgba(0,0,0,0.1)]">
          <div className="p-5 border-b border-slate-100 flex items-center space-x-3 bg-gradient-to-r from-slate-50 to-white">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 border border-indigo-200 flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 leading-tight">Alice</h3>
              <p className="text-xs text-slate-500 font-medium">组织负责人</p>
            </div>
          </div>
          
          <div className="flex-1 p-5 overflow-y-auto bg-slate-50/30">
             <div className="flex flex-col space-y-4">
                <div className="flex gap-3 max-w-[90%]">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 border border-indigo-200 flex items-center justify-center flex-shrink-0 mt-1 shadow-sm">
                    <Bot className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="bg-white px-4 py-3 rounded-2xl rounded-tl-sm text-sm text-slate-700 shadow-sm border border-slate-200/60 leading-relaxed">
                    您好，我是 Alice，本组织的负责人。今天我能帮您协调哪些代理？
                  </div>
                </div>
             </div>
          </div>
          
          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="relative shadow-sm rounded-xl bg-slate-50 border border-slate-200 focus-within:border-indigo-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all duration-200 p-1.5 flex items-end">
              <textarea 
                placeholder="给 Alice 发送消息..." 
                className="flex-1 px-3 py-1.5 bg-transparent resize-none max-h-32 min-h-[36px] focus:outline-none text-slate-700 placeholder-slate-400 text-sm"
                rows={1}
              />
              <button className="h-9 w-9 flex items-center justify-center bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-lg hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md shadow-indigo-200 flex-shrink-0 ml-1">
                <Send className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
