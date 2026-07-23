import React from 'react';
import { User, Shield } from 'lucide-react';

export default function Profile() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">个人中心</h1>
      </header>
      
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-2xl">
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div className="p-8 border-b border-slate-100">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                  <User className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">个人信息</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">昵称</label>
                  <input 
                    type="text" 
                    defaultValue="admin"
                    className="w-full max-w-md px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all duration-200"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-8 bg-slate-50/30">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                  <Shield className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-900">安全设置</h2>
              </div>
              
              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">当前密码</label>
                  <input 
                    type="password" 
                    className="w-full max-w-md px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">新密码</label>
                  <input 
                    type="password" 
                    className="w-full max-w-md px-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all duration-200 shadow-sm"
                  />
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 bg-white flex justify-end">
              <button className="bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-medium py-2.5 px-6 rounded-xl hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all shadow-md shadow-indigo-200">
                保存更改
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
