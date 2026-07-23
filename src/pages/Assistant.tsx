import React from 'react';
import { Send, Sparkles } from 'lucide-react';

export default function Assistant() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">平台小助理</h1>
      </header>
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto flex flex-col space-y-6">
          {/* Assistant Message */}
          <div className="flex gap-4 max-w-2xl">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 border border-indigo-200/50 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Sparkles className="w-5 h-5 text-indigo-600" />
            </div>
            <div className="bg-white px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm border border-slate-200/60 mt-1">
              <p className="text-slate-700 leading-relaxed">您好！我是您的平台小助理。今天您想创建什么样的 AI 组织？</p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 bg-white/80 backdrop-blur-md border-t border-slate-200/60">
        <div className="max-w-4xl mx-auto">
          <div className="relative shadow-sm rounded-2xl bg-white border border-slate-300 focus-within:border-indigo-500 focus-within:ring-4 focus-within:ring-indigo-500/10 transition-all duration-200 p-2 flex items-end">
            <textarea 
              placeholder="描述您想创建的组织（例如：'一个包含文案和设计师的营销部门'）..." 
              className="flex-1 px-4 py-2 bg-transparent resize-none max-h-32 min-h-[44px] focus:outline-none text-slate-700 placeholder-slate-400"
              rows={1}
            />
            <button className="h-10 w-10 flex items-center justify-center bg-gradient-to-br from-indigo-600 to-blue-600 text-white rounded-xl hover:from-indigo-700 hover:to-blue-700 transition-all shadow-md shadow-indigo-200 flex-shrink-0 ml-2">
              <Send className="w-4 h-4 ml-0.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
