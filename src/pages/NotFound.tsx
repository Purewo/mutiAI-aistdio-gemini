import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50/50 p-8 text-center">
      <Compass className="h-10 w-10 text-slate-400" aria-hidden="true" />
      <h1 className="text-xl font-bold text-slate-800">页面不存在</h1>
      <p className="max-w-md text-sm text-slate-500">该地址不在当前版本的功能范围内。</p>
      <Link
        to="/"
        className="mt-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition-all hover:from-indigo-700 hover:to-blue-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-500/20"
      >
        返回平台小助理
      </Link>
    </div>
  );
}
