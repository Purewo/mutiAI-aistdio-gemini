import React from 'react';
import { Smartphone, QrCode } from 'lucide-react';

export default function WeChatConnect() {
  return (
    <div className="flex flex-col h-full bg-slate-50/50">
      <header className="px-8 py-5 bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-10">
        <h1 className="text-xl font-bold text-slate-800">微信对接</h1>
      </header>
      
      <div className="flex-1 p-8 overflow-y-auto flex items-center justify-center">
        <div className="bg-white p-10 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 max-w-md w-full text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 via-blue-500 to-emerald-500"></div>
          
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl flex items-center justify-center mb-6 border border-emerald-100 shadow-sm">
            <Smartphone className="w-8 h-8 text-emerald-600" />
          </div>
          
          <h2 className="text-2xl font-bold text-slate-900 mb-3">连接微信</h2>
          <p className="text-slate-500 mb-8 text-sm leading-relaxed max-w-[280px] mx-auto">
            扫描下方二维码，将您的微信账号连接到平台小助理。
          </p>
          
          <div className="w-56 h-56 mx-auto bg-white border-2 border-dashed border-slate-300 rounded-2xl flex flex-col items-center justify-center mb-8 bg-slate-50/50">
            <QrCode className="w-10 h-10 text-slate-300 mb-2" />
            <span className="text-slate-400 text-sm font-medium">二维码占位符</span>
          </div>
          
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-amber-50 text-amber-700 text-sm font-medium border border-amber-200/60">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
            等待连接...
          </div>
        </div>
      </div>
    </div>
  );
}
